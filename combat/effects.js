(function(root,factory){const api=factory(typeof module==='object'&&module.exports?require('./recipes'):root.MonsterRecipes);if(typeof module==='object'&&module.exports)module.exports=api;else root.MonsterEffects=api;})(typeof globalThis!=='undefined'?globalThis:this,function(R){
'use strict';
const palette={fire:0xff671e,wind:0xc3ffee,water:0x37bfff,grass:0x80ed47,electric:0xffec55,rock:0xb28a58,psychic:0xef78ff,poison:0xb36bde,dark:0x7047ba,bug:0xb4d956,steel:0xd3eeff,normal:0xfff2c2,status:0xffdc72,heal:0x5ee68c};
// Battle-item cues (shell only): a POTION's green self ring, a GREAT BALL's blue top half.
const CUE=Object.freeze({HEAL_FAMILY:'heal',BALL_TOP:0xe64c53,GREAT_TOP:0x3f7fe8});
// Contact burst tunables (world units / seconds). Shell-only cosmetics: nothing here reaches the engine.
const BURST=Object.freeze({
 COUNT:18,          // sparks per landed hit (STANDARD/HIGH)
 SUPER_EXTRA:8,     // extra sparks for super-effective or critical hits
 LOW:8,             // sparks at LOW quality
 REDUCED:4,         // sparks with reduced motion
 SPREAD:4.2,        // horizontal speed range (+-SPREAD/2)
 UP:3.2,            // upward speed range, plus LIFT
 LIFT:1,
 TOWARD:1.6,        // speed pushed toward the camera so sparks fly at the viewer, never into the mesh
 GRAVITY:7,         // spark gravity
 LIFE:.35,LIFE_JITTER:.25,
 CORE_SIZE:3.4,CORE_LIFE:.1, // white core flash at contact (none with reduced motion)
 RING_SIZE:1.6,RING_CRIT:2.6,RING_LIFE:.3,RING_GROW:1.6, // camera-facing ring that expands as it shrinks away
 SHOCK_SCALE:3,SHOCK_LIFE:.3,SHOCK_ALPHA:.9,SHOCK_Y:.04, // ground shockwave under the target: scale 0 -> 3, fading over 300 ms
 ORDER:10,SHOCK_ORDER:9  // explicit renderOrder: transparent effects sort by bounding-box centre otherwise
});
// Cosmetic LCG shared by combat/ effects and camera: never the global random, never the engine stream.
function createRng(seed){let s=(seed>>>0)||1;return function(){s=(Math.imul(s,1664525)+1013904223)>>>0;return s/4294967296;};}
function seedFor(key){return (String(key).split('').reduce((a,c)=>a+c.charCodeAt(0),137))>>>0;}
function createEffects(T,shared,settings){settings=settings||{};const quality=String(settings.quality||'STANDARD').toUpperCase(),reduced=!!settings.reducedMotion,limit=reduced?24:quality==='HIGH'?256:quality==='LOW'?48:128;
const root=new T.Group(),geometries={orb:new T.IcosahedronGeometry(.16,1),rock:new T.DodecahedronGeometry(.24,0),ring:new T.TorusGeometry(.4,.045,5,24),leaf:new T.OctahedronGeometry(.16,0),beam:new T.CylinderGeometry(.035,.065,1,5),flame:new T.ConeGeometry(.18,.65,6)},materials={},pool=[],free=[],active=[];
let current=null,time=0,emitted=false,rnd=createRng(1),disposed=false;
const diagnostics={limit,active:0,impacts:0,defeats:0,created:limit,disposed:false,lastImpact:[0,0,0],lastTarget:[0,0,0]};
const UP=new T.Vector3(0,1,0),FWD=new T.Vector3(0,0,1),V=new T.Vector3(),F=new T.Vector3(),I=new T.Vector3();
function vel(x,y,z){return V.set(x,y,z);} // scratch: emit() copies it immediately
const ball=new T.Group();ball.name='capture-ball';ball.visible=false;root.add(ball);const ballResources=[];
function ballPart(geometry,color){const material=new T.MeshBasicMaterial({color});const mesh=new T.Mesh(geometry,material);ballResources.push(geometry,material);ball.add(mesh);return mesh;}
const ballTop=ballPart(new T.SphereGeometry(.28,16,10,0,Math.PI*2,0,Math.PI/2),CUE.BALL_TOP);
ballPart(new T.SphereGeometry(.28,16,10,0,Math.PI*2,Math.PI/2,Math.PI/2),0xf3f8ed);
const band=ballPart(new T.TorusGeometry(.28,.027,5,24),0x28313d);band.rotation.x=Math.PI/2;
const button=ballPart(new T.SphereGeometry(.075,8,6),0xf8e7a4);button.position.z=.265;
Object.keys(palette).forEach(k=>materials[k]=new T.MeshBasicMaterial({color:palette[k],transparent:true,opacity:.9,depthWrite:false}));
// Additive copies for the contact burst only: it glows over any arena, depth-tested so walls still hide it.
const glow={};Object.keys(palette).forEach(k=>glow[k]=new T.MeshBasicMaterial({color:palette[k],transparent:true,opacity:.95,depthWrite:false,depthTest:true,blending:T.AdditiveBlending}));
const shockGeometry=new T.RingGeometry(.42,.56,40),shockMaterial=new T.MeshBasicMaterial({color:0xffffff,transparent:true,opacity:0,depthWrite:false,depthTest:true,blending:T.AdditiveBlending,side:T.DoubleSide});
const shock=new T.Mesh(shockGeometry,shockMaterial);shock.name='impact-shockwave';shock.rotation.x=-Math.PI/2;shock.renderOrder=BURST.SHOCK_ORDER;shock.visible=false;root.add(shock);let shockT=Infinity;
// Fixed pool of records, allocated once: emitting and expiring never allocate.
for(let i=0;i<limit;i++){const m=new T.Mesh(geometries.orb,materials.normal);m.visible=false;root.add(m);const rec={m,v:new T.Vector3(),life:0,max:1,size:1,kind:'orb',fixed:false,g:0,grow:0};pool.push(rec);free.push(rec);}
function emit(kind,family,pos,v,life,size,g,grow,additive){if(!free.length)return null;const p=free.pop(),m=p.m,set=additive?glow:materials;m.geometry=geometries[kind]||geometries.orb;m.material=set[family]||set.normal;m.renderOrder=additive?BURST.ORDER:0;m.position.copy(pos);m.scale.setScalar(size||1);m.rotation.set(0,0,0);m.visible=true;p.v.copy(v);p.life=p.max=life;p.size=size||1;p.kind=kind;p.fixed=false;p.g=g||0;p.grow=grow||0;active.push(p);diagnostics.active=active.length;return p;}
function reset(){for(const p of active){p.m.visible=false;free.push(p);}active.length=0;ball.visible=false;shock.visible=false;shockT=Infinity;current=null;diagnostics.active=0;diagnostics.impacts=0;diagnostics.defeats=0;}
function point(k,fallback){const p=current.context[k];return typeof p==='function'?p():p?p.clone():fallback;}
function start(action,context){reset();const recipe=action.moveId?R.recipeFor(action.moveId):null;current={action,recipe,context:context||{}};time=0;emitted=false;rnd=createRng(seedFor(action.id||action.moveId||action.kind));
 if(action.kind==='throw'||action.kind==='catch'){const hex=action.item==='greatball'?CUE.GREAT_TOP:CUE.BALL_TOP;ballTop.material.color.setHex(hex);diagnostics.ballTop=hex;}}
function beam(a,b,family,thickness){const d=b.clone().sub(a),length=d.length();const p=emit('beam',family,a.clone().add(b).multiplyScalar(.5),vel(0,0,0),.08,1);if(p){p.m.quaternion.setFromUnitVectors(UP,d.normalize());p.m.scale.set(thickness||1,length,thickness||1);p.fixed=true;}return p;}
function impactSignature(family,at){
 const count=reduced?3:quality==='LOW'?5:8;
 if(family==='fire'){
  for(let j=0;j<(reduced?2:5);j++){const angle=j*Math.PI*2/5,q=at.clone();q.x+=Math.cos(angle)*.3;q.y+=Math.sin(angle)*.3;emit('flame','fire',q,vel(Math.cos(angle)*.9,.6+Math.sin(angle)*.8,0),.42,reduced?1.6:2.8,0,1.6,false);}
  emit('orb','fire',at,vel(0,0,0),.38,reduced?2:3.7,0,1.7,false);
 }else if(family==='electric'){
  for(let j=0;j<count;j++){const angle=j*Math.PI*2/count,mid=at.clone().add(new T.Vector3(Math.cos(angle)*.65,Math.sin(angle)*.65,.12)),end=at.clone().add(new T.Vector3(Math.cos(angle+.24)*1.45,Math.sin(angle+.24)*1.45,.2));for(const p of [beam(at,mid,'electric',2.8),beam(mid,end,'electric',1.8)])if(p)p.life=p.max=reduced?.16:.28;}
 }else if(family==='water'||family==='wind'){
  for(let j=0;j<(reduced?1:3);j++){const ring=emit('ring',family,at,vel(0,j*.25,0),.4,1+j*.7,0,2,true);if(ring){ring.m.quaternion.setFromUnitVectors(FWD,F);ring.fixed=true;}}
 }else if(family==='normal'||family==='steel'){
  for(let j=0;j<count;j++){const angle=j*Math.PI*2/count,end=at.clone().add(new T.Vector3(Math.cos(angle),Math.sin(angle),.1));beam(at,end,family,2);}
 }
}
function defeatBurst(at){
 diagnostics.defeats=(diagnostics.defeats||0)+1;
 for(let j=0;j<(reduced?5:quality==='LOW'?10:20);j++){const angle=j*2.39996;emit('orb','dark',at,vel(Math.cos(angle)*1.4,.8+rnd(),Math.sin(angle)*1.4),.65+rnd()*.2,1.1,1.5,0,true);}
 const p=emit('ring','psychic',at,vel(0,0,0),.55,2,0,reduced?.3:2,true);if(p){p.m.quaternion.setFromUnitVectors(FWD,F);p.fixed=true;}
}
// The burst at contact: at the impact point (in front of the target, toward the camera) when the
// presenter supplies one, else at the target. Sparks, one expanding camera-facing ring, a white core.
function burst(r,b){const result=current.action.result||{},eff=Number.isFinite(result.eff)?result.eff:1,big=eff>=2||!!result.crit;
 const at=I.copy(point('impact',b));F.copy(at).sub(b);if(F.lengthSq()<1e-6)F.copy(FWD);F.normalize();const facing=current.context.facing;if(typeof facing==='function'){const f=facing();if(f&&f.lengthSq()>1e-6)F.copy(f).normalize();}
 diagnostics.impacts++;diagnostics.lastImpact[0]=at.x;diagnostics.lastImpact[1]=at.y;diagnostics.lastImpact[2]=at.z;diagnostics.lastTarget[0]=b.x;diagnostics.lastTarget[1]=b.y;diagnostics.lastTarget[2]=b.z;
 const family=r.family,n=reduced?BURST.REDUCED:quality==='LOW'?BURST.LOW:BURST.COUNT+(big?BURST.SUPER_EXTRA:0),kind=family==='rock'?'rock':family==='grass'?'leaf':'orb';
 impactSignature(family,at);
 for(let j=0;j<n;j++){emit(kind,family,at,vel((rnd()-.5)*BURST.SPREAD+F.x*BURST.TOWARD,rnd()*BURST.UP+BURST.LIFT,(rnd()-.5)*BURST.SPREAD+F.z*BURST.TOWARD),BURST.LIFE+rnd()*BURST.LIFE_JITTER,r.status?.7:1.1,BURST.GRAVITY,0,true);}
 const ring=emit('ring',family,at,vel(0,0,0),BURST.RING_LIFE,result.crit?BURST.RING_CRIT:BURST.RING_SIZE,0,BURST.RING_GROW,true);if(ring){ring.m.quaternion.setFromUnitVectors(FWD,F);ring.fixed=true;}
 if(!reduced)emit('orb','normal',at,vel(0,0,0),BURST.CORE_LIFE,BURST.CORE_SIZE*(big?1.3:1),0,0,true);
 shock.position.set(b.x,BURST.SHOCK_Y,b.z);shockMaterial.color.setHex(palette[family]||palette.normal);shock.scale.setScalar(.001);shockMaterial.opacity=BURST.SHOCK_ALPHA;shock.visible=true;shockT=0;}
function update(dt,authoritativeElapsed){if(disposed)return;dt=Math.max(0,Math.min(.1,dt||0));for(let i=active.length-1;i>=0;i--){const p=active[i];p.life-=dt;if(p.life<=0){p.m.visible=false;free.push(p);active.splice(i,1);continue;}if(p.g){p.v.y-=p.g*dt;}p.m.position.addScaledVector(p.v,dt);if(p.g&&p.m.position.y<.05){p.m.position.y=.05;p.v.y*=-.35;}const k=p.life/p.max;if(p.grow)p.m.scale.setScalar(p.size*(1+(1-k)*p.grow));else if(!p.fixed){p.m.rotation.z+=dt*2;p.m.scale.setScalar(p.size*(.4+.6*k));}}diagnostics.active=active.length;
if(shockT<BURST.SHOCK_LIFE){shockT+=dt;const k=Math.min(1,shockT/BURST.SHOCK_LIFE);shock.scale.setScalar(Math.max(.001,BURST.SHOCK_SCALE*(1-(1-k)*(1-k))));shockMaterial.opacity=BURST.SHOCK_ALPHA*(1-k);shock.visible=k<1;diagnostics.shock=k<1?shock.scale.x:0;}else diagnostics.shock=0;
if(!current)return;time=Number.isFinite(authoritativeElapsed)?Math.max(0,authoritativeElapsed):time+dt;const {action,recipe:r}=current;const a=point('source',new T.Vector3(-3,1,0)),b=point('target',new T.Vector3(3,1,0));
if(!r){const duration=action.duration||1.2;if(action.kind==='faint'){if(!emitted){emitted=true;defeatBurst(b);}return;}if(action.kind==='throw'||action.kind==='catch'){const p=action.kind==='catch'?1:Math.min(1,time/.65);ball.visible=time<duration;ball.position.copy(a).lerp(b,p);ball.position.y+=Math.sin(p*Math.PI)*2;ball.rotation.z=p<1?time*9:Math.sin((time-.65)*18)*.25;if(p>=1&&action.result?.caught)emit('ring','status',b,vel(0,.4,0),.2,1.5);}
else if(time<duration){const family=action.kind==='evolve'?'psychic':action.kind==='heal'?CUE.HEAL_FAMILY:'status';emit('ring',family,b.clone().add(vel(0,time*2,0)),vel(0,.4,0),.35,1+time*2);diagnostics.ringFamily=family;}return;}
const phase=R.sampleAction(action,time);const family=r.family,miss=!!action.result?.missed,immune=action.result?.eff===0;
if(phase.phase==='windup'){emit(r.weapon==='blade'?'leaf':'orb',family,a,vel((rnd()-.5)*.3,(rnd()-.5)*.3,(rnd()-.5)*.3),.15,.35+phase.progress*.6);}
if(phase.phase==='travel'){const p=phase.progress,end=b.clone();if(miss)end.z+=2.4;const pos=a.clone().lerp(end,p);const dir=end.clone().sub(a).normalize();const side=new T.Vector3(-dir.z,0,dir.x);if(family==='fire'){
const flames=reduced?2:quality==='LOW'?3:5;
for(let j=0;j<flames;j++){const fp=Math.max(0,p-j*.055),q=a.clone().lerp(end,fp);q.y+=Math.sin(fp*Math.PI)*.85;const f=emit('flame',family,q,vel(0,.25,0),.16,(r.id==='flameburst'?2.7:1.8)*(1-j/(flames+1)));if(f)f.m.quaternion.setFromUnitVectors(UP,dir);}
pos.y+=Math.sin(p*Math.PI)*.85;emit('orb',family,pos,vel(0,0,0),.18,r.id==='flameburst'?2.8:1.8);emit('orb','status',pos,vel(0,.1,0),.14,r.id==='flameburst'?1.7:1.2);emit('orb','rock',pos.clone().add(vel(0,.4,0)),vel(0,.6,0),.4,.65);
}
else if(family==='wind'){for(let j=0;j<2;j++){const q=pos.clone().addScaledVector(side,Math.cos(time*26+j*Math.PI)*.55);q.y+=Math.sin(time*26+j*Math.PI)*.55;emit('ring',family,q,dir,.22,.5+p);}}
else if(family==='electric'){let prev=a;for(let j=1;j<=5;j++){const q=a.clone().lerp(pos,j/5);q.y+=(rnd()-.5)*.65;q.z+=(rnd()-.5)*.5;beam(prev,q,family,.65);prev=q;}}
else if(family==='water'){emit(r.id==='aquatail'?'ring':'orb',family,pos,vel(0,.25,0),.25,r.id==='brinejet'?1.3:.8);}
else if(family==='grass'){if(r.weapon==='vine'){beam(a,pos,family,2);emit('leaf',family,pos,vel(0,.2,0),.3,1.4);}else emit(r.weapon==='focus'?'orb':'leaf',family,pos,vel(0,0,0),.2,1.7);}
else if(family==='rock'){pos.y+=Math.sin(p*Math.PI)*(r.id==='rockslide'?2:1);emit('rock',family,pos,vel(0,0,0),.2,r.id==='rockslide'?2:1.4);}
else if(family==='psychic'){emit('ring',family,pos,vel(0,0,0),.25,1.2);if(r.id==='psybeam')beam(a,pos,family,2);}
else if(family==='bug'&&r.id==='stringshot'){beam(a,pos,'bug',.8);emit('ring','bug',pos,vel(0,0,0),.2,.7);}
else if(family==='poison'){emit('orb',family,pos,vel(0,-.2,0),.3,1.3);}
else if(r.status){emit('ring',family,pos,vel(0,.3,0),.25,1.4);}
else{emit(r.weapon==='claw'||r.weapon==='blade'?'leaf':'ring',family,pos,vel(0,0,0),.17,1.1);}}
if(phase.contact&&!emitted){emitted=true;if(!miss&&!immune&&!action.result?.capped)burst(r,b);}
}
function dispose(){if(disposed)return;reset();Object.values(geometries).forEach(g=>g.dispose());Object.values(materials).forEach(m=>m.dispose());Object.values(glow).forEach(m=>m.dispose());shockGeometry.dispose();shockMaterial.dispose();ballResources.forEach(r=>r.dispose());root.clear();disposed=true;diagnostics.disposed=true;}
return {root,start,update,reset,dispose,diagnostics};}
return {createEffects,createRng,seedFor,palette,BURST,CUE};});
