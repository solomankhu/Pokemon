# Webcam Battle Controls Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let the player time MONSTER TRAIL battle commands and navigate battle menus with body motion seen by the webcam (browser build only, opt-in, off by default).

**Architecture:** New `combat/webcam.js` with three layers: a pure frame classifier, a pure tracker state machine that turns motion into input intents, and a browser controller that owns `getUserMedia` and feeds intents into the game's *existing* `commandInput` / `press` / `release` seams. Settings are extended in `combat/commands.js`; the settings rows, calibration card, camera badge and toasts go in `combat/host.js`; `claude's monsters.html` gets two small helpers (`commandClock`, a pause counter), the wiring and the lifecycle call in its frame loop.

**Tech Stack:** Plain browser JS (UMD modules like the other `combat/*.js`), `getUserMedia`, Canvas 2D `getImageData`, Node `assert` tests run by `combat/verify.cjs`.

**Spec:** `docs/superpowers/specs/2026-10-18-webcam-battle-controls-design.md` (approved 2026-10-18). Read it first; this plan implements it exactly.

---

## Ground rules for every task

- **No Git.** Before the first edit to an existing file, copy it to
  `.superpowers/sdd/2026-10-18-webcam-battle-controls/` (Task 0). The "commit" step of
  each task is replaced by **running the gate** below.
- **Gate:** `node .claude/scripts/verify.js --auto` (whole repo) and, while iterating,
  `node combat/verify.cjs`. Never pipe a suite through `tail`/`head`, which hides the exit code.
- Filenames with spaces/apostrophes must be quoted: `"claude's monsters.html"`.
- Code style: match the compact style of the existing `combat/*.js` files (UMD wrapper,
  `'use strict'`, short helpers). Tests follow `combat/commands.test.js`: `assert`, a
  `checks` counter, `ok(v,msg)`, and a final `console.log` of the count.
- **Never** use `Math.random` or `Date.now` in `combat/webcam.js` layers 1-2. Time is
  passed in.
- Do not touch `claude's monsters.py`, `combat/commands.py`, shared tables, MAP,
  `campaign.js` or `gemini's code.html`.

## File map

| File | Responsibility |
|---|---|
| `combat/webcam.js` (new) | Constants, `classifyMotion`, `createTracker`/`stepTracker`, `computeLag`, `toGray`, `lagToCommandTime`, `createWebcamController` |
| `combat/webcam.test.js` (new) | Classifier, tracker, computeLag, controller (stubbed browser), determinism |
| `combat/webcam-integration.test.js` (new) | Real `claude's monsters.html` loaded in `vm`: settings normalisation, `commandClock`, the pause counter, `webcamOptions` wiring, gesture-vs-key parity |
| `combat/webcam-host.test.js` (new) | `host.js` settings rows, Apply merge, calibration card, badge, notify |
| `combat/commands.js` | `normalizeSettings` gains 5 webcam keys |
| `combat/commands.test.js` | Settings tests for the new keys |
| `combat/host.js` | Fallback `settings()` passthrough, Apply merge, WEBCAM rows, `openCalibration`, camera badge, `notify` |
| `claude's monsters.html` | Script tag, `commandClock()`, `webcamPauseGen`, `webcamOptions()`, controller creation, frame-loop `sync`, `pagehide` dispose, `__GAME__` exports |
| `CLAUDE.md`, `docs/wiki/testing.md`, `docs/playtests/monster-trail.md` | Docs and a playtest duty |

---

## Chunk 1: Pure layers (classifier, tracker, lag)

### Task 0: Back up the files that will be edited

- [ ] **Step 1: Copy the sources**

```bash
cd /e/game && mkdir -p .superpowers/sdd/2026-10-18-webcam-battle-controls && cp combat/commands.js combat/commands.test.js combat/host.js "claude's monsters.html" CLAUDE.md docs/wiki/testing.md docs/playtests/monster-trail.md .superpowers/sdd/2026-10-18-webcam-battle-controls/
```

Expected: the 7 files are in the folder (`ls` it).

- [ ] **Step 2: Baseline gate**

Run: `node .claude/scripts/verify.js`
Expected: every check PASS. If anything is red **before** you start, stop and report it.

### Task 1: Module skeleton and `classifyMotion`

**Files:**
- Create: `combat/webcam.js`
- Create: `combat/webcam.test.js`

- [ ] **Step 1: Write the failing classifier tests**

Create `combat/webcam.test.js`:

```js
'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs');
assert.ok(fs.existsSync(__dirname+'/webcam.js'),'webcam module must exist');
const realRandom=Math.random;let randomCalls=0;Math.random=()=>{randomCalls++;return realRandom();};
const W=require('./webcam.js');let checks=0;
const ok=(v,m)=>{assert.ok(v,m);checks++;};
const near=(a,b,e,m)=>ok(Math.abs(a-b)<=e,m+' ('+a+' vs '+b+')');
const N=W.FRAME_W*W.FRAME_H;
function frame(v=0){return new Uint8Array(N).fill(v);}
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

module.exports={W,ok,near,frame,paint,get checks(){return checks;},get randomCalls(){return randomCalls;}};
if(require.main===module)finish();
function finish(){ok(randomCalls===0,'webcam module never calls Math.random');ok(!/Math\.random|Date\.now/.test(fs.readFileSync(__dirname+'/webcam.js','utf8')),'no Math.random/Date.now in source');console.log('webcam: '+checks+' checks passed');}
```

(The `module.exports`/`finish` scaffold is replaced by plain sequential code in Task 2; it keeps this step self-contained.)

- [ ] **Step 2: Run it and watch it fail**

Run: `node combat/webcam.test.js`
Expected: FAIL with `AssertionError: webcam module must exist`.

- [ ] **Step 3: Write the module skeleton and classifier**

Create `combat/webcam.js`:

```js
(function(root,factory){const api=factory(root);if(typeof module==='object'&&module.exports)module.exports=api;root.MonsterWebcam=api;})(typeof globalThis!=='undefined'?globalThis:this,function(global){
'use strict';
// Motion-zone webcam input for battles. Layers 1-2 are pure (no DOM, no clock, no random);
// only createWebcamController touches the browser. Spec: docs/superpowers/specs/2026-10-18-webcam-battle-controls-design.md
const FRAME_W=80,FRAME_H=60,BURST_MIN=.18,NOISY_MIN=.25,SWEEP_SPAN=.45,SWEEP_WINDOW_MS=400,CANCEL_MIN=.18,CANCEL_HOLD_MS=1500,COOLDOWN_MS=250,DOUBLE_MS=900,WARMUP_MS=1000,SETTLE_MS=500,LAG_SCALE=.55,LAG_MAX=300;
const THRESHOLDS=Object.freeze({LOW:40,MED:28,HIGH:18});
const ZERO9=Object.freeze([0,0,0,0,0,0,0,0,0]);
function zoneOf(x,y){return Math.min(2,Math.floor(y*3/FRAME_H))*3+Math.min(2,Math.floor(x*3/FRAME_W));}
const AREAS=(()=>{const a=[0,0,0,0,0,0,0,0,0];for(let y=0;y<FRAME_H;y++)for(let x=0;x<FRAME_W;x++)a[zoneOf(x,y)]++;return a;})();
function classifyMotion(prev,curr,opts){
 const o=opts||{},threshold=Number.isFinite(o.threshold)?o.threshold:THRESHOLDS.MED,floor=o.noiseFloor||ZERO9,mirror=o.mirror===true;
 const counts=[0,0,0,0,0,0,0,0,0];let moving=0,sx=0,sy=0;
 for(let y=0;y<FRAME_H;y++)for(let x=0;x<FRAME_W;x++){const i=y*FRAME_W+x;if(Math.abs(curr[i]-prev[i])<=threshold)continue;const mx=mirror?FRAME_W-1-x:x;counts[zoneOf(mx,y)]++;moving++;sx+=mx;sy+=y;}
 const zones=counts.map((c,z)=>Math.max(0,c/AREAS[z]-(Number(floor[z])||0)));
 const noisy=zones.filter(v=>v>=NOISY_MIN).length>=7;
 return {zones,total:moving/(FRAME_W*FRAME_H),centroidX:moving?sx/moving/(FRAME_W-1):null,centroidY:moving?sy/moving/(FRAME_H-1):null,event:noisy?'noisy':zones[4]>=BURST_MIN?'burst':null};
}
return {FRAME_W,FRAME_H,BURST_MIN,NOISY_MIN,SWEEP_SPAN,SWEEP_WINDOW_MS,CANCEL_MIN,CANCEL_HOLD_MS,COOLDOWN_MS,DOUBLE_MS,WARMUP_MS,SETTLE_MS,LAG_SCALE,LAG_MAX,THRESHOLDS,classifyMotion};
});
```

- [ ] **Step 4: Run the tests and check they pass**

Run: `node combat/webcam.test.js`
Expected: `webcam: 15 checks passed` (the count may differ by a few; there must be no AssertionError).

### Task 2: Tracker state machine

**Files:**
- Modify: `combat/webcam.js`, `combat/webcam.test.js`

- [ ] **Step 1: Turn the scaffold into a sequential test file and add tracker tests**

In `combat/webcam.test.js`, delete the `module.exports=...`, `if(require.main===module)finish();` and `function finish(){...}` lines. At the end of the file, append:

```js
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

ok(randomCalls===0,'webcam module never calls Math.random');
ok(!/Math\.random|Date\.now/.test(fs.readFileSync(__dirname+'/webcam.js','utf8').split('function createWebcamController')[0]),'pure layers never read Math.random/Date.now');
console.log('webcam: '+checks+' checks passed');
```

- [ ] **Step 2: Run it and watch it fail**

Run: `node combat/webcam.test.js`
Expected: FAIL with `TypeError: W.createTracker is not a function`.

- [ ] **Step 3: Implement the tracker**

In `combat/webcam.js`, insert before the `return {...}` line:

```js
// Menus need a DOUBLE burst (two onsets within DOUBLE_MS) to confirm, so one stray motion never picks a move or RUN.
function createTracker(){return {status:'idle',centreLow:true,lastOnsetMs:-Infinity,pendingBurstAt:null,trail:[],cancelSince:null,cancelFired:false};}
// One sample in, intents out. sample={motion, command:null|{kind,ready,waitingRelease,held}}. Pure: returns a new tracker.
function stepTracker(prev,sample,nowMs){
 const t={...prev,trail:prev.trail.slice()},intents=[],m=sample&&sample.motion,cmd=sample&&sample.command||null;
 if(!m)return {tracker:t,intents};
 if(m.event==='noisy'){t.status='noisy';t.trail=[];t.pendingBurstAt=null;t.cancelSince=null;t.centreLow=false;return {tracker:t,intents};}
 const z=m.zones;
 if(cmd)t.pendingBurstAt=null;
 // Menus only: sweeps and the two-hand cancel. A sweep swallows a pending confirm.
 if(!cmd){
  if(m.centroidX!==null&&m.total>0)t.trail.push({t:nowMs,x:m.centroidX,y:m.centroidY});
  t.trail=t.trail.filter(p=>nowMs-p.t<=SWEEP_WINDOW_MS);
  if(t.trail.length>=2){const a=t.trail[0],b=t.trail[t.trail.length-1],dx=b.x-a.x,dy=b.y-a.y;let key=null;
   if(Math.abs(dx)>SWEEP_SPAN&&Math.abs(dx)>=Math.abs(dy))key=dx>0?'arrowright':'arrowleft';else if(Math.abs(dy)>SWEEP_SPAN)key=dy>0?'arrowdown':'arrowup';
   if(key){intents.push({type:'key',key});t.trail=[];t.pendingBurstAt=null;t.lastOnsetMs=nowMs;t.centreLow=false;t.status='idle';return {tracker:t,intents};}}
  if(z[0]>=CANCEL_MIN&&z[2]>=CANCEL_MIN){if(t.cancelSince===null)t.cancelSince=nowMs;if(!t.cancelFired&&nowMs-t.cancelSince>=CANCEL_HOLD_MS){t.cancelFired=true;t.pendingBurstAt=null;intents.push({type:'key',key:'x'});}}
  else{t.cancelSince=null;t.cancelFired=false;}
 }else{t.trail=[];t.cancelSince=null;t.cancelFired=false;}
 if(z[4]<BURST_MIN/2)t.centreLow=true;
 if(t.centreLow&&z[4]>=BURST_MIN&&nowMs-t.lastOnsetMs>=COOLDOWN_MS){
  t.centreLow=false;t.lastOnsetMs=nowMs;
  if(!cmd){if(t.pendingBurstAt!==null&&nowMs-t.pendingBurstAt<=DOUBLE_MS){t.pendingBurstAt=null;intents.push({type:'key',key:'z'});}else t.pendingBurstAt=nowMs;}
  else if(!cmd.ready)intents.push({type:'arm'});
  else if(cmd.waitingRelease){}
  else if(cmd.kind==='strike'||cmd.kind==='guard')intents.push({type:'press',lagged:true});
  else intents.push({type:cmd.held?'release':'press',lagged:true});
 }
 if(t.pendingBurstAt!==null&&nowMs-t.pendingBurstAt>DOUBLE_MS)t.pendingBurstAt=null;
 const pressed=intents.some(i=>i.type==='press'&&cmd&&(cmd.kind==='charge'||cmd.kind==='catch')),released=intents.some(i=>i.type==='release');
 t.status=pressed?'holding':released||!cmd?'idle':cmd.held?'holding':'idle';
 return {tracker:t,intents};
}
```

and add `createTracker,stepTracker` to the returned object.

- [ ] **Step 4: Run the tests and check they pass**

Run: `node combat/webcam.test.js`
Expected: `webcam: <n> checks passed` with no AssertionError.

> If the "abandoned charge" case fails: when `cmd` becomes `null` the status must be `'idle'`, and nothing may be emitted. That is the `!cmd?'idle'` branch.

### Task 3: `computeLag`, `toGray`, `lagToCommandTime`

**Files:** Modify: `combat/webcam.js`, `combat/webcam.test.js`

- [ ] **Step 1: Add failing tests** (insert before the final `ok(randomCalls===0...` lines)

```js
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
```

- [ ] **Step 2: Run and watch it fail**

Run: `node combat/webcam.test.js` → FAIL `W.computeLag is not a function`.

- [ ] **Step 3: Implement** (before `return {...}`; add the three names to the returned object)

```js
function computeLag(onsets,rings){const n=Math.min(onsets.length,rings.length);if(!n)return null;const d=[];for(let i=0;i<n;i++)d.push(onsets[i]-rings[i]);d.sort((a,b)=>a-b);const mid=n%2?d[(n-1)/2]:(d[n/2-1]+d[n/2])/2;return Math.max(0,Math.min(LAG_MAX,Math.round(mid)));}
function toGray(rgba,out){for(let i=0,j=0;j<out.length;i+=4,j++)out[j]=(rgba[i]*77+rgba[i+1]*150+rgba[i+2]*29)>>8;return out;}
function lagToCommandTime(clock,lagMs){const lag=Number.isFinite(lagMs)?lagMs:0;return Math.max(0,clock-(lag/1000)*LAG_SCALE);}
```

- [ ] **Step 4: Pass**

Run: `node combat/webcam.test.js` → `webcam: <n> checks passed`.

- [ ] **Step 5: Gate**

Run: `node combat/verify.cjs` → exit code 0 (every `combat/*.test.js`, including the new one, passes).

---

## Chunk 2: Browser controller

### Task 4: `createWebcamController`

**Files:** Modify: `combat/webcam.js`, `combat/webcam.test.js`

The controller is the only browser-facing part. Its options (all injectable for tests):
`{global, doc, now, setTimeout, clearTimeout, getSettings, setSettings, getCommand, commandClock, pauseGeneration, isInputOpen, press, release, commandInput, onStatus}`.

Public API: `supported()`, `start()` (a Promise of the state), `stop()`, `dispose()`, `sync(active)`, `processFrame(gray, t)` (the per-sample pipeline, called by the timer; exported for tests), `measureFloor(ms)`, `setCalibrationListener(fn|null)`, and the getters `state`, `meter`, `video`, `noiseFloor`.

States: `off`, `starting`, `warmup`, `live`, `noisy`, `unavailable`, `denied`, `ended`.

- [ ] **Step 1: Add failing controller tests** (before the final `ok(randomCalls===0...` lines)

```js
// --- controller (stubbed browser) ---
class El{constructor(tag){this.tagName=tag;this.style={};this.children=[];this.attributes={};}appendChild(e){this.children.push(e);e.parentNode=this;return e;}removeChild(e){this.children.splice(this.children.indexOf(e),1);e.parentNode=null;}setAttribute(k,v){this.attributes[k]=v;}getContext(){return {drawImage(){},getImageData:()=>({data:new Uint8ClampedArray(N*4)})};}play(){return Promise.resolve();}}
function env(opts={}){
 const body=new El('body'),timers=new Map();let id=0,clock=0;const calls={gum:0,press:[],release:[],input:[],settings:[],status:[]};const tracks=[];let settings=Object.assign({webcam:'ON',webcamSensitivity:'MED',webcamMirror:true,webcamLagMs:120},opts.settings);
 const gum=opts.gum||(()=>{calls.gum++;const tr={stopped:false,on:{},stop(){this.stopped=true;},addEventListener(k,f){this.on[k]=f;}};tracks.push(tr);return Promise.resolve({getTracks:()=>[tr]});});
 const g={navigator:opts.noMedia?{}:{mediaDevices:{getUserMedia:(...a)=>{if(opts.gum)calls.gum++;return gum(...a);}}}};
 let gen=0,inputOpen=true,command=opts.command||null,clockVal=.5;
 const docStub={body,createElement:t=>new El(t),hidden:false};
 const c=W.createWebcamController({global:g,doc:docStub,now:()=>clock,setTimeout:(f,ms)=>{timers.set(++id,f);return id;},clearTimeout:i=>timers.delete(i),
  getSettings:()=>settings,setSettings:s=>{settings=s;calls.settings.push(s);},getCommand:()=>command,commandClock:()=>clockVal,pauseGeneration:()=>gen,isInputOpen:()=>inputOpen,
  press:k=>calls.press.push(k),release:k=>calls.release.push(k),commandInput:(p,r,at)=>calls.input.push([p,r,at]),onStatus:s=>calls.status.push(s)});
 return {c,body,timers,calls,tracks,set docHidden(v){docStub.hidden=v;},set clock(v){clock=v;},get clock(){return clock;},bumpGen(){gen++;},set inputOpen(v){inputOpen=v;},set command(v){command=v;},set clockVal(v){clockVal=v;},get settings(){return settings;}};
}
const flush=()=>new Promise(r=>setImmediate(r));
// drive warm-up to live with still frames: first frame discarded, floor measured over WARMUP_MS
function warm(e){e.c.processFrame(frame(),0);for(let t=33;t<=W.SETTLE_MS+W.WARMUP_MS+33;t+=33)e.c.processFrame(frame(),t);}
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
 {const e=env();e.c.sync(true);await flush();warm(e);e.c.processFrame(paint(frame(),4,255),2000);e.c.processFrame(frame(),2100);ok(e.calls.press.length===0,'single menu burst does nothing');e.c.processFrame(paint(frame(),4,255),2400);ok(e.calls.press.join()==='z','double burst presses confirm');e.c.processFrame(frame(),2433);ok(e.calls.release.join()==='z','released on the next sample');}
 {const e=env({command:strike});e.c.sync(true);await flush();warm(e);e.c.processFrame(frame(255),2000);ok(e.c.state==='noisy'&&e.calls.input.length===0,'noisy scene: no input');}
 {const e=env({command:strike});e.c.sync(true);await flush();const noisy=frame();for(let i=0;i<N;i+=7)noisy[i]=255;e.c.processFrame(frame(),0);for(let t=33;t<=W.SETTLE_MS+W.WARMUP_MS+33;t+=33)e.c.processFrame(t%66?noisy:frame(),t);ok(e.c.noiseFloor.some(v=>v>0),'busy room: floor measured per zone');ok(e.c.noiseFloor.every(v=>v<=W.BURST_MIN/2),'floor capped at half a burst');}
 {const e=env({command:strike});e.c.sync(true);await flush();e.c.processFrame(frame(),0);for(let t=33;t<W.SETTLE_MS;t+=33)e.c.processFrame(t%66?frame(255):frame(),t);for(let t=W.SETTLE_MS;t<=W.SETTLE_MS+W.WARMUP_MS+33;t+=33)e.c.processFrame(frame(),t);ok(e.c.noiseFloor.every(v=>v===0),'settle frames (exposure flicker) are not measured');}
 {const e=env();e.c.sync(true);await flush();warm(e);e.c.processFrame(paint(frame(),4,255),2000);e.c.processFrame(frame(),2300);e.c.processFrame(paint(frame(),4,255),2400);ok(e.calls.press.join()==='z','pending key');e.c.sync(false);ok(e.calls.release.join()==='z','stopping releases the pending key');}
 {const e=env();e.c.sync(true);await flush();const [id,f]=[...e.timers][0];e.timers.delete(id);e.docHidden=true;f();ok(e.c.state==='off'&&e.tracks[0].stopped,'hidden tab: sampler stops the camera itself');}
 {let resolve;const e=env({gum:()=>new Promise(r=>resolve=r)});e.c.sync(true);e.c.sync(false);e.c.sync(true);const tr={stopped:false,stop(){this.stopped=true;},addEventListener(){}};resolve({getTracks:()=>[tr]});await flush();ok(e.calls.gum===1&&!tr.stopped&&e.c.state==='warmup','a blur during the permission prompt does not abort or re-prompt');}
 {const e=env({command:strike});e.c.sync(true);await flush();warm(e);ok(e.calls.input.length===0,'no dispatch during warm-up');e.c.processFrame(paint(frame(),4,255),3000);ok(e.calls.input.length===1,'first burst after warm-up is not mistaken for a pause');}
 {const e=env();e.c.sync(true);await flush();warm(e);const seen=[];e.c.setCalibrationListener((m,t)=>seen.push([m.event,t]));e.inputOpen=false;e.c.processFrame(paint(frame(),4,255),2000);ok(seen.length===1&&seen[0][0]==='burst','calibration listener sees motion while input is closed');e.c.setCalibrationListener(null);}
 {const e=env();e.c.sync(true);await flush();warm(e);e.c.measureFloor(2000);ok(e.c.state==='warmup','measureFloor restarts warm-up');}
 {const e=env();e.c.sync(true);await flush();e.c.dispose();ok(e.tracks[0].stopped&&e.timers.size===0,'dispose stops everything');e.c.sync(true);ok(e.calls.gum===1,'disposed controller never restarts');}
}
controllerTests().then(()=>{
 ok(randomCalls===0,'webcam module never calls Math.random');
 ok(!/Math\.random|Date\.now/.test(fs.readFileSync(__dirname+'/webcam.js','utf8').split('function createWebcamController')[0]),'pure layers never read Math.random/Date.now');
 console.log('webcam: '+checks+' checks passed');
}).catch(e=>{console.error(e);process.exitCode=1;});
```

Then **delete** the earlier two `ok(randomCalls...)` lines and the `console.log` that ended the file, because the `.then` block now replaces them.

- [ ] **Step 2: Run and watch it fail**

Run: `node combat/webcam.test.js` → FAIL `W.createWebcamController is not a function` (printed by the `.catch`, exit code 1).

- [ ] **Step 3: Implement the controller** (before `return {...}`; add `createWebcamController` to the returned object)

```js
function createWebcamController(o){
 const g=o.global||global,doc=o.doc||g.document,now=o.now||(()=>g.performance.now()),setT=o.setTimeout||((f,ms)=>g.setTimeout(f,ms)),clearT=o.clearTimeout||(id=>g.clearTimeout(id));
 const gen=()=>o.pauseGeneration?o.pauseGeneration():0;
 let stream=null,video=null,ctx=null,timer=null,prev=null,tracker=createTracker(),state='off',token=0,failed=false,disposed=false,wantStop=false;
 let warmupMs=WARMUP_MS,settleMs=0,startedAt=0,floorAcc=null,floorN=0,noiseFloor=ZERO9.slice(),lastGen=gen(),pendingRelease=null,slow=0,fast=0,interval=33,meter=0,listener=null;
 const settings=()=>o.getSettings?o.getSettings()||{}:{};
 function setState(s){if(s===state)return;state=s;if(o.onStatus)o.onStatus(s);}
 function supported(){const md=g.navigator&&g.navigator.mediaDevices;return !!(md&&typeof md.getUserMedia==='function');}
 function stopTracks(s){try{for(const t of s.getTracks())t.stop();}catch(_){}}
 function turnOff(){if(o.setSettings)o.setSettings(Object.assign({},settings(),{webcam:'OFF'}));}
 // halt releases a key it pressed: a stuck keys['z'] would swallow the next real press, and a stuck arrow would walk the player.
 function halt(){token++;wantStop=false;if(timer!==null){clearT(timer);timer=null;}if(stream){stopTracks(stream);stream=null;}if(video){video.srcObject=null;if(video.parentNode)video.parentNode.removeChild(video);video=null;}ctx=null;prev=null;if(pendingRelease){const k=pendingRelease;pendingRelease=null;if(o.release)o.release(k);}tracker=createTracker();meter=0;}
 function stop(){halt();setState('off');}
 function fail(reason){halt();failed=true;setState(reason);turnOff();}
 // Always enters warm-up, even with no stream, so processFrame can be driven headless by tests.
 // settle: frames ignored first (camera auto-exposure), then the floor is averaged over ms.
 function measureFloor(ms,settle){warmupMs=Number.isFinite(ms)?ms:WARMUP_MS;settleMs=Number.isFinite(settle)?settle:0;startedAt=now();floorAcc=[0,0,0,0,0,0,0,0,0];floorN=0;prev=null;lastGen=gen();setState('warmup');}
 function start(){
  if(disposed)return Promise.resolve(state);
  if(stream||state==='starting')return Promise.resolve(state);
  if(!supported()){fail('unavailable');return Promise.resolve(state);}
  const my=++token;setState('starting');
  let request;try{request=g.navigator.mediaDevices.getUserMedia({video:{width:160,height:120},audio:false});}catch(e){request=Promise.reject(e);}
  return Promise.resolve(request).then(s=>{
   if(my!==token||disposed||wantStop){stopTracks(s);wantStop=false;if(my===token&&!disposed)setState('off');return state;}
   // Not display:none: some browsers (Safari/iOS) stop decoding hidden video. A 1px transparent element keeps frames flowing.
   stream=s;video=doc.createElement('video');video.muted=true;video.setAttribute('playsinline','');video.setAttribute('aria-hidden','true');Object.assign(video.style,{position:'fixed',left:'0',top:'0',width:'1px',height:'1px',opacity:'0',pointerEvents:'none'});video.srcObject=s;doc.body.appendChild(video);
   try{const p=video.play&&video.play();if(p&&p.catch)p.catch(()=>{});}catch(_){}
   const canvas=doc.createElement('canvas');canvas.width=FRAME_W;canvas.height=FRAME_H;ctx=canvas.getContext('2d',{willReadFrequently:true});
   for(const t of s.getTracks())if(t.addEventListener)t.addEventListener('ended',()=>{if(stream===s)fail('ended');});
   tracker=createTracker();interval=33;slow=fast=0;measureFloor(WARMUP_MS,SETTLE_MS);schedule();return state;
  },err=>{if(my!==token||disposed)return state;wantStop=false;fail(err&&(err.name==='NotAllowedError'||err.name==='SecurityError')?'denied':'unavailable');return state;});
 }
 function schedule(){if(stream&&timer===null)timer=setT(tick,interval);}
 function tick(){timer=null;if(!ctx||!video)return;
  // rAF pauses in a hidden tab, so the game's frame loop can't stop the camera there; the sampler stops itself.
  if(doc&&doc.hidden){stop();return;}
  const t0=now();let gray=null;
  try{ctx.drawImage(video,0,0,FRAME_W,FRAME_H);gray=toGray(ctx.getImageData(0,0,FRAME_W,FRAME_H).data,new Uint8Array(FRAME_W*FRAME_H));}catch(_){}
  if(gray)processFrame(gray,t0);
  const cost=now()-t0;slow=cost>8?slow+1:0;fast=cost<4?fast+1:0;if(slow>=3)interval=66;else if(fast>=60)interval=33;schedule();}
 function processFrame(curr,t){
  if(pendingRelease){const k=pendingRelease;pendingRelease=null;if(o.release)o.release(k);}
  const p=prev;prev=curr;if(!p)return;
  const s=settings(),threshold=THRESHOLDS[s.webcamSensitivity]||THRESHOLDS.MED,mirror=s.webcamMirror!==false;
  if(state==='warmup'){
   if(video&&video.readyState!==undefined&&video.readyState<2){startedAt=t;return;}   // camera not delivering frames yet
   const raw=classifyMotion(p,curr,{threshold,mirror});meter=raw.total;if(listener)listener(raw,t);
   if(t-startedAt<settleMs)return;
   for(let z=0;z<9;z++)floorAcc[z]+=raw.zones[z];floorN++;
   // The floor is capped at half a burst, so a noisy warm-up can never make bursts undetectable.
   if(t-startedAt>=settleMs+warmupMs){noiseFloor=floorAcc.map(v=>Math.min(BURST_MIN/2,v/Math.max(1,floorN)));lastGen=gen();setState('live');}return;}
  const motion=classifyMotion(p,curr,{threshold,noiseFloor,mirror});meter=motion.total;if(listener)listener(motion,t);
  const g2=gen(),paused=g2!==lastGen;lastGen=g2;
  const r=stepTracker(tracker,{motion,command:o.getCommand?o.getCommand():null},t);tracker=r.tracker;
  setState(tracker.status==='noisy'?'noisy':'live');
  if(paused){tracker={...tracker,centreLow:false,pendingBurstAt:null};return;}
  if(o.isInputOpen&&!o.isInputOpen())return;
  for(const i of r.intents)dispatch(i,s);
 }
 function dispatch(i,s){
  if(i.type==='arm'){o.commandInput(true,false);o.commandInput(false,true);}
  else if(i.type==='press'||i.type==='release'){const at=lagToCommandTime(o.commandClock(),s.webcamLagMs);if(i.type==='press')o.commandInput(true,false,at);else o.commandInput(false,true,at);}
  else if(i.type==='key'){o.press(i.key);pendingRelease=i.key;}
 }
 // While a permission request is pending, sync(false) only marks wantStop: aborting would turn a
 // prompt-induced blur into prompt -> blur -> abort -> focus -> prompt again. The stream is closed when it arrives.
 function sync(active){if(disposed)return;if(active){wantStop=false;if(!failed&&!stream&&state!=='starting')start();}else{failed=false;if(state==='starting'){wantStop=true;return;}if(stream||state==='warmup'||state==='live'||state==='noisy')stop();}}
 function dispose(){if(disposed)return;halt();disposed=true;listener=null;setState('off');}
 return {supported,start,stop,dispose,sync,processFrame,measureFloor,setCalibrationListener(fn){listener=typeof fn==='function'?fn:null;},
  get state(){return state;},get meter(){return meter;},get video(){return video;},get noiseFloor(){return noiseFloor.slice();}};
}
```

- [ ] **Step 4: Pass**

Run: `node combat/webcam.test.js` → `webcam: <n> checks passed`, exit code 0.

Notes if a test fails:
- *"denied turns OFF"*: `fail()` must run `turnOff()` **after** `setState(reason)`, so the status is reported before settings change.
- *"no re-prompt until sync(false)"*: the `failed` latch must only clear in `sync(false)`.
- *"10 cycles leave nothing behind"*: `halt()` must clear the timer even when `stream` is null.

- [ ] **Step 5: Gate:** `node combat/verify.cjs` → exit code 0.

---

## Chunk 3: Settings and host UI

### Task 5: Webcam keys in `normalizeSettings`

**Files:** Modify: `combat/commands.js:11`, `combat/commands.test.js`

- [ ] **Step 1: Failing tests.** In `combat/commands.test.js`, after line 15 (`'explicit basic mode'`), add:

```js
{const d=C.normalizeSettings({});ok(d.webcam==='OFF'&&d.webcamSensitivity==='MED'&&d.webcamMirror===true&&d.webcamLagMs===120&&d.webcamCalibrated===false,'webcam defaults');}
{const j=C.normalizeSettings({webcam:'yes',webcamSensitivity:'MAX',webcamMirror:'no',webcamLagMs:'abc',webcamCalibrated:'true'});ok(j.webcam==='OFF'&&j.webcamSensitivity==='MED'&&j.webcamMirror===true&&j.webcamLagMs===120&&j.webcamCalibrated===false,'junk webcam values fall back');}
ok(C.normalizeSettings({webcam:'ON',webcamSensitivity:'HIGH',webcamMirror:false,webcamCalibrated:true}).webcam==='ON','webcam ON kept');
ok(C.normalizeSettings({webcamMirror:false}).webcamMirror===false,'mirror off kept');
ok(C.normalizeSettings({webcamLagMs:-1}).webcamLagMs===0&&C.normalizeSettings({webcamLagMs:301}).webcamLagMs===300,'lag clamps');
ok(C.normalizeSettings({webcamLagMs:'150'}).webcamLagMs===150&&C.normalizeSettings({webcamLagMs:NaN}).webcamLagMs===120&&C.normalizeSettings({webcamLagMs:null}).webcamLagMs===120,'lag parses strings, rejects NaN/null');
{const s=C.normalizeSettings({actionMode:'ASSIST',quality:'LOW',reducedMotion:true,basicMode:true});ok(s.actionMode==='ASSIST'&&s.quality==='LOW'&&s.reducedMotion&&s.basicMode,'old keys unchanged');}
```

- [ ] **Step 2: Fail:** `node combat/commands.test.js` → AssertionError `webcam defaults`.

- [ ] **Step 3: Implement.** In `combat/commands.js`, replace the `normalizeSettings` line (line 11) with:

```js
 function webcamLag(v){const n=typeof v==='string'&&v.trim()!==''?Number(v):v;return typeof n==='number'&&Number.isFinite(n)?Math.max(0,Math.min(300,Math.round(n))):120;}
 // webcam* keys belong to the browser-only webcam controls (combat/webcam.js); combat/commands.py deliberately omits them.
 function normalizeSettings(raw){const o=raw&&typeof raw==='object'?raw:{};return {actionMode:modes.includes(o.actionMode)?o.actionMode:'ON',quality:['HIGH','STANDARD','LOW'].includes(o.quality)?o.quality:'STANDARD',reducedMotion:o.reducedMotion===true,basicMode:o.basicMode===true,webcam:o.webcam==='ON'?'ON':'OFF',webcamSensitivity:['LOW','MED','HIGH'].includes(o.webcamSensitivity)?o.webcamSensitivity:'MED',webcamMirror:o.webcamMirror!==false,webcamLagMs:webcamLag(o.webcamLagMs),webcamCalibrated:o.webcamCalibrated===true};}
```

(Keep the original four keys' logic byte-for-byte. Only the five webcam keys are new.)

- [ ] **Step 4: Pass:** `node combat/commands.test.js` passes; `.venv/Scripts/python.exe combat/commands_py_test.py` is still OK (Python untouched).

### Task 6: `host.js`: settings passthrough, Apply merge, WEBCAM rows, notify

**Files:** Modify: `combat/host.js` (lines 5, 17, 33, 34); Create: `combat/webcam-host.test.js`

`host.js` is written as long single lines, so make each edit by exact substring replacement.

- [ ] **Step 1: Failing tests.** Create `combat/webcam-host.test.js`:

```js
'use strict';
const assert=require('assert');let checks=0;const ok=(v,m)=>{assert(v,m);checks++;};
class El{constructor(tag){this.tagName=tag;this.style={};this.children=[];this.listeners={};this.attributes={};this.value='';this.textContent='';}appendChild(e){this.children.push(e);e.parentNode=this;return e;}removeChild(e){this.children.splice(this.children.indexOf(e),1);e.parentNode=null;}setAttribute(k,v){this.attributes[k]=v;}addEventListener(k,f){this.listeners[k]=f;}removeEventListener(k){delete this.listeners[k];}focus(){}getBoundingClientRect(){return {left:20,top:30,width:640,height:480};}getContext(){return {drawImage(){},strokeRect(){},fillRect(){},clearRect(){}};}click(){if(this.onclick)this.onclick({stopPropagation(){},preventDefault(){}});}}
global.document={body:new El('body'),createElement:t=>new El(t)};global.THREE={};global.MonsterCommands=require('./commands.js');
global.MonsterPresenter={createBattlePresenter(){return {diagnostics:{ready:true},enter(){return true;},sync(){},update(){},render(){},suspend(){},resume(){},leave(){},dispose(){}};}};
const W=require('./webcam.js');
function all(e){return [e,...e.children.flatMap(all)];}
const find=t=>all(document.body).find(e=>e.textContent===t);
const wait=ms=>new Promise(r=>setTimeout(r,ms));
let settings={actionMode:'ON',quality:'STANDARD'},saves=0,modal=false;let listener=null;
const cam={state:'live',meter:.3,video:null,stops:0,floors:0,supported:()=>true,stop(){this.stops++;this.state='off';},measureFloor(){this.floors++;},setCalibrationListener(fn){listener=fn;}};
let clock=0;
const H=require('./host.js');const canvas=new El('canvas');canvas.parentNode=new El('div');
const host=H.createHost({canvas,species:{},getSettings:()=>settings,setSettings:s=>settings=s,save:()=>{saves++;return true;},onModal:v=>modal=v,onInputReset:()=>{},webcam:cam,now:()=>clock,calibrationTiming:{still:20,lead:30,miss:400,poll:5}});
async function run(){
 host.sync({mine:{id:'emberling'}},.016);await wait(10);
 // settings rows
 host.openSettings();const selects=all(document.body).filter(e=>e.tagName==='select');
 ok(selects.length===4,'action, quality, webcam, sensitivity selects');ok(selects[2].value==='OFF'&&selects[3].value==='MED','webcam rows show current values');
 ok(find('Calibrate webcam'),'calibrate button');ok(find('Calibrate webcam').disabled===true&&find('Calibrate during a battle with the webcam ON.'),'calibrate disabled while webcam OFF');
 selects[3].value='HIGH';find('Apply settings').click();ok(settings.webcamSensitivity==='HIGH'&&settings.webcamLagMs===120,'apply keeps webcam keys');
 settings=Object.assign({},settings,{webcamLagMs:200,webcamCalibrated:true});find('Apply settings').click();ok(settings.webcamLagMs===200&&settings.webcamCalibrated===true,'apply does not wipe calibration');
 find('Close').click();ok(!modal,'closed');
 // turning ON while uncalibrated opens calibration
 settings=Object.assign({},settings,{webcamCalibrated:false});host.openSettings();all(document.body).filter(e=>e.tagName==='select')[2].value='ON';find('Apply settings').click();
 ok(settings.webcam==='ON','webcam ON persisted');ok(host.diagnostics.calibration&&host.diagnostics.calibration.step==='still','calibration opens when uncalibrated');ok(cam.floors===1,'calibration measures the floor');ok(modal,'calibration is modal');
 // still -> rings; three punches 100 ms late
 await wait(40);ok(host.diagnostics.calibration.step==='rings','rings after the still step');
 const M=z=>({zones:[0,0,0,0,z,0,0,0,0],total:z,centroidX:.5,centroidY:.5,event:z>=W.BURST_MIN?'burst':null});
 for(let i=0;i<3;i++){const ringAt=host.diagnostics.calibration.ringAt;clock=ringAt+100;listener(M(.5),clock);listener(M(0),clock+10);await wait(5);}
 ok(host.diagnostics.calibration.step==='done'&&host.diagnostics.calibration.lag===100,'median lag measured');
 find('DONE').click();ok(settings.webcamLagMs===100&&settings.webcamCalibrated===true,'DONE saves lag and calibrated');ok(!modal&&listener===null,'DONE closes and detaches the listener');
 // TURN OFF keeps the calibration
 host.openCalibration();find('TURN OFF').click();ok(settings.webcam==='OFF'&&settings.webcamCalibrated===true&&settings.webcamLagMs===100,'TURN OFF keeps calibration');ok(cam.stops===1,'TURN OFF stops the camera');
 // a camera that dies during calibration stops the card instead of looping
 cam.state='live';host.openCalibration();cam.state='denied';await wait(30);ok(host.diagnostics.calibration.step==='failed'&&find('Camera unavailable: keyboard and touch still work.'),'dead camera: calibration reports failure');
 find('RETRY').click();await wait(20);ok(host.diagnostics.calibration.step==='failed','retry with a dead camera fails again, no loop');
 // Escape closes the card (same handler as the settings panel)
 const dlg=all(document.body).find(e=>e.attributes&&e.attributes.role==='dialog');dlg.listeners.keydown({key:'Escape',preventDefault(){},stopPropagation(){}});ok(!modal&&listener===null,'Escape closes calibration');
 // badge
 cam.state='live';host.sync({mine:{id:'emberling'}},.016);const badge=all(document.body).find(e=>e.attributes['aria-label']==='Webcam control on');ok(badge,'camera badge while live');
 cam.state='noisy';host.sync({mine:{id:'emberling'}},.016);ok(badge.title==='Too much motion','noisy badge title');
 cam.state='off';host.sync({mine:{id:'emberling'}},.016);ok(!all(document.body).includes(badge),'badge removed when off');
 // notify
 host.notify('Camera blocked: keyboard and touch still work.');ok(find('Camera blocked: keyboard and touch still work.'),'toast shown');
 // unsupported
 cam.supported=()=>false;host.openSettings();ok(all(document.body).filter(e=>e.tagName==='select')[2].disabled===true,'webcam row disabled when unsupported');ok(find('Webcam: not available in this browser.'),'unsupported message');find('Close').click();
 host.leave();ok(!all(document.body).some(e=>e.attributes&&e.attributes['aria-label']==='Webcam control on'),'leave removes the badge');
 host.dispose();
 console.log('webcam host: '+checks+' checks passed');
}
run().catch(e=>{console.error(e);process.exitCode=1;});
```

- [ ] **Step 2: Fail:** `node combat/webcam-host.test.js` → AssertionError `action, quality, webcam, sensitivity selects`.

- [ ] **Step 3a: Fallback `settings()` passthrough (line 5).** Replace the fallback object literal's opening
`:{actionMode:['ON','ASSIST','AUTO']` with `:{...raw,actionMode:['ON','ASSIST','AUTO']`, so the webcam keys survive when `MonsterCommands` is absent.

- [ ] **Step 3b: WEBCAM rows and the Apply merge (line 17).** In `openSettings`, replace this exact substring:

```js
const motion=check('Reduced motion','reducedMotion'),basic=check('Basic presentation (2D)','basicMode');const apply=el('button','Apply settings',panel),close=el('button','Close',panel);apply.onclick=()=>{const next={actionMode:mode.value,quality:quality.value,reducedMotion:motion.checked,basicMode:basic.checked};
```

with:

```js
const motion=check('Reduced motion','reducedMotion'),basic=check('Basic presentation (2D)','basicMode');const cam=options.webcam,camOk=!!(cam&&cam.supported());const webcamSel=select('Webcam control','webcam',['OFF','ON']),sens=select('Webcam sensitivity','webcamSensitivity',['LOW','MED','HIGH']),mirror=check('Mirror webcam','webcamMirror');if(!camOk){webcamSel.disabled=true;el('p','Webcam: not available in this browser.',panel);}const calibrate=el('button','Calibrate webcam',panel);calibrate.disabled=!(camOk&&diagnostics.active&&current.webcam==='ON');if(camOk&&calibrate.disabled)el('p','Calibrate during a battle with the webcam ON.',panel);calibrate.onclick=()=>openCalibration();const apply=el('button','Apply settings',panel),close=el('button','Close',panel);apply.onclick=()=>{const next=Object.assign(settings(),{actionMode:mode.value,quality:quality.value,reducedMotion:motion.checked,basicMode:basic.checked,webcam:webcamSel.value,webcamSensitivity:sens.value,webcamMirror:mirror.checked});
```

and replace the end of the same handler, `Object.assign(current,next);};close.onclick=closeModal;mode.focus();}`, with:

```js
Object.assign(current,next);if(camOk&&diagnostics.active&&next.webcam==='ON'&&!next.webcamCalibrated)openCalibration();};close.onclick=closeModal;mode.focus();}
```

> The existing basicMode/quality checks compare `current.*` with `next.*`, and `next` now has every key, so that logic is unchanged.

- [ ] **Step 3c: `notify` and the camera badge.** After the `function markBasic(){...}` line, add a new line:

```js
 let camBadge=null,toast=null,toastTimer=null;const now=options.now||(()=>global.performance.now());
 function notify(text){if(disposed)return;remove(toast);if(toastTimer!==null)global.clearTimeout(toastTimer);toast=el('div',String(text),doc.body);toast.setAttribute('role','status');Object.assign(toast.style,{position:'fixed',zIndex:'1001',left:'50%',top:'12px',transform:'translateX(-50%)',background:'#3a2a12',color:'#fff',font:'bold 13px system-ui',padding:'8px 12px',borderRadius:'4px',pointerEvents:'none'});toastTimer=global.setTimeout(()=>{remove(toast);toast=null;toastTimer=null;},3000);}
 function updateCamBadge(){const cam=options.webcam,live=!!cam&&diagnostics.active&&['warmup','live','noisy'].includes(cam.state);if(!live){remove(camBadge);camBadge=null;return;}if(!camBadge){camBadge=el('button','',doc.body);camBadge.setAttribute('aria-label','Webcam control on');Object.assign(camBadge.style,{position:'fixed',zIndex:'4',width:'92px',height:'24px',font:'bold 10px system-ui',color:'#fff',border:'1px solid #9ac3df',borderRadius:'4px',cursor:'pointer'});camBadge.onclick=e=>{if(e&&e.stopPropagation)e.stopPropagation();openSettings();};camBadge.addEventListener('keydown',e=>e.stopPropagation());camBadge.addEventListener('keyup',e=>e.stopPropagation());}const level=Math.max(0,Math.min(5,Math.round(cam.meter*10)));camBadge.textContent='CAM '+'#'.repeat(level)+'.'.repeat(5-level);camBadge.style.background=cam.state==='noisy'?'#8a5a00':'#20354a';camBadge.title=cam.state==='noisy'?'Too much motion':cam.state==='warmup'?'Webcam warming up':'Webcam control on';const r=canvas.getBoundingClientRect();Object.assign(camBadge.style,{left:r.left+r.width-118-100+'px',top:r.top+7+'px'});}   // left of the SETTINGS button, clear of the foe HP box at (24,28)
```

In `sync(snapshot,dt)`, insert `updateCamBadge();` immediately after `align();` (the first `align();` in `sync`). In `leave()`, change `remove(button);remove(badge);remove(loading);button=badge=loading=null;` to `remove(button);remove(badge);remove(loading);remove(camBadge);button=badge=loading=camBadge=null;`. In `dispose()`, after `leave();` add `remove(toast);toast=null;if(toastTimer!==null){global.clearTimeout(toastTimer);toastTimer=null;}`.

- [ ] **Step 3d: Export.** Change the returned object `{sync,isReady,is3D,openSettings,suspend,leave,dispose,` to `{sync,isReady,is3D,openSettings,openCalibration,notify,suspend,leave,dispose,`.

### Task 7: The calibration card in `host.js`

**Files:** Modify: `combat/host.js`

- [ ] **Step 1: Implement `openCalibration`.** Add this as a new line after `function openSettings(){...}`:

```js
 let calTimers=[];function calClear(){for(const t of calTimers)global.clearTimeout(t);calTimers=[];if(options.webcam&&options.webcam.setCalibrationListener)options.webcam.setCalibrationListener(null);diagnostics.calibration=null;}
 function openCalibration(){if(disposed||!options.webcam)return;const cam=options.webcam,W=global.MonsterWebcam||{},BURST=W.BURST_MIN||.18,T=Object.assign({still:2000,lead:1500,miss:800,poll:100},options.calibrationTiming);const panel=showModal('Webcam calibration');diagnostics.settingsOpen=true;   // lets Escape close the card like the settings panel
  const cal=diagnostics.calibration={step:'waiting',ringAt:0,rings:[],onsets:[],lag:null};
  const info=el('p','Stay still for 2 seconds.',panel),count=el('p','',panel),preview=el('canvas',null,panel);preview.width=160;preview.height=120;preview.setAttribute('aria-hidden','true');el('p','Move once to start a command, then punch on the timing. ASSIST timing is easier with a webcam.',panel);
  const done=el('button','DONE',panel),retry=el('button','RETRY',panel),off=el('button','TURN OFF',panel);done.disabled=true;
  const later=(f,ms)=>{const id=global.setTimeout(f,ms);calTimers.push(id);return id;};
  let low=true,missTimer=null;
  function nextRing(){if(diagnostics.calibration!==cal)return;if(DEAD.includes(cam.state)){whenLive(()=>{});return;}cal.ringAt=now()+T.lead;info.textContent='Punch when the count reaches NOW ('+(cal.rings.length+1)+'/3).';count.textContent='3';later(()=>{count.textContent='2';},T.lead/3);later(()=>{count.textContent='1';},T.lead*2/3);later(()=>{count.textContent='NOW';},T.lead);missTimer=later(()=>{info.textContent='Missed - try again.';nextRing();},T.lead+T.miss);}
  const DEAD=['off','denied','ended','unavailable'];
  // Each phase waits for the camera to be live (permission granted, warm-up done) instead of trusting a timer;
  // a camera that dies mid-card stops the card instead of looping "Missed".
  function whenLive(f){if(diagnostics.calibration!==cal)return;if(DEAD.includes(cam.state)){cal.step='failed';info.textContent='Camera unavailable: keyboard and touch still work.';count.textContent='';done.disabled=true;return;}if(cam.state==='live')f();else later(()=>whenLive(f),T.poll);}
  function begin(){cal.step='waiting';cal.rings=[];cal.onsets=[];cal.lag=null;done.disabled=true;info.textContent='Waiting for the camera...';count.textContent='';
   whenLive(()=>{cal.step='still';info.textContent='Stay still for 2 seconds.';cam.measureFloor(T.still);later(()=>whenLive(()=>{cal.step='rings';nextRing();}),T.poll);});}
  cam.setCalibrationListener((motion,t)=>{
   try{const c=preview.getContext('2d');if(cam.video)c.drawImage(cam.video,0,0,160,120);for(let z=0;z<9;z++){const x=(z%3)*53,y=Math.floor(z/3)*40;c.strokeRect(x,y,53,40);if(motion.zones[z]>=BURST){c.fillStyle='rgba(255,200,0,.35)';c.fillRect(x,y,53,40);}}}catch(_){}
   const z4=motion.zones[4];if(z4<BURST/2){low=true;return;}if(!low||z4<BURST||cal.step!=='rings')return;low=false;
   if(t<cal.ringAt-500)return;
   if(missTimer!==null){global.clearTimeout(missTimer);missTimer=null;}cal.rings.push(cal.ringAt);cal.onsets.push(t);
   if(cal.onsets.length<3){later(nextRing,0);return;}
   cal.lag=W.computeLag?W.computeLag(cal.onsets,cal.rings):null;cal.step='done';count.textContent='';info.textContent='Measured delay: '+cal.lag+' ms. DONE saves it.';done.disabled=false;});
  done.onclick=()=>{if(cal.lag!==null)persist(Object.assign(settings(),{webcamLagMs:cal.lag,webcamCalibrated:true}));closeModal();};
  retry.onclick=()=>{for(const t of calTimers)global.clearTimeout(t);calTimers=[];begin();};
  off.onclick=()=>{cam.stop();persist(Object.assign(settings(),{webcam:'OFF'}));closeModal();};
  begin();done.focus&&retry.focus();}
```

Then make `closeModal` detach calibration first: change `function closeModal(){if(!modal)return;` to `function closeModal(){calClear();if(!modal)return;`.

> `showModal` already calls `closeModal()` first, so opening calibration from the settings panel replaces that panel. `closeModal` calls `disarm()`, which calls `onInputReset`, which is `releaseAll`. That bumps the pause counter in the HTML (Task 8), so no stale gesture survives a modal.

- [ ] **Step 2: Pass:** `node combat/webcam-host.test.js` → `webcam host: <n> checks passed`; `node combat/host.test.js` still passes (it uses `select[1]` for quality and finds buttons by text, and both are unchanged).

> If *"median lag measured"* fails: `ringAt` is read from `host.diagnostics.calibration`, so the `diagnostics` getter must return `calibration`. `Object.assign({},diagnostics,...)` copies it. The listener ignores onsets earlier than `ringAt - 500`, and the test punches 100 ms after.

- [ ] **Step 3: Gate:** `node combat/verify.cjs` → exit code 0.

---

## Chunk 4: Game wiring, docs, playtest

### Task 8: Wire the controller into `claude's monsters.html`

**Files:** Modify: `claude's monsters.html` (lines ~158, 1432, 1626-1632, 5525-5530, 5862-5900, 5957); Create: `combat/webcam-integration.test.js`

- [ ] **Step 1: Failing integration test.** Create `combat/webcam-integration.test.js`:

```js
'use strict';
const assert=require('node:assert/strict'),vm=require('node:vm'),fs=require('node:fs');
let checks=0;const ok=(v,m)=>{assert.ok(v,m);checks++;};
const W=require('./webcam.js');
function load(){const store={};const c={console,MonsterCommands:require('./commands.js'),MonsterWebcam:W,localStorage:{getItem:k=>store[k]||null,setItem:(k,v)=>store[k]=v}};c.globalThis=c;vm.runInNewContext(fs.readFileSync("claude's monsters.html",'utf8').match(/<script>([\s\S]*)<\/script>/)[1],c);return {g:c.__GAME__,c};}
const {g,c}=load(),G=g.G;
ok(fs.readFileSync("claude's monsters.html",'utf8').includes('<script src="combat/webcam.js"></script>'),'webcam module is loaded by the page');
ok(typeof g.commandClock==='function'&&typeof g.webcamOptions==='function'&&typeof g.webcamPauseGen==='function','webcam seams exported');
// G.settings round-trips the webcam keys through normalizeSettings
G.settings=g.normalizeCombatSettings({webcam:'ON',webcamLagMs:'90'});ok(G.settings.webcam==='ON'&&G.settings.webcamLagMs===90,'G.settings normalised with webcam keys');
// battle with a strike command
G.party=[g.makeMon('emberling',20)];G.settings=g.normalizeCombatSettings({actionMode:'ON'});g.startBattle(g.makeMon('sprigling',20));
const b=G.battle;b.queue=[];b.step=null;b.phase='anim';
ok(g.commandClock()===0,'no command: clock 0');
const before=g.webcamPauseGen();g.releaseAll();ok(g.webcamPauseGen()===before+1,'releaseAll bumps the pause counter');
// webcam-driven strike vs key-driven strike at the same command time give the same tier
const opts=g.webcamOptions();ok(opts.getCommand()===null,'no command yet');
const N=W.FRAME_W*W.FRAME_H,still=new Uint8Array(N),burst=new Uint8Array(N);for(let y=20;y<40;y++)for(let x=27;x<=53;x++)burst[y*W.FRAME_W+x]=255;
// No stream here: measureFloor(0) enters a zero-length warm-up, so two frames reach 'live' and
// processFrame is driven exactly as the sample timer would drive it.
// Arm with one burst, then strike.
{let r=null;g.qCommand(b,'strike',x=>{r=x;});g.pumpQueue(b,0);ok(opts.getCommand()&&opts.getCommand().kind==='strike','strike command visible to the controller');
 const s=G.settings;G.settings=Object.assign({},s,{webcamLagMs:0});
 const cam=W.createWebcamController(Object.assign({},opts,{global:{navigator:{}},now:()=>0}));
 cam.measureFloor(0);cam.processFrame(still,0);cam.processFrame(still,1);   // warm-up done (0 ms) -> live
 cam.processFrame(burst,100);ok(b.command.ready&&!b.command.waitingRelease,'first burst arms the command');
 cam.processFrame(still,200);g.pumpQueue(b,.65/.55);ok(Math.abs(b.command.elapsed-.65)<1e-9,'command clock advanced to the target');
 cam.processFrame(burst,500);g.pumpQueue(b,0);ok(r&&r.tier==='PERFECT','webcam strike on the target is PERFECT');
 let k=null;g.qCommand(b,'strike',x=>{k=x;});g.pumpQueue(b,0);g.commandInput(true,false);g.commandInput(false,true);g.pumpQueue(b,.65/.55);g.commandInput(true,false);g.pumpQueue(b,0);ok(k&&k.tier===r.tier,'same tier as the keyboard at the same time');
 G.settings=s;}
// pause counter: a modal between samples drops the lagged press
{let r=null;g.qCommand(b,'strike',x=>{r=x;});g.pumpQueue(b,0);const cam=W.createWebcamController(Object.assign({},opts,{global:{navigator:{}},now:()=>0}));
 cam.measureFloor(0);cam.processFrame(still,0);cam.processFrame(still,1);cam.processFrame(burst,100);cam.processFrame(still,200);g.pumpQueue(b,.3);
 g.releaseAll();cam.processFrame(burst,500);g.pumpQueue(b,0);ok(r===null,'press after a pause is dropped');
 b.command=null;b.step=null;}
function liveCam(){const cam=W.createWebcamController(Object.assign({},opts,{global:{navigator:{}},now:()=>0}));cam.measureFloor(0);cam.processFrame(still,0);cam.processFrame(still,1);return cam;}
const lag0=()=>{G.settings=Object.assign({},G.settings,{webcamLagMs:0});};
// a key that finishes a strike, then a webcam burst: exactly one result
{lag0();let n=0;g.qCommand(b,'strike',()=>{n++;});g.pumpQueue(b,0);g.commandInput(true,false);g.commandInput(false,true);g.pumpQueue(b,.3);g.commandInput(true,false);g.pumpQueue(b,0);ok(n===1&&!b.command,'key finished the strike');
 const cam=liveCam();cam.processFrame(burst,100);g.pumpQueue(b,0);ok(n===1,'a later webcam burst adds nothing');}
// a key-held charge is released by a webcam burst
{lag0();let r=null;g.qCommand(b,'charge',x=>{r=x;});g.pumpQueue(b,0);g.commandInput(true,false);g.commandInput(false,true);g.pumpQueue(b,.5);g.commandInput(true,false);g.pumpQueue(b,0);ok(b.command&&b.command.held&&!r,'charge held by the key');
 const cam=liveCam();g.pumpQueue(b,(.85-b.command.elapsed)/.55);cam.processFrame(burst,100);g.pumpQueue(b,0);ok(r&&r.tier==='PERFECT','webcam burst releases the key-held charge on target');}
// the activity rule behind the frame-loop sync
{const keep={mode:G.mode,settings:G.settings};G.settings=Object.assign({},G.settings,{webcam:'ON'});G.mode='battle';ok(g.webcamActive()===true,'active in a battle with ON');
 G.settings=Object.assign({},G.settings,{webcam:'OFF'});ok(g.webcamActive()===false,'inactive when OFF');G.settings=Object.assign({},G.settings,{webcam:'ON'});
 G.mode='overworld';ok(g.webcamActive()===false,'inactive outside battle');G.mode='battle';const saved=G.battle;G.battle=null;ok(g.webcamActive()===false,'inactive without a battle');G.battle=saved;
 G.mode=keep.mode;G.settings=keep.settings;}
// determinism: webcam-driven and key-driven strikes consume the same engine randomness
{vm.runInContext('globalThis.__rng=0;{const r=Math.random;Math.random=()=>{globalThis.__rng++;return r();};}',c);lag0();
 let a=null;g.qCommand(b,'strike',x=>{a=x;});g.pumpQueue(b,0);g.commandInput(true,false);g.commandInput(false,true);g.pumpQueue(b,.65/.55);g.commandInput(true,false);g.pumpQueue(b,0);const keyCalls=c.__rng;
 c.__rng=0;let w=null;g.qCommand(b,'strike',x=>{w=x;});g.pumpQueue(b,0);const cam=liveCam();cam.processFrame(burst,100);cam.processFrame(still,200);g.pumpQueue(b,.65/.55);cam.processFrame(burst,500);g.pumpQueue(b,0);
 ok(a&&w&&a.tier===w.tier,'same result');ok(c.__rng===keyCalls,'same Math.random call count ('+keyCalls+')');}
console.log('webcam integration: '+checks+' checks passed');
```

> This relies on `measureFloor` always entering `'warmup'` (Task 4), so `processFrame` works without a stream. In the vm, `lastBattleFrameAt` is 0, so `commandClock()` equals `b.command.elapsed` exactly.

- [ ] **Step 2: Fail:** `node combat/webcam-integration.test.js` → AssertionError `webcam module is loaded by the page`.

- [ ] **Step 3: Implement the HTML changes.**

1. **Script tag.** After `<script src="combat/commands.js"></script>` (line 158), add `<script src="combat/webcam.js"></script>`.
2. **State.** On line 1432, after `lastBattleFrameAt = 0;`, add on a new line:
   `let webcam = null, webcamPauseGen = 0;   // webcam battle controls (combat/webcam.js); the counter drops gestures that straddle a pause`
3. **`commandClock()`.** Directly above `function commandInput(pressed, released, at) {`, add:

```js
function commandClock() {
  const b=G.battle;if(!b||!b.command)return 0;
  const fractional=typeof performance!=='undefined' && lastBattleFrameAt ? Math.max(0,Math.min(.05,(performance.now()-lastBattleFrameAt)/1000))*.55 : 0;
  return b.command.elapsed+fractional;
}
```

   and in `commandInput` replace the two lines

```js
  const fractional=typeof performance!=='undefined' && lastBattleFrameAt ? Math.max(0,Math.min(.05,(performance.now()-lastBattleFrameAt)/1000))*.55 : 0;
  const pending=b.commandInput,eventAt=Number.isFinite(at)?at:b.command.elapsed+fractional;
```

   with

```js
  const pending=b.commandInput,eventAt=Number.isFinite(at)?at:commandClock();
```

4. **Pause counter.** In `releaseAll()`, make the first line of the body `webcamPauseGen++;`.
5. **Options builder.** Below `commandClock`, add:

```js
function normalizeCombatSettings(v) { return CombatCommands ? CombatCommands.normalizeSettings(v) : v; }
// Everything the webcam controller may touch: the same seams keyboard and touch use.
function webcamOptions() {
  return {
    getSettings: () => G.settings, setSettings: v => { G.settings = normalizeCombatSettings(v); saveGame(); },
    getCommand: () => (G.battle && G.battle.command) || null, commandClock, pauseGeneration: () => webcamPauseGen,
    isInputOpen: () => !combatModal && battleFocused, press, release, commandInput,
  };
}
const WEBCAM_MESSAGES = { denied: 'Camera blocked: keyboard and touch still work.', ended: 'Camera disconnected: keyboard and touch still work.', unavailable: 'Webcam: not available in this browser.' };
```

6. **Boot.** In `boot()`, replace `if(globalThis.MonsterBattleHost)battleHost=globalThis.MonsterBattleHost.createHost({` with

```js
  if(globalThis.MonsterWebcam)webcam=globalThis.MonsterWebcam.createWebcamController(Object.assign(webcamOptions(),{onStatus:s=>{if(battleHost&&WEBCAM_MESSAGES[s])battleHost.notify(WEBCAM_MESSAGES[s]);}}));
  window.addEventListener('pagehide',e=>{if(!webcam)return;if(e&&e.persisted)webcam.sync(false);else webcam.dispose();});   // bfcache: stop, stay reusable
  if(globalThis.MonsterBattleHost)battleHost=globalThis.MonsterBattleHost.createHost({webcam,
```

   and change `onModal:on=>{combatModal=on;}` to `onModal:on=>{combatModal=on;if(on)webcamPauseGen++;}`.

   **Blur and hidden must stop the camera directly.** `requestAnimationFrame` is paused in a hidden tab, so the frame loop alone would leave the camera on. Change the two existing handlers:
   - `window.addEventListener('blur',()=>{battleFocused=false;if(battleHost)battleHost.suspend();});` becomes `window.addEventListener('blur',()=>{battleFocused=false;if(battleHost)battleHost.suspend();if(webcam)webcam.sync(false);});`
   - In the `visibilitychange` handler, append `if(document.hidden&&webcam)webcam.sync(false);` inside its braces, after `battleHost.suspend();`.

   (The controller's own `tick` also stops itself when `document.hidden`, so this is covered twice.)
7. **Frame loop.** Above `function webcamOptions()`, add the single activity rule:

```js
// The camera may stream only here: in a battle, focused, not mid-descent, with the setting ON.
function webcamActive() { return !campaignBusy && G.mode === 'battle' && !!G.battle && battleFocused && G.settings.webcam === 'ON'; }
```

   and in `frame(now)`, directly after the `if(battleHost){...}` block, add:

```js
    if(webcam)webcam.sync(webcamActive());
```

   This covers battle end, descent (`campaignBusy`), focus, and OFF. It does **not** depend on `combatModal`, so the camera keeps running while the calibration card is open.
8. **Exports.** In `__GAME__`, after `commandInput,` add `commandClock, webcamOptions, webcamActive, normalizeCombatSettings, releaseAll, webcamPauseGen: () => webcamPauseGen,` and, next to `get battleHost(){...}`, add `get webcam(){return webcam;},`. `G`, `makeMon`, `pumpQueue`, `startBattle` and `saveGame` are already exported, so don't add them again. `releaseAll` is safe headless: `touchReset` returns early without touch elements.

- [ ] **Step 4: Pass**

Run: `node combat/webcam-integration.test.js` → `webcam integration: <n> checks passed`.
Run: `node combat/verify.cjs` → exit code 0.
Run: `node "claude's monsters.test.js"` → passes (expected count ≈ 3331, unchanged; the HTML suite doesn't use the webcam).

### Task 9: Docs and playtest duty

**Files:** Modify: `CLAUDE.md`, `docs/wiki/testing.md`, `docs/playtests/monster-trail.md`

- [ ] **Step 1: CLAUDE.md.** In the paragraph that starts `` `combat/` holds the 3D battle presentation``, append:
  "`combat/webcam.js` adds opt-in webcam battle controls (motion zones, no ML, no assets; spec `docs/superpowers/specs/2026-10-18-webcam-battle-controls-design.md`). Its pure classifier/tracker turn motion into the same `commandInput`/`press` calls keys use; the controller only streams while `G.mode === 'battle'`, focused and `G.settings.webcam === 'ON'`. Browser-only: `combat/commands.py` deliberately lacks the `webcam*` settings keys."
  In the bullet "**The HTML build has touch controls.**", add: "Webcam gestures (`combat/webcam.js`) are a third input source in battles only, feeding the same seams."
- [ ] **Step 2: `docs/wiki/testing.md`.** Under the combat suites, list `combat/webcam.test.js`, `combat/webcam-host.test.js` and `combat/webcam-integration.test.js`, each with a one-line description. **Update the suite count** in the `combat` row (`docs/wiki/testing.md:17` says "9 suites"; it becomes 12; recount with `ls combat/*.test.js`). Fix any other place that states that count (`grep -rn "9 suites" CLAUDE.md docs/`).
- [ ] **Step 3: Playtest duty.** Append to the table in `docs/playtests/monster-trail.md`:

```
| MT-16 | | Webcam battle controls (fake camera) | launch Chromium with `--use-fake-ui-for-media-stream --use-fake-device-for-media-stream`; battle → SETTINGS → Webcam control ON → Apply; complete or skip calibration; finish the battle; start a second battle | the calibration card renders with the preview; the `Webcam control on` badge shows in battle; after the battle `__GAME__.webcam.state === 'off'` and no `video` element remains; the second battle does not re-prompt; a battle that ends by a webcam double-burst confirm leaves `keys` all false; switching tabs mid-battle (`document.hidden`) stops the stream; after a reload with webcam ON saved, note whether the first battle re-prompts (report it, don't fail on it); with permission denied (`--deny-permission-prompts`, or the context's permissions cleared) the toast "Camera blocked: keyboard and touch still work." appears and the setting returns to OFF; the console is empty |
```

- [ ] **Step 4: Wiki drift:** run `node .claude/scripts/wiki-sync.js --summary` and fix any COUNT-DRIFT or UNDOCUMENTED finding it names.

### Task 10: Final gate

- [ ] **Step 1:** `node .claude/scripts/verify.js` → every check PASS (py, js, gemini, campaign, combat, combatpy, hooks, tables).
- [ ] **Step 2:** Confirm `.superpowers/sdd/2026-10-18-webcam-battle-controls/` holds the backups from Task 0.
- [ ] **Step 3:** Hand off to the game-reviewer and the playtester (`game: monster-trail`, `mode: duty`, duty `MT-16` plus the regressions `MT-04`, `MT-13` and `MT-14`). A real-webcam feel check is for the user.
