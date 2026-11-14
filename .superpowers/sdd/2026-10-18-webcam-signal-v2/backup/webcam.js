(function(root,factory){const api=factory(root);if(typeof module==='object'&&module.exports)module.exports=api;root.MonsterWebcam=api;})(typeof globalThis!=='undefined'?globalThis:this,function(global){
'use strict';
// Motion-zone webcam input for battles. Layers 1-2 are pure (no DOM, no clock, no random);
// only createWebcamController touches the browser. Spec: docs/superpowers/specs/2026-10-18-webcam-battle-controls-design.md
const FRAME_W=80,FRAME_H=60,BURST_MIN=.18,NOISY_MIN=.25,SWEEP_SPAN=.45,SWEEP_WINDOW_MS=400,CANCEL_MIN=.18,CANCEL_HOLD_MS=1500,COOLDOWN_MS=250,DOUBLE_MS=900,WARMUP_MS=1000,SETTLE_MS=500,READY_TIMEOUT_MS=3000,LAG_SCALE=.55,LAG_MAX=300;
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
function computeLag(onsets,rings){const n=Math.min(onsets.length,rings.length);if(!n)return null;const d=[];for(let i=0;i<n;i++)d.push(onsets[i]-rings[i]);d.sort((a,b)=>a-b);const mid=n%2?d[(n-1)/2]:(d[n/2-1]+d[n/2])/2;return Math.max(0,Math.min(LAG_MAX,Math.round(mid)));}
function toGray(rgba,out){for(let i=0,j=0;j<out.length;i+=4,j++)out[j]=(rgba[i]*77+rgba[i+1]*150+rgba[i+2]*29)>>8;return out;}
function lagToCommandTime(clock,lagMs){const lag=Number.isFinite(lagMs)?lagMs:0;return Math.max(0,clock-(lag/1000)*LAG_SCALE);}
function createWebcamController(o){
 const g=o.global||global,doc=o.doc||g.document,now=o.now||(()=>g.performance.now()),setT=o.setTimeout||((f,ms)=>g.setTimeout(f,ms)),clearT=o.clearTimeout||(id=>g.clearTimeout(id));
 const gen=()=>o.pauseGeneration?o.pauseGeneration():0;
 let stream=null,video=null,ctx=null,timer=null,prev=null,tracker=createTracker(),state='off',token=0,failed=false,disposed=false,wantStop=false;
 let warmupMs=WARMUP_MS,settleMs=0,prevT=0,readySince=null,bufs=[new Uint8Array(FRAME_W*FRAME_H),new Uint8Array(FRAME_W*FRAME_H)],bufI=0,startedAt=0,floorAcc=null,floorN=0,noiseFloor=ZERO9.slice(),lastGen=gen(),pendingRelease=null,slow=0,fast=0,interval=33,meter=0,listener=null;
 const settings=()=>o.getSettings?o.getSettings()||{}:{};
 function setState(s){if(s===state)return;state=s;if(o.onStatus)o.onStatus(s);}
 function supported(){const md=g.navigator&&g.navigator.mediaDevices;return !!(md&&typeof md.getUserMedia==='function');}
 function stopTracks(s){try{for(const t of s.getTracks())t.stop();}catch(_){}}
 function turnOff(){if(o.setSettings)o.setSettings(Object.assign({},settings(),{webcam:'OFF'}));}
 // halt releases a key it pressed: a stuck keys['z'] would swallow the next real press, and a stuck arrow would walk the player.
 function halt(){token++;wantStop=false;if(timer!==null){clearT(timer);timer=null;}if(stream){stopTracks(stream);stream=null;}if(video){video.srcObject=null;if(video.parentNode)video.parentNode.removeChild(video);video=null;}ctx=null;prev=null;if(pendingRelease){const k=pendingRelease;pendingRelease=null;if(o.release)o.release(k);}tracker=createTracker();meter=0;}
 function stop(){halt();setState('off');}
 // permanent=false (camera busy etc.) keeps the setting, so the next battle retries; the failed latch still stops retries this battle.
 function fail(reason,permanent){halt();failed=true;if(permanent!==false)turnOff();setState(reason);}
 // Always enters warm-up, even with no stream, so processFrame can be driven headless by tests.
 // settle: frames ignored first (camera auto-exposure), then the floor is averaged over ms.
 function measureFloor(ms,settle){warmupMs=Number.isFinite(ms)?ms:WARMUP_MS;settleMs=Number.isFinite(settle)?settle:0;startedAt=now();floorAcc=[0,0,0,0,0,0,0,0,0];floorN=0;prev=null;readySince=null;lastGen=gen();setState('warmup');}
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
  },err=>{if(my!==token||disposed)return state;wantStop=false;const perm=!!err&&(err.name==='NotAllowedError'||err.name==='SecurityError');fail(perm?'denied':'unavailable',perm);return state;});
 }
 function schedule(){if(stream&&timer===null)timer=setT(tick,interval);}
 function tick(){timer=null;if(!ctx||!video)return;
  // rAF pauses in a hidden tab, so the game's frame loop can't stop the camera there; the sampler stops itself.
  if(doc&&doc.hidden){stop();return;}
  const t0=now();let gray=null;
  try{ctx.drawImage(video,0,0,FRAME_W,FRAME_H);gray=toGray(ctx.getImageData(0,0,FRAME_W,FRAME_H).data,bufs[bufI]);bufI^=1;}catch(_){}   // ping-pong: prev is always the other buffer
  if(gray)processFrame(gray,t0);
  const cost=now()-t0;slow=cost>8?slow+1:0;fast=cost<4?fast+1:0;if(slow>=3)interval=66;else if(fast>=60)interval=33;schedule();}
 function processFrame(curr,t){
  // Any callback (release, listener, onStatus, press) may stop/dispose us: halt bumps token, and we bail.
  const my=token;
  if(pendingRelease){const k=pendingRelease;pendingRelease=null;if(o.release)o.release(k);if(my!==token)return;}
  const p=prev,pt=prevT;prev=curr;prevT=t;if(!p)return;
  const s=settings(),threshold=THRESHOLDS[s.webcamSensitivity]||THRESHOLDS.MED,mirror=s.webcamMirror!==false;
  if(state==='warmup'){
   if(video&&video.readyState!==undefined&&video.readyState<2){   // camera not delivering frames yet
    if(readySince===null)readySince=t;if(t-readySince>=READY_TIMEOUT_MS){fail('unavailable');return;}startedAt=t;return;}
   readySince=null;   // the ready timeout measures one continuous stall, not the total since the first stall
   const raw=classifyMotion(p,curr,{threshold,mirror});meter=raw.total;if(listener){listener(raw,t);if(my!==token)return;}
   // A diff spans two frames: skip it while its earlier frame is still settling. prevT cannot be stale here:
   // measureFloor and halt both null prev, so the first frame after either returns at !p and refreshes prevT.
   if(pt-startedAt<settleMs)return;
   for(let z=0;z<9;z++)floorAcc[z]+=raw.zones[z];floorN++;
   // The floor is capped at half a burst, so a noisy warm-up can never make bursts undetectable.
   if(t-startedAt>=settleMs+warmupMs){noiseFloor=floorAcc.map(v=>Math.min(BURST_MIN/2,v/Math.max(1,floorN)));lastGen=gen();setState('live');}return;}
  const motion=classifyMotion(p,curr,{threshold,noiseFloor,mirror});meter=motion.total;if(listener){listener(motion,t);if(my!==token)return;}
  const g2=gen(),paused=g2!==lastGen;lastGen=g2;
  const r=stepTracker(tracker,{motion,command:o.getCommand?o.getCommand():null},t);tracker=r.tracker;
  setState(tracker.status==='noisy'?'noisy':'live');if(my!==token)return;
  if(paused){tracker={...tracker,centreLow:false,pendingBurstAt:null};return;}
  if(o.isInputOpen&&!o.isInputOpen())return;
  for(const i of r.intents){if(my!==token)return;dispatch(i,s,my);}
 }
 function dispatch(i,s,my){
  if(i.type==='arm'){o.commandInput(true,false);o.commandInput(false,true);}
  else if(i.type==='press'||i.type==='release'){const at=lagToCommandTime(o.commandClock(),s.webcamLagMs);if(i.type==='press')o.commandInput(true,false,at);else o.commandInput(false,true,at);}
  else if(i.type==='key'){if(pendingRelease){const k=pendingRelease;pendingRelease=null;if(o.release)o.release(k);if(my!==token)return;}pendingRelease=i.key;o.press(i.key);}
 }
 // While a permission request is pending, sync(false) only marks wantStop: aborting would turn a
 // prompt-induced blur into prompt -> blur -> abort -> focus -> prompt again. The stream is closed when it arrives.
 function sync(active){if(disposed)return;if(active){wantStop=false;if(!failed&&!stream&&state!=='starting')start();}else{failed=false;if(state==='starting'){wantStop=true;return;}if(stream||state==='warmup'||state==='live'||state==='noisy')stop();}}
 function dispose(){if(disposed)return;halt();disposed=true;listener=null;setState('off');}
 return {supported,start,stop,dispose,sync,processFrame,measureFloor,setCalibrationListener(fn){listener=typeof fn==='function'?fn:null;},
  get state(){return state;},get meter(){return meter;},get video(){return video;},get noiseFloor(){return noiseFloor.slice();}};
}
return {FRAME_W,FRAME_H,BURST_MIN,NOISY_MIN,SWEEP_SPAN,SWEEP_WINDOW_MS,CANCEL_MIN,CANCEL_HOLD_MS,COOLDOWN_MS,DOUBLE_MS,WARMUP_MS,SETTLE_MS,READY_TIMEOUT_MS,LAG_SCALE,LAG_MAX,THRESHOLDS,classifyMotion,createTracker,stepTracker,computeLag,toGray,lagToCommandTime,createWebcamController};
});
