const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');

test('2.9 generation failures, setting identity, voice presets and staged controls',()=>{
 const root=path.join(__dirname,'..'),html=fs.readFileSync(path.join(root,'index.html'),'utf8'),source=html.match(/<script>([\s\S]*?)<\/script>/)[1],context=vm.createContext({});
 vm.runInContext(source,context);const api=context.MusicMaker,db=api.database;
 assert.equal(api.validateDatabase(),true);assert.equal(db.version,'2.9.0');assert.ok(db.storage.key);
 assert.equal(db.moods.length,24);assert.equal(db.styles.length,23);
 assert.deepEqual(Array.from(db.vocalRanges,r=>r.id),['baritone','tenor','alto','mezzo-soprano','soprano']);
 for(const [old,id]of Object.entries(db.vocalRangeRules.aliases))assert.equal(api.normalizeConfig({vocalRange:old}).vocalRange,id);
 for(const mood of db.moods){const emotionTable=db.fields.find(f=>f.id==='toplineEmotion').table;assert.ok(db[emotionTable].some(e=>e.id===db.expressionRules.moodMap[mood.id]));assert.notEqual(db.identityRules.moodStarts[mood.id],undefined);}
 for(const style of db.styles.filter(s=>s.performance)){
  assert.ok(db.instruments.some(i=>i.id===style.performance.harmony));assert.ok(style.performance.comp.every(id=>db.performanceIdioms.comp.patterns[id]?.length));
 }
 const fields=db.settingsFlow.steps.flatMap(s=>s.fields??s.blocks.flatMap(b=>b.fields)).concat(db.settingsFlow.advanced.fields);
 assert.equal(fields.length,db.fields.length);assert.equal(new Set(fields).size,fields.length);assert.ok(fields.every(id=>db.fields.some(f=>f.id===id)));
 assert.deepEqual(Array.from(db.settingsFlow.steps,s=>s.label),['곡의 방향','송폼과 전개','키와 코드','보컬','드럼과 베이스','반주와 밀도']);
 const nodes=new Map();context.document={getElementById(id){if(!nodes.has(id))nodes.set(id,{innerHTML:'',open:false,querySelector(){return{focus(){}};},scrollIntoView(){}});return nodes.get(id);}};
 vm.runInContext('buildControls()',context);const controls=nodes.get('controls').innerHTML;
 for(const field of db.fields)assert.equal(controls.split('id="field-'+field.id+'"').length-1,1,'each setting appears once: '+field.id);
 assert.equal((controls.match(/data-setup-next=/g)??[]).length,6);assert.match(controls,/<optgroup label="피아노·건반">/);assert.match(controls,/보컬 성부 \/ 음역/);
 vm.runInContext('advanceSetup(0)',context);assert.equal(nodes.get('setup-direction').open,false);assert.equal(nodes.get('setup-form').open,true);
 assert.match(html,/pending-notice instruction/);

 // A valid D -> E tension at a section entry used to be rejected because its preparation was in the preceding section.
 context.synthetic={kind:'outro',phraseBars:8,phrase:[{id:'vi',root:9,tones:[9,0,4,7],quality:'minor',bar:0,duration:8}],incomingTopline:{pitch:64,start:-7,duration:3,role:'chord',chordId:'vi',chordTones:[9,0,4,7]},parts:{topline:{notes:[{pitch:62,start:1,duration:2,strong:false,role:'tension',resolvesTo:{pitch:64,start:4}},{pitch:64,start:4,duration:3,role:'chord'}]}}};
 vm.runInContext('this.local=makeContext(normalizeConfig({artistStyle:"kenshi-yonezu"}))',context);
 assert.equal(vm.runInContext('melodicFigureErrors(local,synthetic)',context),0);
 const incoming=context.synthetic.incomingTopline;context.synthetic.incomingTopline=null;assert.equal(vm.runInContext('melodicFigureErrors(local,synthetic)',context),1);context.synthetic.incomingTopline=incoming;
 context.synthetic.parts.topline.notes[1].pitch=65;assert.ok(vm.runInContext('melodicFigureErrors(local,synthetic)',context)>0,'unresolved dissonance still fails');

 const verify=guide=>{
  assert.equal(guide.revision,db.generationIdentity.revision);const range=db.vocalRanges.find(r=>r.id===guide.config.vocalRange);
  for(const section of guide.sections){assert.equal(section.interaction.rules.valid,true);assert.equal(section.interaction.metrics.unresolved,0);assert.equal(section.interaction.metrics.instrumentRangeErrors,0);assert.equal(section.interaction.ensemble.valid,true);
   assert.ok(section.parts.topline.notes.every(n=>n.pitch>=range.lower&&n.pitch<=range.upper));
  }
 };
 // This full default Kenshi song previously failed at the outro, despite all candidate harmonies being legal.
 const regression=api.generateGuide({...db.defaults,artistStyle:'kenshi-yonezu'});verify(regression);assert.equal(regression.bars,80);assert.equal(regression.sections.at(-1).kind,'outro');
 console.log('Known artist configuration: all 80 bars passed required music rules.');
 const base={...db.defaults,form:'custom',customForm:[['verse',8],['chorus',8]],classical:0,bpm:92,subgenre:'ballad',style:'piano-broken',seed:'same-settings-review'};
 const configs=[base,{...base,mood:'brooding'},{...base,genre:'rock',subgenre:'jrock'},{...base,artistStyle:'kenshi-yonezu'},{...base,style:'guitar-strum'}],guides=configs.map(config=>{const guide=api.generateGuide(config);verify(guide);return guide;});
 const fingerprint=guide=>JSON.stringify(guide.sections.map(s=>({chords:s.phrase.map(c=>[c.id,c.level,c.duration]),voice:s.parts.topline.notes.map(n=>[n.start,n.duration,n.pitch]),drums:s.parts.drums.events.map(e=>[e.start,e.voice]),backing:s.orchestration.tracks.filter(t=>t.role==='harmony').map(t=>[t.id,t.events.map(e=>[e.start,e.duration,e.pitches])])})));
 const initial=fingerprint(guides[0]);for(const guide of guides.slice(1))assert.notEqual(fingerprint(guide),initial,'changed musical settings must change generated notes, not only the heading');
 assert.equal(new Set(guides.map(g=>g.story.kernel.id)).size,guides.length,'each setting combination has a distinct theme identity');
 assert.equal(fingerprint(api.generateGuide(base)),initial,'same settings and seed reproduce the same arrangement');
 for(const[guide,id]of[[guides[0],'piano'],[guides[4],'guitar']])for(const s of guide.sections)assert.equal(s.orchestration.tracks.find(t=>t.role==='harmony').id,id);
 console.log('Mood, subgenre, artist and accompaniment changes differ; repeated settings reproduce.');
 for(const[vocalRange,style]of[['baritone','piano-wide'],['soprano','synth-pad']]){
  const guide=api.generateGuide({...base,vocalRange,style,customForm:[['verse',4],['chorus',4]]});verify(guide);
  const events=api.createPlaybackEvents(guide.sections[1],'chords').events;assert.ok(events.length);assert.ok(events.every(e=>e.instrument===(style==='synth-pad'?'synth':'piano')));
 }
 // Playback selects the chosen accompaniment's actual timbre.
 const waves=[],parameter={setValueAtTime(){},linearRampToValueAtTime(){},exponentialRampToValueAtTime(){}},audioNode=()=>({connect(){},disconnect(){}});
 context.audioStub={createOscillator(){const oscillator={...audioNode(),frequency:parameter,start(){waves.push(this.type);},stop(){}};return oscillator;},createBiquadFilter(){return{...audioNode(),frequency:{value:0}};},createGain(){return{...audioNode(),gain:parameter};}};
 vm.runInContext("guidePlayer.context=audioStub;guidePlayer.bus={};playPitchedEvent({part:'chords',instrument:'synth',track:'synth:harmony',velocity:80,pitches:[60],duration:1},0)",context);assert.ok(waves.length&&waves.every(w=>w===db.playback.timbres.synth.wave));

 // A failed sketch must try another rhythm while retaining the same strict music checks.
 const recoveryContext=vm.createContext({});vm.runInContext(source,recoveryContext);
 vm.runInContext("this.originalSearch=searchTopline;this.sketchAttempts=[];searchTopline=function(ctx,...args){sketchAttempts.push(ctx.toplineVariant);if(!ctx.toplineVariant)throw new Error(PU.noMelody);return originalSearch(ctx,...args);}",recoveryContext);
 const recovered=recoveryContext.MusicMaker.generateGuide({...base,customForm:[['verse',4],['chorus',4]]});verify(recovered);assert.ok(recovered.sections.every(s=>s.interaction.recoverySketch>0));assert.ok(recoveryContext.sketchAttempts.includes(0)&&recoveryContext.sketchAttempts.includes(1));
 vm.runInContext("searchTopline=function(){throw new Error(PU.noMelody)}",recoveryContext);assert.throws(()=>recoveryContext.MusicMaker.generateGuide({...base,customForm:[['verse',4]]}),/필수 음악 규칙/);
});
