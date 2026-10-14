const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');

test('100-song jazz priors, piano theory, genre transfer and instrumental mode',()=>{
 const root=path.join(__dirname,'..'),html=fs.readFileSync(path.join(root,'index.html'),'utf8'),source=html.match(/<script>([\s\S]*?)<\/script>/)[1],context=vm.createContext({});vm.runInContext(source,context);
 const api=context.MusicMaker,db=api.database,corpus=JSON.parse(fs.readFileSync(path.join(root,'data/jazz-corpus.json'),'utf8'));
 assert.equal(api.validateDatabase(),true);assert.equal(db.version,'2.9.1');assert.equal(JSON.stringify(db.jazzCorpus),JSON.stringify(corpus));
 assert.equal(corpus.songCount,100);assert.equal(corpus.melodySongs,41);assert.equal(new Set(corpus.songs.map(s=>s.title)).size,100);
 assert.deepEqual(corpus.sourceTypes,{jaah:80,wjazzd:13,hooktheory:7});
 assert.equal(corpus.songs.reduce((n,s)=>n+s.coverage.noteCount,0),21289);assert.equal(corpus.songs.reduce((n,s)=>n+s.coverage.parsedChords,0),14015);
 const probability=hist=>{if(!hist)return;const values=Array.isArray(hist)?hist:Object.values(hist);assert.ok(values.every(v=>Number.isFinite(v)&&v>=0));assert.ok(Math.abs(values.reduce((a,b)=>a+b,0)-1)<.0001);};
 for(const group of Object.values(corpus.groups)){
  assert.ok(group.count>0);probability(group.harmony.motions);probability(group.harmony.trigrams);probability(group.harmony.harmonyDurations);
  if(group.melody){probability(group.melody.intervals);probability(group.melody.durations);probability(group.melody.onsets);for(const tones of Object.values(group.melody.tonesByQuality))probability(tones);}
 }
 for(const s of corpus.songs){assert.equal(s.source.hash.length,64);if(s.sourceType==='jaah')assert.equal(s.source.labHash.length,64);assert.ok(!('notes' in s)&&!('events' in s));}
 assert.ok(db.subgenres.some(s=>s.id==='acid-jazz')&&db.subgenres.some(s=>s.id==='stride-jazz'));
 const base={...db.defaults,form:'custom',customForm:[['verse',4],['pre',4],['chorus',4]],classical:0,seed:'jazz-cross-genre',jazzy:75};
 const verify=guide=>{for(const section of guide.sections){assert.equal(section.interaction.rules.valid,true);assert.equal(section.interaction.metrics.unresolved,0);assert.equal(section.interaction.metrics.instrumentRangeErrors,0);assert.equal(section.interaction.metrics.limbErrors,0);assert.equal(section.interaction.ensemble.valid,true);const range=db.vocalRanges.find(r=>r.id===guide.config.vocalRange);assert.ok(section.parts.topline.notes.every(n=>n.pitch>=range.lower&&n.pitch<=range.upper));}};
 const signature=guide=>JSON.stringify(guide.sections.map(s=>({chords:s.phrase.map(c=>[c.id,c.suffix,c.duration]),notes:s.parts.topline.notes.map(n=>[n.start,n.duration,n.pitch]),comp:s.orchestration.tracks.filter(t=>t.role==='harmony').map(t=>t.events.map(e=>[e.start,e.pitches]))})));
 // The statistics change real candidates in pop and R&B, while the strict music checks remain enabled.
 for(const config of[{...base,subgenre:'city-pop',style:'rhodes-pocket',bpm:108},{...base,genre:'rnb',subgenre:'neo-soul',style:'rhodes-pocket',bpm:92}]){
  const learned=api.generateGuide(config);verify(learned);assert.ok(learned.jazzLearning?.strength>0);assert.notEqual(learned.profile.parent,'jazz');
  db.jazzLearningRules.enabled=false;const without=api.generateGuide(config);db.jazzLearningRules.enabled=true;verify(without);assert.equal(without.jazzLearning,null);assert.notEqual(signature(learned),signature(without),'measured jazz priors change actual music outside jazz');
 }
 console.log('Measured priors affect pop and R&B; all required rules passed.');
 // Native jazz has an instrument-aware voicing vocabulary and independent A/B/chorus phrasing.
 const jazz=api.generateGuide({...base,genre:'jazz',subgenre:'swing-jazz',style:'jazz-rootless',bpm:124});verify(jazz);assert.equal(jazz.jazzLearning.group,'swing');assert.ok(jazz.sections[2].parts.topline.hook.core.length>=3);
 const modal=api.generateGuide({...base,genre:'jazz',subgenre:'modal-jazz',style:'jazz-quartal',instrumental:true,customForm:[['verse',4],['chorus',4]],bpm:92});verify(modal);
 assert.ok(modal.sections.flatMap(s=>s.phrase).some(c=>c.voicingNotes.slice(1).some((p,i)=>p-c.voicingNotes[i]===5)),'quartal spacing is present in played voicings');
 const instrumental=api.generateGuide({...db.defaults,genre:'jazz',subgenre:'stride-jazz',style:'stride-piano',instrumental:true,introVocal:true,classical:0,bpm:112,seed:'stride-inst'});verify(instrumental);assert.equal(instrumental.bars,80);assert.equal(instrumental.story.hook,null);
 for(const section of instrumental.sections){assert.equal(section.instrumental,true);assert.equal(section.parts.topline.enabled,false);assert.equal(section.parts.topline.notes.length,0);assert.ok(section.parts.topline.events.every(e=>e.role==='rest'));assert.ok(section.arrangement.instruments.every(i=>i.role!=='melody'));assert.ok(section.orchestration.tracks.every(t=>t.role!=='melody'));assert.ok(api.createPlaybackEvents(section,'all').events.every(e=>e.part!=='topline'));assert.equal(api.createPlaybackEvents(section,'topline').events.length,0);}
 const intro=instrumental.sections[0],piano=intro.orchestration.tracks.find(t=>t.id==='piano');assert.ok(piano.events.some(e=>e.pitches.some(p=>p<48)),'solo stride intro supplies its own piano bass');
 const beatTwo=new Set(piano.events.filter(e=>e.start===4).flatMap(e=>e.pitches));assert.ok(beatTwo.size>1,'stride chords answer on beat two, including voices scheduled as separate sustained events');
 console.log('Instrumental mode: 80 bars, zero lead notes and zero lead playback events.');
 // Rootless voicings retain the defining third/seventh; a solo piano includes a root.
 context.config={...base,genre:'jazz',subgenre:'swing-jazz',style:'jazz-rootless'};vm.runInContext('this.local=makeContext(normalizeConfig(config))',context);
 context.chord={root:2,quality:'minor',tones:[2,5,9,0,4],notes:[53,57,60,64]};
 const options=vm.runInContext('jazzVoicingOptions(local,chord,DB.instrumentProfiles.piano,true)',context);assert.ok(options.length);assert.ok(options.every(notes=>notes.some(p=>p%12===5)&&notes.some(p=>p%12===0)&&notes.every(p=>p%12!==2)));
 const solo=vm.runInContext('jazzVoicingOptions(local,chord,DB.instrumentProfiles.piano,false)',context);assert.ok(solo.length&&solo.every(notes=>notes[0]%12===2&&notes.at(-1)-notes[1]<=db.jazzLearningRules.theory.handSpan));
 const nodes=new Map();context.document={getElementById(id){if(!nodes.has(id))nodes.set(id,{innerHTML:''});return nodes.get(id);}};vm.runInContext('buildControls()',context);const controls=nodes.get('controls').innerHTML;
 assert.equal((controls.match(/id="field-instrumental"/g)??[]).length,1);assert.equal((controls.match(/id="intro-part-controls"/g)??[]).length,1);assert.ok(controls.indexOf('id="setup-vocal"')<controls.indexOf('id="field-instrumental"'));
 context.instrumentalSection=intro;assert.match(vm.runInContext("renderPartPlans(instrumentalSection,'topline',0)",context),/인스트루멘털 설정/);
 const choices=db.settingsFlow.steps.flatMap(s=>s.fields??s.blocks.flatMap(b=>b.fields)).concat(db.settingsFlow.advanced.fields);assert.equal(new Set(choices).size,db.fields.length);
});
