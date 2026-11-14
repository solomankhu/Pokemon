'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs');
assert.ok(fs.existsSync(__dirname+'/webcam.js'),'webcam module must exist');
const realRandom=Math.random;let randomCalls=0;Math.random=()=>{randomCalls++;return realRandom();};
const W=require('./webcam.js');let checks=0;
const ok=(v,m)=>{assert.ok(v,m);checks++;};
const near=(a,b,e,m)=>ok(Math.abs(a-b)<=e,m+' ('+a+' vs '+b+')');
const N=W.FRAME_W*W.FRAME_H;
function frame(v=0){return new Uint8Array(N).fill(v);}
// real per-pixel noise (seeded, test-only): every pixel takes a fresh random grey, as a camera at night or a shaken camera does
function mulberry32(a){return function(){a|=0;a=a+0x6D2B79F5|0;let t=Math.imul(a^a>>>15,1|a);t=t+Math.imul(t^t>>>7,61|t)^t;return ((t^t>>>14)>>>0)/4294967296;};}
const noiseRng=mulberry32(4242);function noisyFrame(){const f=new Uint8Array(N);for(let i=0;i<N;i++)f[i]=Math.floor(noiseRng()*256);return f;}
// Zone c,r covers x in [c*80/3, (c+1)*80/3) and y in [r*20, r*20+20): cols 0..26, 27..53, 54..79.
const COLS=[[0,26],[27,53],[54,79]];
function paint(f,zone,v){const c=zone%3,r=Math.floor(zone/3);for(let y=r*20;y<r*20+20;y++)for(let x=COLS[c][0];x<=COLS[c][1];x++)f[y*W.FRAME_W+x]=v;return f;}

// --- classifyMotion ---
{const r=W.classifyMotion(frame(),frame(),{});ok(r.event===null&&r.total===0,'still scene: no event');ok(r.centroidX===null&&r.centroidY===null,'still scene: null centroid');ok(r.zones.length===9,'nine zones');}
{const r=W.classifyMotion(frame(),paint(frame(),4,255),{});ok(r.event==='burst','centre burst');near(r.zones[4],1,1e-9,'centre full');ok(r.zones.every((v,i)=>i===4||v===0),'only centre moves');near(r.centroidX,.5,.02,'centroid x mid');near(r.centroidY,.5,.03,'centroid y mid');}
{const r=W.classifyMotion(frame(),frame(255),{});ok(r.event==='noisy','full-frame motion is noisy');near(r.total,1,1e-9,'total 1');}
{const f=paint(paint(frame(),0,255),2,255);const r=W.classifyMotion(frame(),f,{});ok(r.event===null,'corners only: no burst');ok(r.zones[0]>.99&&r.zones[2]>.99,'corner zones full');}
{const r=W.classifyMotion(frame(),paint(frame(),4,20),{threshold:W.THRESHOLDS.MED});ok(r.zones[4]===0,'diff 20 below MED threshold');}
{const r=W.classifyMotion(frame(),paint(frame(),4,20),{threshold:W.THRESHOLDS.HIGH});near(r.zones[4],1,1e-9,'diff 20 above HIGH threshold');}
{const floor=[0,0,0,0,.5,0,0,0,0];const r=W.classifyMotion(frame(),paint(frame(),4,255),{noiseFloor:floor});near(r.zones[4],.5,1e-9,'per-zone noise floor subtracted');}
{const floor=[0,0,0,0,2,0,0,0,0];const r=W.classifyMotion(frame(),paint(frame(),4,255),{noiseFloor:floor});ok(r.zones[4]===0&&r.event===null,'floor never goes negative');}
{const f=paint(frame(),3,255);const plain=W.classifyMotion(frame(),f,{}),mir=W.classifyMotion(frame(),f,{mirror:true});ok(plain.centroidX<.4&&plain.zones[3]>.99,'left zone unmirrored');ok(mir.centroidX>.6&&mir.zones[5]>.99,'mirror flips x');}
{const a=frame(),b=paint(frame(),4,255),t0=process.hrtime.bigint();for(let i=0;i<1000;i++)W.classifyMotion(i%2?a:b,i%2?b:a,{});const ms=Number(process.hrtime.bigint()-t0)/1e6;ok(ms<1000,'1000 classifications under 1 s ('+ms.toFixed(0)+' ms)');}

// --- tracker ---
function M(z4=0,extra={}){const zones=[0,0,0,0,z4,0,0,0,0];if(extra.corners){zones[0]=extra.corners;zones[2]=extra.corners;}return {zones,total:extra.total??(z4>0||extra.corners?.2:0),centroidX:extra.cx??(z4>0||extra.corners?.5:null),centroidY:extra.cy??(z4>0||extra.corners?.5:null),event:extra.event??(z4>=W.BURST_MIN?'burst':null)};}
function run(steps,cmd){let t=W.createTracker();const out=[];for(const [ms,motion,c] of steps){const r=W.stepTracker(t,{motion,command:c===undefined?cmd:c},ms);t=r.tracker;out.push(...r.intents.map(i=>({...i,ms})));}return {t,out};}
const strike={kind:'strike',ready:true,waitingRelease:false,held:false};
// burst mapping, row by row
{const {out}=run([[0,M(.5)]],{kind:'strike',ready:false,waitingRelease:false,held:false});ok(out.length===1&&out[0].type==='arm','not ready: arm');}
{const {out}=run([[0,M(.5)]],{kind:'strike',ready:true,waitingRelease:true,held:false});ok(out.length===0,'waitingRelease: nothing');}
{const {out}=run([[0,M(.5)]],strike);ok(out.length===1&&out[0].type==='press'&&out[0].lagged,'strike: lagged press');}
{const {out}=run([[0,M(.5)]],{kind:'guard',ready:true,waitingRelease:false,held:false});ok(out[0].type==='press','guard: press');}
{const {t,out}=run([[0,M(.5)]],{kind:'charge',ready:true,waitingRelease:false,held:false});ok(out[0].type==='press'&&t.status==='holding','charge not held: press, holding');}
{const {t,out}=run([[0,M(.5)]],{kind:'catch',ready:true,waitingRelease:false,held:true});ok(out[0].type==='release'&&out[0].lagged&&t.status==='idle','held: release (keyboard press, webcam release)');}
{const {t,out}=run([[0,M(.5),{kind:'charge',ready:true,waitingRelease:false,held:false}],[100,M(0),{kind:'charge',ready:true,waitingRelease:false,held:true}],[200,M(0),null]]);ok(out.length===1&&t.status==='idle','abandoned charge: idle, nothing emitted');}
// hysteresis and cooldown
{const {out}=run([[0,M(.5)],[300,M(.5)],[350,M(.05)],[400,M(.5)]],strike);ok(out.length===2&&out[1].ms===400,'re-fire only after falling below half');}
{const {out}=run([[0,M(.5)],[50,M(.05)],[100,M(.5)]],strike);ok(out.length===1,'cooldown blocks a quick second onset');}
{const {out}=run([[0,M(.5)],[100,M(.12)],[300,M(.5)]],strike);ok(out.length===1,'dip to .12 is not below half: no re-fire');}
// noisy
{const {t,out}=run([[0,M(.9,{event:'noisy'})]],strike);ok(out.length===0&&t.status==='noisy','noisy blocks intents');}
{const {out}=run([[0,M(.9,{event:'noisy'})],[100,M(.05)],[400,M(.5)]],strike);ok(out.length===1&&out[0].ms===400,'recovers after noise');}
// menus: delayed confirm, sweeps, cancel
{const {out}=run([[0,M(.5)],[100,M(0)],[2000,M(0)]],null);ok(out.length===0,'one stray burst never confirms a menu');}
{const {out}=run([[0,M(.5)],[100,M(0)],[400,M(.5)]],null);ok(out.length===1&&out[0].type==='key'&&out[0].key==='z'&&out[0].ms===400,'double burst confirms');}
{const {out}=run([[0,M(.5)],[100,M(0)],[1200,M(.5)]],null);ok(out.length===0,'bursts too far apart do not confirm');}
{const {out}=run([[0,M(.5)],[100,M(0)],[1200,M(.5)],[1300,M(0)],[1600,M(.5)]],null);ok(out.length===1&&out[0].ms===1600,'a late burst starts a new pair');}
{const {out}=run([[0,M(.05,{cx:.1,total:.1})],[100,M(.5,{cx:.4,total:.2})],[200,M(.05,{cx:.7,total:.1})],[700,M(0)]],null);ok(out.length===1&&out[0].key==='arrowright','sweep right, burst suppressed');}
{const {out}=run([[0,M(.05,{cx:.9,total:.1})],[200,M(.05,{cx:.3,total:.1})]],null);ok(out.length===1&&out[0].key==='arrowleft','sweep left');}
{const {out}=run([[0,M(.05,{cy:.1,total:.1})],[200,M(.05,{cy:.8,total:.1})]],null);ok(out[0].key==='arrowdown','sweep down');}
{const {out}=run([[0,M(.05,{cy:.9,total:.1})],[200,M(.05,{cy:.2,total:.1})]],null);ok(out[0].key==='arrowup','sweep up');}
{const {out}=run([[0,M(.05,{cx:.1,total:.1})],[500,M(.05,{cx:.9,total:.1})]],null);ok(out.length===0,'too slow is not a sweep');}
{const {out}=run([[0,M(.05,{cx:.1,total:.1})],[200,M(.05,{cx:.9,total:.1})]],strike);ok(out.length===0,'no sweeps during a command');}
{const s=[];for(let ms=0;ms<=1600;ms+=100)s.push([ms,M(0,{corners:.5})]);const {out}=run(s,null);ok(out.length===1&&out[0].key==='x'&&out[0].ms===1500,'two-hand hold cancels once at 1500 ms');}
{const s=[];for(let ms=0;ms<=1400;ms+=100)s.push([ms,M(0,{corners:.5})]);s.push([1450,M(0)]);for(let ms=1500;ms<=2900;ms+=100)s.push([ms,M(0,{corners:.5})]);const {out}=run(s,null);ok(out.length===0,'cancel needs a continuous hold');}
{const s=[];for(let ms=0;ms<=1600;ms+=100)s.push([ms,M(0,{corners:.5})]);const {out}=run(s,strike);ok(out.length===0,'no cancel during a command');}
{const t=W.createTracker(),copy=JSON.stringify(t);W.stepTracker(t,{motion:M(.5),command:strike},0);ok(JSON.stringify(t)===copy,'stepTracker does not mutate its input');}

// --- helpers ---
ok(W.computeLag([1100,2650,4120],[1000,2500,4000])===120,'median lag');
ok(W.computeLag([900,2400,3900],[1000,2500,4000])===0,'early punches clamp to 0');
ok(W.computeLag([1500,3000,4500],[1000,2500,4000])===300,'clamp to 300');
ok(W.computeLag([],[])===null,'no samples: null');
ok(W.computeLag([1100,2600],[1000,2500,4000])===100,'pairs only as many as both have');
{const g=W.toGray(new Uint8ClampedArray([255,255,255,255,0,0,0,255,255,0,0,255]),new Uint8Array(3));ok(g[0]===255&&g[1]===0&&g[2]===76,'rgba to gray (BT.601 integer)');}
near(W.lagToCommandTime(.5,200),.5-.2*.55,1e-12,'lag converted to command time');
ok(W.lagToCommandTime(.05,300)===0,'never before the window opened');
ok(W.lagToCommandTime(.5,NaN)===.5,'bad lag means no correction');
// --- v2 pipeline (stepMotion) ---
function textured(off=0,mul=1){const f=new Uint8Array(N);for(let i=0;i<N;i++){const x=i%W.FRAME_W,y=(i/W.FRAME_W)|0;f[i]=Math.max(0,Math.min(255,Math.round((60+60*((x>>2)+(y>>2)&1)+20*Math.sin(x/7))*mul+off)));}return f;}
{const m=W.createMotionModel();ok(W.stepMotion(m,frame(),33,{})===null,'v2: first frame has no diff (null)');const n0=m.noise.slice(),f0=m.frames;
 ok(W.stepMotion(m,frame(),33,{learn:'all'})===null,'v2: an all-zero diff is a duplicate (null)');ok(m.frames===f0&&m.noise.every((v,i)=>v===n0[i]),'v2: a duplicate updates nothing (no EMA, no prev)');}
{const m=W.createMotionModel();W.stepMotion(m,textured(),33,{});const add=W.stepMotion(m,textured(40),33,{});ok(add.total===0&&add.event===null&&add.punch===0,'v2: a global +40 exposure step gives zero motion');
 const m2=W.createMotionModel();W.stepMotion(m2,textured(),33,{});const mul=W.stepMotion(m2,textured(0,1.3),33,{});ok(mul.total===0&&mul.event===null&&mul.punch===0,'v2: a x1.3 exposure step on a high-contrast background gives zero motion');near(mul.exposure.a,1.3,.02,'v2: the fitted exposure gain');}
{const sp=v=>{const m=W.createMotionModel();W.stepMotion(m,frame(),33,{});const f=frame();for(let i=0;i<N;i+=97)f[i]=v;return W.stepMotion(m,f,33,{});};ok(sp(90).total===0,'v2: speckle up to ~100 levels is removed by blur + threshold');const hot=sp(255);ok(hot.blob.area*N<=9&&hot.punch<.5,'v2: a full-range hot pixel stays a <=3x3 dot (blob '+hot.blob.area*N+' px)');}
{const m=W.createMotionModel();W.stepMotion(m,frame(),33,{});const r=W.stepMotion(m,paint(frame(),4,255),33,{});ok(r.event==='burst'&&r.punch===1&&r.blob.area>.08,'v2: a centre burst out of stillness is a full punch');ok(Array.isArray(r.zones)&&r.zones.length===9&&r.flow&&'dx' in r.flow&&r.blob&&'x' in r.blob&&'centroidX' in r,'v2: motion shape (zones,total,centroid,event + blob,flow,punch)');}
{const mk=zone=>{const m=W.createMotionModel();W.stepMotion(m,frame(),33,{zone});return W.stepMotion(m,paint(frame(),3,255),33,{zone,mirror:false});};ok(mk('LEFT').punch===1&&mk('RIGHT').punch===0,'v2: the punch region follows webcamZone');
 const m=W.createMotionModel();W.stepMotion(m,frame(),33,{});const mir=W.stepMotion(m,paint(frame(),3,255),33,{zone:'RIGHT',mirror:true});ok(mir.punch===1&&mir.blob.x>.6&&mir.zones[5]>.9,'v2: mirror flips zones, blob and the punch region');}
{const one=dt=>{const m=W.createMotionModel();W.stepMotion(m,frame(),dt,{});return W.stepMotion(m,paint(frame(),4,255),dt,{});};
 near(one(66).energy[4],one(33).energy[4]*.5,1e-9,'v2: the energy rate is scaled by 33/dt');ok(one(33).scale===1&&one(66).scale===.5,'v2: dt scale');
 ok(one(2000).scale===W.V2.DT_SCALE_MIN&&one(5).scale===W.V2.DT_SCALE_MAX&&one(NaN).scale===1,'v2: dt scale clamps to 0.5..2 (bad dt = 33 ms)');}
{const low=g=>{const m=W.createMotionModel();W.stepMotion(m,frame(100),33,{});return W.stepMotion(m,paint(frame(100),4,112),33,{gain:g}).total;};ok(low(9)>0&&low(1)===0,'v2: gain 9 sees a 12-level change that gain 1 ignores');ok(W.gainK(1)>W.gainK(5)&&W.gainK(5)>W.gainK(9),'gainK falls with gain');}
{const m=W.createMotionModel();W.stepMotion(m,frame(),33,{});for(let k=0;k<30;k++)W.stepMotion(m,k%2?noisyFrame():frame(),33,{learn:'all'});const n=m.noise.reduce((a,b)=>a+b,0);ok(n>0,'v2: warm-up learns every pixel');
 W.resetMotionTemporal(m);ok(!m.hasPrev&&m.noise.reduce((a,b)=>a+b,0)===n,'resetMotionTemporal keeps the noise');W.resetMotionModel(m);ok(m.noise.every(v=>v===0),'resetMotionModel clears the noise');}
// slow leak: a pixel that keeps moving for > NOISE_LEAK_MS is learned, so a fan can't stay a permanent blob
{const m=W.createMotionModel();const a=paint(frame(),4,40),b=frame();W.stepMotion(m,b,33,{});let first=null,lastR=null;for(let k=0;k<600;k++){lastR=W.stepMotion(m,k%2?b:a,33,{});if(k===0)first=lastR;}ok(first.zones[4]>.9&&lastR.zones[4]===0,'v2: a flicker that runs for seconds leaks into the noise model');}
ok(W.gainOf({})===5&&W.gainOf({webcamSensitivity:'HIGH'})===7&&W.gainOf({webcamGain:2,webcamSensitivity:'HIGH'})===2&&W.gainOf({webcamGain:'x'})===5,'gainOf mirrors normalizeSettings');
ok(W.punchOf({})===W.PUNCH_DEFAULT&&W.punchOf({webcamPunch:.4})===.4&&W.punchOf({webcamPunch:9})===W.PUNCH_MAX,'punchOf');ok(W.zoneOfSetting({webcamZone:'LEFT'})==='LEFT'&&W.zoneOfSetting({webcamZone:'x'})==='CENTER','zoneOfSetting');
ok(W.calibratePunch([.4,.6,.5],0)===.25&&W.calibratePunch([.1,.1,.1],0)===W.CAL_FLOOR,'calibratePunch: half the median, floored at CAL_FLOOR');
near(W.calibratePunch([.4,.6,.5],.3),.3*W.CAL_NUIS_K,1e-12,'calibratePunch: floored above the nuisance peak');ok(W.calibratePunch([],0)===null&&W.calibratePunch([2,2,2],0)===W.PUNCH_MAX,'calibratePunch: empty, clamp');
for(const k of ['DT_REF','MIN_NOISE','NORM_BAND','NOISE_TAU','NOISE_LEAK_MS','MHI_MS','PUNCH_WIN_MS','RISE_MS','RISE_K','PUNCH_FULL','COH_LO','COH_HI'])ok(Number.isFinite(W.V2[k]),'V2.'+k+' exported');
ok(Object.isFrozen(W.V2)&&[W.PUNCH_COOLDOWN_MS,W.SWEEP_REFRACT_MS,W.SWEEP_SPAN_V2,W.BLOB_JUMP,W.FLOW_MIN,W.CAL_FLOOR,W.PUNCH_NORM_PX].every(Number.isFinite),'v2 tracker constants exported');
{const m=W.createMotionModel(),a=frame(),b=paint(frame(),4,255),t0=process.hrtime.bigint();for(let i=0;i<1000;i++)W.stepMotion(m,i%2?b:a,33,{gain:5,mirror:true});const ms=Number(process.hrtime.bigint()-t0)/1e6;ok(ms<3000,'1000 v2 frames under 3 s ('+ms.toFixed(0)+' ms)');}
// Real v2 pipeline: simultaneous upper-corner motion cancels, with no cross-gesture input.
{const model=W.createMotionModel();let menu=W.createTracker(),cmd=W.createTracker(),keys=[],presses=[];
 for(let ms=0;ms<=1800;ms+=100){let f=frame();if((ms/100)%2){paint(f,0,255);paint(f,2,255);}const motion=W.stepMotion(model,f,100,{gain:5,mirror:true});if(!motion)continue;
 let r=W.stepTracker(menu,{motion,command:null},ms);menu=r.tracker;keys.push(...r.intents);r=W.stepTracker(cmd,{motion,command:strike},ms);cmd=r.tracker;presses.push(...r.intents);}
 ok(keys.length===1&&keys[0].key==='x','v2 pipeline two-hand cancel fires X once, never Z or arrows');ok(presses.length===0,'v2 pipeline two-hand cancel never strikes');}
// --- v2 tracker ---
function V(p,extra={}){return Object.assign({zones:[0,0,0,0,0,0,0,0,0],total:p>0?.1:0,centroidX:null,centroidY:null,event:null,blob:{x:null,y:null,area:0},flow:{dx:0,dy:0,coh:0},punch:p,punchMin:.25},extra);}
{const {t,out}=run([[0,V(.5)]],strike);ok(out.length===1&&out[0].type==='press'&&t.reason===null,'v2: punch >= punchMin presses');}
{const {out}=run([[0,V(.2)]],strike);ok(out.length===0,'v2: punch below punchMin does nothing');}
{const {out}=run([[0,V(.5)],[100,V(0)],[200,V(.5)],[300,V(.5)],[400,V(0)],[500,V(.5)]],strike);ok(out.length===2&&out[1].ms===500,'v2: an onset inside PUNCH_COOLDOWN_MS is used up (a retract cannot fire later)');}
{let t=W.createTracker();t=W.stepTracker(t,{motion:V(.5),command:strike},0).tracker;t=W.stepTracker(t,{motion:V(0),command:strike},100).tracker;t=W.stepTracker(t,{motion:V(.5),command:strike},200).tracker;ok(t.reason==='cooldown','reason: cooldown');
 t=W.stepTracker(W.createTracker(),{motion:V(.5),command:null},0).tracker;ok(t.reason==='confirm-pending','reason: confirm-pending');t=W.stepTracker(t,{motion:V(0,{event:'noisy'}),command:null},50).tracker;ok(t.reason==='noisy','reason: noisy');t=W.stepTracker(t,{motion:V(0),command:null},2000).tracker;ok(t.reason===null,'reason: null when idle');}
const B=(x,y,fx,fy,a=.04)=>V(0,{blob:{x,y,area:a},flow:{dx:fx,dy:fy,coh:1},total:.05});
{const {out}=run([[0,B(.2,.5,.8,0)],[100,B(.4,.5,.8,0)],[200,B(.65,.5,.8,0)]],null);ok(out.length===1&&out[0].key==='arrowright','v2: blob travel with coherent flow sweeps');}
{const {out}=run([[0,B(.2,.5,.1,0)],[100,B(.4,.5,.1,0)],[200,B(.65,.5,.1,0)]],null);ok(out.length===0,'v2: blob travel with incoherent flow (two hands) is no sweep');}
{const {out}=run([[0,B(.2,.5,-.8,0)],[100,B(.4,.5,-.8,0)],[200,B(.65,.5,-.8,0)]],null);ok(out.length===0,'v2: flow against the travel is no sweep');}
{const {out}=run([[0,B(.5,.1,0,.8)],[100,B(.5,.3,0,.8)],[200,B(.5,.6,0,.8)]],null);ok(out[0]&&out[0].key==='arrowdown','v2: sweep down');}
{const {out}=run([[0,B(.2,.5,.8,0)],[200,B(.65,.5,.8,0)],[300,B(.9,.5,.8,0)],[400,B(.6,.5,-.8,0)],[500,B(.2,.5,-.8,0)],[900,B(.6,.5,-.8,0)],[1000,B(.2,.5,-.8,0)]],null);ok(out.map(i=>i.key).join()==='arrowright,arrowleft'&&out[1].ms===1000,'v2: one sweep per SWEEP_REFRACT_MS (no double or reversed arrow) ('+out.map(i=>i.key+i.ms).join()+')');}
{const {out}=run([[0,B(.2,.5,.8,0,.002)],[200,B(.65,.5,.8,0,.002)]],null);ok(out.length===0,'v2: a tiny blob never sweeps');}
{const {out}=run([[0,V(.5,{blob:{x:.2,y:.5,area:.04},flow:{dx:0,dy:0,coh:0}})],[100,V(0)],[400,V(.5,{blob:{x:.8,y:.5,area:.04},flow:{dx:0,dy:0,coh:0}})]],null);ok(out.map(i=>i.key).join()==='z','v2: menu double punch is z, and a zone punch is never an arrow');}
// --- controller (stubbed browser) ---
// --- gestures (plan docs/plans/2026-10-23-webcam-gesture-set.md, Phase 2): phase-aware tracker ---
// Phase-less output is BYTE-IDENTICAL to the pre-gesture tracker: this digest was computed with the Phase 1 webcam.js
// (backup .superpowers/sdd/2026-10-23-webcam-gestures/phase2/webcam.js) over a seeded stream of v2 + legacy samples and
// every command kind. Never re-baseline it to make a change pass: a different digest means phase-less behaviour changed.
{const r=mulberry32(20261023);const fnv=(s,h)=>{for(let i=0;i<s.length;i++){h^=s.charCodeAt(i);h=Math.imul(h,16777619)>>>0;}return h;};
 const cmds=[null,strike,{kind:'guard',ready:true,waitingRelease:false,held:false},{kind:'catch',ready:true,waitingRelease:false,held:true},{kind:'charge',ready:false,waitingRelease:false,held:false},{kind:'catch',ready:true,waitingRelease:true,held:false}];
 const runs=[[],[],[]];
 for(const [k,extra] of [[0,{}],[1,{phase:null}],[2,{phase:undefined}]]){let t=W.createTracker(),h=2166136261,n=0;const rr=mulberry32(20261023);
  for(let i=0;i<4000;i++){const z=[0,0,0,0,0,0,0,0,0].map(()=>rr()<.3?rr()*.5:0),tot=z.reduce((a,b)=>a+b,0)/9,v2=i%7!==0;
   const m=v2?{zones:z,total:tot,centroidX:tot?rr():null,centroidY:tot?rr():null,event:rr()<.02?'noisy':null,blob:{x:rr()<.1?null:rr(),y:rr(),area:rr()*.1,second:0},flow:{dx:rr()*2-1,dy:rr()*2-1,coh:rr()},punch:rr()<.15?rr():0,punchMin:.25}
    :{zones:z,total:tot,centroidX:tot?rr():null,centroidY:tot?rr():null,event:z[4]>=.18?'burst':null};
   if(v2&&m.event!=='noisy'&&m.punch>=.25)m.event='burst';
   const res=W.stepTracker(t,Object.assign({motion:m,command:cmds[(i>>5)%cmds.length]},extra),i*40);t=res.tracker;n+=res.intents.length;h=fnv(JSON.stringify(res.intents)+t.status+t.reason,h);runs[k].push(JSON.stringify(res.intents));}
  if(k===0)ok(n===200&&h===3903691192,'phase-less tracker output is byte-identical to Phase 1 (golden digest '+n+'/'+h+')');}
 ok(runs[1].join()===runs[0].join()&&runs[2].join()===runs[0].join(),'phase null / undefined are the phase-less path');r();}
// v2 gesture samples: G2({z, rc, pose, dx, dy, coh, bx, by, ba, punch}); total defaults to the zone mean
const G2=(o={})=>{const z=o.z||[0,0,0,0,0,0,0,0,0];return {zones:z,recent:o.rc||z,total:o.tot??z.reduce((a,b)=>a+b,0)/9,centroidX:null,centroidY:null,event:(o.punch||0)>=.25?'burst':null,
 blob:{x:o.bx??null,y:o.by??null,area:o.ba??0,second:0},flow:{dx:o.dx||0,dy:o.dy||0,coh:o.coh||0},punch:o.punch||0,punchMin:.25,pose:o.pose||[0,0,0,0,0,0,0,0,0]};};
const Z=v=>[0,0,0,0,0,0,0,0,0].map((_,i)=>v[i]||0);
function runP(steps,phase,cmd){let t=W.createTracker();const out=[];for(const [ms,m,c] of steps){const r=W.stepTracker(t,{motion:m,command:c===undefined?cmd||null:c,phase},ms);t=r.tracker;out.push(...r.intents.map(i=>({...i,ms})));}return {t,out};}
const still=(t0,t1,o={})=>{const s=[];for(let t=t0;t<=t1;t+=50)s.push([t,G2(o)]);return s;};
const punchAt=ms=>[[ms,G2({punch:.6,z:Z({4:.3})})],[ms+50,G2({punch:.6,z:Z({4:.3})})]];
{// a menu punch is ATTACK once the fist is back (deferred), never a 'z'; reason says so meanwhile
 const s=[...still(0,950),...punchAt(1000),...still(1100,2000)],{t,out}=runP(s,'menu');
 ok(out.length===1&&out[0].type==='action'&&out[0].id==='attack','menu punch: one ATTACK action ('+JSON.stringify(out)+')');
 ok(out[0].ms>=1000+W.GESTURE.PUNCH_DEFER_MS&&out[0].ms<1000+W.GESTURE.PUNCH_DEFER_MS+100,'ATTACK after PUNCH_DEFER_MS ('+out[0].ms+')');
 {const at=runP(s.filter(x=>x[0]<=out[0].ms),'menu').t;ok(at.pendingBurstAt===null&&at.lastOnsetMs===out[0].ms&&at.centreLow===false&&at.gestureFloorMs>out[0].ms,'the action consumes the onset (pendingBurstAt cleared, lastOnsetMs set, refractory floor)');}
 let tr=W.createTracker();for(const [ms,m] of s.filter(x=>x[0]<=1300))tr=W.stepTracker(tr,{motion:m,command:null,phase:'menu'},ms).tracker;ok(tr.reason==='punch-pending','reason while the punch waits: punch-pending');}
{// punch + punch within 500 ms: ONE action and no 'z' (the phase-less path would confirm)
 const s=[...still(0,950),...punchAt(1000),...still(1100,1350),...punchAt(1400),...still(1500,2600)];
 const a=runP(s,'menu').out,b=runP(s).out;
 ok(a.length===1&&a[0].id==='attack'&&!a.some(i=>i.key==='z'),'menu double punch within 500 ms: one ATTACK, no z ('+JSON.stringify(a)+')');ok(b.length===1&&b[0].key==='z','phase-less: the same double punch is still z');}
{// a punch that never comes back (the centre stays changed, e.g. a lean or a held pose) is never ATTACK
 const s=[...still(0,950),...punchAt(1000),...still(1100,3000,{pose:Z({4:.6})})];ok(runP(s,'menu').out.every(i=>i.id!=='attack'),'a punch whose centre never returns to rest is not ATTACK');}
// held gestures: motion into place (recent activity >= ACT_RC), then still with the pose changed
const into=(t0,t1,o)=>{const s=[];for(let t=t0;t<=t1;t+=50)s.push([t,G2(o)]);return s;};
const GUARD=[...still(0,950),...into(1000,1200,{z:Z({3:.4,4:.5}),pose:Z({3:.5,4:.6})}),...still(1250,1700,{pose:Z({3:.5,4:.6})})];
const RAISE=[...still(0,950),...into(1000,1200,{z:Z({2:.4,5:.3}),pose:Z({2:.4}),dy:-.6}),...still(1250,1700,{pose:Z({2:.4})})];
{const g=runP(GUARD,'menu').out,r=runP(RAISE,'menu').out;
 ok(g.length===1&&g[0].id==='defend','guard (forearms into the middle row, held): one DEFEND ('+JSON.stringify(g)+')');ok(r.length===1&&r[0].id==='bag','raise (hand up into a top corner, held): one BAG ('+JSON.stringify(r)+')');
 ok(runP(GUARD).out.length===0&&runP(RAISE).out.length===0,'no phase: no gestures');ok(runP(GUARD,'moves').out.length===0,'another phase (move list): no menu actions');
 const sw=RAISE.map(([t,m])=>[t,Object.assign({},m,{flow:{dx:.8,dy:-.1,coh:.5}})]);ok(runP(sw,'menu').out.length===0,'sideways motion then a top-corner pose is not RAISE (the motion must be upward)');}
{// lean: the centre column changed for >= LEAN_AWAY_MS via ONE side, then still; then RUN is confirmed only by a double punch
 const LB=[...still(0,950),...into(1000,1300,{z:Z({3:.3,6:.4,4:.3}),rc:Z({3:.4,6:.5,4:.4}),pose:Z({1:.4,4:.5})})],LH=(a,b)=>still(a,b,{pose:Z({1:.4,4:.5})}),L=[...LB,...LH(1350,2600)];
 const a=runP(L,'menu');ok(a.out.length===1&&a.out[0].id==='run-cursor'&&a.out[0].ms-1000>=W.GESTURE.LEAN_AWAY_MS,'lean (one side, away >= 1 s, then still): one run-cursor ('+JSON.stringify(a.out)+')');
 const lt=a.out[0].ms,Lt=[...LB,...LH(1350,lt)],back=[...Lt,...punchAt(lt+300),...still(lt+400,lt+1950)],b=runP(back,'menu').out;ok(b.length===1,'coming back into frame (a punch-like motion) within LEAN_REFRACT_MS does nothing ('+JSON.stringify(b)+')');
 const c0=lt+W.GESTURE.LEAN_REFRACT_MS+100,single=runP([...Lt,...still(lt+50,c0-50),...punchAt(c0),...still(c0+100,c0+1500)],'menu').out,double=runP([...Lt,...still(lt+50,c0-50),...punchAt(c0),...still(c0+100,c0+400),...punchAt(c0+450),...still(c0+550,c0+1500)],'menu').out;
 ok(single.length===1,'after the lean, a single punch never confirms RUN (never flees on its own) ('+JSON.stringify(single)+')');ok(double.length===2&&double[1].type==='key'&&double[1].key==='z','after the lean, a double punch confirms (z)');
 const sym=L.map(([t,m])=>[t,Object.assign({},m,{recent:Z({3:.4,6:.5,5:.4,8:.5}),zones:Z({3:.3,6:.4,5:.3,8:.4})})]);ok(runP(sym,'menu').out.length===0,'symmetric side motion (two hands) is not a lean');}
{// commands: punch is unchanged for every kind; guard is an extra trigger for 'guard', throw for 'catch' press; wrong context: nothing
 const kinds=['strike','guard','charge','catch'].map(kind=>({kind,ready:true,waitingRelease:false,held:false}));
 for(const c of kinds){const s=[...still(0,950),...punchAt(1000),...still(1100,1500)];ok(JSON.stringify(runP(s,'command',c).out)===JSON.stringify(runP(s,null,c).out),'command '+c.kind+': punch intents identical with a phase');}
 const gk={kind:'guard',ready:true,waitingRelease:false,held:false},g=runP(GUARD,'command',gk).out;
 ok(g.length===1&&g[0].type==='press'&&g[0].lagged&&g[0].ageMs>0&&g[0].ageMs<=W.GESTURE.BACKDATE_MAX_MS,'guard command: the guard gesture presses, back-dated to the hold start ('+JSON.stringify(g)+')');
 ok(runP(GUARD,'command',kinds[0]).out.length===0&&runP(GUARD,'command',kinds[2]).out.length===0,'guard gesture in a strike/charge command: nothing');
 ok(runP(GUARD,'command',{kind:'guard',ready:false,waitingRelease:false,held:false}).out.length===0&&runP(GUARD,'command',{kind:'guard',ready:true,waitingRelease:true,held:false}).out.length===0,'guard gesture before ready / while waiting for release: nothing');
 // Phase 3: an overhand throw is wound up (the hand rises up its side into the corner), arcs across with the flow, and
 // follows through (never back up); it is recognised THROW_FOLLOW_MS after the arc end, so a catch press is back-dated to it.
 const TW=[900,G2({tot:.1,z:Z({3:.3}),bx:.2,by:.45,ba:.03,dy:-.6})],TA=[[1000,G2({tot:.1,z:Z({0:.3}),bx:.2,by:.15,ba:.03})],[1100,G2({tot:.1,z:Z({4:.3}),bx:.4,by:.4,ba:.03,dx:.5})],[1200,G2({tot:.1,z:Z({7:.3}),bx:.5,by:.7,ba:.03,dx:.5})]];
 const TH=[...still(0,850),TW,...TA,...still(1250,1600)];
 const ck={kind:'catch',ready:true,waitingRelease:false,held:false},th=runP(TH,'command',ck).out;ok(th.length===1&&th[0].type==='press'&&th[0].ageMs>0&&th[0].ageMs<=W.GESTURE.BACKDATE_MAX_MS&&[1100,1200].includes(th[0].ms-th[0].ageMs),'catch command: an overhand throw presses, back-dated to the arc end ('+JSON.stringify(th)+')');
 ok(runP(TH,'command',{...ck,held:true}).out.length===0,'catch already held: a throw does not release (punch still does)');ok(runP(TH,'command',gk).out.length===0,'throw in a guard command: nothing');
 ok(runP(TH,'menu').out.map(i=>i.id).join()==='ball','the same throw in the battle menu is BALL');
 {const m=x=>runP(x,'menu').out.map(i=>i.id).join()||'-',noWind=[...still(0,950),...TA,...still(1250,1600)],back=[...still(0,850),TW,...TA,[1300,G2({tot:.1,z:Z({4:.3}),bx:.4,by:.4,ba:.03})],...still(1350,1700)];
  const against=[...still(0,850),TW,...TA.map(([t,g])=>[t,Object.assign({},g,{flow:{dx:-.5,dy:0,coh:0}})]),...still(1250,1600)],column=[...still(0,850),[900,G2({tot:.1,z:Z({5:.3}),bx:.68,by:.6,ba:.03,dy:-.6})],[1000,G2({tot:.1,z:Z({2:.3}),bx:.68,by:.28,ba:.03})],[1100,G2({tot:.1,z:Z({5:.3}),bx:.62,by:.6,ba:.03,dx:-.5})],...still(1150,1600)];
  ok(m(noWind)==='-','the same arc with no wind-up (a punch from the guard) is not BALL ('+m(noWind)+')');ok(m(back)==='-','an arc whose hand comes back up (a punch retracting) is not BALL ('+m(back)+')');
  ok(m(against)==='-','an arc whose motion history points the other way (a blob label jump) is not BALL ('+m(against)+')');ok(m(column)==='-','a drop inside one side column (no sideways travel) is not BALL ('+m(column)+')');}}
{// ring: lives in the tracker, bounded, reset by createTracker and by a phase change; classifier is pure
 ok(Array.isArray(W.createTracker().ring)&&W.createTracker().ring.length===0,'createTracker starts with an empty gesture ring');
 let t=W.createTracker();for(let i=0;i<500;i++)t=W.stepTracker(t,{motion:G2({z:Z({4:.1})}),command:null,phase:'menu'},i*10).tracker;ok(t.ring.length<=W.GESTURE.RING_MAX,'ring bounded ('+t.ring.length+')');
 const t2=W.stepTracker(t,{motion:G2(),command:null,phase:'moves'},5000).tracker;ok(t2.ring.length===1&&t2.ringPhase==='moves','a phase change starts a fresh ring');
 const n0=t.ring.length;W.stepTracker(t,{motion:G2(),command:null,phase:'menu'},5000);ok(t.ring.length===n0,'stepTracker does not mutate the input ring');
 const {t:tg}=runP(GUARD.slice(0,-3),'menu'),copy=JSON.stringify(tg.ring),a=W.classifyGesture(tg.ring,1700),b=W.classifyGesture(tg.ring,1700);ok(a===b&&JSON.stringify(tg.ring)===copy,'classifyGesture is pure');
 const D={};W.gestureScores(tg.ring,1700,-Infinity,-Infinity,D);ok(D.guard&&D.guard.pose>=1&&D.guard.hold>=1,'gestureScores reports each term (margins)');
 ok(W.classifyGesture([],0)===null&&W.classifyGesture(tg.ring,1700,{allow:['raise']})===null,'empty ring and allow-list give null');}
{// the motion model's pose: zero for a still scene, a held change shows, a matching scene refreshes the reference
 const m=W.createMotionModel(),o={gain:5,mirror:false,zone:'CENTER'};W.stepMotion(m,textured(),33,o);let r=null;for(let t=1;t<12;t++)r=W.stepMotion(m,textured(t%2),33,o)||r;
 ok(r.pose&&r.pose.every(v=>v===0)&&Array.isArray(r.recent)&&r.recent.length===9,'pose/recent: a still scene gives zero pose');
 const held=paint(textured(),4,255);W.stepMotion(m,held,33,o);let p=null;for(let t=0;t<20;t++)p=W.stepMotion(m,t%2?held:paint(textured(1),4,255),33,o)||p;
 ok(p.pose[4]>.9&&p.pose.every((v,i)=>i===4||v<.1),'a held change shows in its cell for seconds (not absorbed; neighbours only get the blur edge)');
 for(let t=0;t<Math.ceil(W.V2.POSE_ABSORB_MS/33)+3;t++)p=W.stepMotion(m,t%2?held:paint(textured(1),4,255),33,o)||p;ok(p.pose[4]<.05,'held still for POSE_ABSORB_MS, the changed scene becomes the reference');
 W.resetMotionTemporal(m);ok(m.refValid===false,'temporal reset drops the reference');}
let imageFn=()=>new Uint8ClampedArray(N*4);
class El{constructor(tag){this.tagName=tag;this.style={};this.children=[];this.attributes={};}appendChild(e){this.children.push(e);e.parentNode=this;return e;}removeChild(e){this.children.splice(this.children.indexOf(e),1);e.parentNode=null;}setAttribute(k,v){this.attributes[k]=v;}getContext(){return {drawImage(){},getImageData:()=>({data:imageFn()})};}play(){return Promise.resolve();}}
function env(opts={}){
 const body=new El('body'),timers=new Map(),delays=[];let id=0,clock=0;const calls={gum:0,press:[],release:[],input:[],settings:[],status:[]};const tracks=[],hooks={};let settings=Object.assign({webcam:'ON',webcamSensitivity:'MED',webcamMirror:true,webcamLagMs:120},opts.settings);
 const gum=opts.gum||(()=>{calls.gum++;const tr={stopped:false,on:{},stop(){this.stopped=true;},addEventListener(k,f){this.on[k]=f;}};tracks.push(tr);return Promise.resolve({getTracks:()=>[tr]});});
 const g={navigator:opts.noMedia?{}:{mediaDevices:{getUserMedia:(...a)=>{if(opts.gum)calls.gum++;return gum(...a);}}}};
 let gen=0,inputOpen=true,command=opts.command||null,clockVal=.5;
 const docStub={body,createElement:t=>new El(t),hidden:false};
 const c=W.createWebcamController({global:g,doc:docStub,now:()=>clock,setTimeout:(f,ms)=>{timers.set(++id,f);delays.push(ms);return id;},clearTimeout:i=>timers.delete(i),
  getSettings:()=>settings,setSettings:s=>{settings=s;calls.settings.push(s);},getCommand:()=>command,commandClock:()=>clockVal,pauseGeneration:()=>gen,isInputOpen:()=>inputOpen,getPhase:opts.phase!==undefined?()=>opts.phase:undefined,battleAction:opts.actions?id=>opts.actions.push(id):undefined,
  press:k=>{calls.press.push(k);if(hooks.press)hooks.press(k);},release:k=>calls.release.push(k),commandInput:(p,r,at)=>calls.input.push([p,r,at]),onStatus:s=>{calls.status.push(s);if(hooks.status)hooks.status(s);}});
 return {c,body,timers,delays,calls,tracks,hooks,set docHidden(v){docStub.hidden=v;},set clock(v){clock=v;},get clock(){return clock;},bumpGen(){gen++;},set inputOpen(v){inputOpen=v;},set command(v){command=v;},set clockVal(v){clockVal=v;},get settings(){return settings;}};
}
const flush=()=>new Promise(r=>setImmediate(r));
// drive warm-up to live with still frames: first frame discarded, floor measured over WARMUP_MS
function warm(e){e.c.processFrame(frame(),0);for(let t=33;t<=W.SETTLE_MS+W.WARMUP_MS+33;t+=33)e.c.processFrame(frame(),t);}
// --- clip codec (RECORD tool, plan docs/plans/2026-10-23-webcam-gesture-set.md Phase 1) ---
{const fr=k=>{const f=new Uint8Array(N);for(let i=0;i<N;i++)f[i]=(i*7+k*13)&255;return f;};
 const clip={v:1,w:W.FRAME_W,h:W.FRAME_H,label:'punch',mirror:true,gain:5,zone:'LEFT',punchMin:.3,t:[0,33.3,66.7],frames:[fr(0),fr(1),fr(2)]};
 ok(W.CLIP_LABELS.join()==='punch,guard,throw,shove,raise,lean,sweep,cancel,idle,talk','clip label allow-list');
 const json=W.encodeClip(clip);ok(typeof json==='string'&&JSON.parse(json).frames.every(f=>typeof f==='string'),'encodeClip: JSON with base64 frames');
 const back=W.decodeClip(json);ok(back&&['v','w','h','label','mirror','gain','zone','punchMin'].every(k=>back[k]===clip[k])&&back.t.join()===clip.t.join(),'round trip keeps the header and t[]');
 ok(back.frames.length===3&&back.frames.every((f,i)=>f instanceof Uint8Array&&f.length===N&&f.every((v,j)=>v===clip.frames[i][j])),'round trip keeps every pixel');
 {const odd=Object.assign({},clip,{frames:[new Uint8Array(N).fill(255),new Uint8Array(N),fr(9)]});const b=W.decodeClip(W.encodeClip(odd));ok(b&&b.frames[0].every(v=>v===255)&&b.frames[1].every(v=>v===0),'round trip at 0 and 255');}
 const bad=(c,m)=>ok(W.decodeClip(typeof c==='string'?c:JSON.stringify(c))===null,'decodeClip rejects '+m);
 const base=JSON.parse(json),mut=f=>{const c=JSON.parse(json);f(c);return c;};
 bad('not json','non-JSON');bad('null','null');bad('[1,2]','an array');ok(W.decodeClip(undefined)===null&&W.decodeClip(base)===null,'decodeClip needs a string');
 bad(mut(c=>c.v=2),'a wrong version');bad(mut(c=>c.w=40),'a wrong width');bad(mut(c=>c.h=120),'a wrong height');
 bad(mut(c=>c.label='dance'),'a label outside the allow-list');bad(mut(c=>c.label='__proto__'),'a prototype label');bad(mut(c=>delete c.label),'a missing label');
 bad(mut(c=>c.mirror='yes'),'a non-boolean mirror');bad(mut(c=>c.gain=12),'a gain out of range');bad(mut(c=>c.zone='TOP'),'an unknown zone');bad(mut(c=>c.punchMin=5),'a punchMin out of range');
 bad(mut(c=>c.t.pop()),'t/frames length mismatch');bad(mut(c=>c.t[1]=-1),'decreasing t');bad(mut(c=>c.t[0]='0'),'non-numeric t');bad(mut(c=>{c.t=[];c.frames=[];}),'an empty clip');
 bad(mut(c=>c.frames[1]=c.frames[1].slice(4)),'a short frame');bad(mut(c=>c.frames[1]=c.frames[1]+'AAAA'),'a long frame');bad(mut(c=>c.frames[2]='*'+c.frames[2].slice(1)),'bad base64');bad(mut(c=>c.frames[0]=7),'a non-string frame');
 {const many=mut(c=>{c.t=[];c.frames=[];for(let i=0;i<=W.CLIP_MAX_FRAMES;i++){c.t.push(i);c.frames.push(base.frames[0]);}});bad(many,'more than CLIP_MAX_FRAMES frames');}
 ok(W.decodeClip(json+' '.repeat(W.CLIP_MAX_CHARS))===null,'decodeClip rejects an oversize string before parsing');
 ok(W.encodeClip(Object.assign({},clip,{label:'dance'}))===null&&W.encodeClip(Object.assign({},clip,{frames:[fr(0),fr(1),new Uint8Array(10)]}))===null&&W.encodeClip(Object.assign({},clip,{frames:[fr(0),fr(1),Array.from(fr(2))]}))===null,'encodeClip refuses an invalid clip');
 ok(W.encodeClip(Object.assign({},clip,{frames:[fr(0),fr(1),fr(2)]}))===json,'encodeClip is deterministic');}
async function controllerTests(){
 {const e=env({noMedia:true});ok(!e.c.supported(),'unsupported without mediaDevices');ok(await e.c.start()==='unavailable','start reports unavailable');ok(e.settings.webcam==='OFF','unavailable turns the setting OFF');}
 {const e=env();ok(e.c.supported(),'supported');e.c.sync(true);e.c.sync(true);ok(e.calls.gum===1,'one getUserMedia while starting');await flush();ok(e.c.state==='warmup','warm-up after the stream opens');ok(e.body.children.length===1&&e.body.children[0].tagName==='video','hidden video attached');ok(e.body.children[0].muted===true,'video muted');ok(e.timers.size===1,'one sample timer');
  e.c.sync(false);ok(e.tracks[0].stopped,'track stopped on sync(false)');ok(e.body.children.length===0&&e.timers.size===0,'video and timer removed');ok(e.c.state==='off','off');}
 {const e=env();for(let i=0;i<10;i++){e.c.sync(true);await flush();e.c.sync(false);}ok(e.calls.gum===10&&e.tracks.every(t=>t.stopped),'10 cycles stop every track');ok(e.body.children.length===0&&e.timers.size===0,'10 cycles leave nothing behind');}
 {const e=env({gum:()=>Promise.reject(Object.assign(Error('no'),{name:'NotAllowedError'}))});e.c.sync(true);await flush();ok(e.c.state==='denied'&&e.settings.webcam==='OFF','denied turns OFF');ok(e.calls.status.includes('denied'),'denied reported');e.c.sync(true);await flush();ok(e.calls.gum===1,'no re-prompt until sync(false)');}
 {let resolve;const e=env({gum:()=>new Promise(r=>resolve=r)});e.c.sync(true);e.c.sync(false);const tr={stopped:false,stop(){this.stopped=true;},addEventListener(){}};resolve({getTracks:()=>[tr]});await flush();ok(tr.stopped&&e.body.children.length===0,'stream arriving after stop is closed at once');}
 {const e=env();e.c.sync(true);await flush();e.tracks[0].on.ended();ok(e.c.state==='ended'&&e.tracks[0].stopped,'track ended stops the controller');ok(e.settings.webcam==='OFF'&&e.calls.status.includes('ended'),'ended turns OFF and reports');}
 // pipeline
 {const e=env({command:strike});e.c.sync(true);await flush();e.c.processFrame(frame(),0);e.c.processFrame(paint(frame(),4,255),33);ok(e.calls.input.length===0,'first frames are warm-up: nothing dispatched');}
 {const e=env({command:strike});e.c.sync(true);await flush();warm(e);ok(e.c.state==='live','live after warm-up');ok(e.c.noiseFloor.every(v=>v===0),'still room: zero floor');
  e.c.processFrame(paint(frame(),4,255),2000);ok(e.calls.input.length===1,'burst dispatched');const [p,r,at]=e.calls.input[0];ok(p===true&&r===false,'as a press');near(at,.5-.12*.55,1e-9,'lag-corrected command time');}
 {const e=env({command:strike});e.c.sync(true);await flush();warm(e);e.clockVal=.02;e.c.processFrame(paint(frame(),4,255),2000);ok(e.calls.input[0][2]===0,'at clamps to 0');}
 {const e=env({command:{kind:'strike',ready:false,waitingRelease:false,held:false}});e.c.sync(true);await flush();warm(e);e.c.processFrame(paint(frame(),4,255),2000);ok(e.calls.input.length===2&&e.calls.input[0][0]===true&&e.calls.input[1][1]===true&&e.calls.input.every(x=>x[2]===undefined),'arm is press+release with no timestamp');}
 {const e=env({command:strike});e.c.sync(true);await flush();warm(e);e.bumpGen();e.c.processFrame(paint(frame(),4,255),2000);ok(e.calls.input.length===0,'pause during the lag window drops the press');}
 {const e=env({command:strike});e.c.sync(true);await flush();warm(e);e.inputOpen=false;e.c.processFrame(paint(frame(),4,255),2000);ok(e.calls.input.length===0,'closed input drops the press');}
 {const e=env();e.c.sync(true);await flush();warm(e);e.c.processFrame(paint(frame(),4,255),2000);e.c.processFrame(frame(),2100);e.c.processFrame(frame(),2133);ok(e.calls.press.length===0,'single menu burst does nothing');e.c.processFrame(paint(frame(),4,255),2400);ok(e.calls.press.join()==='z','double burst presses confirm');e.c.processFrame(frame(),2433);ok(e.calls.release.join()==='z','released on the next sample');}
 // rewritten for v2: a uniform frame(255) is an exposure step (normalised away), so noise is per-pixel
 {const e=env({command:strike});e.c.sync(true);await flush();warm(e);e.c.processFrame(noisyFrame(),2000);ok(e.c.state==='noisy'&&e.calls.input.length===0,'noisy scene (per-pixel noise): no input');
  e.c.processFrame(noisyFrame(),2033);ok(e.c.state==='noisy'&&e.calls.input.length===0,'still noisy: no input');}
 {const e=env({command:strike});e.c.sync(true);await flush();warm(e);e.c.processFrame(frame(255),2000);ok(e.c.state==='live'&&e.calls.input.length===0,'a uniform brightness jump is an exposure step: live, no input');}
 {const e=env({command:strike});e.c.sync(true);await flush();const noisy=frame();for(let i=0;i<N;i+=7)noisy[i]=255;e.c.processFrame(frame(),0);for(let t=33;t<=W.SETTLE_MS+W.WARMUP_MS+33;t+=33)e.c.processFrame(t%66?noisy:frame(),t);ok(e.c.noiseFloor.some(v=>v>0),'busy room: noise learned per pixel (per-zone summary)');ok(e.c.noiseFloor.every(v=>v<=W.V2.NOISE_CAP),'noise model capped at NOISE_CAP');
  e.c.processFrame(paint(frame(),4,255),3000);ok(e.calls.input.length===1,'a burst is still detected after a busy warm-up');}
 {const e=env({command:strike});e.c.sync(true);await flush();e.c.processFrame(frame(),0);for(let t=33;t<W.SETTLE_MS;t+=33)e.c.processFrame(t%66?frame(255):frame(),t);for(let t=W.SETTLE_MS;t<=W.SETTLE_MS+W.WARMUP_MS+33;t+=33)e.c.processFrame(frame(),t);ok(e.c.noiseFloor.every(v=>v===0),'settle frames (exposure flicker) are not measured');}
 // v2: the second frame moved 2300 -> 2100; at 2300 the first burst's withdrawal falls inside PUNCH_COOLDOWN_MS and is used up
 {const e=env();e.c.sync(true);await flush();warm(e);e.c.processFrame(paint(frame(),4,255),2000);e.c.processFrame(frame(),2100);e.c.processFrame(frame(),2133);e.c.processFrame(paint(frame(),4,255),2400);ok(e.calls.press.join()==='z','pending key');e.c.sync(false);ok(e.calls.release.join()==='z','stopping releases the pending key');}
 {const e=env();e.c.sync(true);await flush();const [id,f]=[...e.timers][0];e.timers.delete(id);e.docHidden=true;f();ok(e.c.state==='off'&&e.tracks[0].stopped,'hidden tab: sampler stops the camera itself');}
 {let resolve;const e=env({gum:()=>new Promise(r=>resolve=r)});e.c.sync(true);e.c.sync(false);e.c.sync(true);const tr={stopped:false,stop(){this.stopped=true;},addEventListener(){}};resolve({getTracks:()=>[tr]});await flush();ok(e.calls.gum===1&&!tr.stopped&&e.c.state==='warmup','a blur during the permission prompt does not abort or re-prompt');}
 {const e=env({command:strike});e.c.sync(true);await flush();warm(e);ok(e.calls.input.length===0,'no dispatch during warm-up');e.c.processFrame(paint(frame(),4,255),3000);ok(e.calls.input.length===1,'first burst after warm-up is not mistaken for a pause');}
 {const e=env();e.c.sync(true);await flush();warm(e);const seen=[];e.c.setCalibrationListener((m,t)=>seen.push([m.event,t]));e.inputOpen=false;e.c.processFrame(paint(frame(),4,255),2000);ok(seen.length===1&&seen[0][0]==='burst','calibration listener sees motion while input is closed');e.c.setCalibrationListener(null);}
 {const e=env();e.c.sync(true);await flush();warm(e);e.c.measureFloor(2000);ok(e.c.state==='warmup','measureFloor restarts warm-up');}
 {const e=env();e.c.sync(true);await flush();e.c.dispose();ok(e.tracks[0].stopped&&e.timers.size===0,'dispose stops everything');e.c.sync(true);ok(e.calls.gum===1,'disposed controller never restarts');}
 // --- review fixes ---
 // re-entrancy: a callback that stops the controller ends processFrame at once
 {const e=env({command:strike});e.c.sync(true);await flush();warm(e);e.c.setCalibrationListener(()=>e.c.stop());e.c.processFrame(paint(frame(),4,255),2000);ok(e.c.state==='off','listener stop: state stays off');ok(e.calls.input.length===0,'listener stop: no command input after halt');}
 {const e=env({command:strike});e.c.sync(true);await flush();warm(e);e.c.processFrame(noisyFrame(),2000);e.c.processFrame(frame(),2033);e.hooks.status=s=>{if(s==='live')e.c.stop();};e.c.processFrame(paint(frame(),4,255),2100);ok(e.c.state==='off','onStatus stop: state stays off');ok(e.calls.input.length===0,'onStatus stop: nothing dispatched');}
 {const e=env();e.c.sync(true);await flush();warm(e);e.hooks.press=()=>e.c.stop();e.c.processFrame(paint(frame(),4,255),2000);e.c.processFrame(frame(),2100);e.c.processFrame(frame(),2133);e.c.processFrame(paint(frame(),4,255),2400);ok(e.c.state==='off'&&e.calls.press.join()==='z','press stop: one press, state off');ok(e.calls.release.join()==='z','press stop: the key is released, never stuck');}
 // status handlers already see the setting OFF
 {let seen=null;const e=env({gum:()=>Promise.reject(Object.assign(Error('no'),{name:'NotAllowedError'}))});e.hooks.status=s=>{if(s==='denied')seen=e.settings.webcam;};e.c.sync(true);await flush();ok(seen==='OFF','onStatus(denied) sees webcam OFF');}
 // a camera that never delivers frames fails after READY_TIMEOUT_MS
 ok(W.READY_TIMEOUT_MS===3000,'READY_TIMEOUT_MS exported');
 {const e=env({command:strike});e.c.sync(true);await flush();e.c.video.readyState=0;e.c.processFrame(frame(),0);for(let t=33;t<=3000;t+=33)e.c.processFrame(frame(),t);ok(e.c.state==='warmup','still waiting before the timeout');e.c.processFrame(frame(),3100);ok(e.c.state==='unavailable'&&e.tracks[0].stopped,'readyState<2 for 3 s: unavailable, camera stopped');ok(e.settings.webcam==='OFF','ready timeout turns the setting OFF');}
 {const e=env({command:strike});e.c.sync(true);await flush();e.c.video.readyState=0;e.c.processFrame(frame(),0);for(let t=33;t<=2000;t+=33)e.c.processFrame(frame(),t);e.c.video.readyState=4;for(let t=2033;t<=2000+W.SETTLE_MS+W.WARMUP_MS+66;t+=33)e.c.processFrame(frame(),t);ok(e.c.state==='live','a slow camera that becomes ready goes live');}
 // transient errors keep the setting and retry next battle; permission errors turn it off
 {const e=env({gum:()=>Promise.reject(Object.assign(Error('busy'),{name:'NotReadableError'}))});e.c.sync(true);await flush();ok(e.c.state==='unavailable'&&e.settings.webcam==='ON','busy camera: unavailable, setting kept');e.c.sync(true);await flush();ok(e.calls.gum===1,'busy camera: no retry within the battle');e.c.sync(false);e.c.sync(true);await flush();ok(e.calls.gum===2,'busy camera: retried next battle');}
 {const e=env({gum:()=>Promise.reject(Object.assign(Error('no'),{name:'SecurityError'}))});e.c.sync(true);await flush();ok(e.c.state==='denied'&&e.settings.webcam==='OFF','SecurityError: denied, setting OFF');}
 // the sampler: frames from ticks never alias the previous frame
 {const e=env({command:strike});e.c.sync(true);await flush();const white=new Uint8ClampedArray(N*4);for(let i=0;i<N;i++){const y=Math.floor(i/W.FRAME_W),x=i%W.FRAME_W;if(y>=20&&y<40&&x>=27&&x<=53)white[i*4]=white[i*4+1]=white[i*4+2]=255;}
  const tickAt=ms=>{e.clock=ms;const [id,f]=[...e.timers][0];e.timers.delete(id);f();};imageFn=()=>new Uint8ClampedArray(N*4);for(let ms=0;ms<=W.SETTLE_MS+W.WARMUP_MS+66;ms+=33)tickAt(ms);ok(e.c.state==='live','ticks drive warm-up to live');
  imageFn=()=>white;tickAt(2000);imageFn=()=>new Uint8ClampedArray(N*4);ok(e.calls.input.length===1,'a burst seen through ticks is dispatched (buffers do not alias)');e.c.stop();}
 // --- v2 controller ---
 {const run1=g=>{const e=env({command:strike,settings:{webcamGain:g}});return (async()=>{e.c.sync(true);await flush();warm(e);e.c.processFrame(paint(frame(),4,16),2000);return e.calls.input.length;})();};
  ok(await run1(9)===1&&await run1(1)===0,'controller reads webcamGain (gain 9 sees a 16-level burst, gain 1 does not)');}
 {const e=env({command:strike,settings:{webcamSensitivity:'LOW'}});e.c.sync(true);await flush();warm(e);e.c.processFrame(paint(frame(),4,16),2000);ok(e.calls.input.length===0,'a legacy LOW save (no webcamGain) runs at gain 3');}
 {const z=async zone=>{const e=env({command:strike,settings:{webcamZone:zone}});e.c.sync(true);await flush();warm(e);e.c.processFrame(paint(frame(),5,255),2000);return e.calls.input.length;};   // raw zone 5 = the user's LEFT (mirrored)
  ok(await z('LEFT')===1&&await z('RIGHT')===0,'controller punches in the configured webcamZone (mirrored)');}
 {const e=env({command:strike});e.c.sync(true);await flush();ok(e.c.lastMotion===null,'lastMotion null before any diff');warm(e);e.c.processFrame(paint(frame(),5,255),2000);const a=e.c.lastMotion;
  ok(a.mask instanceof Uint8Array&&a.mask.length===N&&a.width===W.FRAME_W&&a.height===W.FRAME_H,'lastMotion carries a mask copy');ok(a.mask[30*W.FRAME_W+10]===1&&a.mask[30*W.FRAME_W+70]===0,'lastMotion mask is in display (mirrored) orientation');
  a.mask.fill(0);a.zones[0]=9;const b=e.c.lastMotion;ok(b.mask[30*W.FRAME_W+10]===1&&b.zones[0]!==9,'lastMotion is a copy (read-only for the overlay)');ok(['punch','event','reason','status','zone','blob','flow'].every(k=>k in b),'lastMotion fields');
  ok(e.c.noiseFloor.length===9&&e.c.noiseFloor.every(Number.isFinite),'noiseFloor getter: per-zone summary');}
 {const e=env({command:strike});e.c.sync(true);await flush();warm(e);e.c.setCalibrationListener(()=>e.c.measureFloor(500));e.c.processFrame(paint(frame(),4,255),2000);ok(e.calls.input.length===0&&e.c.state==='warmup','epoch: measureFloor inside a callback ends the frame (no dispatch)');}
 {const e=env();e.c.sync(true);await flush();warm(e);e.c.processFrame(paint(frame(),4,255),2000);e.c.processFrame(frame(),2100);e.bumpGen();e.c.processFrame(paint(frame(),4,255),2500);e.c.processFrame(frame(),2600);e.c.processFrame(paint(frame(),4,255),2700);
  ok(e.calls.press.length===0,'pause: the gesture in flight and the pending confirm are dropped, history reset');e.c.processFrame(frame(),2800);e.c.processFrame(paint(frame(),4,255),3300);ok(e.calls.press.length===0,'after the pause one burst only arms the confirm');e.c.processFrame(frame(),3400);e.c.processFrame(paint(frame(),4,255),3700);ok(e.calls.press.join()==='z','after a pause a fresh double punch confirms');}
 // duplicate frames: video.currentTime unchanged means no capture, no diff
 {const e=env({command:strike});e.c.sync(true);await flush();let grabs=0;imageFn=()=>{grabs++;return new Uint8ClampedArray(N*4);};const tickAt=ms=>{e.clock=ms;const [id,f]=[...e.timers][0];e.timers.delete(id);f();};
  e.c.video.currentTime=1;tickAt(0);tickAt(33);tickAt(66);ok(grabs===1,'unchanged currentTime: duplicates are not captured');for(let k=0;k<W.DUP_RUN_MAX+1;k++)tickAt(100+k*33);ok(grabs===2,'a stuck currentTime is captured again after DUP_RUN_MAX');
  e.c.video.currentTime=2;tickAt(400);ok(grabs===3,'a new frame is captured');imageFn=()=>new Uint8ClampedArray(N*4);e.c.stop();}
 // cost: a slow calibration listener must not drop the sampler to 15 Hz
 {const e=env({command:strike});e.c.sync(true);await flush();const tickAt=ms=>{e.clock=ms;const [id,f]=[...e.timers][0];e.timers.delete(id);f();};let k=0;imageFn=()=>{const a=new Uint8ClampedArray(N*4);a[(k++%N)*4]=200;return a;};
  e.c.setCalibrationListener(()=>{e.clock+=20;});for(let i=0;i<8;i++)tickAt(i*40);ok(e.delays.at(-1)===33,'listener time is not pipeline cost (stays 30 Hz)');imageFn=()=>new Uint8ClampedArray(N*4);e.c.stop();}
 // RECORD: the listener gets (motion, t, frame, state); frame is a copy of the grey frame the pipeline used
 {const e=env({command:strike});e.c.sync(true);await flush();const tickAt=ms=>{e.clock=ms;const [id,f]=[...e.timers][0];e.timers.delete(id);f();};let k=0;
  const img=v=>{const a=new Uint8ClampedArray(N*4);for(let i=0;i<N;i++)a[i*4]=a[i*4+1]=a[i*4+2]=(v+i)&255;return a;};imageFn=()=>img(k++*40);
  const seen=[];e.c.setCalibrationListener((m,t,frame,state)=>seen.push({t,frame,state,first:frame[0]}));
  for(let ms=0;ms<=W.SETTLE_MS+W.WARMUP_MS+99;ms+=33)tickAt(ms);ok(e.c.state==='live'&&seen.length>3,'listener runs through warm-up and live');
  ok(seen.some(x=>x.state==='warmup')&&seen.at(-1).state==='live','listener state arg: warmup, then live');
  ok(seen.every(x=>x.frame instanceof Uint8Array&&x.frame.length===N),'listener frame: an 80x60 Uint8Array');
  ok(seen.every((x,i)=>i===0||x.frame!==seen[i-1].frame),'listener frame: a fresh array every call');
  ok(seen.every(x=>x.frame[0]===x.first),'listener frame: later captures (the reused buffer) never change an earlier frame');
  {const x=seen.at(-1),k0=x.first;ok(x.frame[5]===((k0+5)&255),'listener frame: the grey values the pipeline saw');}
  imageFn=()=>new Uint8ClampedArray(N*4);e.c.stop();}
 {const e=env();e.c.sync(true);await flush();warm(e);const got=[];e.c.setCalibrationListener((m,t,frame,state)=>got.push([frame,state]));const src=paint(frame(),4,255);e.c.processFrame(src,2000);src.fill(9);
  ok(got.length===1&&got[0][1]==='live'&&got[0][0]!==src&&got[0][0][30*W.FRAME_W+40]===255,'processFrame: the listener frame is a copy, not the caller buffer');
  e.inputOpen=false;e.c.processFrame(frame(),2100);e.c.processFrame(paint(frame(),4,255),2400);e.c.processFrame(frame(),2500);e.c.processFrame(paint(frame(),4,255),2800);
  ok(got.length===5&&e.calls.press.length===0&&e.calls.input.length===0,'recording with input closed (the modal): frames flow, nothing dispatched');}
 {const e=env();e.c.sync(true);await flush();warm(e);const old=[];e.c.setCalibrationListener((m,t)=>old.push(t));e.c.processFrame(paint(frame(),4,255),2000);ok(old.length===1&&old[0]===2000,'a two-argument listener still works');}
 // gestures through the controller: getPhase goes into the sample, actions go to battleAction
 {const actions=[];const e=env({phase:'menu',actions});e.c.sync(true);await flush();warm(e);e.c.processFrame(frame(1),1966);e.c.processFrame(paint(frame(),4,255),2000);for(let t=2033;t<=2800;t+=33)e.c.processFrame(t%2?frame():frame(1),t);
  ok(actions.join()==='attack'&&e.calls.press.length===0,'menu phase: a punch from stillness is battleAction(attack), no key ('+actions.join()+'; '+e.calls.press.join()+')');}
 {const e=env({phase:'menu'});e.c.sync(true);await flush();warm(e);e.c.processFrame(paint(frame(),4,255),2000);e.c.processFrame(frame(),2100);e.c.processFrame(frame(),2133);e.c.processFrame(paint(frame(),4,255),2400);
  ok(e.calls.press.join()==='z','getPhase menu without battleAction: gestures stay off, so the double-punch confirm still works');}
 {const actions=[];const e=env({phase:'menu',actions});e.c.sync(true);await flush();warm(e);e.c.processFrame(frame(1),1966);e.c.processFrame(paint(frame(),4,255),2000);e.c.processFrame(frame(),2033);e.bumpGen();for(let t=2066;t<=2900;t+=33)e.c.processFrame(t%2?frame():frame(1),t);
  ok(actions.length===0,'a pause drops the gesture ring: the pending punch never becomes ATTACK');}
 {const actions=[];const e=env({phase:'menu',actions});e.c.sync(true);await flush();warm(e);e.inputOpen=false;e.c.processFrame(frame(1),1966);e.c.processFrame(paint(frame(),4,255),2000);for(let t=2033;t<=2800;t+=33)e.c.processFrame(t%2?frame():frame(1),t);
  ok(actions.length===0,'closed input (a modal): no battleAction');}
 {// guard command + phase: the guard gesture presses too, dated back to when the forearms stopped
  const e=env({phase:'command',command:{kind:'guard',ready:true,waitingRelease:false,held:false}});e.c.sync(true);await flush();warm(e);const band=v=>paint(paint(frame(),3,v),4,v);
  e.c.processFrame(frame(1),1966);e.c.processFrame(band(255),2000);for(let t=2033;t<=2400;t+=33)e.c.processFrame(band(t%2?255:254),t);
  const ins=e.calls.input;ok(ins.length===2&&ins.every(x=>x[0]===true),'guard command: the onset press, then the guard gesture press ('+ins.length+')');
  const lagged=.5-.12*W.LAG_SCALE;ok(ins.length===2&&Math.abs(ins[0][2]-lagged)<1e-9&&ins[1][2]<lagged-W.GESTURE.GUARD_HOLD_MS/1000*W.LAG_SCALE+1e-9&&ins[1][2]>=lagged-W.GESTURE.BACKDATE_MAX_MS/1000*W.LAG_SCALE-1e-9,'the guard gesture press is back-dated by its hold in COMMAND time (hold x LAG_SCALE, hold <= BACKDATE_MAX_MS)');
  ok(ins.length===2&&Math.abs(ins[1][2]-(lagged-.231*W.LAG_SCALE))<1e-9,'back-date is exact: 231 ms of hold = '+(.231*W.LAG_SCALE).toFixed(4)+' s of command time');}
 {const e=env({phase:'command',command:strike});e.c.sync(true);await flush();warm(e);const band=v=>paint(paint(frame(),3,v),4,v);e.c.processFrame(frame(1),1966);e.c.processFrame(band(255),2000);for(let t=2033;t<=2400;t+=33)e.c.processFrame(band(t%2?255:254),t);
  ok(e.calls.input.length===1,'strike command: the guard gesture adds nothing (only the punch onset presses)');}
}
controllerTests().then(()=>{
 ok(randomCalls===0,'webcam module never calls Math.random');
 ok(!/Math\.random|Date\.now/.test(fs.readFileSync(__dirname+'/webcam.js','utf8').split('function createWebcamController')[0]),'pure layers never read Math.random/Date.now');
 console.log('webcam: '+checks+' checks passed');
}).catch(e=>{console.error(e);process.exitCode=1;});
