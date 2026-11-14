(function(root,factory){if(typeof module==='object'&&module.exports)module.exports=factory();else root.MonsterModels=factory();})(typeof globalThis!=='undefined'?globalThis:this,function(){
 'use strict';
 const IDS='emberling pyrelash dripling tidecoil sprigling thornmane nibbit gnawtl flutterfly galebeak zapmote pebblit boulderon mirepuff nocturn umbrawing cogling ironclad brinecrab tidewhisk lanternfly duneghast cinderpaw psywisp voltbloom gloomstalk'.split(' ');
 const SOCKETS='mouth focus claw fang tail wing vine blade stinger body'.split(' ');
 const TINT_EMISSIVE=1;      // emissive intensity at a full hit flash (white emissive at 1 reads as pure white)
 const TINT_SHADOW_FADE=.5;  // a dissolving rig stops casting a hard shadow below this opacity
 function buildCreature(T,id,species,sharedAssets){
  if(!IDS.includes(id)||!species||!species.art)throw new Error('Unknown creature '+id);
  const a=species.art,root=new T.Group(),body=new T.Group(),joints={body},sockets={},weapons={},ownedG=new Set(),ownedM=new Set(),bases=[];
  root.name=id;root.add(body);root.userData.signature=id+':'+JSON.stringify(a);
  function mat(color,extra){const m=new T.MeshStandardMaterial(Object.assign({color,roughness:.7},extra));ownedM.add(m);return m;}
  const skin=mat(a.c1),accent=mat(a.c2),dark=mat('#171622'),white=mat('#fff5d8'),glow=mat(a.c2,{emissive:a.c2,emissiveIntensity:.65}),steel=mat('#c4e0f0',{metalness:.65,roughness:.3}),leaf=mat('#75c957');
  function mesh(parent,shape,xyz,scale,m){let g=shape==='cone'?new T.ConeGeometry(1,2,6):shape==='box'?new T.BoxGeometry(2,2,2):shape==='rock'?new T.IcosahedronGeometry(1,0):shape==='ring'?new T.TorusGeometry(1,.2,6,14):new T.SphereGeometry(1,12,8);ownedG.add(g);const o=new T.Mesh(g,m||skin);o.position.set(...xyz);o.scale.set(...scale);o.castShadow=true;o.receiveShadow=true;parent.add(o);return o;}
  function joint(name,parent,p){const g=new T.Group();g.name=name;g.position.set(...p);parent.add(g);joints[name]=g;return g;}
  function tip(parent,p,m,s=.15){return mesh(parent,'cone',p,[s,s*2,s],m);}
  const big=!!a.big,kind=a.kind; let headY=1.65,headX=.62;
  if(a.pickajoo){
   mesh(body,'ball',[0,.85,0],[.52,.66,.43]);mesh(body,'ball',[.28,.82,0],[.3,.48,.36],accent);
   for(const z of [-.28,.28]){mesh(body,'ball',[.1,.16,z],[.36,.16,.2]);}
   headX=.18;headY=1.65;
  }else if(kind==='quad'||kind==='rodent'){
   mesh(body,'ball',[0,1.05,0],[big?.94:.82,.53,.46]);mesh(body,'ball',[.12,.94,0],[.66,.32,.4],accent);
   for(const x of [-.55,.55])for(const z of [-.32,.32]){const l=joint((x>0?'front':'rear')+(z>0?'Left':'Right'),body,[x,.83,z]);mesh(l,'ball',[0,-.29,0],[.17,.41,.17]);mesh(l,'ball',[.12,-.64,0],[.26,.15,.21],accent);}
   headY=1.62;headX=.66;
  }else if(kind==='serpent'){
   for(let i=0;i<7;i++){const t=i/6;mesh(body,'ball',[-.7+Math.sin(t*3)*.5,.26+t*1.25,Math.cos(t*4)*.14],[.48-t*.1,.26,.38-t*.12],i%2?skin:accent);}headY=1.9;headX=.25;
  }else if(kind==='plant'){
   mesh(body,'ball',[0,.82,0],[.62,.72,.48]);for(let i=0;i<6;i++){const t=i*Math.PI/3;const l=mesh(body,'ball',[Math.cos(t)*.48,.23,Math.sin(t)*.48],[.6,.12,.21],accent);l.rotation.y=-t;}
   headX=.15;headY=1.58;
  }else if(kind==='gear'){
   mesh(body,'ring',[0,1.25,0],[.7,.7,.35],skin).rotation.y=Math.PI/2;
   mesh(body,'ball',[0,1.25,0],[.46,.55,.5],accent);
   for(let i=0;i<10;i++){const t=i*Math.PI/5;const tooth=mesh(body,'box',[0,1.25+Math.sin(t)*.75,Math.cos(t)*.75],[.28,.16,.18],skin);tooth.rotation.x=t;}
   for(const z of [-.36,.36])mesh(body,'box',[0,.28,z],[.32,.25,.23],accent);headX=.38;headY=1.55;
  }else if(kind==='crab'){
   mesh(body,'ball',[0,.8,0],[.75,.38,.62]);for(const s of [-1,1])for(let i=0;i<3;i++){const leg=mesh(body,'box',[-.45+i*.43,.45,s*.65],[.11,.12,.5],accent);leg.rotation.x=s*.45;}
   headY=1.16;headX=.5;
  }else if(kind==='rock'){
   mesh(body,'rock',[0,.95,0],[.76,.91,.64]);for(const z of [-.47,.47])mesh(body,'rock',[.05,.21,z],[.4,.24,.3],accent);headX=.38;headY=1.65;
  }else if(kind==='ooze'){
   mesh(body,'ball',[0,.5,0],[.95,.48,.65]);mesh(body,'ball',[.1,1.05,0],[.62,.64,.49]);for(let i=0;i<5;i++)mesh(body,'ball',[-.6+i*.3,.22,Math.sin(i*4)*.48],[.32,.22,.3],accent);headX=.4;headY=1.65;
  }else if(kind==='wisp'){
   mesh(body,a.relic?'rock':'ball',[0,1.27,0],[.62,.68,.49]);for(let i=0;i<5;i++){const t=i*1.256;mesh(body,a.relic?'rock':'ball',[Math.cos(t)*.45,.55,Math.sin(t)*.4],[.16,.3,.15],accent);}headX=.3;headY=1.7;
  }else{
   mesh(body,'ball',[0,1.15,0],[kind==='bug'?.35:.51,.65,.4]);mesh(body,'ball',[.23,1.1,0],[.3,.45,.36],accent);
   for(const z of [-.22,.22]){mesh(body,'box',[.14,.22,z],[.24,.12,.14],accent);mesh(body,'ball',[0,.49,z],[.1,.3,.1]);}headY=1.8;headX=.28;
  }
  const head=joint('head',body,[headX,headY,0]);mesh(head,kind==='rock'?'rock':'ball',[0,0,0],[.47,.41,.39]);
  mesh(head,'ball',[.37,-.12,0],[.27,.18,.29],accent);mesh(head,'ball',[.57,-.1,0],[.1,.075,.13],dark);
  for(const s of [-1,1]){mesh(head,'ball',[.28,.12,s*.31],[.12,.15,.07],white);mesh(head,'ball',[.33,.12,s*.365],[.06,.09,.035],dark);if(!a.pickajoo&&['quad','rodent','bat'].includes(kind)){const ear=tip(head,[-.12,.5,s*.27],accent,kind==='rodent'?.2:.14);ear.rotation.x=s*.2;}}
  if(kind==='bird'){const beak=tip(head,[.65,-.05,0],accent,.22);beak.rotation.z=-Math.PI/2;}
  if(kind==='bug'){for(const s of [-1,1]){mesh(head,'box',[0,.48,s*.19],[.035,.25,.035],accent).rotation.x=s*.3;mesh(head,'ball',[0,.72,s*.27],[.09,.09,.09],glow);}}
  const mouth=joint('mouth',head,[.63,-.14,0]);sockets.mouth=mouth;weapons.mouth=mouth;
  const focus=joint('focus',head,[.04,.37,0]);mesh(focus,'rock',[0,0,0],[.12,.15,.12],glow);sockets.focus=focus;weapons.focus=focus;
  const tail=joint('tail',body,[-.65,.95,0]);for(let i=0;i<4;i++){const seg=mesh(tail,'ball',[-i*.2,-Math.sin(i*.8)*.13,0],[.24-i*.035,.15,.15],i===3?accent:skin);seg.rotation.z=-.25;}sockets.tail=joint('tailTip',tail,[-.73,-.1,0]);weapons.tail=tail;
  if(a.pickajoo){
   for(const child of tail.children)if(child.isMesh)child.visible=false;
   const red=mat('#ef4545');
   for(const side of [-1,1]){
    const label=side===1?'left':'right';
    mesh(head,'ball',[.3,-.16,side*.34],[.16,.12,.065],red).name='pickajoo-cheek-'+label;
    const ear=joint('pickajoo-ear-'+label,head,[-.12,.4,side*.28]);ear.rotation.x=side*.3;
    mesh(ear,'cone',[0,.34,0],[.12,.48,.11],skin);
    mesh(ear,'cone',[0,.69,0],[.085,.16,.08],dark).name='pickajoo-ear-tip-'+label;
   }
   const bolt=joint('pickajoo-lightning-tail',tail,[-.08,.1,0]);
   for(const [x,y,angle,length] of [[-.12,0,.7,.3],[-.35,.3,-.6,.3],[-.65,.58,.8,.44]]){const segment=mesh(bolt,'box',[x,y,0],[length,.13,.08],skin);segment.rotation.z=angle;}
  }
  const arms=[];for(const s of [-1,1]){const arm=joint(s===1?'leftArm':'rightArm',body,[.37,1.05,s*.44]);mesh(arm,'ball',[.15,-.1,s*.1],[.29,.15,.16],skin);const claw=joint('claw'+s,arm,[.42,-.1,s*.1]);for(let i=0;i<3;i++){const t=tip(claw,[.13,0,(i-1)*.1],kind==='gear'?steel:white,.06);t.rotation.z=-Math.PI/2;}arms.push(claw);}
  sockets.claw=arms[0];weapons.claw=arms[0];
  const fang=joint('fang',mouth,[0,-.05,0]);for(const s of [-1,1]){const f=tip(fang,[-.06,0,s*.15],white,a.tusks?.13:.065);f.rotation.z=Math.PI;}sockets.fang=fang;weapons.fang=fang;
  const nativeWing=['bird','bat','bug'].includes(kind),wingGroup=joint('wing',body,[-.07,1.43,0]);
  for(const s of [-1,1]){const w=joint(s===1?'leftWing':'rightWing',wingGroup,[0,0,s*.28]);
   for(let i=0;i<4;i++){let feather=mesh(w,kind==='bat'?'cone':'ball',[-i*.14,-i*.05,s*(.35+i*.15)],[.35,.065,.43-i*.055],i%2?accent:skin);feather.rotation.y=s*(.3+i*.1);}
  }wingGroup.visible=nativeWing;sockets.wing=joints.leftWing;weapons.wing=wingGroup;
  const vine=joint('vine',joints.leftArm,[.2,0,0]);for(let i=0;i<5;i++){mesh(vine,'ball',[i*.14,Math.sin(i*.8)*.12,0],[.18,.06,.06],leaf);}vine.visible=kind==='plant';sockets.vine=joint('vineTip',vine,[.65,0,0]);weapons.vine=vine;
  const blade=joint('blade',joints.rightArm,[.25,0,0]);const b=mesh(blade,'ball',[.35,0,0],[.5,.055,.16],leaf);b.rotation.y=.2;blade.visible=false;sockets.blade=joint('bladeTip',blade,[.8,0,0]);weapons.blade=blade;
  const stinger=joint('stinger',tail,[-.65,0,0]);tip(stinger,[-.12,0,0],accent,.14).rotation.z=Math.PI/2;stinger.visible=kind==='ooze';sockets.stinger=joint('stingerTip',stinger,[-.4,0,0]);weapons.stinger=stinger;
  sockets.body=body;weapons.body=body;
  if(a.mane||a.thorns){for(let i=0;i<9;i++){const t=i*Math.PI*2/9;const p=tip(head,[-.22,Math.sin(t)*.43,Math.cos(t)*.43],a.thorns?leaf:accent,.17);p.rotation.x=t;p.rotation.z=.5;}}
  if(a.flame){for(let i=0;i<3;i++)tip(tail,[-.65+i*.1,.2+i*.1,0],i%2?accent:glow,.13);}
  if(a.fins){for(const s of [-1,1]){const f=mesh(head,'cone',[-.2,0,s*.5],[.12,.4,.3],accent);f.rotation.x=s*.9;}}
  if(a.horns||id==='gloomstalk'){for(const s of [-1,1])tip(head,[-.2,.45,s*.23],accent,.13);}
  if(a.crystals||a.spikes){for(let i=0;i<5;i++)tip(body,[-.4+i*.2,1.7+Math.sin(i)*.15,-.3],a.crystals?glow:steel,.16);}
  if(a.glow){mesh(body,'ball',[-.42,.8,0],[.36,.4,.36],glow);}
  if(a.relic){const halo=mesh(body,'ring',[0,2.15,0],[.55,.55,.55],accent);halo.rotation.x=Math.PI/2;}
  if(id==='voltbloom'){for(let i=0;i<8;i++){const t=i*Math.PI/4;mesh(head,'ball',[-.12,Math.sin(t)*.5,Math.cos(t)*.5],[.14,.27,.2],glow);}}
  if(id==='gloomstalk'){for(let i=0;i<5;i++)tip(body,[-.5+i*.2,1.67,0],accent,.12);head.scale.set(1.13,.9,.9);}
  // Normalize actual authored bounds, preserving root origin for battle placement.
  root.updateMatrixWorld(true);const bounds=new T.Box3().setFromObject(root),height=bounds.max.y-bounds.min.y;const scale=(big?2.65:2.25)/height;body.scale.setScalar(scale);body.position.y=-bounds.min.y*scale;
  // Fitted metrics (root space, root at origin): the presenter aims effects at the body's middle and
  // places the contact burst on the camera side of this radius instead of inside the mesh.
  root.updateMatrixWorld(true);const fitted=new T.Box3().setFromObject(root);
  const metrics=Object.freeze({height:fitted.max.y-fitted.min.y,radius:Math.max(fitted.max.x-fitted.min.x,fitted.max.z-fitted.min.z)/2});
  root.traverse(o=>{if(o!==root)bases.push([o,o.position.clone(),o.rotation.clone(),o.scale.clone(),o.visible]);});
  // Hit flash (emissive white pulse) and faint dissolve (opacity), on this rig's own materials only.
  // Allocation happens here once; setTint itself allocates nothing and is a no-op when unchanged.
  const WHITE=new T.Color(1,1,1),tints=[...ownedM].map(m=>({m,emissive:m.emissive.clone(),intensity:m.emissiveIntensity,opacity:m.opacity,transparent:m.transparent,depthWrite:m.depthWrite}));
  const casters=[];root.traverse(o=>{if(o.isMesh)casters.push([o,o.castShadow]);});
  let tintFlash=0,tintFade=1;
  function setTint(flash,fade){flash=Math.max(0,Math.min(1,Number(flash)||0));fade=Number.isFinite(fade)?Math.max(0,Math.min(1,fade)):1;if(flash===tintFlash&&fade===tintFade)return;
   const fading=fade<1,modeChanged=fading!==(tintFade<1);
   for(const t of tints){t.m.emissive.copy(t.emissive).lerp(WHITE,flash);t.m.emissiveIntensity=t.intensity+(TINT_EMISSIVE-t.intensity)*flash;t.m.opacity=t.opacity*fade;if(modeChanged){t.m.transparent=fading||t.transparent;t.m.depthWrite=fading?false:t.depthWrite;t.m.needsUpdate=true;}}
   if(modeChanged||fading)for(const [o,cast] of casters)o.castShadow=cast&&fade>TINT_SHADOW_FADE;
   tintFlash=flash;tintFade=fade;}
  function getTint(){return {flash:tintFlash,fade:tintFade};}
  function resetPose(){for(const [o,p,r,s,v] of bases){o.position.copy(p);o.rotation.copy(r);o.scale.copy(s);o.visible=v;}}
  function setPose(p){resetPose();p=p||{};const t=Math.max(0,Math.min(1,Number(p.progress)||0)),weapon=p.weapon||'body';if(weapons[weapon]){weapons[weapon].visible=true;let parent=weapons[weapon].parent;while(parent&&parent!==root){parent.visible=true;parent=parent.parent;}}
   const phase=p.phase||'idle',k=phase==='preparation'?-Math.sin(t*Math.PI/2):phase==='recovery'?1-t:Math.sin(Math.PI*t);
   if(p.kind==='recoil'||p.kind==='hit'){body.rotation.z=.16*Math.sin(t*Math.PI);return;}
   if(phase==='idle'){body.position.y+=Math.sin((p.time||0)*2)*.035;return;}
   head.rotation.z=-k*.18;body.rotation.z=-k*.08;
   if(weapon==='tail'||weapon==='stinger')tail.rotation.y=k*1.6;
   if(weapon==='claw'||weapon==='blade'||weapon==='vine'){joints.leftArm.rotation.y=-k*1.1;joints.rightArm.rotation.z=-k*.8;}
   if(weapon==='fang')head.rotation.z=-k*.35;
   if(weapon==='wing'){joints.leftWing.rotation.x=k*.8;joints.rightWing.rotation.x=-k*.8;}
   if(weapon==='vine')vine.scale.x=1+Math.max(0,k)*1.8;
   if(weapon==='body')body.position.y+=Math.max(0,k)*.3;
  }
  let disposed=false;function dispose(){if(disposed)return;disposed=true;for(const g of ownedG)g.dispose();for(const m of ownedM)m.dispose();root.clear();}
  return {root,joints,sockets,weapons,resetPose,setPose,setTint,getTint,dispose,metrics,metadata:{id,kind,signature:root.userData.signature,nativeWing}};
 }
 return {buildCreature,TINT_EMISSIVE,TINT_SHADOW_FADE,SPECIES_IDS:Object.freeze(IDS),SOCKETS:Object.freeze(SOCKETS)};
});
