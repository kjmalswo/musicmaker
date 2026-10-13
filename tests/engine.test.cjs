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
   assert.ok(!parts.topline.enabled||parts.topline.evaluations>0);
   assert.ok(!parts.bass.enabled||parts.bass.evaluations>0);
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
    if(!parts.bass.enabled)continue;
    const root=parts.bass.events.find(note=>note.start===chord.bar*grid.barTicks);
    assert.ok(root,'each chord change must retain a bass onset, including fast tempos');assert.equal(root.pitch%12,chord.root);
   }
   const bassNotes=parts.bass.events.filter(note=>Number.isFinite(note.pitch));
   for(const[index,note]of bassNotes.entries()){
    const meter=db.meters.find(meter=>meter.id===guide.config.meter);
    if(index)assert.ok(note.start-bassNotes[index-1].start>=Math.ceil(guide.config.bpm*meter.pulseQuarters*db.parts.ticksPerQuarter/(60*db.parts.bass.maxNotesPerSecond)),'bass attack speed includes the compound BPM pulse');
    assert.ok(note.pitch>=db.parts.bass.lower&&note.pitch<=db.parts.bass.upper);
    assert.equal(db.parts.bass.tuning.find(string=>string.string===note.string).midi+note.fret,note.pitch);
    assert.ok(note.fret>=0&&note.fret<=db.parts.bass.frets);
    if(index)assert.ok(Math.abs(note.pitch-bassNotes[index-1].pitch)<=db.parts.bass.maxLeap);
    if(note.role==='approach'){
     const next=bassNotes[index+1];assert.equal(next.pitch,note.resolvesTo.pitch);assert.equal(Math.abs(next.pitch-note.pitch),1);assert.ok(!note.strong);
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
  assert.ok(markdown.includes(guide.sections.flatMap(section=>section.parts.topline.notes)[0].note));
  assert.ok(markdown.includes(db.partUI.unitHelp));
  assert.ok(!markdown.includes('undefined'));
  const report={innerHTML:''};
  context.document={getElementById:()=>report};context.guide=guide;
  vm.runInContext('renderGuide(guide)',context);
  assert.ok(report.innerHTML.includes('data-action="json"'));
  assert.ok(report.innerHTML.includes('class="result-tabs"'));
  assert.ok(!report.innerHTML.includes('undefined'));
  assert.equal((report.innerHTML.match(/id="result-section"/g)||[]).length,1);
  context.guide=guide;
  const printable=vm.runInContext('renderPrintableGuide(guide)',context);
  assert.equal((printable.match(/class="section"/g)||[]).length,guide.sections.length);
 }
 // User-provided seed is inert text in HTML and remains available in structured export.
 const escaped={...defaults,config:{...defaults.config,seed:'<img src=x onerror=alert(1)>'}};
 const report={innerHTML:''};context.document={getElementById:()=>report};context.guide=escaped;
 vm.runInContext('renderGuide(guide)',context);
 assert.ok(!report.innerHTML.includes('<img src=x'));
 assert.ok(report.innerHTML.includes('&lt;img'));
});

test('result workspace shows one section and part with readable timing, navigation and complete print output',()=>{
 const html=fs.readFileSync(path.join(__dirname,'..','index.html'),'utf8'),context=vm.createContext({});
 vm.runInContext(html.match(/<script>([\s\S]*?)<\/script>/)[1],context);
 const api=context.MusicMaker,db=api.database;
 const guide=api.generateGuide({...db.defaults,form:'custom',customForm:[['intro',2],['chorus',8],['outro',2]],seed:'readable-guide'});
 const focused=[],report={innerHTML:'',querySelector:selector=>({focus:()=>focused.push(selector)})};
 context.document={getElementById:()=>report};context.guide=guide;
 vm.runInContext('currentGuide=guide;renderGuide(guide)',context);
 const state=()=>JSON.parse(vm.runInContext('JSON.stringify(resultState)',context));
 const press=(action,value)=>{context.click={target:{closest:()=>({dataset:{resultAction:action,resultValue:String(value)}})}};vm.runInContext('handleResultAction(click)',context);};
 assert.deepEqual(state(),{section:1,part:'chords',bar:0});
 assert.equal((report.innerHTML.match(/id="result-section"/g)||[]).length,1);
 for(const step of db.resultUI.steps){assert.ok(report.innerHTML.includes('href="#'+step.target+'"'));assert.ok(report.innerHTML.includes('id="'+step.target+'"'));}
 for(const tab of db.resultUI.tabs)assert.ok(report.innerHTML.includes('data-result-value="'+tab.id+'"'));
 assert.ok(report.innerHTML.includes('class="chord-duration"'));assert.ok(!report.innerHTML.includes('class="part-grid"'));
 for(const track of['drums','bass','topline']){
  press('part',track);assert.equal(state().part,track);
  assert.ok(report.innerHTML.includes('class="part-grid"'));
  assert.ok(report.innerHTML.includes(track==='drums'?'class="drum-pattern"':'class="note-pattern"'));
  assert.ok(report.innerHTML.includes(db.resultUI.start));assert.ok(report.innerHTML.includes(track==='drums'?db.resultUI.velocity:db.resultUI.length));
  assert.ok(report.innerHTML.includes('aria-pressed="true"'));assert.ok(!report.innerHTML.includes('undefined'));
 }
 press('bar',7);assert.equal(state().bar,7);assert.ok(report.innerHTML.includes(db.resultUI.barTitle.replace('{bar}','8')));
 press('section',2);assert.deepEqual(state(),{section:2,part:'topline',bar:0});
 assert.ok(report.innerHTML.includes(db.resultUI.barTitle.replace('{bar}','1')));
 press('bar',99);assert.equal(state().bar,0);press('section',99);assert.equal(state().section,2);
 assert.ok(focused.length>0,'navigation restores keyboard focus after rendering');
 const printable=vm.runInContext('renderPrintableGuide(guide)',context);
 assert.equal((printable.match(/class="section"/g)||[]).length,guide.sections.length);
 assert.equal((printable.match(/class="part-grid"/g)||[]).length,guide.sections.length);
 assert.ok(printable.includes(guide.sections[1].phrase[0].voicing));assert.ok(printable.includes(guide.sections[1].parts.topline.notes[0].note));
 context.sampleEvent={start:5,duration:3};context.samplePart={barTicks:12,displayTicks:2};
 const compound=JSON.parse(vm.runInContext('JSON.stringify(noteTiming(sampleEvent,samplePart))',context));
 assert.deepEqual(compound,{start:'3.5칸',length:'1.5칸'});
 context.held=[{start:14,duration:4,note:'C4',pitch:60,role:'chord'}];
 const carried=JSON.parse(vm.runInContext('JSON.stringify(eventsInBar(held,1,{barTicks:16}))',context))[0];
 assert.equal(carried.start,16);assert.equal(carried.duration,2);assert.equal(carried.sourceStart,14);
 context.guide={...guide,config:{...guide.config,seed:'<img src=x>'}};vm.runInContext('renderGuide(guide)',context);
 assert.ok(!report.innerHTML.includes('<img src=x>'));assert.ok(report.innerHTML.includes('&lt;img src=x&gt;'));
 assert.ok(!api.toMarkdown(guide).includes('undefined'));
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

test('intro part switches and bass performance preserve harmony, timing and playable articulation',()=>{
 const html=fs.readFileSync(path.join(__dirname,'..','index.html'),'utf8'),context=vm.createContext({});
 vm.runInContext(html.match(/<script>([\s\S]*?)<\/script>/)[1],context);
 const api=context.MusicMaker,db=api.database;
 assert.equal(api.validateDatabase(),true);
 const input={...db.defaults,form:'custom',customForm:[['intro',4],['chorus',8]],seed:'intro-bass-performance',bassMotion:75};
 const quiet=api.generateGuide(input),slap=api.generateGuide({...input,introVocal:true,introDrums:true,introBass:true,bassStyle:'slap',bassGhost:100});
 const pick=api.generateGuide({...input,introVocal:false,introDrums:false,introBass:true,bassStyle:'pick',bassGhost:0});
 for(const part of['topline','drums','bass'])assert.equal(quiet.sections[0].parts[part].enabled,false);
 assert.equal(quiet.sections[0].parts.topline.notes.length,0);assert.equal(quiet.sections[0].parts.drums.events.length,0);
 assert.ok(quiet.sections[0].parts.bass.events.every(event=>event.role==='rest'));
 assert.ok(!quiet.sections[0].arrangement.instruments.some(item=>['bass','rhythm','melody'].includes(item.role)));
 assert.ok(quiet.sections[1].parts.topline.notes.length>0,'the chorus keeps its vocal part');
 for(const part of['topline','drums','bass'])assert.equal(slap.sections[0].parts[part].enabled,true);
 assert.ok(slap.sections[0].parts.topline.notes.length>0);assert.ok(slap.sections[0].parts.drums.events.length>0);
 assert.equal(pick.sections[0].parts.drums.events.length,0);assert.ok(pick.sections[0].parts.bass.events.some(event=>Number.isFinite(event.pitch)));
 assert.ok(pick.sections.every(section=>section.parts.bass.events.filter(event=>Number.isFinite(event.pitch)).every(event=>event.technique==='pick')));
 assert.ok(!pick.sections.flatMap(section=>section.parts.bass.events).some(event=>event.role==='ghost'));
 const slapEvents=slap.sections.flatMap(section=>section.parts.bass.events);
 assert.ok(slapEvents.some(event=>event.technique==='slap'));assert.ok(slapEvents.some(event=>event.role==='ghost'));
 for(const guide of[quiet,slap,pick])for(const section of guide.sections){
  const part=section.parts,total=part.bars*part.barTicks,events=part.bass.events;
  assert.equal(events.reduce((sum,event)=>sum+event.duration,0),total);
  for(const[index,event]of events.entries()){
   assert.ok(event.duration>0&&event.start>=0&&event.start+event.duration<=total);
   if(index)assert.equal(event.start,events[index-1].start+events[index-1].duration,'pitched notes, rests and ghosts form one continuous monophonic lane');
   if(event.role==='ghost'){
    assert.equal(event.pitch,null);assert.equal(event.note,'×');assert.equal(event.strong,false);assert.ok(event.velocity<db.bassPerformance.velocity.normal);
    assert.ok(!Object.hasOwn(event,'fret'),'unpitched ghost notes do not advertise a fake fret or MIDI pitch');
   }
  }
  if(!part.bass.enabled)continue;
  const pitched=events.filter(event=>Number.isFinite(event.pitch));
  for(const chord of section.phrase)assert.equal(pitched.find(note=>note.start===chord.bar*part.barTicks).pitch%12,chord.root);
  for(const[index,note]of pitched.entries()){
   const chord=section.phrase.find(chord=>note.start>=chord.bar*part.barTicks&&note.start<(chord.bar+chord.duration)*part.barTicks);
   assert.equal(db.parts.bass.tuning.find(string=>string.string===note.string).midi+note.fret,note.pitch);
   if(note.role==='approach'){
    assert.equal(pitched[index+1].pitch,note.resolvesTo.pitch);
    assert.equal(events[events.indexOf(note)+1].pitch,note.resolvesTo.pitch,'a ghost never interrupts an approach-note resolution');
   }else assert.ok(chord.tones.includes(note.pitch%12));
   if(['hammer','pull'].includes(note.technique)){
    const previous=pitched[index-1];assert.equal(previous.string,note.string);assert.equal(previous.position,note.position);
    assert.ok(Math.abs(previous.fret-note.fret)<=db.bassPerformance.legatoFrets);
    assert.equal(previous.start+previous.duration,note.start,'legato notes stay connected');
   }
   if(note.technique==='pop')assert.ok(db.bassPerformance.popStrings.includes(note.string));
  }
 }
 context.guide=slap;
 const report={innerHTML:'',querySelector:()=>null},elements=new Map();
 const element=id=>id==='report'?report:elements.get(id)??elements.set(id,{innerHTML:'',value:'',checked:false,dataset:{},setAttribute(){}}).get(id);
 context.document={getElementById:element};
 vm.runInContext('buildControls();writeConfig(guide.config)',context);
 assert.ok(element('controls').innerHTML.includes('type="checkbox"'));assert.equal(element('field-introVocal').checked,true);
 const roundtrip=JSON.parse(vm.runInContext('JSON.stringify(readConfig())',context));
 assert.equal(roundtrip.introDrums,true);assert.equal(roundtrip.bassStyle,'slap');
 vm.runInContext('renderGuide(guide);resultState.section=0;resultState.part="bass";renderGuide(guide,false)',context);
 assert.ok(report.innerHTML.includes(db.bassPerformance.column));assert.ok(report.innerHTML.includes(db.bassPerformance.techniques.ghost.label));assert.ok(!report.innerHTML.includes('undefined'));
 context.guide=quiet;vm.runInContext('renderGuide(guide);resultState.section=0;resultState.part="topline";renderGuide(guide,false)',context);
 assert.ok(report.innerHTML.includes(db.partPolicy.offHelp));assert.ok(!report.innerHTML.includes('class="note-pattern"'));
 assert.ok(api.toMarkdown(slap).includes(db.bassPerformance.techniques.slap.label));assert.ok(api.toMarkdown(slap).includes('×'));
 assert.ok(!api.toMarkdown(quiet).includes('undefined'));
 assert.equal(db.visualTheme.paper,'#f5f3ee');assert.equal(db.visualTheme.accent,'#d65537');assert.equal(db.visualTheme.green,'#607258');
});

test('theory interactions coordinate global form, real part candidates, orchestration and performance',()=>{
 const html=fs.readFileSync(path.join(__dirname,'..','index.html'),'utf8'),context=vm.createContext({});
 vm.runInContext(html.match(/<script>([\s\S]*?)<\/script>/)[1],context);
 const api=context.MusicMaker,db=api.database;
 assert.equal(api.validateDatabase(),true);assert.ok(db.knowledgeBase.sources.length>=24);assert.ok(db.knowledgeBase.rules.length>=25);
 const common={...db.defaults,seed:'academic-interaction',form:'custom',customForm:[['chorus',8]],classical:0};
 const narrative=api.generateGuide({...common,subgenre:'kpop',classical:75,bassStyle:'slap',bassGhost:100,bridgeDesign:'contrast',tonalPlan:'final-lift',customForm:[['intro',2],['verse',8],['pre',4],['chorus',8],['bridge',4],['chorus',8]]});
 const rock=api.generateGuide({...common,subgenre:'pop-rock',style:'organic'});
 const latin=api.generateGuide({...common,subgenre:'latin-pop'}),clave=api.generateGuide({...common,subgenre:'afro-latin-pop'});
 const blues=api.generateGuide({...common,genre:'blues',subgenre:'shuffle-blues',jazzy:0,progression:'blues-12',form:'blues-form'});
 const chamber=api.generateGuide({...common,genre:'classical',subgenre:'chamber-classical',classical:90,form:'aaba'});
 const oddClave=api.generateGuide({...common,subgenre:'afro-latin-pop',customForm:[['verse',5],['chorus',5]]});
 const lowSax=api.generateGuide({...common,genre:'jazz',vocalRange:'lower',customForm:[['verse',8]]});
 const irregular=api.generateGuide({...common,complexity:100,customForm:[['verse',13]]});
 assert.equal(narrative.sections[0].parts.topline.enabled,false);assert.equal(narrative.sections[0].parts.drums.enabled,false);assert.equal(narrative.sections[0].parts.bass.enabled,false);
 assert.equal(narrative.sections[3].tonality.pc,0);assert.equal(narrative.sections.at(-1).tonality.pc,2);
 assert.equal(new Set(narrative.sections.map(section=>section.parts.topline.theme.id)).size,1,'one shared theme spans the song');
 assert.equal(narrative.sections[4].interaction.transform,'inversion');assert.equal(narrative.sections[0].parts.topline.theme.contour.length,2,'intro uses a real motif fragment');
 assert.ok(narrative.sections[4].parts.topline.theme.contour.slice(2).some((value,index)=>value===-narrative.story.kernel.contour[index+2]));
 assert.equal(latin.sections[0].parts.drums.family,'dembow');assert.ok(latin.sections[0].parts.drums.events.some(event=>event.kind==='backbeat'&&event.start===6));
 assert.equal(clave.sections[0].parts.drums.family,'son-23');assert.ok(clave.sections[0].parts.drums.events.some(event=>event.voice==='claves'&&event.start===4));
 assert.ok(clave.sections[0].parts.drums.events.some(event=>event.voice==='claves'&&event.start===16));
 assert.equal(blues.progressionPlan.bars,12);assert.equal(blues.sections[0].phraseBars,12);
 assert.ok(blues.sections[0].phrase.filter(chord=>['I','IV','V'].includes(chord.id)).every(chord=>chord.quality==='dominant'&&chord.level>=.24));
 assert.equal(blues.sections[0].phrase[0].fn,'T','I7 is a blues tonic and does not inherit dominant function');
 const guitar=rock.sections[0].orchestration.tracks.find(track=>track.profile.family==='plucked');assert.ok(guitar);
 for(const event of guitar.events){
  assert.ok(event.fingering.length>=3);assert.equal(new Set(event.fingering.map(note=>note.string)).size,event.fingering.length);
  const fretted=event.fingering.filter(note=>note.fret>0).map(note=>note.fret);
  assert.ok(!fretted.length||Math.max(...fretted)-Math.min(...fretted)<=db.knowledgeBase.fretted.maxSpan);
 }
 assert.ok(chamber.sections.some(section=>section.orchestration.counter.enabled),'counterpoint produces actual response notes');
 assert.ok(chamber.sections.every(section=>!section.parts.drums.enabled),'a chamber setting does not receive a compulsory drum kit');
 assert.ok(chamber.sections.some(section=>section.parts.bass.styleId==='arco'));
 assert.ok(chamber.sections[0].orchestration.tracks.find(track=>track.role==='harmony').events.length>chamber.sections[0].phrase.length,'classical accompaniment has an actual rhythmic realization');
 assert.ok(oddClave.sections[1].parts.drums.events.some(hit=>hit.voice==='claves'&&hit.start===0),'clave phase continues across an odd section boundary');
 assert.ok(lowSax.sections[0].parts.topline.notes.every(note=>note.pitch>=49),'the selected instrument constrains the requested vocal range');
 assert.equal(irregular.sections[0].parts.bars,13);assert.equal(irregular.sections[0].repeats,1);
 for(const guide of[narrative,rock,latin,clave,blues,chamber,oddClave,lowSax,irregular])for(const section of guide.sections){
  assert.ok(section.interaction.validCandidates>=1&&section.interaction.candidateCount<=3);
  assert.ok(section.interaction.rules.valid);assert.ok(section.interaction.rules.checked.includes('ornament-resolution'));
  assert.ok(!section.interaction.rules.violations.some(violation=>violation.severity==='hard'));
  assert.ok(section.attention.available<=db.knowledgeBase.search.maxDensity);
  assert.ok(Object.values(section.attention.allocation).reduce((sum,value)=>sum+value,0)<=section.attention.available+1e-9);
  for(const track of section.orchestration.tracks)for(const event of track.events)for(const pitch of event.pitches??(Number.isFinite(event.pitch)?[event.pitch]:[]))if(track.profile.range)assert.ok(pitch>=track.profile.range[0]&&pitch<=track.profile.range.at(-1));
  for(const note of section.orchestration.counter.notes){
   const chord=section.phrase.find(chord=>note.start>=chord.bar*section.parts.barTicks&&note.start<(chord.bar+chord.duration)*section.parts.barTicks);
   assert.ok(chord.tones.includes(note.pitch%12));
  }
  for(const plan of Object.values(section.parts))for(const event of plan?.events??[])if(event.performance){assert.ok(event.performance.releaseMs>=event.performance.startMs);assert.ok(event.velocity>=1&&event.velocity<=127);}
  for(const note of section.parts.bass.events.filter(note=>note.kick&&note.performance)){
   const hit=section.parts.drums.events.find(hit=>hit.kind==='kick'&&hit.start===note.start);
   assert.equal(note.performance.offsetMs,hit.performance.offsetMs,'kick and bass share their timing');
  }
  const channels=section.dawTracks.tracks.filter(track=>track.role!=='rhythm').map(track=>track.channel);assert.ok(channels.every(channel=>channel>=1&&channel<=16&&channel!==10));
  assert.ok(section.dawTracks.drums.every(voice=>Number.isInteger(voice.midi)));
 }
 assert.ok(narrative.sections.some(section=>section.performance.parts.topline.maximumOffset>0));
 const broken=vm.runInContext('evaluateMusicRules({rootCoverage:0})',context);assert.equal(broken.valid,false,'academic references are connected to executable hard checks');
 context.guide=narrative;const report={innerHTML:''};context.document={getElementById:()=>report};vm.runInContext('renderGuide(guide)',context);
 assert.ok(report.innerHTML.includes(db.interactionUI.title));assert.ok(report.innerHTML.includes(db.interactionUI.daw));assert.ok(report.innerHTML.includes(db.knowledgeBase.asOf));assert.ok(!report.innerHTML.includes('undefined'));
 assert.ok(api.toMarkdown(narrative).includes(db.interactionUI.title));assert.ok(api.toMarkdown(chamber).includes(db.interactionUI.channel));
 context.guide=chamber;const print=vm.runInContext('renderPrintableGuide(guide)',context);const response=chamber.sections.flatMap(section=>section.orchestration.counter.notes)[0];assert.ok(print.includes(response.note));
});
