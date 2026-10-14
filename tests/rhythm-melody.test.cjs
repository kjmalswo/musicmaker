const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');

test('subdivided genre grooves, developed A/B melodies and artist generation regressions',()=>{
 const html=fs.readFileSync(path.join(__dirname,'..','index.html'),'utf8'),context=vm.createContext({});
 vm.runInContext(html.match(/<script>([\s\S]*?)<\/script>/)[1],context);
 const api=context.MusicMaker,db=api.database;
 assert.equal(api.validateDatabase(),true);
 assert.equal(api.normalizeConfig({drumSubdivision:'unknown'}).drumSubdivision,'auto');
 // These two original full song settings failed in harmonic schema search.
 for(const config of [
  {artistStyle:'yoasobi',style:'organic',meter:'7-8',bpm:140,vocalRange:'lower',classical:0},
  {artistStyle:'bill-evans',style:'orchestral',meter:'3-4',bpm:220,vocalRange:'lower',classical:70}
 ]){
  const guide=api.generateGuide({...db.defaults,...config});
  assert.equal(guide.config.artistStyle,config.artistStyle);
  assert.equal(guide.config.bpm,config.bpm);assert.equal(guide.config.meter,config.meter);
  assert.equal(guide.config.vocalRange,config.vocalRange);
  assert.ok(guide.sections.every(section=>section.interaction.rules.valid));
  assert.ok(guide.sections.every(section=>section.parts.topline.enabled?section.parts.topline.notes.length>0:true));
  for(const section of guide.sections){
   for(let index=0;index<section.phrase.length;index++){
    const chord=section.phrase[index];if(!chord.target)continue;
    const following=section.phrase.slice(index+1).find(item=>item.id!==chord.id)??section.phrase.find(item=>item.id!==chord.id);
    assert.equal(following?.id,chord.target,'applied harmony resolves after prolongation');
   }
  }
 }
 const common={...db.defaults,seed:'rhythm-development',form:'custom',customForm:[['verse',4],['pre',8],['chorus',4]],classical:0,drumDetail:88,toplineNovelty:90,bpm:92};
 const guides=['8','16','32'].map(drumSubdivision=>api.generateGuide({...common,drumSubdivision}));
 const step={8:2,16:1,32:.5};
 for(const guide of guides)for(const section of guide.sections){
  const subdivision=guide.config.drumSubdivision,drums=section.parts.drums;
  assert.equal(drums.gridStep,step[subdivision]);
  assert.ok(drums.events.every(event=>event.start%step[subdivision]===0),'hits use selected grid');
  assert.ok(section.interaction.ensemble.support>=db.ensemble.groove.kickLock,'kick and sounding bass remain coordinated');
  assert.equal(section.interaction.metrics.unresolved,0);assert.equal(section.interaction.metrics.limbErrors,0);
  const byLimb=new Map();
  for(const hit of drums.events){
   const before=byLimb.get(hit.limbId),maxHits=hit.limb==='foot'?db.compositionUpgrade.drum.footHits:db.parts.drums.maxHandHitsPerSecond;
   if(before)assert.ok(hit.performance.startMs-before.performance.startMs>=1000/maxHits-.02,'one limb respects its speed after swing and timing offsets');
   byLimb.set(hit.limbId,hit);
  }
 }
 const sixteen=guides[1],fine=guides[2],verse=fine.sections[0],pre=fine.sections[1],chorus=fine.sections[2];
 assert.ok(sixteen.sections.some(section=>section.parts.drums.events.some(hit=>hit.start%2===1)),'16th attacks are generated');
 assert.ok(fine.sections.some(section=>section.parts.drums.events.some(hit=>hit.start%1===.5)),'32nd attacks are generated');
 assert.equal(verse.parts.topline.theme.role,'A');assert.equal(pre.parts.topline.theme.role,'B');
 assert.equal(pre.label,db.sectionTypes.pre.label);assert.equal(pre.repeats,1,'B buildup spans the whole prechorus');
 assert.ok(verse.energy<pre.energy&&pre.energy<chorus.energy,'B energy stays between A and chorus');
 const fingerprint=section=>JSON.stringify(section.parts.topline.notes.slice(0,12).map(note=>[note.start,note.duration,note.pitch]));
 assert.notEqual(fingerprint(verse),fingerprint(pre),'A and B differ in actual melody and phrasing');
 assert.ok(pre.parts.topline.notes.some(note=>note.strategy==='sequence'));
 assert.ok(pre.parts.topline.notes.some(note=>note.strategy==='contract'));
 assert.equal(pre.phrase.at(-1).fn,'D','automatic pre harmony prepares the chorus');
 const half=pre.parts.bars*pre.parts.barTicks/2;
 assert.ok(pre.parts.topline.notes.filter(note=>note.start>=half).length>=pre.parts.topline.notes.filter(note=>note.start<half).length,'B develops rhythmic activity');
 assert.ok(verse.parts.topline.breaths>0&&chorus.parts.topline.breaths>0);
 const barPatterns=new Set(fine.sections.flatMap(section=>Array.from({length:section.parts.bars},(_,bar)=>JSON.stringify(section.parts.drums.events.filter(hit=>Math.floor(hit.start/section.parts.barTicks)===bar).map(hit=>[hit.voice,hit.start%section.parts.barTicks,hit.velocity])))));
 assert.ok(barPatterns.size>=6,'phrases have distinct groove responses and fills');
 const fineSection=fine.sections.find(section=>section.parts.drums.events.some(hit=>hit.start%1===.5));
 context.part=fineSection.parts;context.hits=fineSection.parts.drums.events.filter(hit=>hit.start<fineSection.parts.barTicks);
 const markup=vm.runInContext('renderDrumPattern(hits,part)',context);
 assert.ok(markup.includes('--ticks:32'),'drum editor shows all 32 grid positions');
 const playback=api.createPlaybackEvents(fineSection,'drums');
 assert.equal(playback.events.length,fineSection.parts.drums.events.length,'fractional attacks reach playback');
 assert.ok(playback.events.every(event=>Number.isFinite(event.start)&&event.duration>0));
 const other=api.generateGuide({...common,seed:'rhythm-other',drumSubdivision:'32',customForm:[['verse',4]]});
 assert.notEqual(fingerprint(verse),fingerprint(other.sections[0]),'seeds vary melodic development');
 const repeat=api.generateGuide({...common,drumSubdivision:'32'});
 assert.equal(JSON.stringify(fine),JSON.stringify(repeat),'same configuration and seed reproduce the guide');
});
