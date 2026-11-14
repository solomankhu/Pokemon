'use strict';
const assert=require('assert'),fs=require('fs'),T=require('../vendor/three-r128.min.js');
const html=fs.readFileSync(require('path').join(__dirname,"../claude's monsters.html"),'utf8');
const species=Function('return ('+html.match(/const SPECIES = (\{[\s\S]*?\n\});/)[1]+')')();
const M=require('./models.js'); let checks=0; const ok=(v,m)=>{assert(v,m);checks++;};
assert.throws(()=>M.buildCreature(T,'unknown',{}));checks++;
const signatures=new Set();
for(const [id,sp] of Object.entries(species)){
 const c=M.buildCreature(T,id,sp); ok(c.root instanceof T.Group,id); signatures.add(c.root.userData.signature);
 let meshes=0;c.root.traverse(o=>{if(o.isMesh)meshes++;});ok(meshes>12,id+' authored mesh assembly');
 for(const k of ['mouth','focus','claw','fang','tail','wing','vine','blade','stinger','body']){ok(c.sockets[k] instanceof T.Object3D,id+k);ok(c.weapons[k] instanceof T.Object3D,id+' weapon '+k);}
 c.root.updateMatrixWorld(true);const box=new T.Box3().setFromObject(c.root);ok(box.max.y-box.min.y>=1.8&&box.max.y-box.min.y<=3.1,id+' normalized height');
 for(const weapon of ['claw','fang','tail','wing','vine','blade','stinger'])for(const phase of ['preparation','travel','contact','recovery']){c.setPose({kind:'attack',phase,progress:.6,weapon});ok(c.weapons[weapon].visible,id+' visible '+weapon);c.root.updateMatrixWorld(true);c.root.traverse(o=>ok(o.matrixWorld.elements.every(Number.isFinite),id+' finite'));}
 c.resetPose();let before=c.joints.head.rotation.z;c.root.position.set(-3.5,0,0);c.root.rotation.y=Math.PI;c.setPose({kind:'attack',phase:'contact',progress:.5,weapon:'fang'});c.resetPose();ok(c.joints.head.rotation.z===before,id+' pose reset');ok(c.root.position.x===-3.5&&c.root.rotation.y===Math.PI,id+' external placement preserved');
 let disposed=0;c.root.traverse(o=>{if(o.geometry)o.geometry.addEventListener('dispose',()=>disposed++);});c.dispose();ok(disposed>0,id+' owned geometry disposed');
}
ok(signatures.size===26,'all species signatures distinct');
{// Hit flash and faint dissolve tint the rig's own materials and restore exactly.
 const c=M.buildCreature(T,'emberling',species.emberling);ok(c.metrics.height>1.8&&c.metrics.radius>.3,'fitted metrics');const mats=new Set();c.root.traverse(o=>{if(o.material)mats.add(o.material);});const before=[...mats].map(m=>[m.emissive.getHex(),m.emissiveIntensity,m.opacity,m.transparent]);
 c.setTint(1,1);ok([...mats].every(m=>m.emissive.getHex()===0xffffff&&m.emissiveIntensity===M.TINT_EMISSIVE),'full flash is white emissive');
 c.setTint(0,.3);ok([...mats].every(m=>m.transparent&&Math.abs(m.opacity-.3)<1e-9),'fade makes the rig translucent');let casting=0;c.root.traverse(o=>{if(o.isMesh&&o.castShadow)casting++;});ok(casting===0,'a dissolving rig stops casting shadows');
 c.setTint(0,1);ok([...mats].every((m,i)=>m.emissive.getHex()===before[i][0]&&m.emissiveIntensity===before[i][1]&&m.opacity===before[i][2]&&m.transparent===before[i][3]),'tint restores the authored materials');c.dispose();}console.log('Models: '+checks+' checks passed');
