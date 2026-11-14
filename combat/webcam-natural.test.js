'use strict';
const assert=require('node:assert/strict'),W=require('./webcam.js');
const z=(a,b,c)=>[0,0,0,a,b,c,0,0,0];
const sample=(t,pose,zones=z(0,0,0),punch=0)=>({t,pose,z:zones,rc:zones,tot:zones.reduce((a,b)=>a+b,0)/9,dx:0,dy:0,coh:0,bx:null,by:null,ba:0,punch,pmin:.25});
// Crossed arms remain in place, but a narrow sleeve edge jitters across a motion-zone border.
for(const dt of [1000/13,1000/15,1000/30]){
 const ring=[sample(0,z(0,0,0)),sample(dt,z(.5,.6,0),z(.5,.5,0))];
 for(let t=2*dt;t<=700;t+=dt)ring.push(sample(t,z(.5,.6,0),z(.2,0,0)));
 assert.equal(W.classifyGesture(ring,ring.at(-1).t),'guard','stable crossed arms tolerate sleeve-edge jitter at '+dt+' ms');
 const drifting=ring.map((s,i)=>({...s,pose:z(.5+(i%3)*.15,.6,0)}));
 assert.ok(W.gestureScores(drifting,drifting.at(-1).t).guard<1,'moving arm pose must not count as a hold');
}
// A punch can start and end in an already raised fighting stance. The reference is the pre-punch stance.
const stance=[0,.6,0,0,.1,0,0,0,0],extended=[0,.6,0,0,.7,0,0,0,0];
const ring=[];for(let t=0;t<=400;t+=75)ring.push(sample(t,stance));
ring.push(sample(450,extended,z(0,.5,0),.8));
for(let t=525;t<=1200;t+=75)ring.push(sample(t,stance));
assert.equal(W.classifyGesture(ring,1200),'punch','punch returns to its own fighting stance');
const held=ring.map(s=>s.t>=450?{...s,pose:extended}:s);
assert.ok(W.gestureScores(held,1200).punch<1,'extended fist has not returned to its fighting stance');

// The stable-pose guard must back-date to the start of the arm hold, even while its sleeve edge moves.
{
 let tracker=W.createTracker();const intents=[];
 for(let t=0;t<=600;t+=75){const a=t===0?z(0,0,0):z(.5,.6,0),zones=t===75?z(.5,.5,0):t>75?z(.2,0,0):z(0,0,0);
  const m={zones,recent:zones,total:zones.reduce((a,b)=>a+b,0)/9,pose:a,punch:0,punchMin:.25,event:null,blob:{x:null,y:null,area:0},flow:{dx:0,dy:0,coh:0}};
  const r=W.stepTracker(tracker,{phase:'command',motion:m,command:{kind:'guard',ready:true,waitingRelease:false,held:false}},t);tracker=r.tracker;intents.push(...r.intents);
 }
 assert.equal(intents.length,1,'jittering guard presses once');
 assert.equal(intents[0].ageMs,225,'jittering guard press dates to stable arms, not latest sleeve motion');
}
{
 const active=[sample(0,z(0,0,0)),sample(75,z(.5,.6,0),z(.8,.8,.8))];
 for(let t=150;t<=450;t+=75)active.push(sample(t,z(.5,.6,0),z(.8,.8,.8)));
 active.push(sample(525,z(.5,.6,0)));
 assert.ok(W.gestureScores(active,525).guard<1,'one quiet frame after active arms is not a held guard');
}
// A moving or poorly sampled pre-punch stance must never bypass the original return-to-rest requirement.
for(const kind of ['moving','unstable','short','sparse']){
 let before=ring.filter(s=>s.t<450).map(s=>({...s}));
 if(kind==='moving')before=before.map(s=>({...s,z:z(.3,.3,0),tot:.1}));
 if(kind==='unstable')before=before.map((s,i)=>({...s,pose:[0,.4+.15*(i%3),0,0,.1,0,0,0,0]}));
 if(kind==='short')before=before.slice(-2);
 if(kind==='sparse')before=[before[0],before.at(-1)];
 const trial=[...before,...ring.filter(s=>s.t>=450)];
 assert.ok(W.gestureScores(trial,1200).punch<1,'reject '+kind+' fighting-stance baseline');
}
console.log('webcam natural movements: 15 checks passed');

