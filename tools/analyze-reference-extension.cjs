// Aggregate symbolic excerpts / published measurements; never package notes, audio or lyrics.
// Usage: node tools/analyze-reference-extension.cjs <local source directory>
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),zlib=require('node:zlib'),crypto=require('node:crypto');
const root=path.join(__dirname,'..'),input=process.argv[2];if(!input)throw Error('Missing local source directory');
const html=fs.readFileSync(path.join(root,'index.html'),'utf8'),ctx=vm.createContext({});vm.runInContext(html.match(/<script>([\s\S]*?)<\/script>/)[1],ctx);
const db=ctx.MusicMaker.database,rules=db.referenceCorpusRules,selected=JSON.parse(fs.readFileSync(path.join(root,'data/reference-extension-selection.json'),'utf8'));
const hash=b=>crypto.createHash('sha256').update(b).digest('hex'),bytes=fs.readFileSync(path.join(input,'Hooktheory.json.gz'));
if(hash(bytes)!==rules.sourceSha256)throw Error('SheetSage source hash mismatch');
const raw=JSON.parse(zlib.gunzipSync(bytes)),entries=Object.entries(raw),pc=p=>((p%12)+12)%12;
const mean=a=>a.length?a.reduce((s,v)=>s+v,0)/a.length:null,round=v=>v===null?null:Number(v.toFixed(5)),normalize=a=>a.map(v=>round(v/(a.reduce((s,v)=>s+v,0)||1)));
function profile(rows){
 const keys=[...new Set(rows.flatMap(r=>Object.keys(r.features)))],result={count:rows.length};
 for(const key of keys){const values=rows.map(r=>r.features[key]).filter(v=>v!==null&&v!==undefined);if(!values.length){result[key]=null;continue;}
  if(Array.isArray(values[0]))result[key]=normalize(values[0].map((_,i)=>mean(values.map(v=>v[i]))));
  else if(typeof values[0]==='object'){const out={};for(const hist of values){const total=Object.values(hist).reduce((s,v)=>s+v,0);if(!total)continue;for(const[k,v]of Object.entries(hist))out[k]=(out[k]??0)+v/total/values.length;}result[key]=Object.fromEntries(Object.entries(out).sort(([a],[b])=>a.localeCompare(b)).map(([k,v])=>[k,round(v)]));}
  else result[key]=round(mean(values));
 }
 return result;
}
function melodicFeatures(notes,total){
 const intervals=Array(5).fill(0),durations=Array(5).fill(0),onsets=Array(16).fill(0);let previousEnd=0,rest=0;
 for(const[n,note]of notes.entries()){
  if(n){const v=Math.abs(note.pitch-notes[n-1].pitch),i=rules.intervalThresholds.findIndex(edge=>v<=edge);intervals[i<0?4:i]++;}
  const d=note.offset-note.onset,i=rules.durationEdges.findIndex(edge=>d<=edge);durations[i<0?4:i]++;
  onsets[Math.min(15,Math.floor(pc(note.onset/(note.meter??4)*12)/12*16))]++;
  rest+=Math.max(0,note.onset-previousEnd);previousEnd=Math.max(previousEnd,note.offset);
 }
 return{intervals:normalize(intervals),durations:normalize(durations),onsets:normalize(onsets),meanDuration:round(mean(notes.map(n=>n.offset-n.onset))),restRatio:round((rest+Math.max(0,total-previousEnd))/total),syncopation:round(mean(notes.map(n=>Math.abs(n.onset-Math.round(n.onset))>.01?1:0))),span:Math.max(...notes.map(n=>n.pitch))-Math.min(...notes.map(n=>n.pitch)),nonChordRatio:null,tones:null,transitions:null,harmonicBars:null,inversionRatio:null,voicingSpan:null};
}
function sage(row){
 const clips=entries.filter(([,r])=>r.hooktheory.artist===row.artist&&r.hooktheory.song===row.song&&r.tags.includes('MELODY')&&r.tags.includes('HARMONY')&&!r.tags.includes('TEMPO_CHANGES')&&r.annotations.melody.length>=rules.minimumMelodyNotes&&r.annotations.harmony.length>=rules.minimumHarmonyEvents),seen=new Set();
 const unique=clips.filter(([,r])=>{const signature=JSON.stringify(r.annotations);if(seen.has(signature))return false;seen.add(signature);return true;});if(!unique.length)return null;
 const analyzed=unique.map(([,r])=>{const a=r.annotations,latest=(list,t)=>list.filter(e=>e.beat<=t).at(-1),notes=a.melody.map(n=>({onset:n.onset,offset:n.offset,pitch:n.octave*12+n.pitch_class,meter:latest(a.meters,n.onset).beats_per_bar})).sort((a,b)=>a.onset-b.onset),f=melodicFeatures(notes,a.num_beats),tones={},transitions={};let non=0,mapped=0;
  const quality=c=>{const t=c.root_position_intervals,third=t[0],fifth=third+(t[1]??0),seventh=t.slice(0,3).reduce((s,v)=>s+v,0);return third===3&&fifth===6?'diminished':third===3?'minor':seventh===10?'dominant':'major';};
  const hc=c=>pc(c.root_pitch_class-latest(a.keys,c.onset).tonic_pitch_class)+':'+quality(c);
  for(const n of notes){const c=a.harmony.find(c=>c.onset<=n.onset&&c.offset>n.onset);if(!c)continue;const tonesC=[0];for(const step of c.root_position_intervals)tonesC.push(pc(tonesC.at(-1)+step));const degree=pc(n.pitch-c.root_pitch_class);mapped++;if(!tonesC.includes(degree))non++;tones[degree]=(tones[degree]??0)+1;}
  a.harmony.forEach((c,i)=>{if(i){const key=hc(a.harmony[i-1])+'>'+hc(c);transitions[key]=(transitions[key]??0)+1;}});
  Object.assign(f,{nonChordRatio:round(non/mapped),tones,transitions,harmonicBars:round(mean(a.harmony.map(c=>(c.offset-c.onset)/latest(a.meters,c.onset).beats_per_bar))),inversionRatio:round(mean(a.harmony.map(c=>c.inversion>0?1:0)))});
  return{features:f,notes:notes.length};});
 const features=profile(analyzed);delete features.count;
 return{...row,title:row.song.replaceAll('-',' '),sourceType:'sheetsage',url:unique[0][1].hooktheory.urls.song,sourceHash:rules.sourceSha256,license:rules.license,confidence:.8,weighting:'Note-event frequencies, equal excerpt then equal song weight',annotators:[...new Set(unique.flatMap(([,r])=>r.hooktheory.annotators))],clipIds:unique.map(([id])=>id),noteCount:analyzed.reduce((s,r)=>s+r.notes,0),features};
}
function pageProps(page){
 const joined=[...page.matchAll(/self\.__next_f\.push\((.*?)\)<\/script>/gs)].map(m=>{try{return JSON.parse(m[1])[1]??'';}catch{return '';}}).join('');let found=null;
 function visit(o){if(!o||typeof o!=='object')return;if(o.sections&&o.sectionStats&&o.song)found=o;for(const v of Object.values(o))visit(v);}
 for(const line of joined.split('\n')){const m=line.match(/^[\da-f]+:(.+)$/);if(m)try{visit(JSON.parse(m[1]));}catch{}}return found;
}
function theorytab(row){
 const data=fs.readFileSync(path.join(input,'reference-page-cache',encodeURIComponent(row.artist+'/'+row.song)+'.html')),p=pageProps(data.toString());
 if(!p?.melody||p.melody.totalBeats<12)throw Error('Insufficient public statistics: '+row.song);
 const m=p.melody,c=p.charts,intervals=Array(5).fill(0),durations=Array(5).fill(0),tones=m.bars.find(b=>b.name==='Chord Tones')?.pct,sync=m.bars.find(b=>b.name==='Syncopation')?.pct;
 c.intervals.labels.forEach((label,i)=>{const v=Math.abs(Number(label)),n=rules.intervalThresholds.findIndex(edge=>v<=edge);intervals[n<0?4:n]+=c.intervals.counts[i];});
 c.durations.labels.forEach((label,i)=>{const v=Number(label),n=rules.durationEdges.findIndex(edge=>v<=edge);durations[n<0?4:n]+=c.durations.counts[i];});
 const transitions={};let harmonicTokens=0,parsedTokens=0;
 function harmonicClass(token,scale){
  // Only unambiguous Roman numerals. Sus/no3/altered extensions are excluded.
  const m=token.match(/^([b#]*)([ivIV]+)(o|ø|\+)?(maj7|M7|7|9|11|13|6|64|65|43|42)?(?:\/([b#]*)([ivIV]+))?$/);if(!m||m[3]==='+')return null;
  const degrees=scale==='minor'?[0,2,3,5,7,8,10]:[0,2,4,5,7,9,11],roman=['I','II','III','IV','V','VI','VII'],i=roman.indexOf(m[2].toUpperCase());if(i<0)return null;
  const alter=s=>[...s].reduce((n,c)=>n+(c==='#'?1:-1),0),target=m[6]?roman.indexOf(m[6].toUpperCase()):0;if(target<0)return null;
  const root=pc(degrees[i]+alter(m[1])+(m[6]?degrees[target]+alter(m[5]):0)),lower=m[2]===m[2].toLowerCase(),seventh=m[4]&&['7','9','11','13','65','43','42'].includes(m[4]);
  let quality=m[3]?'diminished':lower?'minor':'major';if(quality==='major'&&seventh&&!['maj7','M7'].includes(m[4])){const diatonicSeventh=pc(degrees[(i+6)%7]-degrees[i]),diatonicThird=pc(degrees[(i+2)%7]-degrees[i]);if(diatonicSeventh===10||diatonicThird!==4||m[6])quality='dominant';}
  return root+':'+quality;
 }
 for(const section of p.sections){let before=null;for(const token of section.rel.split(/\s+/)){harmonicTokens++;const key=harmonicClass(token,section.scale);if(key)parsedTokens++;if(key&&before){const pair=before+'>'+key;transitions[pair]=(transitions[pair]??0)+1;}before=key;}}
 // Do not synthesize a chord-relative pitch histogram or onsets from percentile ranks.
 return{...row,title:p.song.title,sourceArtist:p.song.artist,sourceType:'theorytab-statistics',url:'https://www.hooktheory.com/theorytab/view/'+row.artist+'/'+row.song,sourceHash:hash(data),license:'Published community measurements; original scores remain with their owners',confidence:.7,weighting:'Intervals are published beat-weighted mass; durations are event counts. Syncopation is the published scalar. Only parsed adjacent Roman chords count as transitions.',annotators:p.contributors,harmonyCoverage:{parsedTokens,harmonicTokens},coverage:p.sections.map(s=>({section:s.name,key:s.key,scale:s.scale,meter:s.meter,bpm:s.tempo,url:s.url})),noteCount:c.durations.counts.reduce((s,n)=>s+n,0),features:{intervals:normalize(intervals),durations:normalize(durations),onsets:null,meanDuration:m.beatsPerNote,span:m.semis,nonChordRatio:tones===undefined?null:round(1-tones/100),syncopation:sync===undefined?null:sync/100,restRatio:null,tones:null,transitions:Object.keys(transitions).length?transitions:null,harmonicBars:null,inversionRatio:null,voicingSpan:null}};
}
function readPart(file){const data=fs.readFileSync(path.join(input,file));return{data,part:JSON.parse(data)};}
function partNotes(p){let cursor=0,meter=4;const notes=[],chords=[];
 for(const measure of p.measures){if(measure.signature)meter=measure.signature[0]*4/measure.signature[1];let position=cursor;
  for(const beat of measure.voices[0].beats){const duration=beat.duration[0]/beat.duration[1]*4,active=beat.notes.filter(n=>!n.rest&&Number.isFinite(n.fret)).map(n=>({...n,pitch:p.tuning[n.string]+n.fret}));
   if(active.length){const pitches=active.map(n=>n.pitch);chords.push(pitches);const top=active.reduce((a,b)=>a.pitch>b.pitch?a:b),before=notes.at(-1);if(top.tie&&before?.pitch===top.pitch&&Math.abs(before.offset-position)<.001)before.offset=position+duration;else notes.push({onset:position,offset:position+duration,pitch:top.pitch,meter});}
   position+=duration;
  }cursor+=meter;
 }return{notes,chords,total:cursor};
}
function songsterr(row){const vocal=readPart(row.vocalFile),harmony=readPart(row.harmonyFile),line=partNotes(vocal.part),comp=partNotes(harmony.part);if(line.notes.length<12)throw Error('Insufficient vocal score');
 const f=melodicFeatures(line.notes,line.total);f.voicingSpan=round(mean(comp.chords.filter(c=>c.length>1).map(c=>Math.max(...c)-Math.min(...c))));
 return{...row,title:row.title,sourceType:'songsterr-public-score',url:row.url,sourceHash:hash(vocal.data),harmonyHash:hash(harmony.data),license:'Public community score; no score or note sequence redistributed',confidence:row.song==='lilac'?.5:.65,weighting:'Upper note of the published vocal part, ties merged; rhythm guitar chord span measured separately',coverage:{revision:vocal.part.revisionId,vocalPart:vocal.part.partId,harmonyPart:harmony.part.partId,partName:vocal.part.name,automaticOrRegenerated:row.song==='lilac'},noteCount:line.notes.length,features:f};
}
function midiNotes(buffer){let at=0;const str=n=>{const s=buffer.toString('ascii',at,at+n);at+=n;return s;},u16=()=>{const n=buffer.readUInt16BE(at);at+=2;return n;},u32=()=>{const n=buffer.readUInt32BE(at);at+=4;return n;},vl=()=>{let n=0,b;do{b=buffer[at++];n=n*128+(b&127);}while(b&128);return n;};
 if(str(4)!=='MThd')throw Error('Bad MIDI');const size=u32(),format=u16(),tracks=u16(),ppq=u16();if(ppq&32768)throw Error('SMPTE unsupported');at=8+size;const events=[],tempo=[{tick:0,micro:500000}];
 for(let tr=0;tr<tracks;tr++){if(str(4)!=='MTrk')throw Error('Bad MIDI track');const end=at+4+buffer.readUInt32BE(at);u32();let tick=0,status=0;const active=new Map();while(at<end){tick+=vl();let b=buffer[at++];if(b<128){at--;b=status;}else if(b<240)status=b;
  if(b===255){const type=buffer[at++],len=vl();if(type===81)tempo.push({tick,micro:buffer.readUIntBE(at,3)});at+=len;continue;}if(b===240||b===247){at+=vl();continue;}
  const kind=b&240,channel=b&15,a=buffer[at++],d=kind===192||kind===208?0:buffer[at++],key=channel+':'+a;
  if(kind===144&&d>0)active.set(key,{tick,pitch:a,velocity:d});else if(kind===128||kind===144){const n=active.get(key);if(n&&tick>n.tick)events.push({...n,endTick:tick});active.delete(key);}
 }at=end;}
 tempo.sort((a,b)=>a.tick-b.tick);function seconds(t){let s=0,prev=0,micro=500000;for(const e of tempo){if(e.tick>t)break;s+=(e.tick-prev)/ppq*micro/1e6;prev=e.tick;micro=e.micro;}return s+(t-prev)/ppq*micro/1e6;}
 return events.map(n=>({...n,start:seconds(n.tick),end:seconds(n.endTick)})).sort((a,b)=>a.start-b.start);
}
function jtd(row){const dir=path.join(input,'artist-jtd',row.recording),meta=JSON.parse(fs.readFileSync(path.join(dir,'metadata.json'),'utf8').replace(/:\s*NaN/g,': null')),bytes=fs.readFileSync(path.join(dir,'piano_midi.mid')),midi=midiNotes(bytes),beatRows=fs.readFileSync(path.join(dir,'beats.csv'),'utf8').trim().split(/\r?\n/).slice(1).map(line=>Number(line.split(',')[1])).filter(Number.isFinite);
 function beat(t){let i=beatRows.findIndex(b=>b>t);if(i<0)i=beatRows.length-1;if(i===0)i=1;return i-1+(t-beatRows[i-1])/(beatRows[i]-beatRows[i-1]);}
 const groups=[];for(const n of midi){const g=groups.at(-1);if(g&&n.start-g.start<.03)g.notes.push(n);else groups.push({start:n.start,notes:[n]});}
 const line=groups.map(g=>g.notes.reduce((a,b)=>a.pitch>b.pitch?a:b)).map(n=>({onset:Math.max(0,beat(n.start)),offset:Math.max(0,beat(n.end)),pitch:n.pitch,meter:meta.time_signature})).filter(n=>n.offset>n.onset),f=melodicFeatures(line,beatRows.length);
 f.voicingSpan=round(mean(groups.filter(g=>g.notes.length>1).map(g=>Math.max(...g.notes.map(n=>n.pitch))-Math.min(...g.notes.map(n=>n.pitch)))));
 return{...row,title:meta.track_name,sourceType:'jtd-automatic-piano',url:'https://github.com/HuwCheston/Jazz-Trio-Database/releases/tag/v02-zenodo',sourceHash:hash(bytes),license:'MIT (Huw Cheston, 2023)',confidence:.45,weighting:'Highest note of automatically transcribed piano onset clusters; beats aligned to detected pulse. Instrumental proxy, never vocal ground truth.',coverage:{recordingYear:meta.recording_year,album:meta.album_name,excerpt:meta.timestamps,meter:meta.time_signature,humanValidated:meta.has_annotations},noteCount:line.length,features:f};
}
const songs=selected.map(row=>row.sourceType==='songsterr-public-score'?songsterr(row):row.sourceType==='jtd-automatic-piano'?jtd(row):sage(row)??theorytab(row));
const general=songs.filter(r=>r.role==='general'),artistIds=db.artistStyles.filter(a=>a.id!=='none').map(a=>a.id),old=new Set(db.referenceCorpus.songs.map(s=>s.artist+'/'+s.song));
if(general.length!==100||new Set(general.map(s=>s.artist+'/'+s.song)).size!==100||general.some(s=>old.has(s.artist+'/'+s.song)||songs.some(a=>a.role==='artist'&&a.artist===s.artist&&a.song===s.song)))throw Error('Additional songs must be 100 distinct new titles');
const artists=Object.fromEntries(artistIds.map(id=>{const rows=songs.filter(s=>s.artistId===id);if(rows.length!==3)throw Error(id+' must have three songs');return[id,{...profile(rows),confidence:round(mean(rows.map(r=>r.confidence))),songIds:rows.map(s=>s.artist+'/'+s.song)}];}));
const cohortIds=[...new Set(general.map(s=>s.cohort))],corpus={asOf:'2026-10-14',method:'Statistical priors calibrated from annotated excerpts, public score measurements and automatic piano transcription. Equal song weights; missing dimensions stay null. No neural fine-tuning or audio analysis claimed.',additionalSongCount:100,artistSongCount:24,uniqueCombinedSongs:new Set([...db.referenceCorpus.songs,...songs].map(s=>s.artist+'/'+s.song)).size,global:profile(general),cohorts:Object.fromEntries(cohortIds.map(id=>[id,profile(general.filter(s=>s.cohort===id))])),artists,songs};
fs.writeFileSync(path.join(root,'data/reference-extension.json'),JSON.stringify(corpus,null,2)+'\n');
fs.writeFileSync(path.join(root,'index.html'),html.includes('referenceCorpusExtension:')?html.replace(/^referenceCorpusExtension:[^\r\n]*\r?\n/m,'referenceCorpusExtension:'+JSON.stringify(corpus)+',\r\n'):html.replace('referenceCorpusRules:','referenceCorpusExtension:'+JSON.stringify(corpus)+',\r\nreferenceCorpusRules:'));
console.log(JSON.stringify({additional:100,artistReferences:24,uniqueCombined:corpus.uniqueCombinedSongs,cohorts:Object.fromEntries(Object.entries(corpus.cohorts).map(([id,g])=>[id,g.count])),artists:Object.fromEntries(Object.entries(artists).map(([id,g])=>[id,{count:g.count,duration:g.meanDuration,intervals:g.intervals}]))}));
