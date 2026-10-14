// Rebuild measured priors from published annotations. Raw notes/audio/charts are not redistributed.
// Usage: node tools/analyze-jazz-corpus.cjs <jazz source directory> <Hooktheory.json.gz>
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),crypto=require('node:crypto'),zlib=require('node:zlib'),{DatabaseSync}=require('node:sqlite');
const root=path.join(__dirname,'..'),input=process.argv[2],sheetPath=process.argv[3];if(!input||!sheetPath)throw Error('Missing local sources');
const html=fs.readFileSync(path.join(root,'index.html'),'utf8'),ctx=vm.createContext({});vm.runInContext(html.match(/<script>([\s\S]*?)<\/script>/)[1],ctx);
const db=ctx.MusicMaker.database,rule=db.jazzLearningRules,ar=rule.analysis,octave=db.engine.numeric.octave,selection=JSON.parse(fs.readFileSync(path.join(root,'data/jazz-selection.json'),'utf8'));
const hash=b=>crypto.createHash('sha256').update(b).digest('hex'),wjBytes=fs.readFileSync(path.join(input,'wjazzd.db')),sheetBytes=fs.readFileSync(sheetPath);
if(hash(wjBytes)!==rule.sources.wjazzd.sha256||hash(sheetBytes)!==rule.sources.hooktheory.sha256)throw Error('Source hash mismatch');
const sql=new DatabaseSync(path.join(input,'wjazzd.db'),{readOnly:true}),sheet=JSON.parse(zlib.gunzipSync(sheetBytes));
const pc=v=>((v%octave)+octave)%octave,mean=a=>a.length?a.reduce((s,v)=>s+v,0)/a.length:null,round=v=>v===null?null:Number(v.toFixed(ar.precision));
const norm=a=>{const total=Array.isArray(a)?a.reduce((s,v)=>s+v,0):Object.values(a).reduce((s,v)=>s+v,0);return total?Array.isArray(a)?a.map(v=>round(v/total)):Object.fromEntries(Object.entries(a).sort(([a],[b])=>a.localeCompare(b)).map(([k,v])=>[k,round(v/total)])):null;};
const histogram=(values,edges)=>{const h=edges.map(()=>0).concat(0);for(const v of values){const i=edges.findIndex(e=>v<=e);h[i<0?h.length-1:i]++;}return norm(h);};
const count=(map,key,weight=1)=>map[key]=(map[key]??0)+weight;
function rootPitch(text){const m=text.match(/^([A-G])([b#]*)/);return m?pc(ar.roots[m[1]]+[...m[2]].reduce((s,v)=>s+ar.accidentals[v],0)):null;}
function degree(text){const m=text.match(/^([b#]*)(\d+)$/);return m?ar.degreeScale[(Number(m[2])-1)%ar.degreeScale.length]+Math.floor((Number(m[2])-1)/ar.degreeScale.length)*octave+[...m[1]].reduce((s,v)=>s+ar.accidentals[v],0):null;}
function chord(label){
 if(!label||['N','NC','X'].includes(label))return null;const root=rootPitch(label);if(root===null)return null;
 const m=label.match(/^([A-G][b#]*)(.*)$/),raw=m[2].split('/')[0].replace(/^:/,''),bass=m[2].includes('/')?m[2].split('/').at(-1):null;let intervals=ar.qualities[raw||'maj'];
 if(raw.startsWith('(')&&raw.endsWith(')')){intervals=[0,...raw.slice(1,-1).split(',').map(degree)];if(intervals.some(v=>v===null))return null;}
 if(!intervals){
  const minor=/^-|^m(?!aj)/.test(raw),half=/m7b5|hdim|ø/.test(raw),dim=/dim|^o/.test(raw),major=/j|^M|maj/.test(raw),sus=/sus/.test(raw);
  intervals=half?[0,3,6,10]:dim?[0,3,6,...(/7/.test(raw)?[9]:[])]:minor?[0,3,7]:sus?[0,5,7]:[0,4,7];
  if(!half&&!dim&&/7|9|11|13/.test(raw))intervals.push(major?11:10);
  if(/9/.test(raw))intervals.push(/9b|b9/.test(raw)?13:/9#|#9/.test(raw)?15:14);
  if(/11/.test(raw))intervals.push(/11#|#11/.test(raw)?18:17);if(/13/.test(raw))intervals.push(/13b|b13/.test(raw)?20:21);
  if(!/[-mMoøj0-9s]|dim|aug|alt/.test(raw)&&raw) return null;
 }
 const tones=[...new Set(intervals.map(i=>pc(root+i)))],classes=intervals.map(pc),quality=classes.includes(3)&&classes.includes(6)?'diminished':classes.includes(3)?'minor':classes.includes(10)?'dominant':'major';
 const relativeBass=bass?degree(bass):null,bassClass=bass?(relativeBass===null?rootPitch(bass):pc(root+relativeBass)):root;
 return{root,quality,tones,extended:intervals.some(i=>i>=octave)||classes.some(i=>[9,10,11].includes(i)),inversion:bassClass!==null&&bassClass!==root,label};
}
function timeMapper(beats){const times=beats.map(b=>typeof b==='number'?b:b.onset),lastGap=mean(times.slice(1).map((t,i)=>t-times[i]).filter(v=>v>0));return t=>{let lo=0,hi=times.length-1;while(lo<hi){const mid=Math.ceil((lo+hi)/2);if(times[mid]<=t)lo=mid;else hi=mid-1;}const i=lo,gap=times[i+1]!==undefined?times[i+1]-times[i]:lastGap;return i+(t-times[i])/(gap||1);};}
function harmonicFeatures(events){
 const motions={},triples={},qualities={},durations=[],active=[];let extended=0,inversions=0,total=0;
 for(const event of events){if(!event.chord){active.push(null);continue;}const c=event.chord,held=event.duration;total+=held;extended+=c.extended?held:0;inversions+=c.inversion?held:0;count(qualities,c.quality,held);const prior=active.at(-1);
  if(prior&&prior.chord.root===c.root&&prior.chord.quality===c.quality&&prior.chord.tones.join(',')===c.tones.join(','))prior.duration+=held;else active.push({...event});
 }
 for(const [i,e]of active.entries()){if(!e)continue;durations.push(e.duration);const a=active[i-1],b=active[i-2];if(a)count(motions,a.chord.quality+'>'+pc(e.chord.root-a.chord.root)+':'+e.chord.quality);if(a&&b)count(triples,b.chord.quality+'>'+pc(a.chord.root-b.chord.root)+':'+a.chord.quality+'>'+pc(e.chord.root-a.chord.root)+':'+e.chord.quality);}
 return{motions:norm(motions),trigrams:norm(triples),qualities:norm(qualities),harmonyDurations:histogram(durations,ar.harmonyEdges),meanHarmonicBeats:round(mean(durations)),extensionRatio:round(total?extended/total:0),inversionRatio:round(total?inversions/total:0),chordCount:active.filter(Boolean).length,annotatedBeats:round(total)};
}
function melodyFeatures(notes,chords,phraseLengths=[],bass=[]){
 if(notes.length<ar.minimumNotes)return null;const intervals=[],durations=[],onsets=Array(ar.onsetBins).fill(0),toneMass={},arrivals=[],phrases=phraseLengths.length?phraseLengths:[],bassMotion={};let nonChord=0,sync=0,rests=0,approaches=0,enclosures=0;
 const chordAt=t=>chords.findLast(c=>c.start<=t)?.chord??null;
 for(const [i,n]of notes.entries()){
  const prior=notes[i-1],next=notes[i+1],span=n.offset-n.onset;if(prior){const gap=Math.max(0,n.onset-prior.offset);rests+=gap;if(gap<ar.phraseGap)intervals.push(Math.abs(n.pitch-prior.pitch));}
  durations.push(span);const phase=((n.metric??n.onset)%n.pulses+n.pulses)%n.pulses,bin=Math.round(phase/n.pulses*ar.onsetBins)%ar.onsetBins;onsets[bin]++;if(Math.abs((n.metric??n.onset)-Math.round(n.metric??n.onset))>ar.beatTolerance)sync++;
  const c=chordAt(n.onset);if(c){const isTone=c.tones.includes(pc(n.pitch)),degree=pc(n.pitch-c.root);const mass=toneMass[c.quality]??Array(octave).fill(0);mass[degree]+=span;toneMass[c.quality]=mass;if(!isTone)nonChord++;
   const change=chords.find(e=>e.chord&&Math.abs(e.start-n.onset)<=ar.beatTolerance);if(change)arrivals.push(rule.theory.guideIntervals[c.quality].includes(degree)?1:0);
   if(!isTone&&next&&Math.abs(next.pitch-n.pitch)===1&&chordAt(next.onset)?.tones.includes(pc(next.pitch)))approaches++;
   if(prior&&next&&Math.sign(n.pitch-next.pitch)!==Math.sign(prior.pitch-next.pitch)&&Math.abs(n.pitch-next.pitch)<=ar.maxMatchStep&&Math.abs(prior.pitch-next.pitch)<=ar.maxMatchStep&&chordAt(next.onset)?.tones.includes(pc(next.pitch)))enclosures++;
  }
 }
 for(let i=1;i<bass.length;i++)count(bassMotion,String(pc(bass[i].pitch-bass[i-1].pitch)));
 if(!phrases.length){let start=notes[0].onset;for(let i=1;i<notes.length;i++)if(notes[i].onset-notes[i-1].offset>=ar.phraseGap){phrases.push((notes[i-1].offset-start)/notes[i-1].pulses);start=notes[i].onset;}phrases.push((notes.at(-1).offset-start)/notes.at(-1).pulses);}
 const total=notes.at(-1).offset-notes[0].onset;
 return{intervals:histogram(intervals,db.referenceCorpusRules.intervalThresholds),durations:histogram(durations,db.referenceCorpusRules.durationEdges),onsets:norm(onsets),tonesByQuality:Object.fromEntries(Object.entries(toneMass).map(([q,h])=>[q,norm(h)])),meanDuration:round(mean(durations)),syncopation:round(sync/notes.length),nonChordRatio:round(nonChord/notes.length),restRatio:round(rests/total),phraseLengths:histogram(phrases,ar.phraseEdges),meanPhraseBars:round(mean(phrases)),guideArrivalRatio:round(mean(arrivals)),chromaticApproachRatio:round(approaches/notes.length),enclosureRatio:round(enclosures/notes.length),bassMotions:norm(bassMotion),noteCount:notes.length};
}
function wjd(melid){
 const solo=sql.prepare('SELECT * FROM solo_info WHERE melid=?').get(melid),record=sql.prepare('SELECT artist,releasedate FROM record_info WHERE recordid=?').get(solo.recordid),beats=sql.prepare('SELECT * FROM beats WHERE melid=? ORDER BY onset').all(melid),raw=sql.prepare('SELECT * FROM melody WHERE melid=? ORDER BY onset').all(melid),map=timeMapper(beats),notes=raw.map(n=>({pitch:Math.round(n.pitch),onset:map(n.onset),offset:map(n.onset+n.duration),metric:n.beat-1+(n.tatum-1)/n.division,pulses:n.num}));
 let current=null;const changes=[];for(const [i,b]of beats.entries()){if(b.chord){current=chord(b.chord);changes.push({start:i,duration:1,chord:current});}else if(changes.length)changes.at(-1).duration++;}
 const phrases=sql.prepare("SELECT start,end FROM sections WHERE melid=? AND type='PHRASE'").all(melid).filter(p=>notes[p.start]&&notes[p.end]).map(p=>(notes[p.end].offset-notes[p.start].onset)/notes[p.start].pulses),bass=beats.filter(b=>Number.isFinite(b.bass_pitch)&&b.bass_pitch>0).map(b=>({pitch:Math.round(b.bass_pitch)}));
 return{source:{type:'wjazzd',melid,performer:solo.performer,recordingArtist:record.artist,year:record.releasedate,style:solo.style,rhythmfeel:solo.rhythmfeel,instrument:solo.instrument,url:rule.sources.wjazzd.url,hash:hash(wjBytes)},harmony:harmonicFeatures(changes),melody:melodyFeatures(notes,changes,phrases,bass),coverage:{noteCount:notes.length,beatCount:beats.length,chordLabels:changes.length,parsedChords:changes.filter(c=>c.chord).length}};
}
function jaah(row){
 const bytes=fs.readFileSync(path.join(input,'jaah',row.file)),p=JSON.parse(bytes),pulses=Number(p.metre.split('/')[0]),beats=p.parts.flatMap(part=>part.beats),map=timeMapper(beats),labFile=path.join(input,'labs','labs',row.file.replace('.json','.lab'));
 const labBytes=fs.readFileSync(labFile),lines=labBytes.toString().trim().split(/\r?\n/),events=lines.map(line=>{const m=line.trim().split(/\s+/);return{start:map(Number(m[0])),duration:map(Number(m[1]))-map(Number(m[0])),chord:chord(m[2])};}).filter(e=>e.duration>0),known=events.filter(e=>e.chord);
 const feature=harmonicFeatures(events),secondary=row.melodyReference?wjd(row.melodyReference.melid):null;
 return{source:{type:'jaah',file:row.file,url:row.url,hash:hash(bytes),labHash:hash(labBytes),...(secondary?{melodyReference:secondary.source}: {})},harmony:feature,melody:secondary?.melody??null,coverage:{chordLabels:events.length,parsedChords:known.length,noteCount:secondary?.melody?.noteCount??0,parts:p.parts.length,beatCount:beats.length},tempo:round(60/mean(beats.slice(1).map((t,i)=>t-beats[i]).filter(t=>t>0))),meter:p.metre};
}
function hook(row){
 const p=sheet[row.excerptId],a=p.annotations,notes=a.melody.map(n=>({pitch:n.octave*octave+n.pitch_class,onset:n.onset,offset:n.offset,pulses:a.meters.findLast(m=>m.beat<=n.onset)?.beats_per_bar??4})),events=a.harmony.map((c,i)=>{const tones=[0];let interval=0;for(const x of c.root_position_intervals){interval+=x;tones.push(interval);}const classes=tones.map(pc),quality=classes.includes(3)&&classes.includes(6)?'diminished':classes.includes(3)?'minor':classes.includes(10)?'dominant':'major';return{start:c.onset,duration:c.offset-c.onset,chord:{root:c.root_pitch_class,quality,tones:tones.map(t=>pc(c.root_pitch_class+t)),extended:tones.length>3,inversion:c.inversion!==0}};});
 return{source:{type:'hooktheory',excerptId:row.excerptId,url:row.url,hash:hash(sheetBytes),annotators:p.hooktheory.annotators,license:rule.sources.hooktheory.license},harmony:harmonicFeatures(events),melody:melodyFeatures(notes,events),coverage:{noteCount:notes.length,chordLabels:events.length,parsedChords:events.length},tempo:(p.alignment?.refined??p.alignment?.user)?round(60*((p.alignment.refined??p.alignment.user).beats.at(-1)-(p.alignment.refined??p.alignment.user).beats[0])/((p.alignment.refined??p.alignment.user).times.at(-1)-(p.alignment.refined??p.alignment.user).times[0])):null,meter:a.meters[0]};
}
function aggregate(rows){
 const merged={count:rows.length,songIds:rows.map(r=>r.id),melodyCount:rows.filter(r=>r.melody).length},combine=(objects,missingZero=false)=>{const keys=[...new Set(objects.flatMap(o=>Object.keys(o??{})))],out={};for(const key of keys){const values=objects.map(o=>o?.[key]??(missingZero?0:undefined)).filter(v=>v!==null&&v!==undefined);if(!values.length)continue;if(Array.isArray(values[0]))out[key]=norm(values[0].map((_,i)=>mean(values.map(v=>v[i]))));else if(typeof values[0]==='object')out[key]=combine(values,typeof Object.values(values[0])[0]==='number');else if(typeof values[0]==='number')out[key]=round(mean(values));}return out;};
 return{...merged,harmony:combine(rows.map(r=>r.harmony)),melody:merged.melodyCount?combine(rows.filter(r=>r.melody).map(r=>r.melody)):null};
}
const songs=selection.songs.map(row=>({...row,...(row.sourceType==='jaah'?jaah(row):row.sourceType==='wjazzd'?wjd(row.melid):hook(row))}));
if(songs.length!==ar.songs||new Set(songs.map(s=>s.title)).size!==songs.length)throw Error('Bad selection');
const result={asOf:selection.asOf,revision:rule.revision,sourceCount:songs.length,songCount:songs.length,melodySongs:songs.filter(s=>s.melody).length,sourceTypes:Object.fromEntries(['jaah','wjazzd','hooktheory'].map(type=>[type,songs.filter(s=>s.sourceType===type).length])),sources:rule.sources,weighting:'Equal composition weight; melody references are independent performances and use their own aligned harmony.',groups:Object.fromEntries(Object.keys(rule.groups).map(group=>[group,aggregate(songs.filter(s=>s.group===group))])),global:aggregate(songs),songs};
fs.writeFileSync(path.join(root,'data/jazz-corpus.json'),JSON.stringify(result,null,2)+'\n');sql.close();console.log(JSON.stringify({songs:result.songCount,melodySongs:result.melodySongs,types:result.sourceTypes,notes:songs.reduce((n,s)=>n+(s.coverage.noteCount??0),0),chords:songs.reduce((n,s)=>n+s.coverage.parsedChords,0)}));
