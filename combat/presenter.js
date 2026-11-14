(function(root,factory){const node=typeof module==='object'&&module.exports;const api=factory(node?require('./recipes'):root.MonsterRecipes,node?require('./effects'):root.MonsterEffects,node?require('./models'):root.MonsterModels,node?require('./arenas'):root.MonsterArenas);if(node)module.exports=api;else root.MonsterPresenter=api;})(typeof globalThis!=='undefined'?globalThis:this,function(R,E,M,A){
'use strict';
/* Impact and camera juice for the 3D presenter. Shell only: it reads the action's own result
   (eff / crit / missed) and the queue's authoritative elapsed time, and writes nothing back, so
   damage, queue order and the engine's random stream are untouched. Every effect is time-boxed.
   Trauma / hit-stop values mirror the 2D juiceHit constants in claude's monsters.html. */
const JUICE=Object.freeze({
 CAM_POS:Object.freeze([-8,6.1,12]),CAM_LOOK:Object.freeze([0,.7,0]),
 TRAUMA_HIT:.35,TRAUMA_WEAK:.2,TRAUMA_SUPER:.6,TRAUMA_CRIT:.2,TRAUMA_SCARE:.8,
 TRAUMA_DECAY:1.8,        // trauma lost per second (not per frame)
 CAM_SHAKE_MAX:.08,       // world units of eye/look offset at trauma 1
 CAM_SHAKE_ROT:.006,      // radians of pitch/yaw at trauma 1 (offset + rotation together stay ~7 px, the 2D SHAKE_MAX)
 CAM_ROLL_MAX:.012,       // radians of camera roll at trauma 1
 CAM_SHAKE_HZ:9,          // base frequency of the smooth shake noise (sums of sines, never per-frame jitter)
 FOV:40,FOV_KICK:5,FOV_RECOVER:.15, // impact FOV kick: fov -= FOV_KICK * hit trauma, eased back over FOV_RECOVER s
 CAM_PUNCH_NORMAL:.06,CAM_PUNCH_SUPER:.11,CAM_PUNCH_WEAK:.025,CAM_PUNCH_CRIT:.04, // fraction of the way to the struck rig
 CAM_PUNCH_LOOK:.35,      // how far the look point slides toward the struck rig during a punch
 CAM_PUNCH_IN:.06,CAM_PUNCH_OUT:.42, // s: snap in, then ease back
 HITSTOP_WEAK:.06,HITSTOP_NORMAL:.075,HITSTOP_SUPER:.1,HITSTOP_CRIT:.12, // s pose hold at contact (both rigs)
 HITSTOP_ELECTRIC:.02,HITSTOP_MAX:.12, // electric hits stop a little longer; hard cap
 HOLD_VIBRATE:.035,HOLD_VIBRATE_HZ:30, // both rigs shiver side to side during the hold (opposite phase)
 FLASH_TIME:.2,FLASH_PEAK:.85, // s and strength of the struck rig's emissive white pulse (fades, never strobes)
 KNOCK_NORMAL:.32,KNOCK_SUPER:.5,KNOCK_WEAK:.18, // world units the struck rig is shoved back
 KNOCK_OUT:.05,KNOCK_TIME:.32, // s to peak, s total
 RECOIL_SQUASH:.14,       // struck rig squash at the peak of the knockback
 WINDUP_SQUASH:.13,       // attacker crouch: scale.y 0.87, scale.x = 1/scale.y (~1.15, volume kept)
 WINDUP_RAMP:.15,         // s the crouch takes to build
 WINDUP_BEAT:.06,         // s the crouch is held still at the end of the wind-up: the beat before the lunge
 WINDUP_LEAN:.22,         // world units the attacker draws back before a lunge
 TRAVEL_STRETCH:.1,       // attacker stretch along the lunge at full speed
 CONTACT_SQUASH:.1,       // attacker squash on landing
 LUNGE_HIT:4.5,LUNGE_MISS:3.2,LUNGE_HOP:.9,
 BURST_HEIGHT:.55,        // impact point height, fraction of the struck rig's height
 BURST_FRONT:.35,         // impact point sits this far beyond the rig's radius, toward the camera
 BURST_RADIUS_CAP:1.4,
 IDLE_BREATH:.025,IDLE_BREATH_HZ:.45,IDLE_PHASE_FOE:1.7,
 FAINT_SLUMP:.45,         // fraction of the faint spent slumping; the rest dissolves
 FAINT_TILT:1.1,FAINT_SINK:.55,FAINT_SQUASH:.22,
 SENDOUT_BACK:1.70158,    // easeOutBack overshoot for the send-out pop-in
 HEAL_PULSE:.08,          // a POTION's gentle swell on the healed monster (none with reduced motion)
 SHADOW_LIFT:.5,          // blob shadow shrink per world unit the rig is airborne
 TAIL_K:120,TAIL_DAMP:11,TAIL_DRIVE:.004,TAIL_MAX:.5 // follow-through: tail spring (stiffness, damping, drive per unit/s^2, clamp rad)
});
/* Battle scene (conditions): camera preset offsets added to CAM_POS (preset 0 = today), weather motion
   in world units per second, and the tremor sway. All of it is shell only and off under reduced motion. */
const CAMERA_PRESETS_3D=Object.freeze([[0,0,0],[1.4,.3,-.6],[-1.2,.5,.4],[.6,.2,.8]].map(Object.freeze));   // preset 3 pitches up a little (plan had y -.4): -.4 put the foe feet at y 246, 2 px off the player box
const WEATHER_FALL=Object.freeze({rain:9,snow:1.2,leaves:.8});   // u/s down; wraps at y=0 back to the top of the box
const WEATHER_DRIFT=.3,LEAF_SWAY=.6,LEAF_SWAY_HZ=.35,SPARK_HZ=7,SPARK_DEPTH=.6;   // u/s sideways; leaf sine drift; spark opacity flicker
const TREMOR_SWAY=.02,TREMOR_HZ=13;   // world units of camera sway with tremor dust (sin(clock*13)*.02)
const HOME={mine:-3.4,foe:3.4};
function clamp01(v){return v<0?0:v>1?1:v;}
function easeOutCubic(t){t=clamp01(t);return 1-(1-t)*(1-t)*(1-t);}
function easeInOut(t){t=clamp01(t);return t<.5?4*t*t*t:1-Math.pow(-2*t+2,3)/2;}
function easeOutBack(t,s){t=clamp01(t);const u=t-1;return 1+(s+1)*u*u*u+s*u*u;}
/* Hit-stop as a pose hold: the visual clock stops at contact for `hold` seconds, then the rest of the
   action is remapped so it still ends exactly when the queue's action ends. Queue time never stops. */
function holdElapsed(elapsed,contactAt,duration,hold){
 if(!(hold>0)||!(elapsed>contactAt))return elapsed;
 if(elapsed<contactAt+hold)return contactAt;
 const rest=duration-contactAt-hold;if(!(rest>0))return Math.min(elapsed,duration);
 return contactAt+(elapsed-contactAt-hold)*(duration-contactAt)/rest;}
function impactProfile(result,family,J){J=J||JUICE;const r=result||{},eff=Number.isFinite(r.eff)?r.eff:1,sup=eff>=2,weak=eff<1,crit=!!r.crit;
 return {trauma:Math.min(1,(sup?J.TRAUMA_SUPER:weak?J.TRAUMA_WEAK:J.TRAUMA_HIT)+(crit?J.TRAUMA_CRIT:0)),
  hold:Math.min(J.HITSTOP_MAX,(crit?J.HITSTOP_CRIT:sup?J.HITSTOP_SUPER:weak?J.HITSTOP_WEAK:J.HITSTOP_NORMAL)+(family==='electric'?J.HITSTOP_ELECTRIC:0)),
  punch:(sup?J.CAM_PUNCH_SUPER:weak?J.CAM_PUNCH_WEAK:J.CAM_PUNCH_NORMAL)+(crit?J.CAM_PUNCH_CRIT:0),
  knock:sup||crit?J.KNOCK_SUPER:weak?J.KNOCK_WEAK:J.KNOCK_NORMAL};}
function landed(action,recipe){const r=action&&action.result||{};return !!recipe&&!recipe.status&&!r.missed&&r.eff!==0&&!r.capped;}
function mediaReduced(){try{return typeof matchMedia==='function'&&!!matchMedia('(prefers-reduced-motion: reduce)').matches;}catch(_){return false;}}
function createBattlePresenter(options){const T=options.THREE,container=options.container,settings=options.settings||{},species=options.species||{};
 // Both reduced-motion paths: the host's checkbox (settings) and the OS media query.
 const reduced=settings.reducedMotion===true||mediaReduced();
 let renderer=null,scene=null,camera=null,effects=null,arena=null,snapshot={},action=null,elapsed=0,clock=0,animClock=0,lastEvent=null,lastActionId=null,syncedElapsed=null,disposed=false,lastScare=null;
 const rigs={mine:null,foe:null},ids={};
 let shield=null;const shieldResources=[];
 function buildShield(){
  shield=new T.Group();shield.name='defense-shield';shield.visible=false;
  const outline=[[-.8,.65],[0,1],[.8,.65],[.68,-.35],[0,-1],[-.68,-.35],[-.8,.65]];
  const shape=new T.Shape();outline.forEach(([x,y],i)=>i?shape.lineTo(x,y):shape.moveTo(x,y));
  const geometry=new T.ShapeGeometry(shape),material=new T.MeshBasicMaterial({color:0x58cfff,transparent:true,opacity:.28,side:T.DoubleSide,depthWrite:false});
  const face=new T.Mesh(geometry,material);face.renderOrder=12;shield.add(face);
  const edgeGeometry=new T.BufferGeometry().setFromPoints(outline.map(([x,y])=>new T.Vector3(x,y,.015))),edgeMaterial=new T.LineBasicMaterial({color:0xb8f4ff,transparent:true,opacity:.95,depthWrite:false});
  const edge=new T.LineLoop(edgeGeometry,edgeMaterial);edge.renderOrder=13;shield.add(edge);
  shieldResources.push(geometry,material,edgeGeometry,edgeMaterial);scene.add(shield);
 }
 function updateShield(){
  if(!shield)return;
  const guarding=snapshot.command&&snapshot.command.kind==='guard';
  const block=action&&['GUARD','PERFECT'].includes(action.guardTier)&&!action.result?.missed&&action.result?.eff!==0;
  const buff=action&&['harden','ironguard'].includes(action.moveId)&&!action.result?.capped;
  const side=buff?action.actor||'mine':block?targetSide:'mine',rig=rigs[side];
  shield.visible=!!((guarding||block||buff)&&rig&&rig.root.visible&&!faded[side]);if(!shield.visible)return;
  centerInto(side,shield.position);shield.position.x+=side==='mine'?.85:-.85;shield.position.z+=.6;shield.quaternion.copy(camera.quaternion);
  const tier=block?action.guardTier:'READY',perfect=tier==='PERFECT',contact=block?Math.max(0,1-Math.abs(elapsed-(action.contactAt||.64))/.22):0;
  shield.userData.tier=tier;shield.scale.setScalar(reduced?1:1+contact*.12);
  shield.children[0].material.color.setHex(perfect?0xffd86b:0x58cfff);shield.children[0].material.opacity=reduced?.3:.28+contact*.3;
  shield.children[1].material.color.setHex(perfect?0xffefb4:0xb8f4ff);
 }
 const diagnostics={ready:false,active:false,suspended:false,failed:false,rendererCount:0,renders:0,entries:0,models:0,arena:null,action:null,reducedMotion:reduced};
 // Juice state, mutated in place (also exposed as diagnostics.juice).
 const juice={trauma:0,shake:0,hold:0,held:false,punch:0,fov:JUICE.FOV,impacts:0,offset:[0,0,0],rotation:[0,0],flash:{mine:0,foe:0},fade:{mine:1,foe:1},sway:0,reduced};
 let weatherClock=0,bgColor=null;
 const tail={mine:{a:0,v:0,x:null,vx:0},foe:{a:0,v:0,x:null,vx:0}};let kickT=Infinity,kickAmt=0;
 const hit={mine:{flash:0,knockT:Infinity,knock:0,dir:-1},foe:{flash:0,knockT:Infinity,knock:0,dir:1}},faded={mine:false,foe:false};
 let punchT=Infinity,punchAmt=0,phases=[0,0,0,0,0,0,0],actionHold=0,impactDone=false,targetSide='foe';
 const camBase=new T.Vector3(...JUICE.CAM_POS),lookBase=new T.Vector3(...JUICE.CAM_LOOK),punchAt=new T.Vector3(),look=new T.Vector3();
 const srcV=new T.Vector3(),tgtV=new T.Vector3(),impV=new T.Vector3(),faceV=new T.Vector3();
 diagnostics.juice=juice;
 function failure(error){diagnostics.failed=true;diagnostics.ready=false;diagnostics.suspended=true;if(options.onFailure)options.onFailure(error instanceof Error?error:new Error(String(error)));}
 function lost(e){if(e.preventDefault)e.preventDefault();failure(new Error('3D graphics context was lost. Retry 3D or choose Basic presentation.'));}
 function restored(){diagnostics.failed=false;diagnostics.ready=true;diagnostics.suspended=false;}
 function initialize(){if(renderer||disposed)return;try{renderer=new T.WebGLRenderer({antialias:String(settings.quality).toUpperCase()!=='LOW',alpha:false,powerPreference:'high-performance'});renderer.setPixelRatio(Math.min(typeof devicePixelRatio==='number'?devicePixelRatio:1,1.5));renderer.setClearColor(0x182c38,1);renderer.shadowMap.enabled=String(settings.quality).toUpperCase()!=='LOW';renderer.shadowMap.type=T.PCFSoftShadowMap;renderer.outputEncoding=T.sRGBEncoding;renderer.domElement.style.width='100%';renderer.domElement.style.height='100%';renderer.domElement.style.display='block';renderer.domElement.addEventListener('webglcontextlost',lost);renderer.domElement.addEventListener('webglcontextrestored',restored);container.appendChild(renderer.domElement);scene=new T.Scene();scene.fog=new T.Fog(0x253c46,14,32);camera=new T.PerspectiveCamera(40,4/3,.1,60);camera.position.copy(camBase);camera.lookAt(lookBase);diagnostics.camera={position:camera.position.toArray(),target:lookBase.toArray()};effects=E.createEffects(T,null,Object.assign({},settings,{reducedMotion:reduced}));scene.add(effects.root);diagnostics.rendererCount=1;diagnostics.ready=true;resize();}catch(error){failure(error);}}
 let width=0,height=0;function resize(){if(!renderer)return;const w=container.clientWidth||640,h=container.clientHeight||480;if(width===w&&height===h)return;width=w;height=h;renderer.setSize(w,h,false);camera.aspect=w/h;camera.updateProjectionMatrix();}
 function resetJuice(){juice.trauma=juice.shake=juice.hold=juice.punch=0;juice.held=false;punchT=kickT=Infinity;punchAmt=kickAmt=0;for(const s of ['mine','foe']){hit[s].flash=0;hit[s].knockT=Infinity;hit[s].knock=0;faded[s]=false;tail[s].a=tail[s].v=tail[s].vx=0;tail[s].x=null;}}
 function clearBattle(){if(shield)shield.visible=false;action=null;lastActionId=null;lastEvent=null;lastScare=null;resetJuice();if(effects)effects.reset();for(const side of ['mine','foe']){if(rigs[side]){scene.remove(rigs[side].root);rigs[side].dispose();rigs[side]=null;}delete ids[side];}if(arena){scene.remove(arena.root);arena.dispose();arena=null;}diagnostics.models=0;restoreScene();}
 // Scene-wide state (fog, background, camera base) belongs to the presenter: applied per arena, restored on exit.
 function restoreScene(){const F=A.FOG_DEFAULT;if(scene&&scene.fog){scene.fog.color.setHex(F.color);scene.fog.near=F.near;scene.fog.far=F.far;}if(scene)scene.background=null;camBase.set(JUICE.CAM_POS[0],JUICE.CAM_POS[1],JUICE.CAM_POS[2]);juice.sway=0;weatherClock=0;diagnostics.scene=null;}
 function applyScene(kind,sc){const look=A.sceneLook(kind,sc);scene.fog.color.setHex(look.fog.color);scene.fog.near=look.fog.near;scene.fog.far=look.fog.far;
  if(look.background===null||look.background===undefined)scene.background=null;else{if(!bgColor)bgColor=new T.Color();scene.background=bgColor.setHex(look.background);}
  const o=CAMERA_PRESETS_3D[sc.camera]||CAMERA_PRESETS_3D[0];camBase.set(JUICE.CAM_POS[0]+o[0],JUICE.CAM_POS[1]+o[1],JUICE.CAM_POS[2]+o[2]);}
 // Weather points: their own phase clock (frozen by hit-stop with the rest of the world); no motion when reduced.
 function animateWeather(dt){const pts=arena&&arena.weather;if(!pts||reduced||!(dt>0))return;weatherClock+=dt;const w=pts.userData.kind,B=A.WEATHER_BOX,arr=pts.geometry.attributes.position.array,n=arr.length,fall=WEATHER_FALL[w]||0,H=B.y1-B.y0,Wd=B.x1-B.x0;
  if(w==='sparks'){pts.material.opacity=pts.userData.baseOpacity*(1-SPARK_DEPTH*(.5+.5*Math.sin(weatherClock*SPARK_HZ*Math.PI*2)));}
  for(let i=0;i<n;i+=3){if(fall){let y=arr[i+1]-fall*dt;if(y<B.y0)y+=H;arr[i+1]=y;}
   const dx=w==='leaves'?LEAF_SWAY*Math.cos(weatherClock*LEAF_SWAY_HZ*Math.PI*2+i*.37)*dt:fall?0:WEATHER_DRIFT*dt;
   if(dx){let x=arr[i]+dx;if(x>B.x1)x-=Wd;else if(x<B.x0)x+=Wd;arr[i]=x;}
   if(!fall)arr[i+1]=Math.min(B.y1,Math.max(B.y0,arr[i+1]+WEATHER_DRIFT*.25*Math.sin(weatherClock*.7+i)*dt));}
  pts.geometry.attributes.position.needsUpdate=true;}
 function replace(side,data){const id=data&&(data.id||data.speciesId||data.species);if(!id)return;if(ids[side]===id)return;if(rigs[side]){scene.remove(rigs[side].root);rigs[side].dispose();}const definition=(snapshot.species||species)[id];rigs[side]=M.buildCreature(T,id,definition);ids[side]=id;faded[side]=false;tail[side].a=tail[side].v=tail[side].vx=0;tail[side].x=null;scene.add(rigs[side].root);rigs[side].root.position.set(HOME[side],0,0);rigs[side].root.rotation.y=side==='mine'?0:Math.PI;diagnostics.models=Object.values(rigs).filter(Boolean).length;}
 function enter(next){if(disposed)return;initialize();if(!diagnostics.ready)return false;diagnostics.active=true;diagnostics.suspended=false;diagnostics.entries++;container.style.display='block';sync(next||{});if(!shield)buildShield();if(renderer.compile)renderer.compile(scene,camera);return true;}
 function sync(next){snapshot=next||{};if(!scene||!diagnostics.active)return;const kind=snapshot.arena||'meadow',sc=A.normalizeScene(snapshot.scene||A.DEFAULT_SCENE),keyStr=kind+'|'+sc.layout+'|'+sc.time+'|'+sc.weather+'|'+sc.camera;
  if(!arena||arena.key!==keyStr){if(arena){scene.remove(arena.root);arena.dispose();}arena=A.buildArena(T,kind,settings.quality||'STANDARD',sc);arena.key=keyStr;scene.add(arena.root);applyScene(kind,sc);weatherClock=0;diagnostics.arena=kind;diagnostics.scene=keyStr;}for(const side of ['mine','foe']){const ev=snapshot.action;const data=ev&&ev.kind==='evolve'&&ev.actor===side&&ev.into&&ev.elapsed>=(ev.duration||1.2)*.5?Object.assign({},snapshot[side],{id:ev.into}):snapshot[side];replace(side,data);const visible=snapshot[side]?.visible!==false;if(!visible)faded[side]=false;if(rigs[side])rigs[side].root.visible=visible;}
  // The hunt's jumpscare reveal shakes the 3D camera too (once, on the transition; never when reduced).
  if(snapshot.scare==='reveal'&&lastScare!=='reveal'&&!reduced)juice.trauma=Math.max(juice.trauma,JUICE.TRAUMA_SCARE);lastScare=snapshot.scare||null;
  if(snapshot.action&&snapshot.action.id!==lastActionId)play(snapshot.action);else if(snapshot.action&&action&&Number.isFinite(snapshot.action.elapsed)){syncedElapsed=Math.max(0,snapshot.action.elapsed);action.elapsed=syncedElapsed;}if(snapshot.event&&snapshot.event.id!==lastEvent){lastEvent=snapshot.event.id;play(snapshot.event);}}
 function socket(side,name){const rig=rigs[side],v=new T.Vector3(HOME[side],1.2,0);if(rig){rig.root.updateMatrixWorld(true);const s=rig.sockets[name]||rig.sockets.body;if(s)s.getWorldPosition(v);}return v;}
 function socketInto(side,name,out){const rig=rigs[side];out.set(HOME[side],1.2,0);if(rig){rig.root.updateMatrixWorld(true);const s=rig.sockets[name]||rig.sockets.body;if(s)s.getWorldPosition(out);}return out;}
 // The middle of a rig's body (the body socket is the rig's feet).
 function centerInto(side,out){const rig=rigs[side];if(!rig)return out.set(HOME[side],1.2,0);const h=rig.metrics?rig.metrics.height:2.25;return out.set(rig.root.position.x,rig.root.position.y+h*JUICE.BURST_HEIGHT*rig.root.scale.y,rig.root.position.z);}
 // Where a hit lands visibly: on the camera side of the struck rig, beyond its radius, never inside it.
 function impactInto(side,out){centerInto(side,out);faceV.copy(camBase).sub(out).normalize();const rig=rigs[side],radius=Math.min(JUICE.BURST_RADIUS_CAP,rig&&rig.metrics?rig.metrics.radius:1);return out.addScaledVector(faceV,radius+JUICE.BURST_FRONT);}
 function targetOf(next,side,r){return (r?.target==='self'||(!r&&!['throw','catch'].includes(next.kind)))?side:(next.target==='mine'||next.target==='foe'?next.target:side==='mine'?'foe':'mine');}
 function play(next){if(!next||!effects||!diagnostics.active)return;action=Object.assign({},next);lastActionId=next.id;elapsed=Math.max(0,next.elapsed||0);diagnostics.action=next.moveId||next.kind;impactDone=false;actionHold=0;
  const side=next.actor||'mine',r=next.moveId?R.recipeFor(next.moveId):null,target=targetOf(next,side,r);targetSide=target;
  if(!r&&['sendout','swap','escape'].includes(next.kind))faded[side]=false;
  effects.start(action,{source:()=>socketInto(side,r?.emitter||'body',srcV),target:()=>centerInto(target,tgtV),impact:()=>impactInto(target,impV),facing:()=>faceV});}
 function contactTime(a,r){const d=a.duration||r.duration;return r.contactAt*(d/r.duration);}
 // Contact: trauma, hit-stop, flash, punch-in and knockback, all scaled by effectiveness / crit.
 function impact(side,a,family){const p=impactProfile(a.result,family);juice.impacts++;const h=hit[side];h.knockT=0;h.knock=reduced?0:p.knock;h.dir=side==='foe'?1:-1;
  if(reduced)return;
  juice.trauma=Math.min(1,juice.trauma+p.trauma);actionHold=p.hold;h.flash=JUICE.FLASH_TIME;punchAmt=p.punch;punchT=0;kickAmt=JUICE.FOV_KICK*p.trauma;kickT=0;centerInto(side,punchAt);
  const rnd=E.createRng(E.seedFor('shake:'+(a.id||a.moveId)));for(let i=0;i<phases.length;i++)phases[i]=rnd()*Math.PI*2;}
 function updateCamera(){
  const shake=reduced?0:juice.trauma*juice.trauma;juice.shake=shake;
  let pk=0;if(!reduced&&punchT<JUICE.CAM_PUNCH_IN+JUICE.CAM_PUNCH_OUT){pk=punchAmt*(punchT<JUICE.CAM_PUNCH_IN?easeOutCubic(punchT/JUICE.CAM_PUNCH_IN):1-easeInOut((punchT-JUICE.CAM_PUNCH_IN)/JUICE.CAM_PUNCH_OUT));}juice.punch=pk;
  camera.position.copy(camBase);look.copy(lookBase);
  // Tremor: the whole view sways a hair (eye and look together); never under reduced motion.
  const sway=!reduced&&arena&&arena.scene&&arena.scene.weather==='dust'?Math.sin(clock*TREMOR_HZ)*TREMOR_SWAY:0;juice.sway=sway;if(sway){camera.position.x+=sway;look.x+=sway;}
  if(pk>0){camera.position.lerp(punchAt,pk);look.lerp(punchAt,pk*JUICE.CAM_PUNCH_LOOK);}
  let ox=0,oy=0,roll=0,pitch=0,yaw=0;if(shake>0){const s=shake*JUICE.CAM_SHAKE_MAX,t=clock*JUICE.CAM_SHAKE_HZ*Math.PI*2;
   ox=s*(.6*Math.sin(t+phases[0])+.4*Math.sin(t*2.3+phases[1]));oy=s*(.6*Math.sin(t*1.3+phases[2])+.4*Math.sin(t*2.9+phases[3]));roll=shake*JUICE.CAM_ROLL_MAX*Math.sin(t*1.7+phases[4]);
   pitch=shake*JUICE.CAM_SHAKE_ROT*Math.sin(t*1.1+phases[5]);yaw=shake*JUICE.CAM_SHAKE_ROT*Math.sin(t*.9+phases[6]);}
  // Eye and look point move together, plus a small rotation: the world image shakes, the HUD canvas above it never does.
  camera.position.x+=ox;camera.position.y+=oy;look.x+=ox;look.y+=oy;camera.lookAt(look);if(pitch)camera.rotateX(pitch);if(yaw)camera.rotateY(yaw);if(roll)camera.rotateZ(roll);
  juice.offset[0]=ox;juice.offset[1]=oy;juice.offset[2]=roll;juice.rotation[0]=pitch;juice.rotation[1]=yaw;
  const kick=!reduced&&kickT<JUICE.FOV_RECOVER?kickAmt*(1-easeOutCubic(kickT/JUICE.FOV_RECOVER)):0,fov=JUICE.FOV-kick;
  if(camera.fov!==fov){camera.fov=fov;camera.updateProjectionMatrix();}juice.fov=fov;
  diagnostics.camera.position[0]=camera.position.x;diagnostics.camera.position[1]=camera.position.y;diagnostics.camera.position[2]=camera.position.z;}
 function update(dt){if(!diagnostics.active||diagnostics.suspended||!diagnostics.ready||disposed)return;dt=Math.max(0,Math.min(.05,Number(dt)||0));clock+=dt;if(syncedElapsed!==null){elapsed=syncedElapsed;syncedElapsed=null;}else elapsed+=dt;resize();
  // 1. Contact detection on the queue's clock, then the visual (held) clock.
  let visual=elapsed,held=false;const r=action&&action.moveId?R.recipeFor(action.moveId):null;
  if(r){const cAt=contactTime(action,r),d=action.duration||r.duration;if(!impactDone&&elapsed+1e-9>=cAt){impactDone=true;if(landed(action,r))impact(targetSide,action,r.family);}
   visual=holdElapsed(elapsed,cAt,d,actionHold);held=actionHold>0&&elapsed>=cAt&&elapsed<cAt+actionHold;juice.hold=held?cAt+actionHold-elapsed:0;}else juice.hold=0;
  juice.held=held;const adt=held?0:dt;animClock+=adt;
  // 2. Juice timers decay per second, frozen during the hold (like the 2D updateJuice).
  // The punch-in still snaps in during the hold and then waits at its peak until the hold ends.
  if(held)punchT=Math.min(punchT+dt,JUICE.CAM_PUNCH_IN);
  if(!held){juice.trauma=Math.max(0,juice.trauma-JUICE.TRAUMA_DECAY*dt);punchT+=dt;kickT+=dt;for(const s of ['mine','foe']){hit[s].flash=Math.max(0,hit[s].flash-dt);hit[s].knockT+=dt;}}
  // 3. Base pose: home, idle bob and breathing (none with reduced motion), knockback and recoil squash.
  const sq={mine:[1,1,1],foe:[1,1,1]},fade={mine:faded.mine?0:1,foe:faded.foe?0:1};
  for(const side of ['mine','foe']){const rig=rigs[side];if(!rig)continue;rig.root.position.set(HOME[side],0,0);rig.root.rotation.z=0;
   const phase=side==='foe'?JUICE.IDLE_PHASE_FOE:0;rig.setPose({phase:'idle',time:reduced?0:animClock+phase});
   if(!reduced){const b=Math.sin(animClock*JUICE.IDLE_BREATH_HZ*Math.PI*2+phase)*JUICE.IDLE_BREATH;sq[side][1]*=1+b;sq[side][0]*=1/(1+b);}
   const h=hit[side];if(h.knock>0&&h.knockT<JUICE.KNOCK_TIME){const env=h.knockT<JUICE.KNOCK_OUT?easeOutCubic(h.knockT/JUICE.KNOCK_OUT):1-easeInOut((h.knockT-JUICE.KNOCK_OUT)/(JUICE.KNOCK_TIME-JUICE.KNOCK_OUT));rig.root.position.x+=h.dir*h.knock*env;const y=1-JUICE.RECOIL_SQUASH*env;sq[side][1]*=y;sq[side][0]*=1/y;}}
  // 4. The action: anticipation, lunge, contact squash, recovery; or a scripted event.
  if(action){const side=action.actor||'mine',rig=rigs[side],other=targetSide;
   if(r){const p=R.sampleAction(action,visual),motion=!reduced;
    if(rig){rig.setPose({phase:p.phase==='windup'?'preparation':p.phase,progress:p.progress,weapon:r.weapon,time:clock});
     const dir=side==='mine'?1:-1,miss=!!action.result?.missed,L=miss?JUICE.LUNGE_MISS:JUICE.LUNGE_HIT,wSec=r.windup*(action.duration||r.duration)/r.duration,wStart=Math.max(0,wSec-JUICE.WINDUP_BEAT-JUICE.WINDUP_RAMP),wEnd=Math.max(wStart+1e-6,wSec-JUICE.WINDUP_BEAT),wind=p.phase==='windup'?easeOutCubic((p.progress*wSec-wStart)/(wEnd-wStart)):1;
     if(motion&&p.phase==='windup'){const y=1-JUICE.WINDUP_SQUASH*wind;sq[side][1]*=y;sq[side][0]*=1/y;}
     if(motion&&r.physical&&!r.status){let reach=0;
      if(p.phase==='windup')reach=-JUICE.WINDUP_LEAN*wind;
      else if(p.phase==='travel'){const t=p.progress*p.progress;reach=-JUICE.WINDUP_LEAN+(L+JUICE.WINDUP_LEAN)*t;const x=1+JUICE.TRAVEL_STRETCH*p.progress;sq[side][0]*=x;sq[side][1]*=1/x;}
      else if(p.phase==='contact'){reach=L;const x=1-JUICE.CONTACT_SQUASH*(1-p.progress);sq[side][0]*=x;sq[side][1]*=1/x;}
      else if(p.phase==='recovery')reach=L*(1-easeInOut(p.progress));
      rig.root.position.x+=dir*reach;if(r.weapon==='wing'||action.moveId==='bodyslam')rig.root.position.y=Math.max(0,Math.sin(clamp01(reach/L)*Math.PI))*JUICE.LUNGE_HOP;}}
    if(p.phase==='contact'&&landed(action,r)&&other!==side&&rigs[other])rigs[other].setPose({kind:'recoil',progress:p.progress});
    if(p.done){action=null;diagnostics.action=null;}}
   else if(rig){const kind=action.kind,t=Math.min(1,elapsed/(action.duration||1.2)),dir=side==='mine'?1:-1;
    if(kind==='faint'){const u=easeOutCubic(t/JUICE.FAINT_SLUMP),v=clamp01((t-JUICE.FAINT_SLUMP)/(1-JUICE.FAINT_SLUMP));rig.root.rotation.z=dir*JUICE.FAINT_TILT*u;rig.root.position.y=-JUICE.FAINT_SINK*(.3*u+.7*v);const y=1-JUICE.FAINT_SQUASH*u;sq[side][1]*=y;sq[side][0]*=1/y;fade[side]=1-v;if(t>=1)faded[side]=true;}
    else if(kind==='escape')rig.root.position.z=t*9;
    else if(kind==='swap'){const s=Math.max(.01,1-t);sq[side][0]*=s;sq[side][1]*=s;sq[side][2]*=s;}
    else if(kind==='sendout'){const s=Math.max(.01,reduced?Math.min(1,t*2):easeOutBack(t*2,JUICE.SENDOUT_BACK));sq[side][0]*=s;sq[side][1]*=s;sq[side][2]*=s;}
    else if(kind==='heal'&&!reduced){const s=1+Math.sin(t*Math.PI)*JUICE.HEAL_PULSE;sq[side][0]*=s;sq[side][1]*=s;sq[side][2]*=s;}
    else if(kind==='evolve'){const s=1+Math.sin(t*Math.PI)*.25;sq[side][0]*=s;sq[side][1]*=s;sq[side][2]*=s;if(t>=.5&&action.into&&ids[side]!==action.into)replace(side,{id:action.into});}
    if(t>=1){action=null;diagnostics.action=null;}}}
  // 5. Apply squash, flash and fade; the blob shadow follows the rig (lunge, hop, knockback, escape).
  for(const side of ['mine','foe']){const rig=rigs[side];if(!rig)continue;const [sx,sy,sz]=sq[side];rig.root.scale.set(sx,sy,sz);
   // Hit-stop shiver: both fighters, opposite phase, side to side; only while the pose is held.
   if(held&&(side===targetSide||side===(action&&action.actor)))rig.root.position.x+=(side==='mine'?1:-1)*JUICE.HOLD_VIBRATE*Math.sin(clock*JUICE.HOLD_VIBRATE_HZ*Math.PI*2);
   // Follow-through: the tail lags the body's acceleration on a damped spring (not during the hold, not when reduced).
   const tl=tail[side],tj=rig.joints&&rig.joints.tail;if(!reduced&&tj&&adt>0){const x=rig.root.position.x;if(tl.x===null)tl.x=x;const vx=(x-tl.x)/adt,ax=Math.max(-400,Math.min(400,(vx-tl.vx)/adt));tl.x=x;tl.vx=vx;
    tl.v+=(-JUICE.TAIL_K*tl.a-JUICE.TAIL_DAMP*tl.v-JUICE.TAIL_DRIVE*JUICE.TAIL_K*ax*(side==='mine'?1:-1))*adt;tl.a=Math.max(-JUICE.TAIL_MAX,Math.min(JUICE.TAIL_MAX,tl.a+tl.v*adt));}
   if(!reduced&&tj&&tl.a)tj.rotation.z+=tl.a;
   const f=reduced?0:JUICE.FLASH_PEAK*hit[side].flash/JUICE.FLASH_TIME;juice.flash[side]=f;juice.fade[side]=fade[side];if(rigs[side]&&ids[side]&&rig.setTint)rig.setTint(f,fade[side]);
   const sh=arena&&arena.shadows&&arena.shadows[side];if(sh){const base=sh.userData.base||[1.15,.75],lift=1/(1+Math.max(0,rig.root.position.y)*JUICE.SHADOW_LIFT),k=lift*fade[side]*sx;sh.position.x=rig.root.position.x;sh.position.z=rig.root.position.z;sh.scale.set(base[0]*k,base[1]*k,1);sh.visible=rig.root.visible&&k>.01;}}
  updateCamera();updateShield();animateWeather(adt);
  scene.updateMatrixWorld(true);effects.update(adt,action?visual:undefined);}
 function render(){if(renderer&&diagnostics.active&&!diagnostics.suspended&&diagnostics.ready&&!disposed){renderer.render(scene,camera);diagnostics.renders++;diagnostics.effects=effects.diagnostics.active;diagnostics.memory=renderer.info?.memory;camera.updateMatrixWorld();diagnostics.projected={};for(const side of ['mine','foe']){const v=socket(side,'body').project(camera);diagnostics.projected[side]={x:(v.x+1)*320,y:(1-v.y)*240};}}}
 function suspend(){diagnostics.suspended=true;}function resume(){if(!diagnostics.failed)diagnostics.suspended=false;}function leave(){if(disposed)return;diagnostics.active=false;diagnostics.suspended=false;container.style.display='none';if(scene)clearBattle();}
 function dispose(){if(disposed)return;leave();if(effects)effects.dispose();shieldResources.forEach(r=>r.dispose());if(shield)scene.remove(shield);if(renderer){renderer.domElement.removeEventListener('webglcontextlost',lost);renderer.domElement.removeEventListener('webglcontextrestored',restored);if(renderer.domElement.parentNode)renderer.domElement.parentNode.removeChild(renderer.domElement);renderer.dispose();if(renderer.forceContextLoss)renderer.forceContextLoss();}disposed=true;diagnostics.ready=false;diagnostics.rendererCount=0;}
 // Read-only views for tests and playtests.
 const view={get scene(){return scene;},get shield(){return shield;},get camera(){return camera;},get rigs(){return rigs;},get arena(){return arena;},get effects(){return effects;},impactPoint:side=>impactInto(side,new T.Vector3()),center:side=>centerInto(side,new T.Vector3())};
 return {enter,sync,play,update,render,suspend,resume,leave,dispose,diagnostics,view};}
return {createBattlePresenter,JUICE,holdElapsed,impactProfile,CAMERA_PRESETS_3D,WEATHER_FALL,TREMOR_SWAY};});

