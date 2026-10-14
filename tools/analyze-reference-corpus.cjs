// Rebuild statistics from the cited, licensed symbolic annotations. No audio/lyrics are used.
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),zlib=require('node:zlib'),crypto=require('node:crypto');
const root=path.join(__dirname,'..'),html=fs.readFileSync(path.join(root,'index.html'),'utf8'),context=vm.createContext({});
vm.runInContext(html.match(/<script>([\s\S]*?)<\/script>/)[1],context);
const db=context.MusicMaker.database,rules=db.referenceCorpusRules,source=process.argv[2];
if(!source)throw Error('Usage: node tools/analyze-reference-corpus.cjs <Hooktheory.json.gz>');
const compressed=fs.readFileSync(source),sha=crypto.createHash('sha256').update(compressed).digest('hex');
if(sha!==rules.sourceSha256)throw Error('Source SHA-256 differs from the pinned release: '+sha);
const raw=JSON.parse(zlib.gunzipSync(compressed)),selection=JSON.parse(fs.readFileSync(path.join(root,'data/reference-selection.json'),'utf8')),octave=db.engine.numeric.octave;
const pc=pitch=>((pitch%octave)+octave)%octave,mean=values=>values.length?values.reduce((a,b)=>a+b,0)/values.length:0,round=value=>Number(value.toFixed(db.engine.display.scoreDigits)),normalize=hist=>hist.map(value=>round(value/(hist.reduce((a,b)=>a+b,0)||1)));
const latest=(events,onset)=>events.filter(event=>event.beat<=onset).at(-1),pitch=note=>note.octave*octave+note.pitch_class;
function quality(chord){const intervals=chord.root_position_intervals,third=intervals[0],fifth=third+(intervals[1]??0),seventh=intervals.slice(0,3).reduce((a,b)=>a+b,0);return third===3&&fifth===6?'diminished':third===3?'minor':seventh===10?'dominant':'major';}
function harmonicClass(chord,keys){return pc(chord.root_pitch_class-latest(keys,chord.onset).tonic_pitch_class)+':'+quality(chord);}
function analyze(record){
 const a=record.annotations,notes=a.melody.slice().sort((a,b)=>a.onset-b.onset),intervals=notes.slice(1).map((note,index)=>pitch(note)-pitch(notes[index])),intervalHistogram=rules.intervalNames.map(()=>0),durations=rules.durationEdges.map(()=>0).concat(0),onsets=Array(rules.onsetBins).fill(0),transitions={},tones={};
 let rests=0,previousEnd=0,nonChord=0,inversions=0;const harmonicDurations=[];
 for(const value of intervals){const magnitude=Math.abs(value),index=rules.intervalThresholds.findIndex(edge=>magnitude<=edge);intervalHistogram[index<0?intervalHistogram.length-1:index]++;}
 for(const note of notes){
  const duration=note.offset-note.onset,index=rules.durationEdges.findIndex(edge=>duration<=edge);durations[index<0?durations.length-1:index]++;
  const meter=latest(a.meters,note.onset),bin=Math.floor((note.onset%meter.beats_per_bar)/meter.beats_per_bar*rules.onsetBins);onsets[bin]++;
  rests+=Math.max(0,note.onset-previousEnd);previousEnd=Math.max(previousEnd,note.offset);
  const chord=a.harmony.find(chord=>chord.onset<=note.onset&&chord.offset>note.onset);if(!chord)continue;
  const degree=pc(note.pitch_class-chord.root_pitch_class),chordTones=[0];for(const interval of chord.root_position_intervals)chordTones.push(pc(chordTones.at(-1)+interval));
  if(!chordTones.includes(degree))nonChord++;tones[degree]=(tones[degree]??0)+1;
 }
 rests+=Math.max(0,a.num_beats-previousEnd);
 for(const[index,chord]of a.harmony.entries()){
  const meter=latest(a.meters,chord.onset);harmonicDurations.push((chord.offset-chord.onset)/meter.beats_per_bar);if(chord.inversion>0)inversions++;
  const before=a.harmony[index-1];if(before){const key=harmonicClass(before,a.keys)+'>'+harmonicClass(chord,a.keys);transitions[key]=(transitions[key]??0)+1;}
 }
 const cells=new Map();for(let i=0;i+2<intervals.length;i++){const key=intervals.slice(i,i+3).join(',');cells.set(key,(cells.get(key)??0)+1);}
 return{notes:notes.length,beats:a.num_beats,chords:a.harmony.length,intervals:normalize(intervalHistogram),durations:normalize(durations),onsets:normalize(onsets),syncopation:round(mean(notes.map(note=>Math.abs(note.onset-Math.round(note.onset))>db.knowledgeBase.search.coverageTolerance?1:0))),meanDuration:round(mean(notes.map(note=>note.offset-note.onset))),restRatio:round(rests/a.num_beats),nonChordRatio:round(nonChord/notes.length),inversionRatio:round(inversions/a.harmony.length),harmonicBars:round(mean(harmonicDurations)),motifRepetition:round([...cells.values()].filter(count=>count>1).reduce((a,b)=>a+b,0)/Math.max(1,intervals.length-2)),transitions,tones};
}
const entries=Object.entries(raw),songs=[],missing=[];
for(const selected of selection){
 const candidates=entries.filter(([,record])=>record.hooktheory.artist===selected.artist&&record.hooktheory.song===selected.song&&record.tags.includes('MELODY')&&record.tags.includes('HARMONY')&&!record.tags.includes('TEMPO_CHANGES')&&record.annotations.melody.length>=rules.minimumMelodyNotes&&record.annotations.harmony.length>=rules.minimumHarmonyEvents);
 const seen=new Set(),clips=candidates.filter(([,record])=>{const signature=JSON.stringify(record.annotations);if(seen.has(signature))return false;seen.add(signature);return true;});
 if(!clips.length){missing.push(selected.artist+'/'+selected.song);continue;}
 const features=clips.map(([,record])=>analyze(record)),vector=key=>features[0][key].map((_,index)=>round(mean(features.map(feature=>feature[key][index])))),scalar=key=>round(mean(features.map(feature=>feature[key]))),histogram=key=>{const hist={};for(const feature of features)for(const[k,value]of Object.entries(feature[key]))hist[k]=(hist[k]??0)+value;return hist;};
 songs.push({...selected,url:clips[0][1].hooktheory.urls.song,clipIds:clips.map(([id])=>id),annotators:[...new Set(clips.flatMap(([,record])=>record.hooktheory.annotators))].sort(),clipCount:clips.length,noteCount:features.reduce((sum,feature)=>sum+feature.notes,0),annotatedBeats:features.reduce((sum,feature)=>sum+feature.beats,0),features:{intervals:vector('intervals'),durations:vector('durations'),onsets:vector('onsets'),syncopation:scalar('syncopation'),meanDuration:scalar('meanDuration'),restRatio:scalar('restRatio'),nonChordRatio:scalar('nonChordRatio'),inversionRatio:scalar('inversionRatio'),harmonicBars:scalar('harmonicBars'),motifRepetition:scalar('motifRepetition'),transitions:histogram('transitions'),tones:histogram('tones')}});
}
if(missing.length)throw Error('Missing analyzable songs: '+missing.join(', '));
if(songs.length!==rules.referenceSongs||new Set(songs.map(song=>song.artist+'/'+song.song)).size!==songs.length)throw Error('Reference selection must have 100 distinct songs');
function profile(rows){
 const vector=key=>rows[0].features[key].map((_,index)=>round(mean(rows.map(song=>song.features[key][index])))),scalar=key=>round(mean(rows.map(song=>song.features[key]))),histogram=key=>{const hist={};for(const song of rows){const entries=Object.entries(song.features[key]),total=entries.reduce((sum,[,value])=>sum+value,0);for(const[k,value]of entries)hist[k]=(hist[k]??0)+value/total/rows.length;}return Object.fromEntries(Object.entries(hist).sort(([a],[b])=>a.localeCompare(b)).map(([k,v])=>[k,round(v)]));};
 return{count:rows.length,intervals:vector('intervals'),durations:vector('durations'),onsets:vector('onsets'),syncopation:scalar('syncopation'),meanDuration:scalar('meanDuration'),restRatio:scalar('restRatio'),nonChordRatio:scalar('nonChordRatio'),inversionRatio:scalar('inversionRatio'),harmonicBars:scalar('harmonicBars'),motifRepetition:scalar('motifRepetition'),transitions:histogram('transitions'),tones:histogram('tones')};
}
const groupIds=[...new Set(songs.map(song=>song.group))],corpus={source:'Sheet Sage / HookTheory',sourceUrl:'https://github.com/chrisdonahue/sheetsage#hooktheory-dataset',sha256:sha,license:rules.license,asOf:'2026-10-14',scope:'Statistics from available annotated excerpts, not complete recordings. Group tags are editorial; note/chord metrics are computed. No lyric syllables, drum stems, accompaniment voicings or commercial model weights.',songCount:songs.length,koreanCount:songs.filter(song=>song.region==='KR').length,internationalCount:songs.filter(song=>song.region==='INTL').length,clipCount:songs.reduce((sum,song)=>sum+song.clipCount,0),noteCount:songs.reduce((sum,song)=>sum+song.noteCount,0),global:profile(songs),groups:Object.fromEntries(groupIds.map(id=>[id,profile(songs.filter(song=>song.group===id))])),songs};
fs.writeFileSync(path.join(root,'data/reference-corpus.json'),JSON.stringify(corpus,null,2)+'\n');
const block='referenceCorpus:'+JSON.stringify(corpus)+',\r\n';
fs.writeFileSync(path.join(root,'index.html'),html.includes('referenceCorpus:')?html.replace(/^referenceCorpus:[^\r\n]*\r?\n/m,block):html.replace('referenceCorpusRules:',block+'referenceCorpusRules:'));
console.log(JSON.stringify({songs:corpus.songCount,korean:corpus.koreanCount,international:corpus.internationalCount,clips:corpus.clipCount,notes:corpus.noteCount,groups:Object.fromEntries(Object.entries(corpus.groups).map(([id,g])=>[id,g.count]))}));
