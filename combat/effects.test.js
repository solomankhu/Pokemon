const assert=require('assert'),T=require('../vendor/three-r128.min.js'),R=require('./recipes'),E=require('./effects');
for(const reducedMotion of [false,true]){
 const e=E.createEffects(T,null,{reducedMotion});
 for(const [moveId,type,min] of [['flameburst','ConeGeometry',reducedMotion?2:5],['thunderbolt','CylinderGeometry',reducedMotion?3:8]]){
  e.start({id:moveId,moveId,result:{eff:1}});e.update(0,R.recipeFor(moveId).contactAt);
  assert(e.root.children.filter(o=>o.visible&&o.geometry?.type===type).length>=min,moveId+' has a distinctive contact explosion');
 }
 e.start({id:'faint',kind:'faint',duration:.65});e.update(.01);assert.equal(e.diagnostics.defeats,1,'faint emits a defeat burst');
 for(let i=0;i<100;i++)e.update(.02);assert.equal(e.diagnostics.defeats,1,'defeat burst emits once');assert.equal(e.diagnostics.active,0,'defeat particles expire');e.dispose();
}
for(const quality of ['HIGH','STANDARD','LOW'])for(const reducedMotion of [false,true]){const e=E.createEffects(T,null,{quality,reducedMotion});for(const id of Object.keys(R.RECIPES)){e.start({moveId:id,actor:'mine',result:{}},{source:new T.Vector3(-3,1,0),target:new T.Vector3(3,1,0)});for(let i=0;i<70;i++){e.update(.03);assert(e.diagnostics.active<=e.diagnostics.limit);e.root.traverse(o=>{assert(Number.isFinite(o.position.x));});}assert.equal(e.diagnostics.active,0);}e.start({moveId:'ember',result:{missed:true}});e.update(.9);assert.equal(e.diagnostics.impacts,0);e.reset();e.start({moveId:'ember',result:{eff:0}});e.update(.9);assert.equal(e.diagnostics.impacts,0);e.dispose();assert(e.diagnostics.disposed);}
const capture=E.createEffects(T,null,{});capture.start({kind:'throw',duration:1.2});capture.update(.05);assert(capture.root.getObjectByName('capture-ball').visible);capture.reset();capture.start({kind:'catch',duration:1.2},{target:new T.Vector3(3,1,0)});capture.update(.01);assert.equal(capture.root.getObjectByName('capture-ball').position.x,3);capture.reset();assert(!capture.root.getObjectByName('capture-ball').visible);capture.dispose();
// Contact burst: at the supplied impact point (in front of the target), additive with an explicit
// renderOrder, a ground shockwave that grows 0 -> 3 and is gone after 300 ms, a fixed record pool.
{const e=E.createEffects(T,null,{quality:'HIGH'}),target=new T.Vector3(3.4,1.2,0),impact=new T.Vector3(2.6,1.5,1.2);let checks=0;const ok=(v,m)=>{assert(v,m);checks++;};
 const rnd=Math.random;let calls=0;Math.random=()=>{calls++;return rnd();};
 for(let k=0;k<40;k++){e.start({id:'b'+k,moveId:k%2?'tackle':'thunderbolt',actor:'mine',result:{eff:k%3?1:2,crit:k%5===0}},{source:new T.Vector3(-3.4,1.2,0),target:()=>target,impact:()=>impact});let shockMax=0,sawGlow=false;
  for(let i=0;i<80;i++){e.update(1/60);shockMax=Math.max(shockMax,e.diagnostics.shock||0);ok(e.diagnostics.active<=e.diagnostics.limit,'bounded');e.root.traverse(o=>{if(o.visible&&o.material&&o.material.blending===T.AdditiveBlending&&o.renderOrder>=E.BURST.SHOCK_ORDER)sawGlow=true;});}
  ok(e.diagnostics.impacts===1,'one burst per landed hit');ok(e.diagnostics.lastImpact.every((v,i)=>v===impact.toArray()[i]),'burst at the impact point, not the target');ok(e.diagnostics.lastTarget[0]===3.4,'target recorded');
  ok(sawGlow,'additive burst with explicit renderOrder');ok(shockMax>1&&shockMax<=E.BURST.SHOCK_SCALE+1e-9,'shockwave grows toward 3');ok(!e.root.getObjectByName('impact-shockwave').visible,'shockwave time-boxed');}
 ok(calls===0,'effects never call Math.random');Math.random=rnd;
 let records=0;e.root.traverse(o=>{if(o.isMesh&&o.parent===e.root&&o.name!=='impact-shockwave')records++;});ok(records===e.diagnostics.limit,'fixed pool: no meshes created by bursts');
 e.reset();e.start({id:'nf',moveId:'tackle',result:{eff:1}},{target:new T.Vector3(3,1,0)});for(let i=0;i<60;i++)e.update(1/60);ok(e.diagnostics.lastImpact[0]===3,'no impact point: falls back to the target');
 const rng=E.createRng(7),a=[rng(),rng(),rng()],rng2=E.createRng(7);ok(a.every(v=>v===rng2()&&v>=0&&v<1),'cosmetic rng is seeded and deterministic');
 e.dispose();console.log('effects burst: '+checks+' checks');}
console.log('effects: 47 moves, 6 quality/motion profiles, lifetime/miss/immunity and visible capture ball verified');
// Battle-item cues: kind 'heal' rides the kindless self-ring path in the green 'heal' family; a
// GREAT BALL throw tints the capture ball's top half blue and a plain BALL resets it. Both motion profiles.
{let checks=0;const ok=(v,m)=>{assert(v,m);checks++;};
 for(const reducedMotion of [false,true]){const e=E.createEffects(T,null,{reducedMotion});const rnd=Math.random;let calls=0;Math.random=()=>{calls++;return rnd();};
  e.start({id:'h',kind:'heal',actor:'mine',duration:.65},{target:new T.Vector3(-3,1,0)});e.update(.02);
  ok(e.diagnostics.ringFamily==='heal'&&e.diagnostics.active>0,'heal emits a heal-family ring');
  let green=false;e.root.traverse(o=>{if(o.visible&&o.material&&o.material.color&&o.material.color.getHex()===E.palette.heal)green=true;});ok(green,'the heal ring is drawn green');
  for(let i=0;i<60;i++){e.update(1/60);ok(e.diagnostics.active<=e.diagnostics.limit,'heal ring pool bounded');}
  e.start({id:'l',kind:'level',actor:'mine',duration:.65},{target:new T.Vector3(-3,1,0)});e.update(.02);ok(e.diagnostics.ringFamily==='status','other kindless actions keep the status ring');
  const top=e.root.getObjectByName('capture-ball').children[0].material;
  e.start({id:'g',kind:'throw',item:'greatball',duration:1.1});e.update(.05);ok(top.color.getHex()===E.CUE.GREAT_TOP&&e.diagnostics.ballTop===E.CUE.GREAT_TOP,'GREAT BALL throw is blue');
  e.start({id:'c',kind:'catch',item:'greatball',duration:1},{target:new T.Vector3(3,1,0)});e.update(.01);ok(top.color.getHex()===E.CUE.GREAT_TOP,'GREAT BALL stays blue for the catch');
  e.start({id:'p',kind:'throw',item:'ball',duration:1.1});e.update(.05);ok(top.color.getHex()===E.CUE.BALL_TOP,'a plain BALL is red');
  ok(calls===0,'item cues never call Math.random');Math.random=rnd;e.dispose();}
 console.log('effects item cues: '+checks+' checks');}
