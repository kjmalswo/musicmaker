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

test('hierarchical genres, editable song form, chord recipes and setting previews',()=>{
 const html=fs.readFileSync(path.join(__dirname,'..','index.html'),'utf8'),context=vm.createContext({});
 vm.runInContext(html.match(/<script>([\s\S]*?)<\/script>/)[1],context);
 const api=context.MusicMaker,db=api.database;
 assert.equal(api.validateDatabase(),true);
 const field=db.fields.find(field=>field.id==='subgenre');
 assert.ok(api.selectOptions(field,{genre:'pop'}).every(option=>option.parent==='pop'));
 assert.ok(api.selectOptions(field,{genre:'pop'}).length>=10);
 assert.equal(api.normalizeConfig({...db.defaults,genre:'rock',subgenre:'rnb-pop'}).subgenre,'alternative-rock');
 assert.equal(api.normalizeConfig({genre:'rnb'}).subgenre,'contemporary-rnb','old saved settings acquire a compatible child');
 const input={...db.defaults,genre:'pop',form:'compact',seed:'subgenre-fixture'};
 const rnb=api.generateGuide({...input,subgenre:'rnb-pop'}),rock=api.generateGuide({...input,subgenre:'pop-rock'}),ballad=api.generateGuide({...input,subgenre:'ballad'}),jpop=api.generateGuide({...input,subgenre:'jpop'}),kpop=api.generateGuide({...input,subgenre:'kpop'});
 assert.equal(JSON.stringify(rnb),JSON.stringify(api.generateGuide({...input,subgenre:'rnb-pop'})));
 assert.ok(rnb.diagnostics.swing>rock.diagnostics.swing);
 assert.equal(rnb.sections[0].arrangement.instruments.find(item=>item.role==='harmony').id,'rhodes');
 assert.equal(rock.sections[0].arrangement.instruments.find(item=>item.role==='harmony').id,'electricGuitar');
 const density=guide=>guide.sections.find(section=>section.kind==='chorus').parts.topline.notes.length/guide.sections.find(section=>section.kind==='chorus').parts.bars;
 assert.ok(density(jpop)>density(ballad),'a melodic J-pop direction and sustained ballad direction change actual line density');
 assert.notEqual(kpop.sections.find(section=>section.kind==='chorus').energy,rnb.sections.find(section=>section.kind==='chorus').energy);
 const sequence=[['verse',12],['pre',4],['chorus',8],['bridge',4],['chorus',8]];
 const custom=api.generateGuide({...input,form:'custom',customForm:sequence});
 assert.equal(custom.sections.map(section=>section.kind).join(','),sequence.map(row=>row[0]).join(','));
 assert.equal(custom.bars,36);assert.ok(!custom.sections.some(section=>section.kind==='intro'||section.kind==='outro'));
 const short=api.generateGuide({...input,form:'custom',customForm:[['verse',1],['chorus',2]]});
 assert.equal(short.bars,3);assert.ok(short.sections.every(section=>Number.isFinite(section.score)));
 const both=api.generateGuide({...input,form:'custom',customForm:[['intro',2],['verse',8],['chorus',8],['outro',2]]});
 assert.equal(both.sections[0].kind,'intro');assert.equal(both.sections.at(-1).kind,'outro');
 for(const sequence of[[],[['unknown',8]],[['verse',0]],[['verse',2.5]],Array.from({length:21},()=>['verse',8])])assert.throws(()=>api.normalizeSongform(sequence),/송폼/);
 const money=api.generateGuide({...input,progression:'money'}),royal=api.generateGuide({...input,progression:'royal'}),jazz=api.generateGuide({...input,progression:'251'});
 assert.equal(money.sections[0].phrase.map(chord=>chord.id).join(','),'I,V,vi,IV');
 assert.equal(royal.sections[0].phrase.map(chord=>chord.id).join(','),'IV,V,iii,vi');
 assert.equal(jazz.progressionPlan.events.length,8);
 assert.equal(jazz.progressionPlan.events.slice(0,3).map(chord=>chord.id).join(','),'ii,V,I');
 assert.equal(jazz.progressionPlan.events.reduce((bars,event)=>bars+event.duration,0),8);
 const jazzDry=api.generateGuide({...input,progression:'251',subgenre:'ballad',jazzy:0,form:'custom',customForm:[['chorus',16]]});
 const jazzMinor=api.generateGuide({...input,progression:'251',mode:'minor',classical:100,form:'custom',customForm:[['chorus',8],['pre',8]]});
 const jazzIrregular=api.generateGuide({...input,progression:'251',form:'custom',customForm:[['verse',12],['pre',4],['outro',2]]});
 const jazzShort=api.generateGuide({...input,progression:'251',form:'custom',customForm:[['verse',1],['chorus',2]]});
 assert.equal(jazzDry.sections[0].phraseBars,8,'a slow ballad still receives an eight-bar jazz phrase');
 assert.equal(jazzDry.sections[0].repeats,2);
 assert.equal(jazzMinor.progressionPlan.events.slice(0,3).map(chord=>chord.id).join(','),'ii°,V,i');
 assert.equal(jazzMinor.sections[0].phrase.at(-1).id,'i');assert.equal(jazzMinor.sections[1].phrase.at(-1).id,'V');
 assert.equal(jazzIrregular.bars,18);assert.equal(jazzIrregular.sections[0].phraseBars,12);
 assert.equal(jazzShort.bars,3);assert.equal(jazzShort.sections.length,2,'the eight-bar reference does not add sections to the custom form');
 for(const guide of[jazz,jazzDry,jazzMinor,jazzIrregular,jazzShort]){
  assert.equal(guide.progressionPlan.bars,8);assert.equal(guide.progressionPlan.events.length,8);
  assert.ok(guide.progressionPlan.events.some(event=>event.source==='applied'),'the jazz sketch develops beyond the three-chord loop');
  assert.ok(guide.progressionPlan.events.every(event=>event.level>0));
  for(const section of[...guide.sections,{events:guide.progressionPlan.events}])for(const[index,event]of section.events.entries()){
   if(event.target)assert.equal(section.events[index+1]?.id,event.target,'every applied dominant resolves to its actual target');
  }
  assert.ok(api.toMarkdown(guide).includes(guide.progressionPlan.title));
 }
 assert.throws(()=>api.generateGuide({...input,form:'custom',customForm:[['verse',1]],progression:'canon',bpm:220,meter:'6-8'}),/너무 빠릅니다/);
 for(const guide of[rnb,rock,ballad,jpop,kpop,custom,short,both,money,royal,jazz,jazzIrregular,jazzShort]){
  assert.equal(guide.config.bpm,input.bpm);assert.equal(guide.config.jazzy,input.jazzy);assert.equal(guide.config.classical,input.classical);
  for(const section of guide.sections){
   assert.equal(section.events.reduce((total,event)=>total+event.duration,0),section.bars);
   assert.equal(section.parts.topline.events.reduce((total,event)=>total+event.duration,0),section.phraseBars*section.parts.barTicks);
   assert.ok(section.parts.topline.notes.every(note=>note.pitch>=55&&note.pitch<=74));
   for(const note of section.parts.topline.notes)if(note.role!=='chord')assert.ok(note.resolvesTo);
  }
  assert.ok(api.toMarkdown(guide).includes(db.subgenres.find(child=>child.id===guide.config.subgenre).label));
 }
 const wide=api.predictSettings({...input,style:'wide'}),groovy=api.predictSettings({...input,style:'groovy'});
 assert.ok(groovy.density>wide.density);assert.ok(wide.instruments.length>0);assert.equal(wide.bpm,undefined);
 assert.equal(wide.config.bpm,input.bpm);assert.equal(wide.config.form,input.form);
 const introPreview=api.predictSettings({...input,form:'custom',customForm:[['intro',2]]});
 assert.equal(introPreview.section,'Intro');assert.ok(introPreview.density<wide.density||introPreview.density<groovy.density);
 const elements=new Map();
 const element=id=>{if(!elements.has(id))elements.set(id,{value:'',innerHTML:'',textContent:'',dataset:{},setAttribute(){},classList:{add(){}}});return elements.get(id);};
 context.document={getElementById:element};context.selection={...input,genre:'rock',subgenre:'jpop'};
 vm.runInContext('buildControls();writeConfig(selection)',context);
 assert.equal(element('field-subgenre').value,'alternative-rock');
 assert.ok(!element('field-subgenre').innerHTML.includes('rnb-pop'));
 element('field-genre').value='pop';vm.runInContext('refreshFields()',context);
 assert.equal(element('field-subgenre').value,'contemporary-pop');assert.equal(Number(element('field-bpm').value),input.bpm);
 assert.ok(element('setting-preview').innerHTML.includes(db.previewUI.title));
 assert.ok(element('help-mood').textContent.includes(db.moods.find(mood=>mood.id===input.mood).description));
 element('field-form').value='custom';element('field-customForm').value=JSON.stringify([['intro',4],['verse',8],['chorus',8],['outro',4]]);
 function action(op,index){context.actionEvent={target:{closest:()=>({dataset:{formOp:op,index:String(index)}})}};vm.runInContext('handleSongformAction(actionEvent)',context);}
 action('remove',0);action('remove',2);action('duplicate',1);action('down',0);
 assert.equal(JSON.parse(element('field-customForm').value).map(row=>row[0]).join(','),'chorus,verse,chorus');
 element('form-add-type').value='intro';action('add',0);
 assert.equal(JSON.parse(element('field-customForm').value).at(-1)[0],'intro');
 assert.ok(element('songform-rows').innerHTML.includes('data-form-op="remove"'));
 assert.ok(element('songform-rows').innerHTML.includes('data-form-op="up"'));
 context.crypto={getRandomValues:array=>{array.fill(1234);return array;}};vm.runInContext('makeNewSeed()',context);
 assert.ok(element('field-seed').value.startsWith(db.seedUI.prefix));
 assert.equal(element('field-seed').value.length,db.seedUI.prefix.length+db.seedUI.words*db.seedUI.hexWidth);
 context.guide=custom;vm.runInContext('renderGuide(guide)',context);
 assert.ok(element('report').innerHTML.includes(custom.summary.subgenre));
 assert.ok(!element('report').innerHTML.includes('undefined'));
 context.guide=jazz;vm.runInContext('renderGuide(guide)',context);
 assert.ok(element('report').innerHTML.includes(jazz.progressionPlan.title));
 assert.ok(element('report').innerHTML.includes('8마디:'));
 assert.ok(api.toMarkdown(custom).includes('Verse (12마디)'));
});
