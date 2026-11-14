'use strict';
/* Battle scene (conditions Chunk 3): layout jitter, time-of-day lighting, weather particles,
   presenter scene-wide state (fog / background / camera presets), cache key and reduced motion.
   Shell only: no Math.random, layout 0 reproduces the pre-conditions arena byte for byte. */
const assert=require('assert'),T=require('../vendor/three-r128.min.js'),A=require('./arenas.js'),P=require('./presenter.js');
let checks=0;const ok=(v,m)=>{assert(v,m);checks++;};
const KINDS=['meadow','shore','pass','ruins','cave'];
// FNV-1a over every object's type, name, transform, geometry, material and light, as built before this chunk.
function digest(a){const out=[];a.root.traverse(o=>{const f=v=>v.toArray().map(n=>(+n).toFixed(6)).join(',');let s=o.type+'|'+(o.name||'')+'|'+f(o.position)+'|'+f(o.scale)+'|'+[o.rotation.x,o.rotation.y,o.rotation.z].map(n=>n.toFixed(6)).join(',');if(o.geometry)s+='|'+o.geometry.type+JSON.stringify(o.geometry.parameters);if(o.material)s+='|'+o.material.color.getHexString()+'|'+(o.material.emissive?o.material.emissive.getHexString():'')+'|'+o.material.opacity;if(o.isLight)s+='|'+o.color.getHexString()+'|'+o.intensity+(o.groundColor?'|'+o.groundColor.getHexString():'');out.push(s);});let h=0x811c9dc5;const str=out.join('\n');for(let i=0;i<str.length;i++){h^=str.charCodeAt(i);h=Math.imul(h,16777619)>>>0;}return {h:h.toString(16),n:out.length};}
// Captured from combat/arenas.js before any scene support existed (backup in .superpowers/sdd/2026-10-18-battle-conditions/).
const GOLDEN={meadow:{h:'998b873e',n:61},shore:{h:'9cd2753a',n:53},pass:{h:'948b42c3',n:53},ruins:{h:'98fb0f41',n:57},cave:{h:'dba8197',n:61}};
const rnd0=Math.random;let randomCalls=0;
const DEF={layout:0,time:'day',weather:'none',camera:0};

/* --- 3.1 buildArena(T, kind, quality, scene) --- */
for(const kind of KINDS){
 for(const sc of [undefined,null,{layout:0},DEF]){const d=digest(A.buildArena(T,kind,'STANDARD',sc));ok(d.h===GOLDEN[kind].h&&d.n===GOLDEN[kind].n,kind+' layout 0 / no scene reproduces today exactly ('+JSON.stringify(sc)+')');}
}
const props=a=>{const out=[];a.root.traverse(o=>{if(o.userData&&o.userData.prop)out.push(o);});return out;};
const ring=a=>{const out=[];a.root.traverse(o=>{if(o.userData&&o.userData.decor)out.push(o);});return out;};
for(const kind of KINDS){
 const base=A.buildArena(T,kind,'STANDARD',DEF),pb=props(base);ok(pb.length>=8,kind+': the jittered props are tagged');ok(ring(base).length===30,kind+': the 30-rock ring is tagged decor, never jittered');
 const a=A.buildArena(T,kind,'STANDARD',{...DEF,layout:12345}),b=A.buildArena(T,kind,'STANDARD',{...DEF,layout:987654321}),pa=props(a),pbb=props(b);
 ok(pa.length===pb.length&&pbb.length===pb.length,kind+': same prop count per layout');
 let moved=0;for(let i=0;i<pa.length;i++)if(pa[i].position.distanceTo(pbb[i].position)>1e-3)moved++;ok(moved>=pa.length*.5,kind+': two layouts move at least half the props ('+moved+'/'+pa.length+')');
 const ra=ring(a),rb=ring(base);ok(ra.every((o,i)=>o.position.distanceTo(rb[i].position)===0),kind+': the decor ring is identical in every layout');
 ok(digest(A.buildArena(T,kind,'STANDARD',{...DEF,layout:12345})).h===digest(a).h,kind+': a layout is deterministic');
 // Clearance: no jittered prop centre in the band between the camera and the platforms.
 let clear=true,inX=true,worst='';for(let l=1;l<=200;l++){const s=A.buildArena(T,kind,'LOW',{...DEF,layout:(l*2654435761)>>>0});for(const o of props(s)){const p=o.position;if(p.x>=-5.2&&p.x<=5.2&&p.z>=-3.4&&p.z<=2.4){clear=false;worst=o.userData.prop+' '+p.toArray();}if(p.x<-9-1e-9||p.x>9+1e-9)inX=false;}s.dispose();}
 ok(clear,kind+': 200 layouts keep jittered props out of the clearance box '+worst);ok(inX,kind+': clamped x stays in [-9,9]');
 base.dispose();a.dispose();b.dispose();
}
// Lighting by time of day.
{const key=(kind,time)=>A.buildArena(T,kind,'STANDARD',{...DEF,time}).lights[1];
 for(const kind of ['meadow','shore','pass','ruins']){ok(key(kind,'night').intensity<key(kind,'day').intensity,kind+': night key light below day');const c=key(kind,'dusk').color;ok(c.r>c.b,kind+': dusk key warmer than blue');ok(key(kind,'dusk').color.getHex()!==key(kind,'day').color.getHex(),kind+': dusk changes the key colour');}
 const cave=A.buildArena(T,'cave','STANDARD',{...DEF,time:'night'});ok(cave.lights[0].color.getHex()===0x8cbbe7,'the cave keeps its own hemisphere colour');ok(cave.lights[1].intensity<1.2,'night still dims the cave key a little');
 ok(A.buildArena(T,'meadow','STANDARD',{...DEF,weather:'sun'}).lights[1].intensity>key('meadow','day').intensity,'sun brightens the key light');
 for(const t of ['day','dusk','dawn','night'])ok(A.TIME_LIGHT[t]&&Number.isFinite(A.TIME_LIGHT[t].key)&&Number.isFinite(A.TIME_LIGHT[t].fog),'TIME_LIGHT.'+t);
 ok(A.TIME_LIGHT.day.fog===0x253c46&&A.TIME_LIGHT.day.sky===null,'day fog/background are today\'s');}
// Weather particles.
ok(A.WEATHER_MAX.HIGH===600&&A.WEATHER_MAX.STANDARD===300&&A.WEATHER_MAX.LOW===120,'WEATHER_MAX');
for(const q of ['HIGH','STANDARD','LOW'])for(const w of ['rain','snow','leaves','dust','sparks','motes','fog','sun','none']){const a=A.buildArena(T,'meadow',q,{...DEF,layout:7,weather:w}),pts=a.root.getObjectByName('weather');
 if(['fog','sun','none'].includes(w)){ok(!pts&&a.weather===null,q+' '+w+': no particles');continue;}
 ok(pts&&pts.isPoints&&a.weather===pts,q+' '+w+': a Points child named weather');const n=pts.geometry.attributes.position.count;ok(n>0&&n<=A.WEATHER_MAX[q],q+' '+w+': '+n+' within WEATHER_MAX');
 const arr=pts.geometry.attributes.position.array;let inBox=true;for(let i=0;i<arr.length;i+=3)if(arr[i]<-9||arr[i]>9||arr[i+1]<0||arr[i+1]>7||arr[i+2]<-6||arr[i+2]>6)inBox=false;ok(inBox,q+' '+w+': spawned inside the weather box');a.dispose();}
ok(A.buildArena(T,'meadow','STANDARD',{...DEF,weather:'rain'}).time==='day'&&A.buildArena(T,'meadow','STANDARD',{...DEF,time:'dusk'}).scene.time==='dusk','returns scene and time');
// Disposal: every geometry and material, weather included, over 20 build/dispose cycles.
{let alive=0,made=0;const WS=['rain','snow','leaves','dust','sparks','motes','fog','sun','none','rain'];
 for(let i=0;i<20;i++){const a=A.buildArena(T,KINDS[i%5],['HIGH','STANDARD','LOW'][i%3],{layout:i*7919,time:['day','dusk','dawn','night'][i%4],weather:WS[i%WS.length],camera:i%4});const res=new Set();a.root.traverse(o=>{if(o.geometry)res.add(o.geometry);if(o.material)res.add(o.material);});for(const r of res){made++;alive++;r.addEventListener('dispose',()=>alive--);}a.dispose();a.dispose();}
 ok(made>0&&alive===0,'20 build/dispose cycles leave no geometry or material alive ('+made+' made)');}
ok(A.normalizeScene({layout:-1,time:'noon',weather:'hail',camera:9}).time==='day'&&A.normalizeScene({weather:'hail'}).weather==='none'&&A.normalizeScene({camera:9}).camera===0&&A.normalizeScene(null).layout===0,'normalizeScene repairs junk to the default');
// The arena build never calls Math.random beyond three.js's own UUIDs: the layout and weather streams are mulberry32.
{const s=require('fs').readFileSync(require('path').join(__dirname,'arenas.js'),'utf8');ok(!/Math\.random/.test(s),'arenas.js has no Math.random');}

/* --- 3.2 presenter: scene-wide state, cache key, camera presets, weather animation --- */
class Renderer{constructor(){this.domElement={style:{},addEventListener(){},removeEventListener(){}};this.shadowMap={};this.info={memory:{},render:{}};}setSize(){}setPixelRatio(){}setClearColor(){}render(){}compile(){}forceContextLoss(){}dispose(){}}
const container={style:{},clientWidth:640,clientHeight:480,appendChild(){},removeChild(){}};
const gameContext={console,localStorage:{getItem:()=>null,setItem(){}}};require('vm').runInNewContext(require('fs').readFileSync(require('path').join(__dirname,"../claude's monsters.html"),'utf8').match(/<script>([\s\S]*)<\/script>/)[1],gameContext);
const SP=gameContext.__GAME__.SPECIES;
const make=s=>P.createBattlePresenter({THREE:{...T,WebGLRenderer:Renderer},container,species:SP,settings:s||{},onFailure:e=>{throw e;}});
const snap=(scene,extra)=>Object.assign({mine:{id:'emberling'},foe:{id:'thornmane'},arena:'meadow'},scene===undefined?{}:{scene},extra||{});
{const p=make();p.enter(snap());const a0=p.view.arena;p.sync(snap());p.update(1/60);p.sync(snap());ok(p.view.arena===a0,'no scene: the arena is built once (DEFAULT_SCENE key)');
 ok(a0.key==='meadow|0|day|none|0'&&p.diagnostics.scene===a0.key,'cache key from DEFAULT_SCENE');
 const sc=p.view.scene;ok(sc.fog.color.getHex()===0x253c46&&sc.fog.near===14&&sc.fog.far===32&&sc.background===null,'default scene keeps today\'s fog and background');
 ok(p.view.camera.position.toArray().join()===P.JUICE.CAM_POS.join(),'default camera at CAM_POS');
 let gone=0;a0.root.traverse(o=>{if(o.geometry)o.geometry.addEventListener('dispose',()=>gone++);});
 const A1={layout:42,time:'dusk',weather:'rain',camera:1};p.sync(snap(A1));const a1=p.view.arena;ok(a1!==a0&&gone>0&&a0.root.parent===null,'a new scene rebuilds the arena and disposes the old one');
 ok(sc.fog.color.getHex()===A.TIME_LIGHT.dusk.fog&&sc.background&&sc.background.getHex()===A.TIME_LIGHT.dusk.sky,'fog and background follow TIME_LIGHT.dusk');
 p.sync(snap(A1));ok(p.view.arena===a1,'same scene, no rebuild');
 p.sync(snap({...A1,weather:'fog'}));ok(sc.fog.near<14&&sc.fog.far<=32,'fog weather pulls the fog near in ('+sc.fog.near+')');ok(sc.background&&sc.background.getHex()===sc.fog.color.getHex(),'fog weather: the background is the fog bank');
 p.sync(snap({...A1,layout:43,weather:'rain'}));ok(p.view.arena!==a1,'a direct battle-to-battle change of layout rebuilds');
 p.leave();ok(sc.fog.color.getHex()===0x253c46&&sc.fog.near===14&&sc.fog.far===32&&sc.background===null,'clearBattle restores fog and background');
 p.enter(snap());p.update(1/60);ok(p.view.camera.position.toArray().join()===P.JUICE.CAM_POS.join(),'clearBattle restores the camera base');ok(Object.isFrozen(P.JUICE.CAM_POS),'JUICE.CAM_POS stays frozen');
 p.dispose();}
// Camera presets keep the foe above the player HP box (y=248) and both rigs on screen.
ok(Array.isArray(P.CAMERA_PRESETS_3D)&&P.CAMERA_PRESETS_3D.length===4&&P.CAMERA_PRESETS_3D[0].every(v=>v===0),'four presets, preset 0 is today');
const foeY0={};for(const id of Object.keys(SP))for(const kind of KINDS)for(let c=0;c<4;c++){const p=make();p.enter(snap({layout:0,time:'day',weather:'none',camera:c},{arena:kind,foe:{id}}));p.update(1/60);p.render();const pr=p.diagnostics.projected;
 ok(pr&&pr.foe.y<286,kind+' preset '+c+' '+id+': foe projected y '+pr.foe.y.toFixed(1)+' < 286');if(c===0)foeY0[kind]=pr.foe.y;else ok(pr.foe.y<=foeY0[kind]+3,kind+' preset '+c+': foe no lower than today + 3 px');for(const s of ['mine','foe'])ok(pr[s].x>=0&&pr[s].x<=640,kind+' preset '+c+': '+s+' x '+pr[s].x.toFixed(1)+' on screen');
 const want=P.JUICE.CAM_POS.map((v,i)=>v+P.CAMERA_PRESETS_3D[c][i]);ok(p.view.camera.position.toArray().every((v,i)=>Math.abs(v-want[i])<1e-9),'preset '+c+' offsets CAM_POS');p.dispose();}
// Projection uses the current camera: moving the preset changes the projected point without a renderer.
{const p=make();p.enter(snap({...DEF,camera:0}));p.update(1/60);p.render();const a=p.diagnostics.projected.foe.x;p.sync(snap({...DEF,camera:1}));p.update(1/60);p.render();ok(Math.abs(p.diagnostics.projected.foe.x-a)>1,'render() projects with the updated camera matrix');p.dispose();}
// Weather animation, deterministic and shell only.
Math.random=()=>{randomCalls++;return rnd0();};
const ys=pts=>Array.from(pts.geometry.attributes.position.array.filter((_,i)=>i%3===1));
for(const [w,falls] of [['rain',true],['snow',true],['leaves',true],['dust',false],['motes',false],['sparks',false]]){
 for(const reducedMotion of [false,true]){const p=make({reducedMotion});p.enter(snap({layout:3,time:'day',weather:w,camera:0}));const pts=p.view.arena.weather,before=pts.geometry.attributes.position.array.slice(),y0=ys(pts),calls=randomCalls,op0=pts.material.opacity;let wrapped=false,minY=Infinity,ops=new Set();
  for(let i=0;i<120;i++){p.sync(snap({layout:3,time:'day',weather:w,camera:0}));p.update(1/60);p.render();const y=ys(pts);for(let k=0;k<y.length;k++){if(y[k]>y0[k]+3&&falls)wrapped=true;minY=Math.min(minY,y[k]);}ops.add(pts.material.opacity.toFixed(3));}
  ok(randomCalls===calls,w+(reducedMotion?' reduced':'')+': no Math.random in sync/update over 120 frames');
  const arr=pts.geometry.attributes.position.array;let same=true;for(let k=0;k<arr.length;k++)if(arr[k]!==before[k])same=false;
  if(reducedMotion){ok(same,w+' reduced: particles never move');ok(ops.size===1&&pts.material.opacity===op0,w+' reduced: no flicker');}
  else{ok(!same,w+': particles move');if(falls){ok(minY>=0,w+': never below y=0');ok(w==='leaves'||wrapped,w+': falls and wraps at y=0');let down=0;const y=ys(pts);for(let k=0;k<y.length;k++)if(y[k]<y0[k])down++;ok(w==='rain'||down>0,w+': drifts down');}if(w==='sparks')ok(ops.size>3,'sparks flicker by opacity');}
  p.dispose();}}
// Rain falls 9 u/s: one 1/60 frame drops it 0.15.
{const p=make();p.enter(snap({layout:3,time:'day',weather:'rain',camera:0}));const pts=p.view.arena.weather,y0=ys(pts);p.update(1/60);const y1=ys(pts);let k=y0.findIndex(v=>v>1);ok(Math.abs((y0[k]-y1[k])-9/60)<1e-6,'rain falls '+P.WEATHER_FALL.rain+' u/s');p.dispose();}
// Tremor sway: tiny camera sway with dust, none under reduced motion, none in other weather.
for(const reducedMotion of [false,true]){const p=make({reducedMotion});p.enter(snap({layout:0,time:'day',weather:'dust',camera:0}));let max=0;for(let i=0;i<60;i++){p.update(1/60);max=Math.max(max,Math.abs(p.diagnostics.juice.sway));}
 if(reducedMotion)ok(max===0&&p.view.camera.position.toArray().join()===P.JUICE.CAM_POS.join(),'reduced: no tremor sway');else ok(max>0&&max<=P.TREMOR_SWAY+1e-12,'tremor sways the camera, clamped ('+max.toFixed(4)+')');p.dispose();}
{const p=make();p.enter(snap({layout:0,time:'day',weather:'rain',camera:0}));for(let i=0;i<30;i++)p.update(1/60);ok(p.diagnostics.juice.sway===0,'no sway without tremor dust');p.dispose();}
// Snapshot is never written.
{const p=make();const s=snap({layout:5,time:'night',weather:'snow',camera:2});const frozen=JSON.stringify(s);p.enter(s);for(let i=0;i<30;i++){p.sync(s);p.update(1/60);p.render();}ok(JSON.stringify(s)===frozen,'the snapshot is never written');p.dispose();}
// Weather resources go with the arena: 20 presenter rebuilds leave nothing alive.
{const p=make();p.enter(snap());let alive=0;const WS=['rain','snow','leaves','dust','sparks','motes'];for(let i=0;i<20;i++){p.sync(snap({layout:i+1,time:'dusk',weather:WS[i%6],camera:i%4}));p.update(1/60);const w=p.view.arena.weather;alive+=2;w.geometry.addEventListener('dispose',()=>alive--);w.material.addEventListener('dispose',()=>alive--);}p.leave();ok(alive===0,'20 weather rebuilds leak nothing');p.dispose();}
Math.random=rnd0;
console.log('scene: '+checks+' checks (layout 0 golden, jitter + clearance, time light, weather pool/caps/disposal, fog/background/camera presets, weather animation, reduced motion, no Math.random)');
