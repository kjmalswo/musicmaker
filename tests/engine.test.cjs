const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');

test('composition search, voicings, constraints and guide rendering',()=>{
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
 assert.equal(forced.sections[0].phrase.map(event=>event.id).join(','),'ii,V,I,V/ii');
 assert.throws(()=>api.generateGuide({...db.defaults,progression:'custom',customProgression:'I V/ii IV V'}),/세컨더리/);
 assert.throws(()=>api.generateGuide({...db.defaults,progression:'custom',customProgression:'I <script>'}),/가능한 코드/);
 assert.throws(()=>api.generateGuide({...db.defaults,seed:''}),/시드/);
 assert.equal(api.normalizeConfig({...db.defaults,bpm:999,jazzy:-5}).bpm,220);
 for(const guide of[defaults,dry,rich,forced]){
  let covered=0;
  for(const section of guide.sections){
   assert.equal(section.start,covered+1);
   assert.equal(section.events.reduce((total,event)=>total+event.duration,0),section.bars);
   assert.equal(section.phraseBars*section.repeats,section.bars);
   assert.ok(Number.isFinite(section.score));
   assert.ok(section.evaluations>0);
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
  assert.ok(!markdown.includes('undefined'));
  const report={innerHTML:''};
  context.document={getElementById:()=>report};context.guide=guide;
  vm.runInContext('renderGuide(guide)',context);
  assert.ok(report.innerHTML.includes('data-action="json"'));
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
