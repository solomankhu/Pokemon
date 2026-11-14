(function(root,factory){const api=factory(root);if(typeof module==='object'&&module.exports)module.exports=api;root.MonsterWebcam=api;})(typeof globalThis!=='undefined'?globalThis:this,function(global){
'use strict';
// Motion-zone webcam input for battles. Layers 1-2 are pure (no DOM, no clock, no random);
// only createWebcamController touches the browser. Spec: docs/superpowers/specs/2026-10-18-webcam-battle-controls-design.md
const FRAME_W=80,FRAME_H=60,BURST_MIN=.18,NOISY_MIN=.25,SWEEP_SPAN=.45,SWEEP_WINDOW_MS=400,CANCEL_MIN=.18,CANCEL_HOLD_MS=1500,COOLDOWN_MS=250,DOUBLE_MS=900,WARMUP_MS=1000,SETTLE_MS=500,READY_TIMEOUT_MS=3000,LAG_SCALE=.55,LAG_MAX=300;
const THRESHOLDS=Object.freeze({LOW:40,MED:28,HIGH:18});
const ZERO9=Object.freeze([0,0,0,0,0,0,0,0,0]);
function zoneOf(x,y){return Math.min(2,Math.floor(y*3/FRAME_H))*3+Math.min(2,Math.floor(x*3/FRAME_W));}
// Punch regions (display px, [x0,x1)x[y0,y1)): the middle-row cell grown into its neighbours, because a real fist
// straddles cell borders (a fist at the chin reaches into the bottom row). They overlap on purpose.
const PUNCH_RECT=Object.freeze({LEFT:Object.freeze([0,36,8,58]),CENTER:Object.freeze([16,64,8,58]),RIGHT:Object.freeze([44,80,8,58])});
function inPunch(zone,dx,y){const r=PUNCH_RECT[zone];return dx>=r[0]&&dx<r[1]&&y>=r[2]&&y<r[3];}
const PMAP=(()=>{const out={};for(const z of Object.keys(PUNCH_RECT)){out[z]=[0,1].map(mi=>{const a=new Uint8Array(FRAME_W*FRAME_H);for(let y=0;y<FRAME_H;y++)for(let x=0;x<FRAME_W;x++)a[y*FRAME_W+x]=inPunch(z,mi?FRAME_W-1-x:x,y)?1:0;return a;});}return out;})();
const PUNCH_NORM_PX=540;   // punch energy is per one 3x3 cell of area, whatever the region size, so regions differ only in reach
// Zone of each raw pixel, unmirrored [0] and mirrored [1], so the hot loop needs no division.
const ZMAP=(()=>{const a=[new Uint8Array(FRAME_W*FRAME_H),new Uint8Array(FRAME_W*FRAME_H)];for(let y=0;y<FRAME_H;y++)for(let x=0;x<FRAME_W;x++){a[0][y*FRAME_W+x]=zoneOf(x,y);a[1][y*FRAME_W+x]=zoneOf(FRAME_W-1-x,y);}return a;})();
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
function createTracker(){return {status:'idle',centreLow:true,lastOnsetMs:-Infinity,pendingBurstAt:null,trail:[],cancelSince:null,cancelFired:false,reason:null,lastSweepMs:-Infinity};}
// Burst level 0..: >=1 is an onset, <.5 re-arms. v2 motion carries punch/punchMin (fast-rise score in webcamZone);
// a legacy classifyMotion result falls back to zones[4]/BURST_MIN, so the old path behaves exactly as before.
function burstLevel(m){return typeof m.punch==='number'?m.punch/(m.punchMin>0?m.punchMin:PUNCH_DEFAULT):m.zones[4]/BURST_MIN;}
// Sweep from the trail. v2: the largest blob's travel, needing coherent block flow in the same direction.
function sweepKey(trail,flow){if(trail.length<2)return null;const a=trail[0],b=trail[trail.length-1],dx=b.x-a.x,dy=b.y-a.y;
 if(!flow){if(Math.abs(dx)>SWEEP_SPAN&&Math.abs(dx)>=Math.abs(dy))return dx>0?'arrowright':'arrowleft';if(Math.abs(dy)>SWEEP_SPAN)return dy>0?'arrowdown':'arrowup';return null;}
 if(Math.abs(dx)>SWEEP_SPAN_V2&&Math.abs(dx)>=Math.abs(dy)&&Math.sign(flow.dx)===Math.sign(dx)&&Math.abs(flow.dx)>=FLOW_MIN)return dx>0?'arrowright':'arrowleft';
 if(Math.abs(dy)>SWEEP_SPAN_V2&&Math.abs(dy)>Math.abs(dx)&&Math.sign(flow.dy)===Math.sign(dy)&&Math.abs(flow.dy)>=FLOW_MIN)return dy>0?'arrowdown':'arrowup';return null;}
// One sample in, intents out. sample={motion, command:null|{kind,ready,waitingRelease,held}}. Pure: returns a new tracker.
// tracker.reason explains a quiet tracker: 'noisy' | 'cooldown' (an onset came too soon) | 'confirm-pending' (one of two menu punches) | null.
function stepTracker(prev,sample,nowMs){
 const t={...prev,trail:prev.trail.slice(),reason:null},intents=[],m=sample&&sample.motion,cmd=sample&&sample.command||null;
 if(!m)return {tracker:t,intents};
 if(m.event==='noisy'){t.status='noisy';t.reason='noisy';t.trail=[];t.pendingBurstAt=null;t.cancelSince=null;t.centreLow=false;return {tracker:t,intents};}
 const z=m.zones,v2=!!m.blob,lv=burstLevel(m);
 // Two high hands are the cancel gesture, never a punch (including during commands).
 // Block on the lower corner threshold before the full cancel hold can mature.
 const twoHands=v2&&z[0]>=CANCEL_MIN/2&&z[2]>=CANCEL_MIN/2;
 if(twoHands){t.pendingBurstAt=null;t.trail=[];t.centreLow=false;
  if(!cmd&&z[0]>=CANCEL_MIN&&z[2]>=CANCEL_MIN){if(t.cancelSince===null)t.cancelSince=nowMs;if(!t.cancelFired&&nowMs-t.cancelSince>=CANCEL_HOLD_MS){t.cancelFired=true;intents.push({type:'key',key:'x'});}}
  else{t.cancelSince=null;t.cancelFired=false;}
  t.status='idle';return {tracker:t,intents};}

 if(cmd)t.pendingBurstAt=null;
 // Menus only: sweeps and the two-hand cancel. A sweep swallows a pending confirm.
 if(!cmd){
  if(v2){const bl=m.blob;if(bl.x!==null&&bl.area>=SWEEP_AREA_MIN){const last=t.trail[t.trail.length-1];if(last&&Math.hypot(bl.x-last.x,bl.y-last.y)>BLOB_JUMP)t.trail=[];t.trail.push({t:nowMs,x:bl.x,y:bl.y});}}
  else if(m.centroidX!==null&&m.total>0)t.trail.push({t:nowMs,x:m.centroidX,y:m.centroidY});
  t.trail=t.trail.filter(p=>nowMs-p.t<=SWEEP_WINDOW_MS);
  // v2: one sweep per SWEEP_REFRACT_MS, so a long pass (or the hand's way back) never gives a second or reversed arrow.
  const key=v2&&nowMs-(t.lastSweepMs??-Infinity)<SWEEP_REFRACT_MS?null:sweepKey(t.trail,v2?m.flow||{dx:0,dy:0}:null);
  if(key){intents.push({type:'key',key});t.lastSweepMs=nowMs;t.trail=[];t.pendingBurstAt=null;t.lastOnsetMs=nowMs;t.centreLow=false;t.status='idle';return {tracker:t,intents};}
  if(z[0]>=CANCEL_MIN&&z[2]>=CANCEL_MIN){if(t.cancelSince===null)t.cancelSince=nowMs;if(!t.cancelFired&&nowMs-t.cancelSince>=CANCEL_HOLD_MS){t.cancelFired=true;t.pendingBurstAt=null;intents.push({type:'key',key:'x'});}}
  else{t.cancelSince=null;t.cancelFired=false;}
 }else{t.trail=[];t.cancelSince=null;t.cancelFired=false;}
 if(lv<V2.REARM)t.centreLow=true;   // legacy: zones[4] < BURST_MIN/2
 // v2: an onset inside the (longer) punch cooldown is used up, so a fist's retract can't fire once the cooldown ends.
 const cool=v2?PUNCH_COOLDOWN_MS:COOLDOWN_MS;
 if(t.centreLow&&lv>=1&&nowMs-t.lastOnsetMs<cool){t.reason='cooldown';if(v2)t.centreLow=false;}
 else if(t.centreLow&&lv>=1){
  t.centreLow=false;t.lastOnsetMs=nowMs;
  if(!cmd){if(t.pendingBurstAt!==null&&nowMs-t.pendingBurstAt<=DOUBLE_MS){t.pendingBurstAt=null;intents.push({type:'key',key:'z'});}else t.pendingBurstAt=nowMs;}
  else if(!cmd.ready)intents.push({type:'arm'});
  else if(cmd.waitingRelease){}
  else if(cmd.kind==='strike'||cmd.kind==='guard')intents.push({type:'press',lagged:true});
  else intents.push({type:cmd.held?'release':'press',lagged:true});
 }
 if(t.pendingBurstAt!==null&&nowMs-t.pendingBurstAt>DOUBLE_MS)t.pendingBurstAt=null;
 if(!t.reason&&t.pendingBurstAt!==null)t.reason='confirm-pending';
 const pressed=intents.some(i=>i.type==='press'&&cmd&&(cmd.kind==='charge'||cmd.kind==='catch')),released=intents.some(i=>i.type==='release');
 t.status=pressed?'holding':released||!cmd?'idle':cmd.held?'holding':'idle';
 return {tracker:t,intents};
}
// Calibration: threshold = half the median of the 3 punch peaks, floored at CAL_FLOOR and at CAL_NUIS_K x the punch
// peak measured while the player stood still, so weak calibration punches can't make breathing or talking fire.
const CAL_FLOOR=.12,CAL_NUIS_K=1.5,CAL_ONSET=.08,CAL_PEAK_MS=300;
function calibratePunch(peaks,nuisancePeak){const p=(peaks||[]).filter(Number.isFinite).slice().sort((a,b)=>a-b);if(!p.length)return null;const n=p.length,med=n%2?p[(n-1)/2]:(p[n/2-1]+p[n/2])/2;
 const floor=Math.max(CAL_FLOOR,(Number.isFinite(nuisancePeak)?nuisancePeak:0)*CAL_NUIS_K);return Math.max(PUNCH_MIN,Math.min(PUNCH_MAX,Math.max(floor,.5*med)));}
function computeLag(onsets,rings){const n=Math.min(onsets.length,rings.length);if(!n)return null;const d=[];for(let i=0;i<n;i++)d.push(onsets[i]-rings[i]);d.sort((a,b)=>a-b);const mid=n%2?d[(n-1)/2]:(d[n/2-1]+d[n/2])/2;return Math.max(0,Math.min(LAG_MAX,Math.round(mid)));}
function toGray(rgba,out){for(let i=0,j=0;j<out.length;i+=4,j++)out[j]=(rgba[i]*77+rgba[i+1]*150+rgba[i+2]*29)>>8;return out;}
function lagToCommandTime(clock,lagMs){const lag=Number.isFinite(lagMs)?lagMs:0;return Math.max(0,clock-(lag/1000)*LAG_SCALE);}
// --- v2 signal (pure, stateful model). Spec addendum "v2 signal". All time is dtMs passed in; no clock, no random. ---
// Per frame: 3x3 blur -> robust affine brightness fit (exposure steps cancel) -> residual vs an adaptive per-pixel
// threshold k(gain)*max(MIN_NOISE,noise EMA) -> 3x3 open -> zones, energy, MHI, largest blob, block flow, and a
// fast-rise punch score in the configured zone. The dt scale clamp(33/dt,.5,2) multiplies the energy (swept area grows
// with dt; pixel contrast does not). Energy/scale are diagnostics; decisions use the ms-window integrals below.
const V2=Object.freeze({DT_REF:33,DT_SCALE_MIN:.5,DT_SCALE_MAX:2,MIN_NOISE:2.5,GAIN_K_MAX:7,GAIN_K_STEP:.55,NORM_BAND:40,NORM_BAND2:16,NORM_MIN_FRAC:.3,NORM_MIN_VAR:25,NORM_GAIN_MIN:.6,NORM_GAIN_MAX:1.7,
 NOISE_TAU_WARM:250,NOISE_TAU:1500,NOISE_TAU_LEAK:4000,NOISE_LEAK_MS:2000,NOISE_CAP:40,MHI_MS:500,FLOW_BLOCK:10,FLOW_STEP:2,FLOW_BLOCK_MIN:4,REARM:.5,AGE_EPS_MS:1,PUNCH_WIN_MS:133,RISE_MS:200,RISE_K:3,SOFT_FRAC:.5,COH_LO:.8,COH_HI:.95,PUNCH_FULL:.2,HIST:32});
const DUP_RUN_MAX=3,GAIN_MIN=1,GAIN_MAX=9,GAIN_DEFAULT=5,LEGACY_GAIN=Object.freeze({LOW:3,MED:5,HIGH:7}),PUNCH_DEFAULT=.25,PUNCH_COOLDOWN_MS=350,PUNCH_MIN=.05,PUNCH_MAX=.6,SWEEP_SPAN_V2=.35,SWEEP_AREA_MIN=.01,BLOB_JUMP=.5,SWEEP_REFRACT_MS=700,FLOW_MIN=.35,ZONES_V2=Object.freeze(['CENTER','LEFT','RIGHT']),ZONE_INDEX=Object.freeze({LEFT:3,CENTER:4,RIGHT:5});
function gainK(gain){const g=Math.max(GAIN_MIN,Math.min(GAIN_MAX,Number.isFinite(gain)?gain:GAIN_DEFAULT));return V2.GAIN_K_MAX-(g-GAIN_MIN)*V2.GAIN_K_STEP;}
// Settings readers shared by the controller and host (mirror combat/commands.js normalizeSettings for raw objects).
function gainOf(s){const o=s||{},n=typeof o.webcamGain==='string'&&o.webcamGain.trim()!==''?Number(o.webcamGain):o.webcamGain;if(typeof n==='number'&&Number.isFinite(n))return Math.max(GAIN_MIN,Math.min(GAIN_MAX,Math.round(n)));return LEGACY_GAIN[o.webcamSensitivity]||GAIN_DEFAULT;}
function punchOf(s){const v=s&&s.webcamPunch;return typeof v==='number'&&Number.isFinite(v)?Math.max(PUNCH_MIN,Math.min(PUNCH_MAX,v)):PUNCH_DEFAULT;}
function zoneOfSetting(s){const z=s&&s.webcamZone;return ZONES_V2.includes(z)?z:'CENTER';}
function createMotionModel(){const N=FRAME_W*FRAME_H,BW=Math.ceil(FRAME_W/V2.FLOW_BLOCK),BH=Math.ceil(FRAME_H/V2.FLOW_BLOCK);
 return {N,cur:new Float32Array(N),prev:new Float32Array(N),tmp:new Float32Array(N),resid:new Float32Array(N),noise:new Float32Array(N),movingMs:new Float32Array(N),raw:new Uint8Array(N),ero:new Uint8Array(N),mask:new Uint8Array(N),
  mhi:new Float64Array(N).fill(-1e9),label:new Int32Array(N),stack:new Int32Array(N),hist:new Int32Array(511),bgx:new Float64Array(BW*BH),bgy:new Float64Array(BW*BH),bn:new Int32Array(BW*BH),BW,BH,
  histT:new Float64Array(V2.HIST),histE:new Float64Array(V2.HIST),histF:new Float64Array(V2.HIST),histS:new Float64Array(V2.HIST),histQ:new Float64Array(V2.HIST),histN:0,histI:0,histZone:-1,hasPrev:false,frames:0,t:0,learned:0};}
// Temporal reset (pause, halt): forget the previous frame, punch history and motion history; keep the learned noise.
function resetMotionTemporal(m){m.hasPrev=false;m.histN=0;m.histI=0;m.mhi.fill(-1e9);m.movingMs.fill(0);m.mask.fill(0);}
// Full reset (measureFloor): also forget the noise model, so warm-up re-learns the room.
function resetMotionModel(m){resetMotionTemporal(m);m.noise.fill(0);m.learned=0;}
function blur3(src,dst,tmp){const W=FRAME_W,H=FRAME_H;
 for(let y=0;y<H;y++){const o=y*W;for(let x=0;x<W;x++){const l=x>0?x-1:0,r=x<W-1?x+1:W-1;tmp[o+x]=(src[o+l]+src[o+x]+src[o+r])/3;}}
 for(let y=0;y<H;y++){const u=(y>0?y-1:0)*W,o=y*W,d=(y<H-1?y+1:H-1)*W;for(let x=0;x<W;x++)dst[o+x]=(tmp[u+x]+tmp[o+x]+tmp[d+x])/3;}}
// Robust brightness fit cur ~ a*prev + b: median diff, then two least-squares passes over inlier pixels.
// Too few inliers (the whole scene changed) means no correction.
function fitExposure(m){const N=m.N,c=m.cur,p=m.prev,h=m.hist;h.fill(0);for(let i=0;i<N;i++){let d=Math.round(c[i]-p[i]);d=d<-255?-255:d>255?255:d;h[d+255]++;}
 let acc=0,b0=0;for(let k=0;k<511;k++){acc+=h[k];if(acc*2>=N){b0=k-255;break;}}
 let a=1,b=b0;for(let pass=0;pass<2;pass++){const band=pass?V2.NORM_BAND2:V2.NORM_BAND;let n=0,sx=0,sy=0,sxx=0,sxy=0;
  for(let i=0;i<N;i++){const x=p[i],y=c[i];if(Math.abs(y-(a*x+b))>band)continue;n++;sx+=x;sy+=y;sxx+=x*x;sxy+=x*y;}
  if(n<V2.NORM_MIN_FRAC*N)return pass?{a,b}:{a:1,b:0};
  const mx=sx/n,my=sy/n,vx=sxx/n-mx*mx;if(vx<V2.NORM_MIN_VAR){a=1;b=my-mx;}else{a=Math.max(V2.NORM_GAIN_MIN,Math.min(V2.NORM_GAIN_MAX,(sxy/n-mx*my)/vx));b=my-a*mx;}}
 return {a,b};}
function morphOpen(m){const W=FRAME_W,H=FRAME_H,s=m.raw,e=m.ero,d=m.mask;   // erode then dilate, 3x3, edges clamp
 for(let y=0;y<H;y++)for(let x=0;x<W;x++){let v=1;for(let dy=-1;dy<=1&&v;dy++){const yy=y+dy<0?0:y+dy>=H?H-1:y+dy;for(let dx=-1;dx<=1;dx++){const xx=x+dx<0?0:x+dx>=W?W-1:x+dx;if(!s[yy*W+xx]){v=0;break;}}}e[y*W+x]=v;}
 for(let y=0;y<H;y++)for(let x=0;x<W;x++){let v=0;for(let dy=-1;dy<=1&&!v;dy++){const yy=y+dy<0?0:y+dy>=H?H-1:y+dy;for(let dx=-1;dx<=1;dx++){const xx=x+dx<0?0:x+dx>=W?W-1:x+dx;if(e[yy*W+xx]){v=1;break;}}}d[y*W+x]=v;}}
// Largest 4-connected component of the opened mask, with a typed-array stack (no allocation).
function largestBlob(m){const W=FRAME_W,H=FRAME_H,N=m.N,L=m.label,S=m.mask,st=m.stack;L.fill(0);let next=0,best=0,bx=0,by=0,second=0;
 for(let i=0;i<N;i++){if(!S[i]||L[i])continue;next++;let sp=0,area=0,sx=0,sy=0;st[sp++]=i;L[i]=next;
  while(sp){const j=st[--sp],x=j%W,y=(j-x)/W;area++;sx+=x;sy+=y;
   if(x>0&&S[j-1]&&!L[j-1]){L[j-1]=next;st[sp++]=j-1;}if(x<W-1&&S[j+1]&&!L[j+1]){L[j+1]=next;st[sp++]=j+1;}
   if(y>0&&S[j-W]&&!L[j-W]){L[j-W]=next;st[sp++]=j-W;}if(y<H-1&&S[j+W]&&!L[j+W]){L[j+W]=next;st[sp++]=j+W;}}
  if(area>best){second=best;best=area;bx=sx/area;by=sy/area;}else if(area>second)second=area;}
 return {area:best,x:bx,y:by,second};}
// Block flow from the motion-history image: newer timestamps lie in the direction of travel. Each block votes a unit
// vector; the mean is the flow, so its length is the coherence (two hands moving apart cancel to ~0). The same vote
// restricted to the punch region gives coh.
function blockFlow(m,zone,mirror){const W=FRAME_W,H=FRAME_H,B=V2.FLOW_BLOCK,h=m.mhi,old=m.t-V2.MHI_MS;m.bgx.fill(0);m.bgy.fill(0);m.bn.fill(0);
 const S=V2.FLOW_STEP,SW=S*W;   // a 2 px stencil bridges the gap a fast hand leaves between frames at 15 Hz
 for(let y=S;y<H-S;y++)for(let x=S;x<W-S;x++){const i=y*W+x;if(h[i]<old)continue;const b=((y/B)|0)*m.BW+((x/B)|0);let any=0;
  if(h[i-S]>=old&&h[i+S]>=old){m.bgx[b]+=h[i+S]-h[i-S];any=1;}if(h[i-SW]>=old&&h[i+SW]>=old){m.bgy[b]+=h[i+SW]-h[i-SW];any=1;}if(any)m.bn[b]++;}
 let sx=0,sy=0,sw=0,zx=0,zy=0,zw=0;for(let b=0;b<m.bn.length;b++){const n=m.bn[b];if(n<V2.FLOW_BLOCK_MIN)continue;const gx=m.bgx[b],gy=m.bgy[b],len=Math.hypot(gx,gy),ux=len>1e-9?gx/len:0,uy=len>1e-9?gy/len:0;sw+=n;sx+=n*ux;sy+=n*uy;
  const cx=Math.min(W-1,(b%m.BW)*B+B/2),cy=Math.min(H-1,((b/m.BW)|0)*B+B/2);if(inPunch(zone,mirror?W-1-cx:cx,cy)){zw+=n;zx+=n*ux;zy+=n*uy;}}
 // coh: how much the punch zone's recent motion moves one way (a rigid head sway ~1; a fist toward the camera spreads out)
 return {dx:sw?sx/sw:0,dy:sw?sy/sw:0,coh:zw?Math.hypot(zx,zy)/zw:0};}
// One frame in. Returns null for the first frame after a reset and for a duplicate (all-zero diff): nothing is updated.
// opts={gain 1..9, mirror, zone 'CENTER'|'LEFT'|'RIGHT', punchMin, learn:'all'|'still'}.
function stepMotion(m,gray,dtMs,opts){const o=opts||{},N=m.N,W=FRAME_W,mirror=o.mirror===true;
 blur3(gray,m.cur,m.tmp);
 if(!m.hasPrev){m.prev.set(m.cur);m.hasPrev=true;m.frames++;return null;}
 let same=true;for(let i=0;i<N;i++)if(m.cur[i]!==m.prev[i]){same=false;break;}if(same)return null;
 const dt=Number.isFinite(dtMs)&&dtMs>0?dtMs:V2.DT_REF,sc=Math.max(V2.DT_SCALE_MIN,Math.min(V2.DT_SCALE_MAX,V2.DT_REF/dt)),k=gainK(o.gain),all=o.learn==='all';
 const fit=fitExposure(m),a=fit.a,b=fit.b,c=m.cur,p=m.prev,nz=m.noise,mv=m.movingMs,raw=m.raw,res=m.resid;
 const zone=PUNCH_RECT[o.zone]?o.zone:'CENTER',pm=PMAP[zone][mirror?1:0],zm=ZMAP[mirror?1:0],rawZ=[0,0,0,0,0,0,0,0,0];let softP=0,sweptP=0;const aw=1-Math.exp(-dt/V2.NOISE_TAU_WARM),as=1-Math.exp(-dt/V2.NOISE_TAU),al=1-Math.exp(-dt/V2.NOISE_TAU_LEAK);
 for(let i=0;i<N;i++){const r=Math.abs(c[i]-(a*p[i]+b));res[i]=r;const n=nz[i],thr=k*(n>V2.MIN_NOISE?n:V2.MIN_NOISE),moving=r>thr;raw[i]=moving?1:0;if(moving)rawZ[zm[i]]++;
  const sv=r-thr*V2.SOFT_FRAC;if(sv>0&&pm[i])softP+=sv;   // soft energy: sees sub-threshold motion the mask drops
  let al2=0;if(all)al2=aw;else if(!moving){al2=as;mv[i]=0;}else{mv[i]+=dt;if(mv[i]>V2.NOISE_LEAK_MS)al2=al;}   // slow leak: a fan/TV can't stay a blob
  if(al2){const v=n+al2*(r-n);nz[i]=v>V2.NOISE_CAP?V2.NOISE_CAP:v;}}
 if(all)m.learned+=dt;
 morphOpen(m);
 m.t+=dt;const counts=[0,0,0,0,0,0,0,0,0],energy=[0,0,0,0,0,0,0,0,0],swept=[0,0,0,0,0,0,0,0,0];let moving=0,sx=0,sy=0;
 for(let y=0;y<FRAME_H;y++)for(let x=0;x<W;x++){const i=y*W+x;if(!m.mask[i])continue;const mx=mirror?W-1-x:x,z=zoneOf(mx,y);counts[z]++;swept[z]+=res[i];if(pm[i])sweptP+=res[i];moving++;sx+=mx;sy+=y;m.mhi[i]=m.t;}
 const zones=counts.map((v,z)=>v/AREAS[z]);for(let z=0;z<9;z++){swept[z]/=AREAS[z]*255;energy[z]=swept[z]*sc;}   // energy: dt-normalised rate
 const pz=ZONE_INDEX[zone];
 const bl=largestBlob(m),fl=blockFlow(m,zone,mirror),blob={x:bl.area?(mirror?W-1-bl.x:bl.x)/(W-1):null,y:bl.area?bl.y/(FRAME_H-1):null,area:bl.area/N,second:bl.second/N},flow={dx:mirror?-fl.dx:fl.dx,dy:fl.dy,coh:fl.coh};
 // Punch: the zone's swept (masked) energy integrated over the last PUNCH_WIN_MS - the same time span, so the same
 // value, at 15 and 30 Hz - minus RISE_K x the quietest *soft* energy (same window) in the last RISE_MS. Soft energy
 // sees motion below the mask threshold, so a sway or lean that speeds up gradually has a non-quiet baseline and
 // scores ~0; a punch out of stillness has a ~0 baseline. Finally it is gated by the zone's flow coherence: a head
 // sway reverses through stillness, but it slides one way (coh ~1), while a fist toward the camera spreads (coh ~.5).
 if(m.histZone!==pz){m.histZone=pz;m.histN=0;m.histI=0;}
 const F=sweptP/(PUNCH_NORM_PX*255),Fs=softP/(PUNCH_NORM_PX*255);let E=F,Es=Fs,q=Infinity;for(let j=0;j<m.histN;j++){const age=m.t-m.histT[j];if(age<V2.PUNCH_WIN_MS-V2.AGE_EPS_MS){E+=m.histF[j];Es+=m.histS[j];}if(age<=V2.RISE_MS+1e-9&&m.histQ[j]<q)q=m.histQ[j];}if(q===Infinity)q=0;
 const gate=Math.max(0,Math.min(1,(V2.COH_HI-fl.coh)/(V2.COH_HI-V2.COH_LO)));   // a coherent sideways slide (head sway) is not a punch
 const punch=Math.max(0,Math.min(1,(E-V2.RISE_K*q)/V2.PUNCH_FULL))*gate;m.histT[m.histI]=m.t;m.histE[m.histI]=E;m.histF[m.histI]=F;m.histS[m.histI]=Fs;m.histQ[m.histI]=Es;m.histI=(m.histI+1)%V2.HIST;if(m.histN<V2.HIST)m.histN++;
 const t2=m.prev;m.prev=m.cur;m.cur=t2;m.frames++;
 const punchMin=Number.isFinite(o.punchMin)?o.punchMin:PUNCH_DEFAULT,noisy=rawZ.filter((v,z)=>v/AREAS[z]>=NOISY_MIN).length>=7;   // on the raw (pre-open) mask: speckle the open erases is still noise
 return {zones,total:moving/N,centroidX:moving?sx/moving/(W-1):null,centroidY:moving?sy/moving/(FRAME_H-1):null,event:noisy?'noisy':punch>=punchMin?'burst':null,
  blob,flow,punch,punchMin,zone,energy,rise:{e:E,q},exposure:{a,b},scale:sc};}
// Per-zone mean of the learned noise (raw grey levels), for the noiseFloor getter.
function noiseSummary(m,mirror){const s=[0,0,0,0,0,0,0,0,0];for(let y=0;y<FRAME_H;y++)for(let x=0;x<FRAME_W;x++)s[zoneOf(mirror?FRAME_W-1-x:x,y)]+=m.noise[y*FRAME_W+x];return s.map((v,z)=>v/AREAS[z]);}
function createWebcamController(o){
 const g=o.global||global,doc=o.doc||g.document,now=o.now||(()=>g.performance.now()),setT=o.setTimeout||((f,ms)=>g.setTimeout(f,ms)),clearT=o.clearTimeout||(id=>g.clearTimeout(id));
 const gen=()=>o.pauseGeneration?o.pauseGeneration():0;
 let stream=null,video=null,ctx=null,timer=null,tracker=createTracker(),state='off',token=0,epoch=0,failed=false,disposed=false,wantStop=false;
 let warmupMs=WARMUP_MS,settleMs=0,prevT=0,readySince=null,gray=new Uint8Array(FRAME_W*FRAME_H),startedAt=0,lastGen=gen(),pendingRelease=null,slow=0,fast=0,interval=33,meter=0,listener=null;
 // v2: one stateful motion model owns the blurred previous frame, so the capture buffer is reused every tick.
 const model=createMotionModel();let last=null,lastMirror=true,pipeMs=0,lastVideoTime=null,dupRun=0;
 const settings=()=>o.getSettings?o.getSettings()||{}:{};
 function setState(s){if(s===state)return;state=s;if(o.onStatus)o.onStatus(s);}
 function supported(){const md=g.navigator&&g.navigator.mediaDevices;return !!(md&&typeof md.getUserMedia==='function');}
 function stopTracks(s){try{for(const t of s.getTracks())t.stop();}catch(_){}}
 function turnOff(){if(o.setSettings)o.setSettings(Object.assign({},settings(),{webcam:'OFF'}));}
 // halt releases a key it pressed: a stuck keys['z'] would swallow the next real press, and a stuck arrow would walk the player.
 function halt(){token++;wantStop=false;if(timer!==null){clearT(timer);timer=null;}if(stream){stopTracks(stream);stream=null;}if(video){video.srcObject=null;if(video.parentNode)video.parentNode.removeChild(video);video=null;}ctx=null;resetMotionTemporal(model);last=null;lastVideoTime=null;dupRun=0;if(pendingRelease){const k=pendingRelease;pendingRelease=null;if(o.release)o.release(k);}tracker=createTracker();meter=0;}
 function stop(){halt();setState('off');}
 // permanent=false (camera busy etc.) keeps the setting, so the next battle retries; the failed latch still stops retries this battle.
 function fail(reason,permanent){halt();failed=true;if(permanent!==false)turnOff();setState(reason);}
 // Always enters warm-up, even with no stream, so processFrame can be driven headless by tests.
 // Warm-up (settle + ms) teaches every pixel's noise; the epoch makes a processFrame already running bail out.
 function measureFloor(ms,settle){epoch++;warmupMs=Number.isFinite(ms)?ms:WARMUP_MS;settleMs=Number.isFinite(settle)?settle:0;startedAt=now();resetMotionModel(model);last=null;prevT=0;readySince=null;lastGen=gen();setState('warmup');}
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
  const t0=now();let got=null;
  // The camera has not decoded a new frame (currentTime unchanged): a duplicate. Capped, in case a browser never advances it.
  const vt=video.currentTime;if(typeof vt==='number'&&vt>0&&vt===lastVideoTime&&dupRun<DUP_RUN_MAX){dupRun++;processFrame(null,t0);schedule();return;}
  lastVideoTime=vt;dupRun=0;
  try{ctx.drawImage(video,0,0,FRAME_W,FRAME_H);got=toGray(ctx.getImageData(0,0,FRAME_W,FRAME_H).data,gray);}catch(_){}
  const capture=now()-t0;pipeMs=0;if(got)processFrame(got,t0);
  // Cost is capture + pipeline only (a slow calibration listener must not drop us to 15 Hz).
  const cost=capture+pipeMs;slow=cost>8?slow+1:0;fast=cost<4?fast+1:0;if(slow>=3)interval=66;else if(fast>=60)interval=33;schedule();}
 // curr=null means a duplicate frame: only the warm-up clocks run.
 function processFrame(curr,t){
  // Any callback (release, listener, onStatus, press) may stop/dispose us (halt bumps token) or restart warm-up (epoch).
  const my=token,ep=epoch,stale=()=>my!==token||ep!==epoch;
  if(pendingRelease){const k=pendingRelease;pendingRelease=null;if(o.release)o.release(k);if(stale())return;}
  const s=settings(),mirror=s.webcamMirror!==false;
  if(state==='warmup'&&video&&video.readyState!==undefined&&video.readyState<2){   // camera not delivering frames yet
   if(readySince===null)readySince=t;if(t-readySince>=READY_TIMEOUT_MS){fail('unavailable');return;}startedAt=t;return;}
  if(state==='warmup')readySince=null;   // the ready timeout measures one continuous stall, not the total since the first stall
  let motion=null;
  if(curr){const before=model.frames,p0=now();lastMirror=mirror;
   motion=stepMotion(model,curr,model.hasPrev?t-prevT:0,{gain:gainOf(s),mirror,zone:zoneOfSetting(s),punchMin:punchOf(s),learn:state==='warmup'?'all':'still'});
   pipeMs+=now()-p0;if(model.frames!==before)prevT=t;   // duplicates leave prev/prevT unchanged
   if(motion){meter=motion.total;last=motion;}}
  if(state==='warmup'){
   if(motion&&listener){listener(motion,t);if(stale())return;}
   if(t-startedAt>=settleMs+warmupMs){lastGen=gen();setState('live');}return;}
  if(!motion)return;
  if(listener){listener(motion,t);if(stale())return;}
  const g2=gen(),paused=g2!==lastGen;lastGen=g2;
  const r=stepTracker(tracker,{motion,command:o.getCommand?o.getCommand():null},t);tracker=r.tracker;
  setState(tracker.status==='noisy'?'noisy':'live');if(stale())return;
  // A pause (modal, blur) drops the gesture in flight: fresh tracker (keeping the cooldown) and fresh motion history.
  if(paused){tracker=Object.assign(createTracker(),{lastOnsetMs:tracker.lastOnsetMs,centreLow:false});resetMotionTemporal(model);return;}
  if(o.isInputOpen&&!o.isInputOpen())return;
  for(const i of r.intents){if(stale())return;dispatch(i,s,my);}
 }
 // Read-only snapshot for the overlay / test modal: a copy, in display orientation, never the live buffers.
 function snapshot(){if(!last)return null;const W=FRAME_W,mask=new Uint8Array(model.N);for(let y=0;y<FRAME_H;y++)for(let x=0;x<W;x++)mask[y*W+(lastMirror?W-1-x:x)]=model.mask[y*W+x];
  return {zones:last.zones.slice(),total:last.total,punch:last.punch,punchMin:last.punchMin,zone:last.zone,event:last.event,blob:Object.assign({},last.blob),flow:Object.assign({},last.flow),rise:Object.assign({},last.rise),mask,width:W,height:FRAME_H,reason:tracker.reason,status:tracker.status,state};}
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
  get state(){return state;},get meter(){return meter;},get video(){return video;},get noiseFloor(){return noiseSummary(model,lastMirror);},get lastMotion(){return snapshot();},get reason(){return tracker.reason;}};
}
return {FRAME_W,FRAME_H,BURST_MIN,NOISY_MIN,SWEEP_SPAN,SWEEP_WINDOW_MS,CANCEL_MIN,CANCEL_HOLD_MS,COOLDOWN_MS,DOUBLE_MS,WARMUP_MS,SETTLE_MS,READY_TIMEOUT_MS,LAG_SCALE,LAG_MAX,THRESHOLDS,
 V2,PUNCH_COOLDOWN_MS,GAIN_MIN,GAIN_MAX,GAIN_DEFAULT,LEGACY_GAIN,PUNCH_DEFAULT,PUNCH_MIN,PUNCH_MAX,SWEEP_SPAN_V2,SWEEP_AREA_MIN,BLOB_JUMP,SWEEP_REFRACT_MS,FLOW_MIN,ZONES_V2,ZONE_INDEX,PUNCH_RECT,DUP_RUN_MAX,
 CAL_FLOOR,CAL_NUIS_K,CAL_ONSET,CAL_PEAK_MS,PUNCH_NORM_PX,
 classifyMotion,createTracker,stepTracker,burstLevel,computeLag,calibratePunch,toGray,lagToCommandTime,gainK,gainOf,punchOf,zoneOfSetting,createMotionModel,resetMotionModel,resetMotionTemporal,stepMotion,noiseSummary,createWebcamController};
});
