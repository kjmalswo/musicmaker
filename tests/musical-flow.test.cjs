const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
test('phrase intent, melody-aware accompaniment and connected section performance',()=>{
 const root=path.join(__dirname,'..'),context=vm.createContext({}),html=fs.readFileSync(path.join(root,'index.html'),'utf8');vm.runInContext(html.match(/<script>([\s\S]*?)<\/script>/)[1],context);const api=context.MusicMaker,db=api.database;
 assert.equal(api.validateDatabase(),true);assert.equal(db.sharedPhrasingCorpus.songCount,32);assert.equal(new Set(db.sharedPhrasingCorpus.songs.map(s=>s.id)).size,32);
 assert.equal(JSON.stringify(db.sharedPhrasingCorpus),JSON.stringify(JSON.parse(fs.readFileSync(path.join(root,'data/shared-phrasing-analysis.json'),'utf8'))));assert.equal(db.sharedPhrasingCorpus.melodyNotes,10526);assert.equal(db.sharedPhrasingCorpus.accompanimentNotes,34713);assert.ok(db.sharedPhrasingCorpus.songs.every(s=>s.midiSha256.length===64&&s.chordSha256.length===64));
 const base={...db.defaults,classical:0,seed:'shared-voice-story',form:'custom',customForm:[['verse',8],['pre',8],['chorus',8],['chorus',8]],toplineEmotion:'dramatic'};
 const configs=[{...base,subgenre:'ballad',bpm:78,progression:'marusa'},{...base,genre:'rock',subgenre:'jrock',bpm:92,key:'C',mode:'minor',artistStyle:'kenshi-yonezu'},{...base,genre:'rnb',subgenre:'neo-soul',bpm:96,artistStyle:'bruno-mars',toplineEmotion:'tender'}];
 let answers=0,supports=0,carries=0,expressive=0;
 for(const config of configs){const guide=api.generateGuide(config);assert.equal(guide.bars,32);assert.equal(guide.story.dramaturgy.climaxIndex,3);
  for(const section of guide.sections){
   assert.equal(section.repeats,1);assert.equal(section.parts.bars,section.bars);assert.equal(section.interaction.rules.valid,true);assert.equal(section.interaction.metrics.unresolved,0);
   assert.ok(section.phraseFlow.windows.length>=2);assert.equal(section.phraseFlow.windows[0].start,0);assert.equal(section.phraseFlow.windows.at(-1).end,section.bars*section.parts.barTicks);
   const notes=section.parts.topline.notes,range=db.vocalRanges.find(r=>r.id===guide.config.vocalRange);assert.ok(notes.every(n=>Number.isFinite(n.velocity)&&n.pitch>=range.lower&&n.pitch<=range.upper&&n.duration>0&&n.phraseId!==undefined));assert.ok(notes.every((n,i)=>!i||n.start>=notes[i-1].start+notes[i-1].duration));
   assert.ok(notes.some(n=>n.flowRole==='peak'));assert.ok(section.parts.topline.events.some(n=>n.role==='rest'));
   for(const n of notes.filter(n=>n.flowSustain)){carries++;const chords=section.phrase.filter(c=>c.bar*section.parts.barTicks<n.start+n.duration&&(c.bar+c.duration)*section.parts.barTicks>n.start);assert.ok(chords.every(c=>c.tones.includes(n.pitch%12)));}
   for(const track of section.orchestration.tracks.filter(t=>t.role==='harmony'))for(const event of track.events){
    const chords=section.phrase.filter(c=>c.bar*section.parts.barTicks<event.start+event.duration&&(c.bar+c.duration)*section.parts.barTicks>event.start);assert.ok(event.pitches.every(p=>p>=track.profile.range[0]&&p<=track.profile.range[1]));if(event.sharedTone)assert.ok(chords.every(c=>event.pitches.every(p=>c.tones.includes(p%12))));
    if(event.supportRole==='reply')answers++;if(['bed','support'].includes(event.supportRole))supports++;
   }
   for(const event of api.createPlaybackEvents(section,'topline').events){assert.ok(event.duration>0);if(event.phraseDelivery){expressive++;assert.ok(Number.isFinite(event.phraseDelivery.level));}}
  }
  const choruses=guide.sections.filter(s=>s.kind==='chorus'),first=choruses[0].parts.topline.hook.core,second=choruses[1].parts.topline.hook.core,shift=choruses[1].tonality.shift-choruses[0].tonality.shift;
  assert.deepEqual(Array.from(second,n=>[n.start,n.duration,n.pitch-shift]),Array.from(first,n=>[n.start,n.duration,n.pitch]),'the core hook survives phrase development');
  if(config.progression==='marusa')assert.deepEqual(Array.from(guide.sections[0].phrase.slice(0,4),c=>c.harmonicSymbol),['Fmaj7','E7','Am7','C7']);
  context.section=guide.sections[0];assert.match(vm.runInContext("renderPartPlans(section,'topline',0)",context),/프레이즈 흐름/);assert.ok(api.toMarkdown(guide).includes('강조'));
 }
 assert.ok(answers>0&&supports>0,'accompaniment both supports singing and answers in gaps');assert.ok(expressive>0,'delivery is included in the performed audio events');
 // Explicit common-tone examples exercise carrying without requiring a lucky generated seed.
 context.input={...base,bpm:96};vm.runInContext("this.local={...makeContext(normalizeConfig(input)),sectionIntent:{melodyRole:'A',emotionalRole:'confide',impactPriority:1,keyShift:0},songIntent:{hook:null}}",context);
 const barTicks=db.parts.meters['4-4'].barTicks;context.grid=db.parts.meters['4-4'];context.synthetic={kind:'verse',phraseBars:4,parts:{topline:{notes:[{start:0,duration:64,pitch:72,flowRole:'peak'}]}},phrase:[{id:'I',root:0,tones:[0,4,7],bar:0,duration:2},{id:'vi',root:9,tones:[9,0,4],bar:2,duration:2}],phraseFlow:{carryTarget:.12,windows:[{id:0,start:0,end:64,peakTick:28,breathTicks:4,pickupTicks:0,impact:1,hold:1.5,core:false}]}};
 context.raw=[0,8,20,28,32,40,52].map(start=>({start,duration:3,chord:context.synthetic.phrase[start<32?0:1],bar:Math.floor(start/barTicks),strong:start%4===0}));
 const rhythm=vm.runInContext('shapePhraseRhythm(local,synthetic,grid,raw,1)',context);assert.ok(rhythm.some(e=>e.start<32&&e.start+e.duration>32&&e.flowSustain));
 context.commonEvents=[{start:0,duration:32,pitches:[60,64,67],articulation:'sustain',supportRole:'bed'},{start:32,duration:32,pitches:[57,60,64],articulation:'sustain',supportRole:'bed'}];
 const linked=vm.runInContext('connectHarmonyTones(local,synthetic,commonEvents,DB.instrumentProfiles.piano)',context);assert.ok(linked.some(e=>e.pitches[0]===60&&e.duration===64&&e.sharedTone));assert.ok(linked.some(e=>e.pitches[0]===64&&e.duration===64&&e.sharedTone));
 const fitted=vm.runInContext('fitMelodyVoicing(local,synthetic,synthetic.phrase[0],[60,64,67,72],DB.instrumentProfiles.piano,[48,52,55,60])',context);assert.ok(fitted.every(p=>[0,4,7].includes(p%12)));assert.ok(fitted.reduce((s,p)=>s+Math.abs(p-72),0)/fitted.length>=db.musicalFlowRules.voicing.separationLimits[0]);
 // The vocal envelope actually swells and tapers in Web Audio scheduling.
 const envelope=[];context.gainStub={setValueAtTime(v,t){envelope.push(['set',v,t]);},linearRampToValueAtTime(v,t){envelope.push(['linear',v,t]);},exponentialRampToValueAtTime(v,t){envelope.push(['exponential',v,t]);}};
 vm.runInContext("noteEnvelope(gainStub,0,1,1,DB.playback.instruments.topline,{role:'peak',level:1})",context);assert.ok(envelope.some(e=>e[1]>1));assert.ok(envelope.some(e=>e[2]===db.musicalFlowRules.vocalDelivery.taperFraction&&e[1]<1));
});
