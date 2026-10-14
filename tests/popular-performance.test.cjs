const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');

test('Marusa sevenths, genre performance, singable runs and verified 100-song statistical priors',()=>{
 const root=path.join(__dirname,'..'),html=fs.readFileSync(path.join(root,'index.html'),'utf8'),context=vm.createContext({});
 vm.runInContext(html.match(/<script>([\s\S]*?)<\/script>/)[1],context);const api=context.MusicMaker,db=api.database;
 assert.equal(api.validateDatabase(),true);assert.equal(db.storage.key,'musicmaker.settings.v1');const corpus=db.referenceCorpus;
 assert.equal(corpus.songCount,100);assert.equal(corpus.koreanCount,50);assert.equal(corpus.internationalCount,50);
 assert.equal(corpus.sha256,db.referenceCorpusRules.sourceSha256);
 assert.equal(new Set(corpus.songs.map(song=>song.artist+'/'+song.song)).size,100);
 assert.equal(corpus.clipCount,corpus.songs.reduce((sum,song)=>sum+song.clipCount,0));
 assert.equal(corpus.noteCount,corpus.songs.reduce((sum,song)=>sum+song.noteCount,0));
 assert.equal(JSON.stringify(corpus),JSON.stringify(JSON.parse(fs.readFileSync(path.join(root,'data/reference-corpus.json'),'utf8'))));
 assert.notDeepEqual(Array.from(corpus.groups.ballad.intervals),Array.from(corpus.groups.dance.intervals));
 for(const genre of db.subgenres){const id=db.performanceIdioms.subgenres[genre.id],idiom=db.performanceIdioms.idioms[id];assert.ok(idiom,genre.id);assert.ok(db.ensemble.profiles[idiom.family]);assert.ok(db.instrumentProfiles[idiom.harmony]);for(const comp of idiom.comp)assert.ok(db.performanceIdioms.comp.patterns[comp]);}
 const form=[['verse',4],['pre',4],['chorus',8],['chorus',8]],base={...db.defaults,classical:0,seed:'popular-phrasing',form:'custom',customForm:form};
 const configs=[
  {...base,subgenre:'ballad',bpm:78,jazzy:0,progression:'marusa'},
  {...base,genre:'rnb',subgenre:'neo-soul',bpm:96,artistStyle:'charlie-puth'},
  {...base,genre:'rock',subgenre:'jrock',mode:'minor',bpm:92},
  {...base,subgenre:'dance-pop',bpm:132,style:'groovy'},
  {...base,subgenre:'synth-pop',bpm:132,style:'groovy'},
  {...base,subgenre:'rnb-pop',mode:'minor',key:'F',bpm:96,progression:'marusa'}
 ];
 const guides=configs.map(config=>api.generateGuide(config)),rule=db.performanceIdioms.phrasing;let runCount=0,leapCount=0;
 for(const guide of guides){
  for(const section of guide.sections){
   assert.ok(section.interaction.rules.valid);assert.equal(section.interaction.metrics.unresolved,0);
   assert.ok(section.performanceDirection.label);const range=db.vocalRanges.find(range=>range.id===guide.config.vocalRange),notes=section.parts.topline.notes;
   assert.ok(notes.every(note=>note.pitch>=range.lower&&note.pitch<=range.upper&&note.duration>0));assert.ok(section.parts.topline.figures.ratio<=db.nonChordRules.maxRatio);
   for(const[index,note]of notes.entries()){
    const before=notes[index-1];if(before&&Math.abs(note.pitch-before.pitch)>db.parts.vocal.leapThreshold)leapCount++;
    if(note.melisma!==undefined){runCount++;context.section=section;context.notes=notes;context.index=index;assert.equal(vm.runInContext('melismaNoteErrors(makeContext(normalizeConfig(input)),section,notes,index)',Object.assign(context,{input:guide.config})),false);}
   }
   const groups=new Map();for(const note of notes.filter(note=>note.melisma!==undefined)){if(!groups.has(note.syllableGroup))groups.set(note.syllableGroup,[]);groups.get(note.syllableGroup).push(note);}
   for(const values of groups.values()){assert.ok(values.length>=3);assert.ok(values.some(note=>note.duration===1),'a run can use actual sixteenth notes at a singable tempo');assert.ok(values.every(note=>note.runTarget.pitch===values.at(-1).pitch));assert.ok(values.every((note,index)=>!index||note.start===values[index-1].start+values[index-1].duration));}
   const harmony=section.orchestration.tracks.find(track=>track.role==='harmony');assert.ok(harmony.events.length);
   for(const event of harmony.events){const chord=section.phrase.find(chord=>event.start>=chord.bar*section.parts.barTicks&&event.start<(chord.bar+chord.duration)*section.parts.barTicks);assert.ok(event.pitches.every(pitch=>chord.tones.includes(pitch%12)),'arpeggios and shells use the current harmony');assert.ok(event.duration>0);}
   for(const mode of ['all','chords','topline']){const playback=api.createPlaybackEvents(section,mode);assert.ok(playback.events.every(event=>event.duration>0&&event.pitches.every(Number.isFinite)));}
  }
  const choruses=guide.sections.filter(section=>section.kind==='chorus'),first=choruses[0].parts.topline.hook.core,second=choruses[1].parts.topline.hook.core,shift=choruses[1].tonality.shift-choruses[0].tonality.shift;
  assert.deepEqual(Array.from(second,note=>[note.start,note.duration,note.pitch-shift]),Array.from(first,note=>[note.start,note.duration,note.pitch]),'ornaments preserve the complete core hook on return');
 }
 assert.ok(runCount>0,'R&B/ballad lines contain bounded vocal runs');assert.ok(leapCount>0,'the performed melody uses meaningful leaps');
 const ballad=guides[0].sections[0],balladTrack=ballad.orchestration.tracks.find(track=>track.role==='harmony');
 assert.equal(balladTrack.id,'piano');assert.ok(balladTrack.events.some(event=>event.pitches.length===1&&event.articulation==='arpeggio'));
 assert.ok(balladTrack.events.some(event=>event.start%ballad.parts.barTicks%4!==0),'ballad accompaniment is not four identical block-chord beats');
 assert.ok(balladTrack.events.some((event,index)=>balladTrack.events[index+1]&&event.performance.releaseMs>balladTrack.events[index+1].performance.startMs),'polyphonic arpeggios ring across a different next pitch');
 assert.ok(ballad.phrase.every(chord=>chord.notes.at(-1)-chord.notes[0]>=12));
 assert.deepEqual(Array.from(ballad.phrase,chord=>chord.harmonicSymbol),['Fmaj7','E7','Am7','C7']);
 assert.deepEqual(Array.from(guides[5].sections[0].phrase,chord=>chord.harmonicSymbol),['D♭maj7','C7','Fm7','A♭7']);
 context.input=configs[0];assert.match(vm.runInContext('progressionHint(input)',context),/Fmaj7.*E7.*Am7.*C7/);
 const signature=guide=>JSON.stringify(guide.sections[0].orchestration.tracks.find(track=>track.role==='harmony').events.map(event=>[event.start,event.pitches,event.articulation]));
 assert.equal(new Set(guides.slice(0,5).map(signature)).size,5,'selected subgenres produce different performed accompaniment');
 context.section=guides[1].sections[0];assert.ok(vm.runInContext("renderInteractionPlan(section)",context).includes(guides[1].sections[0].performanceDirection.label));
 assert.equal(JSON.stringify(api.generateGuide(configs[0])),JSON.stringify(guides[0]),'same seed reproduces the actual ensemble');
});
