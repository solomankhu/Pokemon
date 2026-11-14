const assert=require('assert'),T=require('../vendor/three-r128.min.js');let created=0,disposed=0,renders=0,released=0,lastCamera=null;const handlers={};class Renderer{constructor(){created++;this.domElement={style:{},addEventListener:(n,f)=>handlers[n]=f,removeEventListener:n=>delete handlers[n]};this.shadowMap={};this.info={memory:{},render:{}};}setSize(){}setPixelRatio(){}setClearColor(){}render(s,c){renders++;lastCamera=c;}compile(){}forceContextLoss(){released++;}dispose(){disposed++;}}
const P=require('./presenter');let failures=0;const container={style:{},clientWidth:640,clientHeight:480,appendChild(c){c.parentNode=this;},removeChild(c){c.parentNode=null;}};
const p=P.createBattlePresenter({THREE:{...T,WebGLRenderer:Renderer},container,species:{emberling:{art:{kind:'quad',c1:'#ff7733',c2:'#ffcc77'}}},onFailure:()=>failures++});
for(let i=0;i<20;i++){p.enter({mine:{id:'emberling',hp:10},foe:{id:'emberling',hp:10},arena:'meadow'});p.play({id:i,actor:'mine',moveId:'ember',result:{}});p.update(.05);p.render();p.suspend();const before=renders;p.render();assert.equal(renders,before);p.resume();p.leave();assert.equal(p.diagnostics.active,false);}
assert.equal(created,1);assert(lastCamera.position.x<0,'player near-left, foe far-right avoids fixed HUD');p.enter({mine:{id:'emberling'},foe:{id:'emberling'}});handlers.webglcontextlost({preventDefault(){}});assert.equal(failures,1);assert(p.diagnostics.suspended);p.dispose();assert.equal(disposed,1);assert.equal(released,1);assert.equal(Object.keys(handlers).length,0);
let fail=0;const bad=P.createBattlePresenter({THREE:{...T,WebGLRenderer:class{constructor(){throw Error('blocked')}}},container,onFailure:()=>fail++});bad.enter({});assert.equal(fail,1);assert.equal(bad.diagnostics.ready,false);bad.dispose();
console.log('presenter: repeated entries, suspension, renderer reuse, context loss/failure disposal');

// A replacement is detached before its successor joins the scene: one owned rig per side.
{
 const sp={emberling:{art:{kind:'quad',c1:'#f73',c2:'#fc7'}},dripling:{art:{kind:'serpent',c1:'#37a',c2:'#bdf'}}};
 const q=P.createBattlePresenter({THREE:{...T,WebGLRenderer:Renderer},container,species:sp});
 q.enter({mine:{id:'emberling'},foe:{id:'dripling'}});
 for(let i=0;i<20;i++){
  const old=q.view.rigs.mine.root,id=i%2?'emberling':'dripling';
  q.sync({mine:{id,visible:false},foe:{id:'dripling'}});q.update(0);
  assert.equal(old.parent,null,'outgoing rig leaves scene before replacement');assert(!q.view.rigs.mine.root.visible,'replacement waits for send-out');
  q.sync({mine:{id},foe:{id:'dripling'},action:{id:'one-sendout-'+i,kind:'sendout',actor:'mine',duration:.65,elapsed:.2}});q.update(0);
  const active=q.view.rigs;assert.equal(active.mine.root.parent.children.filter(o=>o===active.mine.root||o===active.foe.root).length,2);
  assert(active.mine.root.visible&&active.foe.root.visible,'one active model on each side');assert.equal(q.diagnostics.models,2);
 }
 q.dispose();
}

// Defense is readable before input and at a successful incoming contact, including reduced motion.
for(const reducedMotion of [false,true]){
 const q=P.createBattlePresenter({THREE:{...T,WebGLRenderer:Renderer},container,settings:{reducedMotion},species:{emberling:{art:{kind:'quad',c1:'#ff7733',c2:'#ffcc77'}}}});
 const snap={mine:{id:'emberling'},foe:{id:'emberling'},arena:'meadow'};
 q.enter(snap);q.sync({...snap,command:{kind:'guard'}});q.update(0);
 assert(q.view.shield&&q.view.shield.visible,'guard command raises a visible shield');
 const a={id:'blocked',actor:'foe',target:'mine',moveId:'tackle',guardTier:'PERFECT',elapsed:.65,duration:1.16,contactAt:.64,result:{eff:1,dmg:5}};
 q.sync({...snap,action:a});q.update(0);assert(q.view.shield.visible,'successful guard keeps shield at contact');
 assert.equal(q.view.shield.userData.tier,'PERFECT');
 q.sync({...snap,action:{...a,id:'unguarded',guardTier:null}});q.update(0);assert(!q.view.shield.visible,'failed guard shows no successful block');
 q.leave();assert(!q.view.shield.visible,'shield clears on battle exit');q.dispose();
}

// Repeated authoritative snapshots must neither restart lifecycle effects nor rebuild an evolving rig.
{
 const q=P.createBattlePresenter({THREE:{...T,WebGLRenderer:Renderer},container,species:{emberling:{art:{kind:'quad',c1:'#ff7733',c2:'#ffcc77'}},thornmane:{art:{kind:'quad',c1:'#449944',c2:'#aadd88'}},pyrelash:{art:{kind:'quad',c1:'#dd4422',c2:'#ffaa66'}}}});
 const snap={mine:{id:'emberling'},foe:{id:'thornmane'},arena:'meadow'};
 q.enter(snap);
 const a={id:'evolution-once',kind:'evolve',actor:'mine',into:'pyrelash',duration:1.6,elapsed:.9};
 q.sync({...snap,action:a});q.update(0);
 const evolved=q.view.rigs.mine;
 q.sync({...snap,action:{...a,elapsed:1}});q.update(0);
 assert(q.view.rigs.mine===evolved,'evolution retains the new rig across stale species snapshots');
 q.sync({...snap,mine:{id:'pyrelash'},action:{...a,elapsed:1.6}});q.update(0);
 q.sync({...snap,mine:{id:'pyrelash'},action:{...a,elapsed:1.6}});
 assert.equal(q.diagnostics.action,null,'completed lifecycle snapshot cannot replay');
 q.dispose();
}

/* --- impact and camera juice (3D) -------------------------------------------------------------
   Contact drives shake/flash/punch/hold from the action's own result; reduced motion (both paths)
   zeroes camera motion and flash; the burst lands in front of the target; the shadow tracks the rig. */
{
 let checks=0;const ok=(v,m)=>{assert(v,m);checks++;};const J=P.JUICE,rnd=Math.random;
 // three.js draws Math.random for UUIDs when it constructs objects; the per-frame effect paths must never call it.
 let randomCalls=0;Math.random=()=>{randomCalls++;return rnd();};
 const SP={emberling:{art:{kind:'quad',c1:'#ff7733',c2:'#ffcc77'}},thornmane:{art:{kind:'quad',c1:'#4a9a4a',c2:'#bde08a',mane:true}}};
 const make=s=>P.createBattlePresenter({THREE:{...T,WebGLRenderer:Renderer},container,species:SP,settings:s||{},onFailure:()=>{throw Error('unexpected failure');}});
 const base=new T.PerspectiveCamera(40,4/3,.1,60);base.position.set(...J.CAM_POS);base.lookAt(new T.Vector3(...J.CAM_LOOK));
 const R=require('./recipes');
 // Step an action at exactly 1/60 s on the queue's clock, the way the HTML host feeds it.
 function run(p,action,seconds,each){p.enter({mine:{id:'emberling'},foe:{id:'thornmane'},arena:'meadow'});const calls=randomCalls;let t=0;const step=1/60;
  while(t<seconds-1e-9){t+=step;const a=Object.assign({},action,{elapsed:Math.min(action.duration,t)});p.sync({mine:{id:'emberling'},foe:{id:'thornmane'},arena:'meadow',action:t<=action.duration?a:null});p.update(step);p.render();if(each)each(t,p);}ok(randomCalls===calls,'no Math.random while an action plays ('+action.moveId+')');}
 const act=(moveId,actor,result)=>{const r=R.recipeFor(moveId);return {id:moveId+actor+JSON.stringify(result),moveId,actor,target:actor==='mine'?'foe':'mine',result,duration:r.duration,contactAt:r.contactAt};};
 // Pure helpers.
 ok(P.holdElapsed(.5,.6,1,.1)===.5&&P.holdElapsed(.65,.6,1,.1)===.6&&Math.abs(P.holdElapsed(1,.6,1,.1)-1)<1e-12,'hold: untouched before contact, frozen during, ends with the queue');
 let prev=-1;for(let e=0;e<=1.0001;e+=.01){const v=P.holdElapsed(e,.6,1,.1);ok(v>=prev-1e-12,'hold is monotonic');prev=v;}
 const w=P.impactProfile({eff:.5}),n=P.impactProfile({eff:1}),s=P.impactProfile({eff:2}),c=P.impactProfile({eff:1,crit:true});
 ok(w.trauma<n.trauma&&n.trauma<s.trauma&&w.punch<n.punch&&n.punch<s.punch&&w.hold<n.hold&&n.hold<s.hold&&c.hold>=s.hold,'super effective gets more, resisted less');
 ok(n.trauma===J.TRAUMA_HIT&&s.trauma===J.TRAUMA_SUPER&&w.trauma===J.TRAUMA_WEAK,'trauma mirrors the 2D juiceHit constants');
 for(const r of [{eff:.5},{eff:1},{eff:2},{eff:2,crit:true}])for(const f of ['normal','electric']){const h=P.impactProfile(r,f).hold;ok(h>=.06-1e-12&&h<=J.HITSTOP_MAX+1e-12,'hold within 60-120 ms, capped');}
 ok(P.impactProfile({eff:1},'electric').hold>P.impactProfile({eff:1},'fire').hold,'electric hits stop longer');
 // Full motion: a super-effective tackle from the player.
 {const p=make({}),a=act('tackle','mine',{eff:2,crit:false,missed:false,dmg:12}),cAt=a.contactAt,wind=R.recipeFor('tackle').windup;let maxOff=0,maxRot=0,minFov=J.FOV,maxShock=0,tailSwing=0,moved=false,lunged=false,heldX=null,heldOk=true,sawHold=false,shadowOk=true,squashed=false,leaned=false,limit=true,impactFrame=null;
  run(p,a,a.duration+1.2,(t,p)=>{const j=p.diagnostics.juice,v=p.view,rig=v.rigs.mine,sh=v.arena.shadows.mine,cam=v.camera;
   maxOff=Math.max(maxOff,Math.abs(j.offset[0]),Math.abs(j.offset[1]));maxRot=Math.max(maxRot,Math.abs(j.rotation[0]),Math.abs(j.rotation[1]));minFov=Math.min(minFov,cam.fov);maxShock=Math.max(maxShock,v.effects.diagnostics.shock||0);tailSwing=Math.max(tailSwing,Math.abs(rig.joints.tail.rotation.z));if(cam.position.distanceTo(base.position)>1e-4)moved=true;
   if(Math.abs(sh.position.x-rig.root.position.x)>1e-9||Math.abs(sh.position.z-rig.root.position.z)>1e-9)shadowOk=false;
   if(rig.root.position.x>-3.4+3)lunged=true;
   if(t<cAt-1e-9){ok(j.trauma===0&&j.flash.foe===0,'nothing before contact');if(t>wind-J.WINDUP_BEAT&&t<wind){if(rig.root.scale.y<1-J.WINDUP_SQUASH*.8&&Math.abs(rig.root.scale.x*rig.root.scale.y-1)<1e-9&&rig.root.scale.x>1.1)squashed=true;if(rig.root.position.x<-3.4-J.WINDUP_LEAN*.8)leaned=true;}}
   if(j.held){sawHold=true;if(heldX===null)heldX=rig.root.position.x;else if(Math.abs(rig.root.position.x-heldX)>2*J.HOLD_VIBRATE+1e-9)heldOk=false;}
   if(impactFrame===null&&j.impacts){impactFrame=t;ok(Math.abs(j.trauma-J.TRAUMA_SUPER)<1e-9,'trauma from the hit');ok(j.flash.foe===J.FLASH_PEAK&&v.rigs.foe.getTint().flash===J.FLASH_PEAK,'struck rig flashes white');ok(j.flash.mine===0,'attacker does not flash');}
   if(v.effects.diagnostics.active>v.effects.diagnostics.limit)limit=false;});
  ok(impactFrame!==null&&impactFrame>=cAt-1e-9&&impactFrame<cAt+1/60+1e-9,'impact on the contact frame');
  ok(sawHold&&heldOk,'hit-stop holds the pose');ok(moved,'camera moves on contact');ok(maxOff>0&&maxOff<=J.CAM_SHAKE_MAX+1e-12,'shake is visible and clamped');
  ok(lunged&&shadowOk,'shadow follows the lunge');ok(maxRot>0&&maxRot<=J.CAM_SHAKE_ROT+1e-12,'shake rotates the camera, clamped');
  ok(minFov<J.FOV-1&&minFov>=J.FOV-J.FOV_KICK-1e-9&&p.view.camera.fov===J.FOV,'FOV kick on impact, recovered');ok(maxShock>1&&maxShock<=3+1e-9&&!p.view.effects.root.getObjectByName('impact-shockwave').visible,'ground shockwave 0 -> 3 then gone');
  ok(tailSwing>.02,'tail follows through on a spring');ok(squashed&&leaned,'anticipation: crouch and draw back before the lunge');ok(limit,'particle pool bounded');
  const d=p.view.effects.diagnostics,cam=new T.Vector3(...J.CAM_POS),imp=new T.Vector3(...d.lastImpact),tgt=new T.Vector3(...d.lastTarget),radius=Math.min(J.BURST_RADIUS_CAP,p.view.rigs.foe.metrics.radius);
  ok(d.impacts===1&&imp.distanceTo(cam)<tgt.distanceTo(cam)-radius,'burst spawns in front of the target, outside its radius');
  ok(tgt.y>.5,'burst aims at the body, not the feet');
  const j=p.diagnostics.juice;ok(j.trauma===0&&j.flash.foe===0&&j.punch===0&&p.view.camera.position.distanceTo(base.position)<1e-9&&p.view.camera.quaternion.angleTo(base.quaternion)<1e-6,'everything is time-boxed: camera back home');
  ok(p.view.rigs.foe.getTint().flash===0,'flash cleared');p.dispose();}
 // Miss and immunity: no impact juice.
 for(const result of [{eff:1,missed:true},{eff:0,missed:false}]){const p=make({}),a=act('tackle','mine',result);let any=false;run(p,a,a.duration+.1,(t,p)=>{const j=p.diagnostics.juice;if(j.trauma||j.flash.foe||j.held||j.punch)any=true;});ok(!any&&p.diagnostics.juice.impacts===0,'no impact juice for '+JSON.stringify(result));p.dispose();}
 // Reduced motion, both paths: no camera motion, flash, hold, lunge, bob or breathing.
 for(const path of ['setting','media']){
  if(path==='media')globalThis.matchMedia=q=>({matches:/prefers-reduced-motion:\s*reduce/.test(q)});
  const p=make(path==='setting'?{reducedMotion:true}:{});ok(p.diagnostics.reducedMotion===true,path+': reduced detected');
  let still=true,noFlash=true,noHold=true,home=true,calm=true,shadowOk=true;
  for(const a of [act('tackle','mine',{eff:2,crit:true}),act('ember','foe',{eff:1})])run(p,a,a.duration+.3,(t,p)=>{const v=p.view,j=p.diagnostics.juice;
   if(v.camera.position.distanceTo(base.position)>1e-12||v.camera.quaternion.angleTo(base.quaternion)>1e-6||j.shake||j.punch)still=false;
   if(j.flash.mine||j.flash.foe||v.rigs.foe.getTint().flash||v.rigs.mine.getTint().flash)noFlash=false;if(j.held)noHold=false;if(v.camera.fov!==J.FOV)still=false;if(v.rigs.mine.joints.tail.rotation.z!==0)calm=false;
   for(const side of ['mine','foe']){const r=v.rigs[side];if(Math.abs(r.root.position.x-(side==='mine'?-3.4:3.4))>1e-12)home=false;if(r.root.scale.y!==1||r.root.scale.x!==1)calm=false;if(v.arena.shadows[side].position.x!==r.root.position.x)shadowOk=false;}});
  ok(still,path+': camera never moves');ok(noFlash,path+': no flash');ok(noHold,path+': no hit-stop');ok(home,path+': no lunge or knockback');ok(calm,path+': no squash or breathing');ok(shadowOk,path+': shadow still tracks');
  ok(p.view.effects.diagnostics.impacts>=1,path+': the contact burst still marks the hit');
  p.dispose();if(path==='media')delete globalThis.matchMedia;}
 // Idle life in full motion: breathing changes the scale over time.
 {const p=make({});p.enter({mine:{id:'emberling'},foe:{id:'thornmane'},arena:'meadow'});const ys=new Set();for(let i=0;i<90;i++){p.update(1/60);ys.add(p.view.rigs.foe.root.scale.y.toFixed(5));}ok(ys.size>10,'idle breathing');p.dispose();}
 // Faint: slump, then dissolve to nothing (no pop); a new send-out is fully opaque again.
 {const p=make({});p.enter({mine:{id:'emberling'},foe:{id:'thornmane'},arena:'meadow'});const a={id:'faint1',kind:'faint',actor:'foe',target:'foe',duration:.65};let mid=null,slumped=false;
  for(let i=1;i<=39;i++){const t=i/60;p.sync({mine:{id:'emberling'},foe:{id:'thornmane'},arena:'meadow',action:Object.assign({},a,{elapsed:t})});p.update(1/60);if(t<.65*J.FAINT_SLUMP&&p.view.rigs.foe.getTint().fade===1&&p.view.rigs.foe.root.rotation.z<-.3)slumped=true;if(i===30)mid=p.view.rigs.foe.getTint().fade;}
  p.update(1/60);ok(slumped,'faint slumps first');ok(mid>0&&mid<1,'then dissolves');ok(p.view.rigs.foe.getTint().fade===0&&p.view.rigs.foe.root.scale.x>.5,'ends invisible without shrinking to a pop');
  p.sync({mine:{id:'emberling'},foe:{id:'thornmane',visible:false},arena:'meadow'});p.update(1/60);p.sync({mine:{id:'emberling'},foe:{id:'thornmane'},arena:'meadow',action:{id:'so',kind:'sendout',actor:'foe',duration:.65,elapsed:.65}});p.update(1/60);ok(p.view.rigs.foe.getTint().fade===1,'send-out restores opacity');p.dispose();}
 // Determinism: the same hit gives the same camera trace.
 {const trace=()=>{const p=make({}),a=act('ember','mine',{eff:1,crit:true}),out=[];run(p,a,a.duration,(t,p)=>out.push(p.view.camera.position.toArray().join()));p.dispose();return out.join('|');};ok(trace()===trace(),'deterministic cosmetic camera');}
 Math.random=rnd;
 // Static guard: no Math.random anywhere in the 3D effect code.
 const fs=require('fs'),path=require('path');for(const f of ['presenter.js','effects.js','models.js','arenas.js','recipes.js'])ok(!/Math\.random/.test(fs.readFileSync(path.join(__dirname,f),'utf8')),f+' has no Math.random');
 console.log('presenter juice: '+checks+' checks (contact shake/flash/hold/punch, burst placement, shadow, anticipation, faint, both reduced-motion paths, no Math.random)');
}



