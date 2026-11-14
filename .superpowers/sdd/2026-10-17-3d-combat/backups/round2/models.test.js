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
ok(signatures.size===26,'all species signatures distinct');console.log('Models: '+checks+' checks passed');
