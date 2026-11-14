'use strict';
const assert=require('node:assert/strict'),W=require('./webcam.js');
function motion(t,z,extra={}){return Object.assign({zones:z,recent:z,total:z.reduce((a,b)=>a+b,0)/9,pose:Array(9).fill(0),punch:0,punchMin:.25,event:null,blob:{x:.5,y:.5,area:.03},flow:{dx:0,dy:0,coh:.3}},extra);}
function track(frames,phase='menu'){let tr=W.createTracker();const out=[];for(const [t,m] of frames){const r=W.stepTracker(tr,{motion:m,phase,command:null},t);tr=r.tracker;out.push(...r.intents.map(i=>({...i,t})));}return out;}
// Continuous combinations: torso/arms stay active while the centre repeatedly fills and clears.
function combo(hz=13){const a=[];for(let t=0;t<=2600;t+=1000/hz){const u=(t%700)/700,c=.4+.23*Math.cos(2*Math.PI*u),z=[0,.15,0,.2,c,.15,.15,.12,.12];a.push([t,motion(t,z)]);}return a;}
for(const hz of [13,15,30]){
 const out=track(combo(hz));assert.equal(out.filter(i=>i.id==='attack').length,1,'continuous combination gives one ATTACK at '+hz+' Hz');assert.ok(out.every(i=>i.id==='attack'),'combination gives no other input');
}
// A single extension, uniform activity, a rigid sway and hands moving low must not become repeated punching.
for(const kind of ['single','uniform','rigid','low']){
 const a=combo().map(([t,m])=>{const z=m.zones.slice();if(kind==='single')z[4]=t<800?.65:.2;if(kind==='uniform')z[4]=.55;if(kind==='low'){z[7]=z[4];z[4]=.1;}return [t,{...m,zones:z,recent:z,total:z.reduce((a,b)=>a+b,0)/9,flow:{dx:0,dy:0,coh:kind==='rigid'?.95:.3}}];});
 // Bottom-centre pushes may legitimately give SWAP through the existing shove detector.
 assert.ok(!track(a).some(i=>kind==='low'?i.id==='attack':i.type==='action'),'reject '+kind+' activity as punching');
}
// A small hand can take 0.8 s to travel across the view; coherent flow must agree throughout.
function slowSweep(dir,hz=13){const a=[];for(let t=0;t<=1000;t+=1000/hz){const u=Math.min(t/800,1),sg=dir==='left'||dir==='up'?-1:1,vert=dir==='up'||dir==='down',p=sg>0?.2+.4*u:.8-.4*u;
 a.push([t,motion(t,[0,0,0,0,.04,0,0,0,0],{blob:{x:vert?.7:p,y:vert?p:.5,area:.006},flow:{dx:vert?0:sg*.8,dy:vert?sg*.8:0,coh:.9}})]);}return a;}
for(const dir of ['up','down','left','right'])for(const hz of [13,15,30]){
 const out=track(slowSweep(dir,hz));assert.deepEqual(out.map(i=>i.key),['arrow'+dir],'slow '+dir+' at '+hz+' Hz');
}
for(const kind of ['reverseFlow','jump','stationary','incoherent']){
 const a=slowSweep('up').map(([t,m])=>[t,{...m,blob:{...m.blob,y:kind==='stationary'?.5:kind==='jump'?(t<400?.8:.4):m.blob.y},flow:{...m.flow,dy:kind==='reverseFlow'?.8:kind==='incoherent'?-.2:m.flow.dy,coh:kind==='incoherent'?.3:.9}}]);
 assert.deepEqual(track(a),[],'reject '+kind+' sweep');
}
// Disconnected observations must not be joined into a gesture across missing camera frames.
const sparse=combo(13).filter(([t])=>Math.abs(t/350-Math.round(t/350))<.1);
assert.ok(!track(sparse).some(i=>i.id==='attack'),'camera gap discards the combination');
const splitSweep=slowSweep('up').filter(([t])=>t<200||t>500);
assert.deepEqual(track(splitSweep),[],'camera gap discards a slow sweep');
assert.deepEqual(track(combo(),null).filter(i=>i.type==='action'),[],'no phase does not enable combination actions');
const highHands=combo().map(([t,m])=>{const zones=m.zones.slice();zones[0]=zones[2]=.2;return [t,{...m,zones}];});
assert.ok(!track(highHands).some(i=>i.type==='action'),'two raised hands suppress combinations');
assert.ok(!track(combo().filter(([t])=>t>1100)).some(i=>i.type==='action'),'reset drops earlier combination cycles');

const interrupted=slowSweep('up',10).filter(([t])=>t<=600).map(([t,m])=>{const zones=m.zones.slice();if(t===300)zones[0]=zones[2]=.1;return [t,{...m,zones}];});
assert.deepEqual(track(interrupted),[],'two hands discard the slow sweep already in progress');
assert.deepEqual(track(slowSweep('up'),null),[],'phase-less path does not enable slow sweeps');
// Independent rendered hand scene: a six-pixel-radius hand crosses slowly over a textured background.
// No recorded pixels or derived silhouettes are used.
for(const hz of [13,15,30]){
 const keys=[],actions=[],settings={webcam:'ON',webcamMirror:false,webcamGain:5,webcamZone:'CENTER',webcamLagMs:0};let clock=0;
 const ctl=W.createWebcamController({global:{navigator:{}},doc:{body:{appendChild(){}},createElement(){return {};}},now:()=>clock,setTimeout:()=>0,clearTimeout(){},getSettings:()=>settings,setSettings(){},getCommand:()=>null,commandClock:()=>1,pauseGeneration:()=>0,isInputOpen:()=>true,getPhase:()=>'menu',battleAction:id=>actions.push(id),press:k=>keys.push(k),release(){},commandInput(){}});
 ctl.measureFloor(0,0);
 for(let t=0;t<=3500;t+=1000/hz){clock=t;const f=new Uint8Array(80*60),cy=50-35*Math.max(0,Math.min(1,(t-1800)/1000));
  for(let y=0;y<60;y++)for(let x=0;x<80;x++){const bg=65+15*Math.sin(x/9)+10*Math.cos(y/7),a=Math.max(0,Math.min(1,6.5-Math.hypot(x-64,y-cy)));f[y*80+x]=Math.round(bg*(1-a)+205*a);}
  ctl.processFrame(f,t);
 }
 assert.deepEqual(keys,['arrowup'],'rendered slow hand at '+hz+' Hz');
 assert.deepEqual(actions,[],'rendered slow hand gives no battle action at '+hz+' Hz');
}
console.log('webcam continuous recognition: 39 checks passed');

