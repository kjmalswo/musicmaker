const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');

test('emotional phrasing, tempo and genre identity, fine bass grids and black mix labels',()=>{
 const html=fs.readFileSync(path.join(__dirname,'..','index.html'),'utf8'),context=vm.createContext({});
 vm.runInContext(html.match(/<script>([\s\S]*?)<\/script>/)[1],context);
 const api=context.MusicMaker,db=api.database;
 assert.equal(api.validateDatabase(),true);
 assert.equal(api.normalizeConfig({toplineEmotion:'invalid',bassSubdivision:'invalid'}).toplineEmotion,'auto');
 assert.equal(api.normalizeConfig({bassSubdivision:'invalid'}).bassSubdivision,'auto');
 assert.ok(db.toplineEmotions.some(profile=>profile.id==='volatile'));
 const common={...db.defaults,seed:'expression-contrast',classical:0,bpm:100,form:'custom',customForm:[['verse',4],['pre',8],['chorus',4]],progression:'custom',customProgression:'I, vi, IV, V'};
 const emotional=Object.fromEntries(['joyful','sad','dramatic','volatile','dark'].map(toplineEmotion=>[toplineEmotion,api.generateGuide({...common,toplineEmotion})]));
 const notes=guide=>guide.sections.flatMap(section=>section.parts.topline.notes);
 const mean=(values)=>values.reduce((sum,value)=>sum+value,0)/values.length;
 const fingerprint=guide=>JSON.stringify(guide.sections.map(section=>section.parts.topline.notes.map(note=>[note.pitch,note.start,note.duration,note.velocity])));
 assert.equal(new Set(Object.values(emotional).map(fingerprint)).size,5,'emotion changes performed melody, rhythm and dynamics');
 assert.ok(mean(notes(emotional.joyful).map(note=>note.pitch))>mean(notes(emotional.dark).map(note=>note.pitch)),'deep darkness uses a lower melodic register');
 assert.ok(mean(notes(emotional.sad).map(note=>note.duration))>mean(notes(emotional.joyful).map(note=>note.duration)),'sadness holds notes rather than only transposing them');
 assert.ok(notes(emotional.joyful).length>notes(emotional.sad).length,'joy and sadness have distinct rhythmic activity');
 for(const [id,guide]of Object.entries(emotional)){
  assert.equal(guide.config.toplineEmotion,id);assert.equal(guide.config.key,common.key);assert.equal(guide.config.mode,common.mode);
  const range=db.vocalRanges.find(range=>range.id===guide.config.vocalRange);
  for(const section of guide.sections){
   assert.equal(section.parts.topline.expression.id,id);assert.equal(section.interaction.metrics.unresolved,0);
   assert.ok(section.interaction.rules.valid);assert.ok(section.parts.topline.notes.every(note=>note.pitch>=range.lower&&note.pitch<=range.upper));
   assert.deepEqual(Array.from(section.phrase.slice(0,4),chord=>chord.id),['I','vi','IV','V'],'the user chord recipe remains intact');
  }
  assert.equal(guide.sections[0].parts.topline.theme.role,'A');assert.equal(guide.sections[1].parts.topline.theme.role,'B');
  assert.ok(guide.sections[0].energy<guide.sections[1].energy&&guide.sections[1].energy<guide.sections[2].energy);
 }
 const tempoBase={...db.defaults,seed:'tempo-shape',classical:0,form:'custom',customForm:[['chorus',8]]};
 const slow=api.generateGuide({...tempoBase,bpm:70}),fast=api.generateGuide({...tempoBase,bpm:155}),rock=api.generateGuide({...tempoBase,bpm:155,subgenre:'pop-rock'});
 assert.equal(slow.tempo.family,'acoustic');assert.equal(fast.tempo.family,'dance');assert.equal(rock.sections[0].ensemble.family,'rock');
 assert.notEqual(slow.sections[0].ensemble.family,fast.sections[0].ensemble.family);
 assert.ok(slow.sections[0].hold>fast.sections[0].hold,'tempo changes harmonic phrasing');
 assert.ok(slow.sections[0].energy<fast.sections[0].energy);
 assert.ok(slow.sections[0].density<fast.sections[0].density);
 assert.notEqual(fingerprint(slow),fingerprint(fast),'BPM affects notes and rhythm, not only playback speed');
 const rnb=api.generateGuide({...tempoBase,bpm:100,subgenre:'rnb-pop'}),kpop=api.generateGuide({...tempoBase,bpm:100,subgenre:'kpop'});
 assert.notEqual(fingerprint(rnb),fingerprint(kpop));
 assert.notEqual(JSON.stringify(rnb.sections[0].parts.drums.events.map(hit=>[hit.voice,hit.start])),JSON.stringify(kpop.sections[0].parts.drums.events.map(hit=>[hit.voice,hit.start])));
 const fineBase={...tempoBase,bpm:40,bassMotion:100,bassStyle:'pick',bassGhost:100,drumSubdivision:'8',customForm:[['chorus',4]]};
 const bassGuides=['8','16','32'].map(bassSubdivision=>api.generateGuide({...fineBase,bassSubdivision}));
 for(const guide of bassGuides){
  const section=guide.sections[0],bass=section.parts.bass,step=db.bassSubdivisionRules.steps[guide.config.bassSubdivision];
  assert.equal(bass.gridStep,step);assert.equal(bass.resolution,guide.config.bassSubdivision);
  assert.ok(bass.events.every(note=>note.start%step===0&&note.duration%step===0));
  assert.equal(section.interaction.metrics.rootCoverage,1);assert.equal(section.interaction.metrics.fretErrors,0);
  assert.ok(section.interaction.ensemble.support>=db.ensemble.groove.kickLock);
  const attacks=bass.events.filter(note=>note.role!=='rest');
  for(let index=1;index<attacks.length;index++)assert.ok(attacks[index].performance.startMs-attacks[index-1].performance.startMs>=1000/Math.min(db.parts.bass.maxNotesPerSecond,db.bassStyles.find(style=>style.id===guide.config.bassStyle).maxAttacks)-.02,'bass attacks remain physically playable');
  assert.ok(Math.abs(bass.events.reduce((sum,event)=>sum+event.duration,0)-section.parts.bars*section.parts.barTicks)<1e-8);
  const playback=api.createPlaybackEvents(section,'bass');assert.ok(playback.events.every(event=>event.duration>0&&Number.isFinite(event.start)));
 }
 assert.ok(bassGuides[1].sections[0].parts.bass.events.some(note=>note.start%2===1),'16th bass placements are produced');
 const bassFine=bassGuides[2].sections[0];assert.ok(bassFine.parts.bass.events.some(note=>note.start%1===.5),'32nd bass placements are produced');
 assert.ok(bassFine.parts.bass.events.some(note=>note.role!=='rest'&&note.duration===.5),'32nd bass note lengths are produced');
 context.part=bassFine.parts;context.events=bassFine.parts.bass.events.filter(note=>note.start<bassFine.parts.barTicks);
 assert.ok(vm.runInContext('renderNotePattern(events,part,part.bass.gridStep)',context).includes('--ticks:32'));
 const alternate=api.generateGuide({...common,toplineEmotion:'joyful',seed:'expression-another'}),repeat=api.generateGuide({...common,toplineEmotion:'joyful'});
 assert.notEqual(fingerprint(emotional.joyful),fingerprint(alternate),'seed changes shared musical ideas');
 assert.equal(JSON.stringify(emotional.joyful),JSON.stringify(repeat),'same version, settings and seed reproduce the arrangement');
 const prediction=api.predictSettings({...common,toplineEmotion:'auto',mood:'wistful'});
 assert.equal(prediction.toplineEmotion.id,'sad');assert.ok(api.toMarkdown(emotional.dark).includes(db.toplineEmotions.find(profile=>profile.id==='dark').label));
 assert.ok(html.includes('.playback-mix .playback-buttons button{color:var(--buttonText)}'));
 assert.equal(db.visualTheme.buttonText,'#000000');
});
