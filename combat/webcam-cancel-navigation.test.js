'use strict';
const assert=require('node:assert/strict'),W=require('./webcam.js');let checks=0;const ok=(v,m)=>{assert.ok(v,m);checks++;};
function m(o={}){return {zones:o.z||[0,0,0,.2,.02,.2,0,0,0],recent:o.z||[0,0,0,.2,.02,.2,0,0,0],total:.05,pose:Array(9).fill(0),punch:0,punchMin:.25,event:null,blob:{x:.2,y:.5,area:.04,second:.035,secondX:.7,secondY:.5,...o.blob},flow:{dx:0,dy:0,coh:0,...o.flow}};}
function run(a,phase='menu',command=null){let tracker=W.createTracker();const out=[];for(const [t,motion] of a){const r=W.stepTracker(tracker,{motion,phase,command},t);tracker=r.tracker;out.push(...r.intents.map(i=>({...i,t})));}return out;}
function wave(hz=13,edit=x=>x,end=3300){const a=[];for(let t=0;t<=end;t+=1000/hz)a.push([t,edit(m(),t)]);return a;}
for(const hz of [13,15,30]){const r=run(wave(hz));ok(r.length===1&&r[0].key==='x','chest-height two-hand wave cancels once at '+hz+' Hz');ok(r[0].t>=1500,'cancel requires a sustained wave');}
for(const kind of ['one-hand','same-side','too-low','tiny-second','one-short-wave']){
 const a=wave(13,(v,t)=>{if(kind==='one-hand')v.blob.second=0;if(kind==='same-side'){v.blob.x=.6;v.blob.secondX=.9;}if(kind==='too-low')v.blob.y=v.blob.secondY=.9;if(kind==='tiny-second')v.blob.second=.003;if(kind==='one-short-wave'&&t>600)v.blob.area=v.blob.second=0;return v;});
 ok(!run(a).some(i=>i.key==='x'),'reject '+kind+' as cancel');
}
ok(!run(wave(13),'command',{kind:'strike',ready:true,waitingRelease:false,held:false}).some(i=>i.key==='x'),'no bilateral cancel during an action command');
ok(!run(wave(13),null).some(i=>i.key==='x'),'phase-less behavior stays unchanged');
const dropped=wave(13,(v,t)=>{if(t>600&&t<750)v.blob.area=v.blob.second=0;return v;});ok(run(dropped).filter(i=>i.key==='x').length===1,'a brief hand occlusion does not restart the entire hold');
const interrupted=wave(13,(v,t)=>{if(t>800&&t<1400)v.blob.area=v.blob.second=0;return v;},2300);ok(!run(interrupted).some(i=>i.key==='x'),'a long hand absence resets the hold');
function path(xs,flows=xs.map(()=>.8)){return xs.map((x,i)=>[i*75,m({blob:{x,y:.5,area:.03,second:0},flow:{dx:flows[i],dy:0,coh:1}})]);}
ok(run(path([.15,.25,.4,.55])).map(i=>i.key).join()==='arrowright','a continuous fast sweep still navigates');
ok(run(path([.2,.22,.75,.77])).length===0,'a jump between moving objects never navigates');
ok(run(path([.15,.25,.4,.55],[.8,-.8,-.8,.8])).length===0,'flow must agree throughout a fast sweep');

// One wave can move between the high-corner and chest-height views; it must cancel only once.
for(const reverse of [false,true]){
 const a=[];for(let t=0;t<=3500;t+=100){const v=m({z:[.2,0,.2,0,0,0,0,0,0]});if(reverse?t<1700:t>1500)v.blob.second=0;a.push([t,v]);}
 ok(run(a).filter(i=>i.key==='x').length===1,'one cancel across '+(reverse?'high-to-chest':'chest-to-high')+' handoff');
}
const rearm=[];for(let t=0;t<=4400;t+=100){const v=m();if(t>=1800&&t<=2300)v.blob.area=v.blob.second=0;rearm.push([t,v]);}
ok(run(rearm).filter(i=>i.key==='x').length===2,'hands disappearing fully rearms cancel');

console.log('webcam cancel/navigation: '+checks+' checks passed');
