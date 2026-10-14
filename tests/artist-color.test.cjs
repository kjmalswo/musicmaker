const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');

test('artist phrasing and ensemble color with resolved non-chord tones and 80-bar pop form',()=>{
 const html=fs.readFileSync(path.join(__dirname,'..','index.html'),'utf8'),context=vm.createContext({});
 vm.runInContext(html.match(/<script>([\s\S]*?)<\/script>/)[1],context);
 const api=context.MusicMaker,db=api.database;
 assert.equal(api.validateDatabase(),true);
 const requested=[['intro',8],['verse',8],['pre',8],['chorus',8],['verse',8],['pre',8],['bridge',8],['chorus',8],['chorus',8],['outro',8]];
 assert.deepEqual(JSON.parse(JSON.stringify(db.forms.find(form=>form.id==='pop').sections)),requested);
 const common={...db.defaults,seed:'artist-color',bpm:108,classical:0,tonalPlan:'stay',form:'custom',customForm:[['verse',4],['chorus',4]],progression:'custom',customProgression:'I, vi, IV, V',toplineEmotion:'tender'};
 const fingerprints=new Set(),rhythms=new Set(),grooves=new Set(),allRoles=new Set();let bruno,bill,tiedSection;
 for(const artist of db.artistStyles.filter(artist=>artist.id!=='none')){
  const guide=api.generateGuide({...common,artistStyle:artist.id});
  assert.equal(guide.config.artistStyle,artist.id);assert.equal(guide.config.customProgression,common.customProgression);
  fingerprints.add(JSON.stringify(guide.sections.map(section=>section.parts.topline.notes.map(note=>[note.pitch,note.start,note.duration]))));
  rhythms.add(JSON.stringify(guide.sections.map(section=>section.parts.topline.notes.map(note=>[note.start,note.duration]))));
  grooves.add(JSON.stringify(guide.sections.map(section=>section.ensemble.bars.map(bar=>[bar.kick,bar.harmony]))));
  let count=0;
  for(const section of guide.sections){
   assert.equal(section.parts.topline.color.id,artist.id);assert.equal(section.interaction.metrics.unresolved,0);
   assert.ok(section.interaction.rules.valid);assert.ok(section.parts.topline.figures.ratio<=db.nonChordRules.maxRatio,'stable tones remain the majority');
   assert.deepEqual(Array.from(section.phrase.slice(0,4),chord=>chord.id),['I','vi','IV','V']);
   const notes=section.parts.topline.notes,grid=db.parts.meters[guide.config.meter],range=db.vocalRanges.find(range=>range.id===guide.config.vocalRange);
   assert.ok(notes.every(note=>note.pitch>=range.lower&&note.pitch<=range.upper));
   for(const[index,note]of notes.entries()){
    const chord=section.phrase.find(chord=>note.start>=chord.bar*grid.barTicks&&note.start<(chord.bar+chord.duration)*grid.barTicks);
    if(note.role==='chord'){assert.ok(chord.tones.includes(note.pitch%12));continue;}
    count++;allRoles.add(note.role);assert.ok(!chord.tones.includes(note.pitch%12),'colored notes really leave the sounded chord');
    const before=notes[index-1],after=notes[index+1];assert.ok(before&&after);assert.equal(note.resolvesTo.pitch,after.pitch);assert.equal(note.resolvesTo.start,after.start);
    const targetChord=section.phrase.find(chord=>after.start>=chord.bar*grid.barTicks&&after.start<(chord.bar+chord.duration)*grid.barTicks);
    assert.ok(targetChord.tones.includes(after.pitch%12),'resolution is an actual chord tone');
    assert.ok(after.start-note.start<=grid.pulseTicks);assert.ok(after.start-note.start-note.duration<=db.nonChordRules.articulationGap);
    const enter=note.pitch-before.pitch,leave=after.pitch-note.pitch;
    if(note.role==='passing')assert.ok(Math.abs(enter)<=2&&Math.abs(leave)<=2&&enter*leave>0);
    if(note.role==='neighbor')assert.ok(Math.abs(enter)<=2&&after.pitch===before.pitch);
    if(note.role==='anticipation')assert.equal(after.pitch,note.pitch);
    if(note.role==='approach')assert.ok(Math.abs(enter)===1&&Math.abs(leave)===1);
    if(note.role==='appoggiatura')assert.ok(Math.abs(enter)>=3&&Math.abs(enter)<=7&&Math.abs(leave)<=2&&enter*leave<0);
    if(note.role==='suspension'){
     assert.equal(note.pitch,before.pitch);assert.equal(before.start+before.duration,note.start);assert.ok(leave<0&&leave>=-2);
     assert.equal(note.tieFrom.start,before.start);tiedSection=section;
    }
    context.auditInput={config:guide.config,section};
    const bad=JSON.parse(JSON.stringify(section));bad.parts.topline.notes[index].resolvesTo.pitch+=1;context.badSection=bad;
    assert.ok(vm.runInContext('melodicFigureErrors(makeContext(auditInput.config),badSection)>0',context),'bad resolutions fail the audit');
   }
  }
  assert.ok(count>0,artist.id+' has actual resolved non-chord motion');
  if(artist.id==='bruno-mars')bruno=guide;if(artist.id==='bill-evans')bill=guide;
 }
 assert.equal(fingerprints.size,8);assert.ok(rhythms.size>=7,'artist changes performed phrasing');assert.ok(grooves.size>=6,'artist changes the shared groove and comping');
 const averageDuration=guide=>{const notes=guide.sections.flatMap(section=>section.parts.topline.notes);return notes.reduce((sum,note)=>sum+note.duration,0)/notes.length;};
 assert.ok(averageDuration(bruno)<averageDuration(bill),'short soul phrasing differs from sustained jazz phrasing');
 assert.ok(allRoles.size>=3,'the engine uses different types of preparation and release');
 if(tiedSection){
  const source=tiedSection.parts.topline.notes.find(note=>note.role==='suspension'),before=tiedSection.parts.topline.notes.find(note=>note.start===source.tieFrom.start),playback=api.createPlaybackEvents(tiedSection,'topline');
  const attack=playback.events.find(event=>event.pitches[0]===before.pitch&&Math.abs(event.start-before.performance.startMs/1000)<.001);
  assert.ok(attack.start+attack.duration>=source.performance.releaseMs/1000-.002,'the tied suspension is actually sustained');
  assert.ok(!playback.events.some(event=>Math.abs(event.start-source.performance.startMs/1000)<.001&&event.pitches[0]===source.pitch),'the tie does not retrigger');
 }
 // Adversarial rule fixtures: the same pitches must obey entry, metrical role and release.
 context.config={...common,artistStyle:'higedan'};
 vm.runInContext(`globalThis.figureCtx=makeContext(config);globalThis.figureRange=byId('vocalRanges',config.vocalRange);
 globalThis.I={id:'I',quality:'major',root:0,tones:[0,4,7],bar:0};globalThis.V={id:'V',quality:'dominant',root:7,tones:[7,11,2],bar:1};
 globalThis.IV={id:'IV',quality:'major',root:5,tones:[5,9,0],bar:0};`,context);
 assert.ok(vm.runInContext("melodicFigurePlan(figureCtx,{start:2,duration:2,strong:false,chord:I},62,{start:0,duration:2,pitch:60,role:'chord',chordId:'I',chordTones:I.tones},{start:4,chord:I},figureRange).targets.some(t=>t.role==='passing'&&t.pitch===64)",context));
 assert.ok(vm.runInContext("melodicFigurePlan(figureCtx,{start:16,duration:2,strong:true,chord:V},72,{start:14,duration:2,pitch:72,role:'chord',chordId:'IV',chordTones:IV.tones},{start:18,chord:V},figureRange).targets.some(t=>t.role==='suspension'&&t.pitch===71)",context));
 assert.equal(vm.runInContext("melodicFigurePlan(figureCtx,{start:16,duration:2,strong:true,chord:I},65,{start:14,duration:2,pitch:64,role:'chord',chordId:'I',chordTones:I.tones},{start:18,chord:I},figureRange)",context),null,'an unprepared major-chord fourth cannot be held on a strong beat');
 const defaultGuide=api.generateGuide({...db.defaults,classical:0});assert.equal(defaultGuide.bars,80);
 assert.deepEqual(Array.from(defaultGuide.sections,section=>[section.kind,section.bars]),requested);
 assert.deepEqual(Array.from(defaultGuide.sections.filter(section=>section.kind==='chorus'),section=>section.occurrence),[0,1,2]);
 const repeat=api.generateGuide({...common,artistStyle:'bruno-mars'});assert.equal(JSON.stringify(bruno),JSON.stringify(repeat));
 assert.ok(api.toMarkdown(bill).includes(db.artistColorRules.roleLabels.tension));
});
