const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
test('three-song artist priors, 100 new references and performed vocal ornaments',()=>{
 const root=path.join(__dirname,'..'),html=fs.readFileSync(path.join(root,'index.html'),'utf8'),context=vm.createContext({});vm.runInContext(html.match(/<script>([\s\S]*?)<\/script>/)[1],context);
 const api=context.MusicMaker,db=api.database,extra=db.referenceCorpusExtension;assert.equal(api.validateDatabase(),true);assert.equal(db.storage.key,'musicmaker.settings.v1');
 assert.equal(JSON.stringify(extra),JSON.stringify(JSON.parse(fs.readFileSync(path.join(root,'data/reference-extension.json'),'utf8'))));
 const old=new Set(db.referenceCorpus.songs.map(s=>s.artist+'/'+s.song)),additional=extra.songs.filter(s=>s.role==='general'),representatives=extra.songs.filter(s=>s.role==='artist');
 assert.equal(additional.length,100);assert.equal(new Set(additional.map(s=>s.artist+'/'+s.song)).size,100);assert.equal(representatives.length,24);
 assert.ok(additional.every(s=>!old.has(s.artist+'/'+s.song)&&!representatives.some(a=>a.artist===s.artist&&a.song===s.song)));assert.equal(extra.uniqueCombinedSongs,222);
 for(const artist of db.artistStyles.filter(a=>a.id!=='none')){assert.equal(extra.artists[artist.id].count,3);assert.ok(extra.artists[artist.id].meanDuration>0);assert.equal(extra.artists[artist.id].intervals.length,5);}
 const bill=representatives.filter(s=>s.artistId==='bill-evans');assert.ok(bill.every(s=>s.sourceType==='jtd-automatic-piano'&&s.coverage.humanValidated===false&&s.features.tones===null&&s.features.transitions===null));
 assert.ok(representatives.find(s=>s.song==='lilac').coverage.automaticOrRegenerated);assert.ok(extra.songs.every(s=>s.sourceHash.length===64&&!s.notes&&!s.lyrics));
 for(const genre of db.subgenres){const idiom=db.performanceIdioms.idioms[db.performanceIdioms.subgenres[genre.id]];assert.ok(idiom,genre.id);for(const kind of idiom.comp)assert.ok(db.performanceIdioms.comp.patterns[kind],kind);}
 context.input={...db.defaults,subgenre:'city-pop'};const city=vm.runInContext('corpusProfile(makeContext(normalizeConfig(input)))',context);context.input={...db.defaults,subgenre:'country-pop'};const country=vm.runInContext('corpusProfile(makeContext(normalizeConfig(input)))',context);assert.notDeepEqual(Array.from(city.intervals),Array.from(country.intervals));
 const base={...db.defaults,genre:'rnb',subgenre:'neo-soul',classical:0,bpm:88,seed:'voice-expression',artistStyle:'charlie-puth',form:'custom',customForm:[['verse',4],['pre',4],['chorus',8],['chorus',8]],vocalTechniqueAmount:95};
 const neutral=api.generateGuide({...base,artistSaturation:0,vocalTechniqueAmount:0}),coloured=api.generateGuide({...base,artistSaturation:95});
 assert.equal(neutral.artistStyle,null);assert.equal(coloured.artistStyle.references.length,3);assert.equal(coloured.artistStyle.strength,95);
 const neutralDecorated=api.generateGuide({...base,artistSaturation:0});
 const signature=g=>JSON.stringify(g.sections.map(s=>({notes:s.parts.topline.notes.map(n=>[n.start,n.duration,n.pitch]),chords:s.phrase.map(c=>c.symbol)})));assert.notEqual(signature(neutralDecorated),signature(coloured),'artist colour changes the score with identical ornament controls');
 assert.ok(neutral.sections.every(s=>s.parts.topline.notes.every(n=>n.melisma===undefined&&!n.pitchControl)));
 let automationCount=0,runCount=0;const techniques=new Set();
 for(const section of coloured.sections){
  assert.equal(section.interaction.rules.valid,true);assert.equal(section.interaction.metrics.unresolved,0);
  const range=db.vocalRanges.find(r=>r.id===coloured.config.vocalRange);assert.ok(section.parts.topline.notes.every(n=>n.pitch>=range.lower&&n.pitch<=range.upper));
  for(const n of section.parts.topline.notes){for(const t of n.vocalTechniques??[])techniques.add(t.type);if(n.melisma!==undefined)runCount++;if(n.hookCore)assert.ok(!n.pitchControl?.entry,'hook attack remains intact');}
  for(const event of api.createPlaybackEvents(section,'all').events){if(event.part!=='topline'){assert.equal(event.pitchAutomation,null);continue;}if(!event.pitchAutomation)continue;automationCount++;assert.equal(event.pitchAutomation.duration,event.duration);assert.ok(event.pitchAutomation.cents.every(c=>Number.isFinite(c)&&c>=event.pitchControl.lowerCents-.001&&c<=event.pitchControl.upperCents+.001));}
 }
 assert.ok(automationCount>0);assert.ok(runCount>0);assert.ok(techniques.has('vibrato'));assert.ok([...techniques].some(t=>['grace','bend','portamento'].includes(t)));
 const choruses=coloured.sections.filter(s=>s.kind==='chorus'),first=choruses[0].parts.topline.hook.core,second=choruses[1].parts.topline.hook.core,shift=choruses[1].tonality.shift-choruses[0].tonality.shift;
 assert.deepEqual(Array.from(second,n=>[n.start,n.duration,n.pitch-shift]),Array.from(first,n=>[n.start,n.duration,n.pitch]));
 context.section=coloured.sections[0];assert.match(vm.runInContext("renderPartPlans(section,'topline',0)",context),/가창/);assert.match(api.toMarkdown(coloured),/대표곡:/);
 // Known pitch curves test audible controls directly, including grace at zero time.
 const rule=db.vocalTechniqueRules,entry={kind:'grace',fromCents:-200,holdSeconds:rule.entryHoldSeconds,rampSeconds:rule.entryRampSeconds};
 const grace=api.vocalPitchAutomation({duration:1,pitchControl:{entry,lowerCents:-300,upperCents:300}});assert.equal(grace.cents[0],-200);assert.equal(grace.cents.at(-1),0);
 const vib=api.vocalPitchAutomation({duration:1.5,pitchControl:{vibrato:{delaySeconds:.3,rateHz:5.2,depthCents:22},lowerCents:-300,upperCents:300}});assert.equal(vib.cents[0],0);assert.ok(vib.cents.some(c=>c>10)&&vib.cents.some(c=>c<-10));assert.equal(vib.cents.at(-1),0);
 const fall=api.vocalPitchAutomation({duration:1,pitchControl:{fall:{cents:-65,seconds:.15},lowerCents:-300,upperCents:300}});assert.equal(fall.cents[0],0);assert.equal(fall.cents.at(-1),-65);
 const short=api.vocalPitchAutomation({duration:.12,pitchControl:{vibrato:{delaySeconds:.3,rateHz:5.2,depthCents:22},lowerCents:0,upperCents:300}});assert.ok(short.cents.every(c=>c===0));
 // A simple Web Audio stub verifies that playback schedules oscillator pitch, not only labels.
 const scheduled=[],param=()=>({value:0,setValueAtTime(){},linearRampToValueAtTime(){},exponentialRampToValueAtTime(){},setValueCurveAtTime(curve,at,duration){scheduled.push({curve,at,duration});}}),node=()=>({connect(){},disconnect(){}});
 context.audioStub={createOscillator:()=>({...node(),frequency:param(),detune:param(),start(){},stop(){}}),createBiquadFilter:()=>({...node(),frequency:param()}),createGain:()=>({...node(),gain:param()})};context.pitchEvent={part:'topline',track:'vocal:melody',pitches:[64],velocity:90,duration:1,pitchAutomation:grace};
 vm.runInContext('guidePlayer.context=audioStub;guidePlayer.bus={};playPitchedEvent(pitchEvent,2)',context);assert.ok(scheduled.length>0);assert.ok(scheduled.every(s=>s.at===2&&s.duration===1&&s.curve[0]===-200));
 // Instrumental leads keep the same symbolic line but have no vocal pitch curves.
 context.input=base;context.synthetic=first;context.range=db.vocalRanges.find(r=>r.id===base.vocalRange);
 assert.ok(vm.runInContext('realizeVocalTechniques({...makeContext(normalizeConfig(input)),vocalLead:false},section,synthetic,range).every(n=>!n.pitchControl)',context));
});
