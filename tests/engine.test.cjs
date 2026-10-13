const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');

test('shared harmony, vocal resolution, drum limbs, playable bass and guide export',()=>{
 const html=fs.readFileSync(path.join(__dirname,'..','index.html'),'utf8');
 const script=html.match(/<script>([\s\S]*?)<\/script>/)[1];
 const context=vm.createContext({});
 vm.runInContext(script,context);
 const api=context.MusicMaker,db=api.database;
 assert.equal(api.validateDatabase(),true);
 const defaults=api.generateGuide(db.defaults);
 assert.equal(JSON.stringify(defaults),JSON.stringify(api.generateGuide(db.defaults)),'seed must reproduce every section and voicing');
 const dry=api.generateGuide({...db.defaults,jazzy:0,classical:0,form:'compact'});
 assert.equal(dry.diagnostics.extension,0);
 assert.equal(dry.diagnostics.borrowed,0);
 assert.equal(dry.diagnostics.applied,0);
 assert.equal(dry.diagnostics.orchestra,0);
 const rich=api.generateGuide({...db.defaults,genre:'jazz',key:'Gb',mode:'minor',jazzy:100,classical:100,complexity:100,form:'aaba',meter:'6-8'});
 assert.ok(rich.diagnostics.extension>dry.diagnostics.extension);
 assert.ok(rich.diagnostics.orchestra>dry.diagnostics.orchestra);
 assert.equal(rich.diagnostics.swing,0,'6/8 uses compound pulse, not swung eighths');
 assert.equal(rich.seconds,40,'32 bars with two dotted-quarter pulses at 96 BPM');
 const forced=api.generateGuide({...db.defaults,progression:'custom',customProgression:'ii V I V/ii',jazzy:80,form:'compact'});
 const fast=api.generateGuide({...db.defaults,mode:'minor',meter:'3-4',bpm:220,jazzy:0,classical:100,vocalRange:'lower',bassMotion:100,drumDetail:100,form:'compact'});
 const compoundFast=api.generateGuide({...db.defaults,meter:'6-8',bpm:220,bassMotion:100,drumDetail:100,form:'compact'});
 assert.equal(forced.sections[0].phrase.map(event=>event.id).join(','),'ii,V,I,V/ii');
 assert.throws(()=>api.generateGuide({...db.defaults,progression:'custom',customProgression:'I V/ii IV V'}),/세컨더리/);
 assert.throws(()=>api.generateGuide({...db.defaults,progression:'custom',customProgression:'I <script>'}),/가능한 코드/);
 assert.throws(()=>api.generateGuide({...db.defaults,seed:''}),/시드/);
 assert.equal(api.normalizeConfig({...db.defaults,bpm:999,jazzy:-5}).bpm,220);
 for(const guide of[defaults,dry,rich,forced,fast,compoundFast]){
  let covered=0;
  for(const section of guide.sections){
   assert.equal(section.start,covered+1);
   assert.equal(section.events.reduce((total,event)=>total+event.duration,0),section.bars);
   assert.equal(section.phraseBars*section.repeats,section.bars);
   assert.ok(Number.isFinite(section.score));
   assert.ok(section.evaluations>0);
   const parts=section.parts,grid=db.parts.meters[guide.config.meter],range=db.vocalRanges.find(range=>range.id===guide.config.vocalRange),total=section.phraseBars*grid.barTicks;
   const chordAt=start=>section.phrase.find(chord=>start>=chord.bar*grid.barTicks&&start<(chord.bar+chord.duration)*grid.barTicks);
   assert.equal(parts.topline.events.reduce((sum,event)=>sum+event.duration,0),total,'notes and rests must cover the full harmonic phrase');
   assert.ok(parts.topline.evaluations>0&&parts.bass.evaluations>0);
   assert.equal(parts.topline.stock,0,'default high novelty excludes the known stock contours');
   for(let start=0;start<total;start+=grid.barTicks*db.parts.phraseBars){
    const end=Math.min(total,start+grid.barTicks*db.parts.phraseBars);
    assert.ok(parts.topline.events.some(event=>event.pitch===null&&Math.min(end,event.start+event.duration)-Math.max(start,event.start)>=parts.topline.breathTicks),'tempo-adjusted breath per two bars');
   }
   for(const[index,note]of parts.topline.notes.entries()){
    const meter=db.meters.find(meter=>meter.id===guide.config.meter);
    assert.ok(note.duration>=Math.ceil(guide.config.bpm*meter.pulseQuarters*db.parts.ticksPerQuarter/(60*db.parts.vocal.maxSyllablesPerSecond)),'vocal speed includes the compound BPM pulse');
    assert.ok(note.pitch>=range.lower&&note.pitch<=range.upper);
    const chord=chordAt(note.start);
    if(note.anchor)assert.ok(chord.tones.includes(note.pitch%12),'strong/long notes must belong to the sounding chord');
    if(index){const before=parts.topline.notes[index-1];assert.ok(Math.abs(note.pitch-before.pitch)<=db.parts.vocal.maxLeap);}
    if(note.role!=='chord'){
     assert.ok(!note.anchor&&note.resolvesTo,'ornaments need an explicit, immediate resolution');
     const next=parts.topline.notes[index+1],before=parts.topline.notes[index-1];
     assert.equal(note.resolvesTo.pitch,next.pitch);assert.equal(note.resolvesTo.start,next.start);
     assert.equal(note.start+note.duration,next.start);
     assert.ok(chordAt(next.start).tones.includes(next.pitch%12));
     assert.ok(Math.abs(next.pitch-note.pitch)<=db.parts.vocal.step);
     if(note.role==='neighbor')assert.equal(before.pitch,next.pitch);
     if(note.role==='passing')assert.equal(Math.sign(note.pitch-before.pitch),Math.sign(next.pitch-note.pitch));
     if(note.role==='approach')assert.equal(Math.abs(next.pitch-note.pitch),1);
    }
   }
   for(const hit of parts.drums.events){
    const together=parts.drums.events.filter(event=>event.start===hit.start);
    assert.ok(together.filter(event=>event.limb==='hand').length<=db.parts.drums.hands);
    assert.ok(together.filter(event=>event.limb==='foot').length<=db.parts.drums.feet);
    assert.equal(new Set(together.map(event=>event.voice)).size,together.length);
    assert.ok(hit.start>=0&&hit.start<total&&hit.velocity>0&&hit.velocity<=127);
    assert.ok(!together.some(event=>event.voice==='ride')||!together.some(event=>event.voice==='closedHat'),'one hand timekeeper');
   }
   for(const chord of section.phrase){
    const root=parts.bass.events.find(note=>note.start===chord.bar*grid.barTicks);
    assert.ok(root,'each chord change must retain a bass onset, including fast tempos');assert.equal(root.pitch%12,chord.root);
   }
   for(const[index,note]of parts.bass.events.entries()){
    const meter=db.meters.find(meter=>meter.id===guide.config.meter);
    assert.ok(note.duration>=Math.ceil(guide.config.bpm*meter.pulseQuarters*db.parts.ticksPerQuarter/(60*db.parts.bass.maxNotesPerSecond)),'bass speed includes the compound BPM pulse');
    assert.ok(note.pitch>=db.parts.bass.lower&&note.pitch<=db.parts.bass.upper);
    assert.equal(db.parts.bass.tuning.find(string=>string.string===note.string).midi+note.fret,note.pitch);
    assert.ok(note.fret>=0&&note.fret<=db.parts.bass.frets);
    if(index)assert.ok(Math.abs(note.pitch-parts.bass.events[index-1].pitch)<=db.parts.bass.maxLeap);
    if(note.role==='approach'){
     const next=parts.bass.events[index+1];assert.equal(next.pitch,note.resolvesTo.pitch);assert.equal(Math.abs(next.pitch-note.pitch),1);assert.ok(!note.strong);
    }else assert.ok(chordAt(note.start).tones.includes(note.pitch%12));
   }
   for(const[index,event]of section.events.entries()){
    assert.equal(event.notes.length,4);
    assert.ok(event.notes.every((note,i)=>Number.isInteger(note)&&note>=db.engine.voicing.lower&&note<=db.engine.voicing.upper&&(i===0||note>event.notes[i-1])),'four strictly ordered voices in the configured range');
    assert.ok(event.notes.every(note=>event.tones.includes(note%12)),'voicing must match the advertised chord');
    assert.ok(event.bass<event.notes[0]);
    if(event.target&&index<section.events.length-1)assert.equal(section.events[index+1].id,event.target);
   }
   if(guide.config.progression==='auto'){
    const closure=db.sectionTypes[section.kind].closure,mode=db.modes.find(item=>item.id===guide.config.mode);
    if(closure==='T')assert.equal(section.events.at(-1).id,mode.tonic);
    if(closure==='D')assert.equal(section.events.at(-1).id,mode.dominant);
   }
   covered+=section.bars;
  }
  assert.equal(covered,guide.bars);
  const markdown=api.toMarkdown(guide);
  assert.ok(markdown.includes(guide.sections[0].events[0].symbol));
  assert.ok(markdown.includes(guide.config.seed));
  assert.ok(markdown.includes(db.partUI.title));
  assert.ok(markdown.includes(guide.sections[0].parts.topline.notes[0].note));
  assert.ok(markdown.includes(db.partUI.unitHelp));
  assert.ok(!markdown.includes('undefined'));
  const report={innerHTML:''};
  context.document={getElementById:()=>report};context.guide=guide;
  vm.runInContext('renderGuide(guide)',context);
  assert.ok(report.innerHTML.includes('data-action="json"'));
  assert.ok(report.innerHTML.includes('class="part-grid"'));
  assert.ok(!report.innerHTML.includes('undefined'));
  assert.equal((report.innerHTML.match(/class="section"/g)||[]).length,guide.sections.length);
 }
 // User-provided seed is inert text in HTML and remains available in structured export.
 const escaped={...defaults,config:{...defaults.config,seed:'<img src=x onerror=alert(1)>'}};
 const report={innerHTML:''};context.document={getElementById:()=>report};context.guide=escaped;
 vm.runInContext('renderGuide(guide)',context);
 assert.ok(!report.innerHTML.includes('<img src=x'));
 assert.ok(report.innerHTML.includes('&lt;img'));
});
