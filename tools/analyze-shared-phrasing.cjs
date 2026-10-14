// Joint melody/accompaniment measurements from a systematic POP909 sample.
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const root=path.join(__dirname,'..'),source=process.argv[2];if(!source)throw Error('Usage: node tools/analyze-shared-phrasing.cjs <POP909 sample folder>');
const mean=a=>a.length?a.reduce((s,v)=>s+v,0)/a.length:null,round=v=>v===null?null:Number(v.toFixed(5)),median=a=>{a=a.slice().sort((a,b)=>a-b);return a.length?a[Math.floor(a.length/2)]:null;},hash=b=>crypto.createHash('sha256').update(b).digest('hex');
function readMidi(buffer){let at=0;const str=n=>{const s=buffer.toString('utf8',at,at+n);at+=n;return s;},u16=()=>{const v=buffer.readUInt16BE(at);at+=2;return v;},u32=()=>{const v=buffer.readUInt32BE(at);at+=4;return v;},vl=()=>{let n=0,b;do{b=buffer[at++];n=n*128+(b&127);}while(b&128);return n;};
 if(str(4)!=='MThd')throw Error('Bad MIDI');const size=u32(),format=u16(),count=u16(),ppq=u16();if(ppq&32768)throw Error('SMPTE not supported');at=8+size;const tracks=[],tempos=[{tick:0,micro:500000}];
 for(let i=0;i<count;i++){if(str(4)!=='MTrk')throw Error('Bad track');const length=u32(),end=at+length,notes=[],active=new Map();let tick=0,status=0,name='';
  while(at<end){tick+=vl();let b=buffer[at++];if(b<128){at--;b=status;}else if(b<240)status=b;
   if(b===255){const type=buffer[at++],n=vl();if(type===3)name=buffer.toString('utf8',at,at+n);if(type===81)tempos.push({tick,micro:buffer.readUIntBE(at,3)});at+=n;continue;}if(b===240||b===247){const n=vl();at+=n;continue;}
   const kind=b&240,channel=b&15,pitch=buffer[at++],velocity=kind===192||kind===208?0:buffer[at++],key=channel+':'+pitch;
   if(kind===144&&velocity>0)active.set(key,{tick,pitch,velocity});else if(kind===128||kind===144){const n=active.get(key);if(n&&tick>n.tick)notes.push({...n,endTick:tick});active.delete(key);}
  }tracks.push({name,notes});at=end;
 }
 tempos.sort((a,b)=>a.tick-b.tick);const seconds=t=>{let sum=0,prior=0,micro=500000;for(const e of tempos){if(e.tick>t)break;sum+=(e.tick-prior)/ppq*micro/1e6;prior=e.tick;micro=e.micro;}return sum+(t-prior)/ppq*micro/1e6;};
 return tracks.map(t=>({name:t.name,notes:t.notes.map(n=>({pitch:n.pitch,start:n.tick/ppq,end:n.endTick/ppq,startSeconds:seconds(n.tick),endSeconds:seconds(n.endTick)})).sort((a,b)=>a.start-b.start)}));
}
const songs=[];
for(const id of fs.readdirSync(source).filter(id=>/^\d{3}$/.test(id)).sort()){
 const bytes=fs.readFileSync(path.join(source,id,id+'.mid')),tracks=readMidi(bytes),melody=tracks.find(t=>t.name==='MELODY')?.notes,piano=tracks.find(t=>t.name==='PIANO')?.notes;
 if(!melody?.length||!piano?.length)throw Error('Missing aligned tracks for '+id);
 const rawChord=fs.readFileSync(path.join(source,id,'chord_midi.txt')),changes=rawChord.toString().trim().split(/\r?\n/).map(line=>({time:Number(line.trim().split(/\s+/)[0]),name:line.trim().split(/\s+/).slice(2).join(' ')})).filter((c,i,a)=>i&&c.name!==a[i-1].name),phrases=[];let line=[];
 for(const note of melody){if(line.length&&note.start-line.at(-1).end>=.5){phrases.push(line);line=[];}line.push(note);}if(line.length)phrases.push(line);
 const eligible=phrases.filter(line=>line.at(-1).end-line[0].start>=2&&line.at(-1).end-line[0].start<=16),peaks=eligible.map(line=>{const top=Math.max(...line.map(n=>n.pitch)),n=line.find(n=>n.pitch===top);return(n.start-line[0].start)/(line.at(-1).end-line[0].start);}),durations=melody.map(n=>n.end-n.start),gaps=melody.slice(1).map((n,i)=>n.start-melody[i].end).filter(g=>g>=.5),attacks=[...new Set(piano.map(n=>n.start))],coincident=attacks.filter(t=>melody.some(n=>Math.abs(n.start-t)<=.0625));
 const supporting=piano.map(n=>({note:n,lead:melody.find(m=>m.start<=n.start&&m.end>n.start)})).filter(x=>x.lead),separation=supporting.map(x=>Math.abs(x.note.pitch-x.lead.pitch)),cross=melody.filter(n=>changes.some(c=>c.time>n.startSeconds&&c.time<n.endSeconds));
 const perBeatDensity=[];for(let start=0;start<melody.at(-1).end;start+=4){const lead=melody.filter(n=>n.start<start+4&&n.end>start),density=attacks.filter(t=>t>=start&&t<start+4).length;if(lead.length)perBeatDensity.push({density,held:lead.some(n=>n.end-n.start>=1.5)});}
 const held=perBeatDensity.filter(w=>w.held),moving=perBeatDensity.filter(w=>!w.held),ratio=mean(held.map(w=>w.density))/mean(moving.map(w=>w.density));
 const metrics={phraseBeats:median(eligible.map(line=>line.at(-1).end-line[0].start)),phrasePeakPosition:mean(peaks),breathBeats:median(gaps),heldNoteRatio:durations.filter(d=>d>=1.5).length/durations.length,sharedAttackRatio:coincident.length/attacks.length,registerSeparation:median(separation),crossHarmonyRatio:cross.length/melody.length,heldAccompanimentDensityRatio:Number.isFinite(ratio)?ratio:null};
 songs.push({id,url:'https://github.com/music-x-lab/POP909-Dataset/tree/master/POP909/'+id,midiSha256:hash(bytes),chordSha256:hash(rawChord),melodyNotes:melody.length,accompanimentNotes:piano.length,phrases:eligible.length,metrics:Object.fromEntries(Object.entries(metrics).map(([k,v])=>[k,round(v)]))});
}
const keys=Object.keys(songs[0].metrics),aggregate=Object.fromEntries(keys.map(k=>[k,round(mean(songs.map(s=>s.metrics[k]).filter(Number.isFinite)))])),result={asOf:'2026-10-14',source:'POP909 (Wang, Chen et al., ISMIR 2020)',sourceUrl:'https://github.com/music-x-lab/POP909-Dataset',paper:'https://arxiv.org/abs/2008.07142',license:'MIT; source MIDI copyrights remain with their holders',sample:'32 deterministic, equally spaced IDs: 001 + 28*k, k=0..31. One main arrangement version per ID.',scope:'Joint symbolic melody/piano timing and register statistics. Automatic phrase segmentation; no lyric or emotion labels, no listening study, no claim to represent every genre.',songCount:songs.length,melodyNotes:songs.reduce((s,x)=>s+x.melodyNotes,0),accompanimentNotes:songs.reduce((s,x)=>s+x.accompanimentNotes,0),aggregate,songs,sourceCommit:'d83e6edba6872a704f5d3b8b32f5cb540088dae6'};
fs.writeFileSync(path.join(root,'data/shared-phrasing-analysis.json'),JSON.stringify(result,null,2)+'\n');console.log(JSON.stringify({songs:result.songCount,melodyNotes:result.melodyNotes,accompanimentNotes:result.accompanimentNotes,aggregate}));
