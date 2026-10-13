const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');

test('artist composition, additional meters, expressive topline and live instrument mix',async()=>{
 const html=fs.readFileSync(path.join(__dirname,'..','index.html'),'utf8'),context=vm.createContext({});
 vm.runInContext(html.match(/<script>([\s\S]*?)<\/script>/)[1],context);
 const api=context.MusicMaker,db=api.database;
 assert.equal(api.validateDatabase(),true);
 assert.equal(api.normalizeConfig({artistStyle:'unknown'}).artistStyle,'none');
 assert.equal(api.normalizeConfig({artistStyle:'yoasobi',tonalPlan:'stay'}).tonalPlan,'stay');
 const common={...db.defaults,seed:'style-mix',form:'custom',customForm:[['chorus',4]],classical:0};
 const plain=api.generateGuide({...common,classical:70});
 const base=plain.sections[0];
 assert.equal(plain.artistStyle,null);
 assert.ok(base.parts.topline.rhythmKinds>=2,'the phrase varies the repeated rhythmic cell');
 assert.ok(base.parts.topline.breaths>=1,'singers have phrase-end breathing space');
 assert.ok(new Set(base.parts.topline.notes.map(note=>note.duration)).size>=2,'short and held notes vary');
 assert.ok(base.parts.topline.notes.some(note=>note.start%base.parts.barTicks!==0),'a phrase can enter off the downbeat');
 const fingerprints=new Set();let yoasobi;
 for(const artist of db.artistStyles.filter(item=>item.id!=='none')){
  const guide=api.generateGuide({...common,artistStyle:artist.id,...(artist.id==='yoasobi'?{customForm:[['verse',4],['chorus',4],['bridge',4],['chorus',4]]}:{})});
  assert.equal(guide.config.artistStyle,artist.id);assert.equal(guide.artistStyle.label,artist.label);
  assert.ok(guide.artistStyle.sources.length>=2);assert.ok(guide.artistStyle.sources.every(source=>/^https:\/\//.test(source.url)));
  const section=guide.sections.find(section=>section.kind==='chorus');
  assert.equal(section.ensemble.family,artist.family);
  assert.ok(section.arrangement.instruments.some(item=>item.id===artist.harmonyInstrument&&item.role==='harmony'));
  for(const note of section.parts.topline.notes){assert.ok(note.pitch>=db.vocalRanges[1].lower&&note.pitch<=db.vocalRanges[1].upper);if(note.anchor){const chord=section.phrase.find(chord=>note.start>=chord.bar*section.parts.barTicks&&note.start<(chord.bar+chord.duration)*section.parts.barTicks);assert.ok(chord.tones.includes(note.pitch%12),'strong targets obey the actual section harmony');}}
  fingerprints.add(JSON.stringify([section.phrase.map(chord=>chord.id),section.parts.topline.notes.map(note=>[note.start,note.duration,note.pitch])]));
  if(artist.id==='bill-evans'){
   const harmony=section.orchestration.tracks.find(track=>track.role==='harmony');
   assert.ok(harmony.events.some(event=>{const chord=section.phrase.find(chord=>event.start>=chord.bar*section.parts.barTicks&&event.start<(chord.bar+chord.duration)*section.parts.barTicks);return event.pitches.length>=2&&event.pitches.every(pitch=>pitch%12!==chord.root);}), 'rootless piano leaves roots to the bass');
  }
  if(artist.id==='yoasobi')yoasobi=guide;
 }
 assert.equal(fingerprints.size,8,'artist selection changes the score, not just its label');
 assert.equal(yoasobi.sections.at(-1).tonality.shift,1,'the tutorial-derived final chorus rises a semitone');
 assert.ok(yoasobi.sections.some(section=>section.phrase.some(chord=>chord.id==='V/vi')),'marusa harmony is executable');
 assert.ok(yoasobi.sections[0].parts.topline.notes[0].pitch%12===4,'IVmaj7 supports the E hook in C');
 assert.ok(api.toMarkdown(yoasobi).includes('youtube.com/watch?v=GbUtCimdtqE'));
 context.example=yoasobi;const rendered=vm.runInContext('artistStyleHtml(example.artistStyle)',context);assert.ok(rendered.includes(db.artistStyleRules.method));assert.ok(!rendered.includes('undefined'));
 // Check explicit settings against context and form planning without regenerating the song.
 context.config={...common,artistStyle:'yoasobi',tonalPlan:'stay',progression:'custom',customProgression:'I,vi,IV,V',vocalRange:'lower',meter:'7-8'};
 const explicit=vm.runInContext('(()=>{const config=normalizeConfig(globalThis.config),ctx=makeContext(config);return {forced:ctx.forced,sections:planSongIntent(ctx,resolveForm(config)).sections,range:config.vocalRange,meter:ctx.meter.id};})()',context);
 assert.deepEqual([...explicit.forced],['I','vi','IV','V']);assert.ok(explicit.sections.every(section=>section.keyShift===0));assert.equal(explicit.range,'lower');assert.equal(explicit.meter,'7-8');
 const additions=['2-4','5-4','7-4','5-8','7-8','9-8','12-8'];
 for(const id of additions){
  const guide=api.generateGuide({...common,meter:id}),section=guide.sections[0],meter=db.meters.find(meter=>meter.id===id),grid=db.parts.meters[id];
  assert.equal(section.parts.barTicks,meter.quarters*db.parts.ticksPerQuarter);
  assert.equal(guide.seconds,Math.round(guide.bars*meter.quarters/meter.pulseQuarters*60/common.bpm));
  assert.equal(api.createPlaybackEvents(section).duration,guide.bars*grid.barTicks*section.performance.msPerTick/1000);
  if(meter.noSwing)assert.equal(guide.diagnostics.swing,0);
  for(const part of ['topline','bass','drums'])for(const event of section.parts[part].events){assert.ok(event.start>=0&&event.duration>0&&event.start+event.duration<=section.phraseBars*grid.barTicks);}
 }
 assert.deepEqual([...db.parts.meters['7-8'].strong],[0,4,8]);
 // All orchestration instruments, including textures, get an independent audio bus.
 const schedule=api.createPlaybackEvents(base),solos=db.playback.parts.map(id=>api.createPlaybackEvents(base,id));
 assert.equal(schedule.events.length,solos.reduce((n,solo)=>n+solo.events.length,0));
 assert.ok(base.orchestration.tracks.some(track=>track.role==='texture'));
 for(const track of base.orchestration.tracks.filter(track=>track.events.some(event=>event.role!=='rest')))assert.ok(schedule.events.some(event=>event.track===track.id+':'+track.role));
 context.example=plain;vm.runInContext('currentGuide=example;resultState.section=0;',context);
 const mix=vm.runInContext('renderPlaybackMix(example.sections[0])',context);assert.ok(mix.includes('data-audio-action="all-on"'));assert.ok(mix.includes('data-audio-action="solo"'));
 const graph=[],intervals=new Map();let timer=0;
 const param=()=>({value:1,setValueAtTime(value){this.value=value;},linearRampToValueAtTime(){},exponentialRampToValueAtTime(){}});
 const node=kind=>{const item={kind,gain:param(),frequency:param(),connect(target){this.target=target;return target;},disconnect(){this.disconnected=true;},start(time){this.started=time;},stop(time){if(time===undefined)this.cancelled=true;}};graph.push(item);return item;};
 class AudioContext{
  constructor(){this.currentTime=10;this.sampleRate=44100;this.destination=node('destination');}async resume(){}
  createGain(){return node('gain');}createOscillator(){return node('oscillator');}createBiquadFilter(){return node('filter');}createBufferSource(){return node('noise');}
  createBuffer(channels,length){return{getChannelData:()=>new Float32Array(length)};}
  createDynamicsCompressor(){const item=node('compressor');for(const key of Object.keys(db.playback.compressor))item[key]=param();return item;}
 }
 context.window={AudioContext};context.document={getElementById:()=>({textContent:''}),querySelectorAll:()=>[]};context.setInterval=callback=>{intervals.set(++timer,callback);return timer;};context.clearInterval=id=>intervals.delete(id);
 await vm.runInContext("startPlayback('all')",context);
 const buses=vm.runInContext('guidePlayer.trackBuses',context),muted=base.orchestration.tracks.find(track=>track.role==='harmony'),trackId=muted.id+':'+muted.role,start=vm.runInContext('guidePlayer.start',context);
 context.trackId=trackId;vm.runInContext("setPlaybackMix('toggle',trackId)",context);
 assert.equal(buses.get(trackId).gain.value,0);assert.equal(vm.runInContext('guidePlayer.start',context),start,'live mute preserves playback position');
 vm.runInContext("setPlaybackMix('solo',trackId)",context);for(const[id,bus]of buses)assert.equal(bus.gain.value,id===trackId?1:0);
 assert.ok(graph.some(item=>item.target===buses.get(trackId)),'scheduled pitched events route through the instrument bus');
 vm.runInContext("setPlaybackMix('all-off')",context);assert.ok([...buses.values()].every(bus=>bus.gain.value===0));
 vm.runInContext("setPlaybackMix('all-on')",context);assert.ok([...buses.values()].every(bus=>bus.gain.value===1));
 const channels=[...buses.values()];vm.runInContext('stopPlayback()',context);assert.equal(intervals.size,0);assert.equal(buses.size,0);assert.ok(channels.every(bus=>bus.disconnected));assert.ok(graph.filter(item=>item.started!==undefined).every(item=>item.cancelled));
});
