const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');

test('performed vocal identity, literal chorus reprises and transposed singable hooks',()=>{
 const html=fs.readFileSync(path.join(__dirname,'..','index.html'),'utf8'),context=vm.createContext({});
 vm.runInContext(html.match(/<script>([\s\S]*?)<\/script>/)[1],context);const api=context.MusicMaker,db=api.database;
 assert.equal(api.validateDatabase(),true);assert.ok(db.songformUI.label&&db.songformUI.sectionInstance,'song form DB remains valid after numbered labels');
 const configs=[
  {...db.defaults,classical:0},
  {...db.defaults,classical:0,artistStyle:'higedan',seed:'vocal-identity',form:'custom',customForm:[['verse',4],['pre',4],['chorus',8],['bridge',4],['chorus',8]]},
  {...db.defaults,classical:0,artistStyle:'bruno-mars',seed:'rhythmic-identity',bpm:140,toplineEmotion:'dark',form:'custom',customForm:[['chorus',4],['chorus',4]]},
  {...db.defaults,classical:0,jazzy:0,vocalRange:'lower',bpm:220,form:'custom',customForm:[['verse',1]]}
 ];
 let first;
 for(const config of configs){
  const guide=api.generateGuide(config);first??=guide;
  const sections=guide.sections.filter(section=>section.parts.topline.hook),range=db.vocalRanges.find(range=>range.id===guide.config.vocalRange);
  assert.ok(sections.length>0,'a performed melody always has an identity section');
  for(const section of guide.sections){assert.ok(section.interaction.rules.valid);assert.equal(section.interaction.metrics.unresolved,0);}
  const initial=sections[0],core=initial.parts.topline.hook.core;assert.ok(core.length>=3);
  for(const section of sections){
   const hook=section.parts.topline.hook,notes=section.parts.topline.notes.filter(note=>note.hookCore),focus=notes.find(note=>note.hookFocus);
   assert.ok(focus&&focus.duration>=Math.min(db.parts.meters[guide.config.meter].pulseTicks,section.parts.barTicks/notes.length));
   const span=Math.max(...notes.map(note=>note.pitch))-Math.min(...notes.map(note=>note.pitch));
   assert.ok(span>=db.vocalHookRules.types[hook.type].minimumSpan,'a flat background line cannot pass as a hook');
   assert.ok(notes.every(note=>note.pitch>=range.lower&&note.pitch<=range.upper&&Number.isFinite(note.velocity)));
   assert.ok(section.parts.topline.figures.ratio<=db.nonChordRules.maxRatio);
   if(section!==initial){
    assert.ok(hook.reprise);assert.equal(notes.length,core.length);const shift=section.tonality.shift-initial.tonality.shift;
    for(let index=0;index<core.length;index++){
     assert.equal(notes[index].start,core[index].start);assert.equal(notes[index].duration,core[index].duration);
     assert.equal(notes[index].pitch,core[index].pitch+shift,'the identity is transposed as a whole rather than regenerated');
     assert.equal(notes[index].role,core[index].role);
    }
    assert.deepEqual(Array.from(section.phrase,chord=>[chord.id,chord.quality,chord.level]),Array.from(initial.phrase,chord=>[chord.id,chord.quality,chord.level]),'reprise retains the harmonic foundation');
   }
   const playback=api.createPlaybackEvents(section,'topline');assert.ok(playback.events.every(event=>event.duration>0&&event.pitches.every(Number.isFinite)));
   context.section=section;
   assert.ok(vm.runInContext("renderPartPlans(section,'topline',0)",context).includes(db.vocalHookRules.ui.title),'the singer can find the identity in the guide');
  }
  if(guide.config.form==='pop'){
   assert.equal(guide.bars,80);assert.deepEqual(Array.from(guide.sections.filter(section=>section.kind==='chorus'),section=>section.label),[1,2,3].map(number=>db.sectionTypes.chorus.label+' '+number));
  }
 }
 const repeat=api.generateGuide(configs[0]);assert.equal(JSON.stringify(first),JSON.stringify(repeat));
 assert.ok(api.toMarkdown(first).includes(db.vocalHookRules.ui.title));
});
