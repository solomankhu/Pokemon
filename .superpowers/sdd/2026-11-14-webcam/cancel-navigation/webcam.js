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
function createTracker(){return {status:'idle',centreLow:true,lastOnsetMs:-Infinity,pendingBurstAt:null,trail:[],cancelSince:null,cancelFired:false,reason:null,lastSweepMs:-Infinity,
 ring:[],ringPhase:null,gestureFloorMs:-Infinity,punchFloorMs:-Infinity,leanAt:-Infinity};}
// Burst level 0..: >=1 is an onset, <.5 re-arms. v2 motion carries punch/punchMin (fast-rise score in webcamZone);
// a legacy classifyMotion result falls back to zones[4]/BURST_MIN, so the old path behaves exactly as before.
function burstLevel(m){return typeof m.punch==='number'?m.punch/(m.punchMin>0?m.punchMin:PUNCH_DEFAULT):m.zones[4]/BURST_MIN;}
// Sweep from the trail. v2: the largest blob's travel, needing coherent block flow in the same direction.
function sweepKey(trail,flow){if(trail.length<2)return null;const a=trail[0],b=trail[trail.length-1],dx=b.x-a.x,dy=b.y-a.y;
 if(!flow){if(Math.abs(dx)>SWEEP_SPAN&&Math.abs(dx)>=Math.abs(dy))return dx>0?'arrowright':'arrowleft';if(Math.abs(dy)>SWEEP_SPAN)return dy>0?'arrowdown':'arrowup';return null;}
 if(Math.abs(dx)>SWEEP_SPAN_V2&&Math.abs(dx)>=Math.abs(dy)&&Math.sign(flow.dx)===Math.sign(dx)&&Math.abs(flow.dx)>=FLOW_MIN)return dx>0?'arrowright':'arrowleft';
 if(Math.abs(dy)>SWEEP_SPAN_V2&&Math.abs(dy)>Math.abs(dx)&&Math.sign(flow.dy)===Math.sign(dy)&&Math.abs(flow.dy)>=FLOW_MIN)return dy>0?'arrowdown':'arrowup';return null;}
// One sample in, intents out. sample={motion, command:null|{kind,ready,waitingRelease,held}, phase?}. Pure: returns a new tracker.
// phase (a string from the game, e.g. 'menu') opts in to gestures (v2 motion only): in phase 'menu' with no command a
// gesture is {type:'action',id} (GESTURE_ACTION) and punches become a deferred ATTACK instead of the double-punch 'z';
// in a command, guard/throw are extra triggers for 'guard'/'catch'. Without a phase the output is exactly as before.
// tracker.reason explains a quiet tracker: 'noisy' | 'cooldown' (an onset came too soon) | 'confirm-pending' (one of two menu
// punches) | 'punch-pending' (menu phase: a punch waits to be confirmed as ATTACK) | null.
function stepTracker(prev,sample,nowMs){
 const t={...prev,trail:prev.trail.slice(),reason:null},intents=[],m=sample&&sample.motion,cmd=sample&&sample.command||null;
 if(!m)return {tracker:t,intents};
 const ph=sample&&typeof sample.phase==='string'?sample.phase:null,gx=ph!==null&&!!m.blob;   // gestures: opt-in by phase, v2 motion only
 if(gx)ringPush(t,m,ph,nowMs);
 if(m.event==='noisy'){t.status='noisy';t.reason='noisy';t.trail=[];t.pendingBurstAt=null;t.cancelSince=null;t.centreLow=false;if(gx){t.ring=[];t.gestureFloorMs=nowMs;}return {tracker:t,intents};}
 const z=m.zones,v2=!!m.blob,lv=burstLevel(m);
 // Two high hands are the cancel gesture, never a punch (including during commands).
 // Block on the lower corner threshold before the full cancel hold can mature.
 const twoHands=v2&&z[0]>=CANCEL_MIN/2&&z[2]>=CANCEL_MIN/2;
 if(twoHands){t.pendingBurstAt=null;t.trail=[];t.centreLow=false;if(gx)t.punchFloorMs=Math.max(t.punchFloorMs,nowMs);   /* two-hand motion is never a punch */
  if(!cmd&&z[0]>=CANCEL_MIN&&z[2]>=CANCEL_MIN){if(t.cancelSince===null)t.cancelSince=nowMs;if(!t.cancelFired&&nowMs-t.cancelSince>=CANCEL_HOLD_MS){t.cancelFired=true;intents.push({type:'key',key:'x'});if(gx)t.gestureFloorMs=nowMs;}}
  else{t.cancelSince=null;t.cancelFired=false;}
  t.status='idle';return {tracker:t,intents};}

 if(cmd)t.pendingBurstAt=null;
 // Menus only: sweeps and the two-hand cancel. A sweep swallows a pending confirm.
 if(!cmd){
  if(v2){const bl=m.blob;if(bl.x!==null&&bl.area>=SWEEP_AREA_MIN){const last=t.trail[t.trail.length-1];if(last&&Math.hypot(bl.x-last.x,bl.y-last.y)>BLOB_JUMP)t.trail=[];t.trail.push({t:nowMs,x:bl.x,y:bl.y});}}
  else if(m.centroidX!==null&&m.total>0)t.trail.push({t:nowMs,x:m.centroidX,y:m.centroidY});
  t.trail=t.trail.filter(p=>nowMs-p.t<=SWEEP_WINDOW_MS);
  // v2: one sweep per SWEEP_REFRACT_MS, so a long pass (or the hand's way back) never gives a second or reversed arrow.
  const key=v2&&nowMs-(t.lastSweepMs??-Infinity)<SWEEP_REFRACT_MS?null:
   sweepKey(t.trail,v2?m.flow||{dx:0,dy:0}:null)||(gx?slowSweepKey(t.ring,nowMs,Math.max(t.gestureFloorMs,t.lastSweepMs,t.punchFloorMs)):null);
  if(key){intents.push({type:'key',key});t.lastSweepMs=nowMs;t.trail=[];t.pendingBurstAt=null;t.lastOnsetMs=nowMs;t.centreLow=false;t.status='idle';if(gx)t.punchFloorMs=nowMs+SWEEP_REFRACT_MS;return {tracker:t,intents};}
  if(z[0]>=CANCEL_MIN&&z[2]>=CANCEL_MIN){if(t.cancelSince===null)t.cancelSince=nowMs;if(!t.cancelFired&&nowMs-t.cancelSince>=CANCEL_HOLD_MS){t.cancelFired=true;t.pendingBurstAt=null;intents.push({type:'key',key:'x'});if(gx)t.gestureFloorMs=nowMs;}}
  else{t.cancelSince=null;t.cancelFired=false;}
 }else{t.trail=[];t.cancelSince=null;t.cancelFired=false;}
 // Battle menu after a lean (RUN cursor): punches are swallowed for LEAN_REFRACT_MS (coming back into frame), then a
 // DOUBLE punch confirms (a key 'z', never a single motion) until LEAN_CONFIRM_MS.
 const menu=gx&&ph==='menu'&&!cmd,sinceLean=nowMs-t.leanAt,runConfirm=menu&&sinceLean>=GESTURE.LEAN_REFRACT_MS&&sinceLean<GESTURE.LEAN_CONFIRM_MS;
 if(lv<V2.REARM)t.centreLow=true;   // legacy: zones[4] < BURST_MIN/2
 // v2: an onset inside the (longer) punch cooldown is used up, so a fist's retract can't fire once the cooldown ends.
 const cool=v2?PUNCH_COOLDOWN_MS:COOLDOWN_MS;
 if(t.centreLow&&lv>=1&&nowMs-t.lastOnsetMs<cool){t.reason='cooldown';if(v2)t.centreLow=false;}
 else if(t.centreLow&&lv>=1){
  t.centreLow=false;t.lastOnsetMs=nowMs;
  if(!cmd&&menu&&!runConfirm)t.pendingBurstAt=null;   // menu punches belong to the gesture ring (deferred ATTACK)
  else if(!cmd){if(t.pendingBurstAt!==null&&nowMs-t.pendingBurstAt<=DOUBLE_MS){t.pendingBurstAt=null;intents.push({type:'key',key:'z'});if(gx)t.gestureFloorMs=nowMs;}else t.pendingBurstAt=nowMs;}
  else if(!cmd.ready)intents.push({type:'arm'});
  else if(cmd.waitingRelease){}
  else if(cmd.kind==='strike'||cmd.kind==='guard')intents.push({type:'press',lagged:true});
  else intents.push({type:cmd.held?'release':'press',lagged:true});
 }
 if(gx&&!intents.length&&nowMs>t.gestureFloorMs)gestureStep(t,intents,cmd,menu,runConfirm,nowMs);
 if(t.pendingBurstAt!==null&&nowMs-t.pendingBurstAt>DOUBLE_MS)t.pendingBurstAt=null;
 if(!t.reason&&t.pendingBurstAt!==null)t.reason='confirm-pending';
 if(!t.reason&&menu&&!runConfirm&&pendingPunch(t.ring,Math.max(t.gestureFloorMs,t.punchFloorMs),nowMs)!==null)t.reason='punch-pending';
 const pressed=intents.some(i=>i.type==='press'&&cmd&&(cmd.kind==='charge'||cmd.kind==='catch')),released=intents.some(i=>i.type==='release');
 t.status=pressed?'holding':released||!cmd?'idle':cmd.held?'holding':'idle';
 return {tracker:t,intents};
}
// --- Gestures (plan docs/plans/2026-10-23-webcam-gesture-set.md, Phase 2). Pure: a time ring of compact v2 samples
// inside the tracker (a pause or createTracker drops it). Each detector is a few physical facts, tuned on the player's
// own clips (combat/webcam-clips.test.js) and synthetic scenes; scores are min(value/threshold), so >=1 fires and the
// size of the score is the margin. Held gestures read the motion model's pose (difference from the last calm scene).
const GESTURE=Object.freeze({RING_MS:2500,RING_MAX:80,STILL_TOT:.06,STILL_ZONE:.15,   // still: little motion overall AND in every cell
 ACT_RC:.3,   // a real gesture: some cell was >=30% covered by motion within RECENT_MS (time-based, so fps-independent)
LOOKBACK_MS:1000,
 GUARD_HOLD_MS:200,GUARD_POSE:.4,GUARD_JITTER:.1,GUARD_MOTION_TOT:.12, // allow up to 12% moving pixels during stable coverage
 RAISE_HOLD_MS:200,RAISE_POSE:.25,RAISE_UP:.25,RAISE_LOOK_MS:300,   // hand(s) up: a top corner changed after upward motion, then still
 LEAN_HOLD_MS:300,LEAN_AWAY_MS:1000,LEAN_POSE:.3,LEAN_GAP_MS:150,LEAN_SIDE:.3,LEAN_ASYM:1.5,   // the centre column emptied via ONE side, >=1 s
 THROW_MS:600,THROW_TOP:.35,THROW_SIDE:.15,THROW_DROP:.25,THROW_MID:.15,THROW_ACROSS:.2,THROW_FLOW:.08,THROW_RISE:.15,THROW_WINDUP_MS:500,THROW_FOLLOW_MS:250,THROW_BACK:.1,BLOB_MIN:.01,      // top corner -> middle, downward, travelling ACROSS
 // (THROW_ACROSS: an overhand arc swings the hand sideways from its corner into the middle; a punch at the camera moves
 // along the view axis, so its centroid drops as the arm extends but barely shifts sideways - real clip .07 vs throw .36)
 // (THROW_FLOW: a hand that really travels across leaves a motion-history gradient the same way - the sweep rule; a
 // largest-blob label that jumps from one body part to another leaves none: real throw +.15, punch-clip jump -.05)
 // (THROW_RISE/THROW_WINDUP_MS: overhand means wound up - the hand rose up the side of the body (the side band, THROW_SIDE)
 // into that corner just before the arc (held up longer it is a raise). A straight punch or cross leaves from the guard and
 // never rises first; the far end of the other fist's cross, near the midline, is not a wind-up.)
 // (THROW_FOLLOW_MS/THROW_BACK: after the release an overhand arm follows through down or out of view; a punch comes back
 // up to the guard. So the arc end must be THROW_FOLLOW_MS old, and the hand never more than THROW_BACK back up from its
 // lowest point over the arc and since - real throw 0, real punch .25. 250 ms spans the fist's hold at full extension plus the first frames of its return: a frame
 // diff marks leaving a pose where it was, so the return shows one frame late. A same-side re-punch rises like a wind-up;
 // this is what tells it apart. Commands back-date the catch press to the arc end, capped at BACKDATE_MAX_MS.)
 SHOVE_WIN_MS:450,SHOVE_MIN_N:3,SHOVE_Z:.3,SHOVE_DOM:1.8,SHOVE_COH:.45,SHOVE_TRAVEL:.15,SHOVE_SPAN_MS:300,                    // palms forward: bottom-centre motion that spreads
 PUNCH_DEFER_MS:600,PUNCH_GIVEUP_MS:1500,PUNCH_REST_POSE:.3,   // a punch goes out and comes BACK: ATTACK once still with the centre at rest
 SAMPLE_GAP_MS:200,COMBO_WINDOW_MS:2200,COMBO_MIN_MS:700,COMBO_PERIOD_MIN:250,COMBO_PERIOD_MAX:1000,COMBO_TOTAL:.07,COMBO_HIGH:.5,COMBO_LOW:.3,COMBO_COH:.65,
 SLOW_SWEEP_MS:900,SLOW_SWEEP_MIN_MS:350,SLOW_SWEEP_AREA:.005,SLOW_SWEEP_SPAN:.28,SLOW_SWEEP_COH:.75,SLOW_SWEEP_STEP:.25,SLOW_SWEEP_SAMPLES:5,
ACTION_REFRACT_MS:1000,LEAN_REFRACT_MS:2000,LEAN_CONFIRM_MS:5000,BACKDATE_MAX_MS:300,SCORE_MAX:9.99});
const GESTURES=Object.freeze(['guard','raise','lean','throw','shove','punch']);   // priority order
const GESTURE_ACTION=Object.freeze({punch:'attack',guard:'defend',throw:'ball',shove:'swap',raise:'bag',lean:'run-cursor'});
function ringPush(t,m,ph,nowMs){const G=GESTURE,same=t.ringPhase===ph,r=same?t.ring.filter(s=>nowMs-s.t<=G.RING_MS):[];if(!same){t.gestureFloorMs=-Infinity;t.punchFloorMs=-Infinity;}
 r.push({t:nowMs,tot:m.total,z:m.zones,rc:m.recent||m.zones,pose:m.pose||null,dx:m.flow?m.flow.dx:0,dy:m.flow?m.flow.dy:0,coh:m.flow?m.flow.coh:0,bx:m.blob.x,by:m.blob.y,ba:m.blob.area,punch:typeof m.punch==='number'?m.punch:0,pmin:m.punchMin>0?m.punchMin:PUNCH_DEFAULT});
 if(r.length>G.RING_MAX)r.splice(0,r.length-G.RING_MAX);t.ring=r;t.ringPhase=ph;}
function ratio(v,thr){return Math.max(0,Math.min(GESTURE.SCORE_MAX,thr>0?v/thr:0));}
// Time of the first punch onset after the floor, or null: a burst after the level has re-armed (fallen under half the
// threshold), exactly like the tracker's centreLow; the ring's first samples start un-armed, like centreLow after a pause.
function pendingPunch(ring,since,nowMs){let armed=false;for(const s of ring){if(s.punch<s.pmin*V2.REARM){armed=true;continue;}if(!armed||s.punch<s.pmin)continue;armed=false;
 if(s.t>since&&!(Number.isFinite(nowMs)&&nowMs-s.t>GESTURE.PUNCH_GIVEUP_MS))return s.t;}return null;}
// Continuous combinations need no quiet onset: three central fills, separated by two clears, while motion
// spreads rather than sliding rigidly. Activity gaps, a high-hand cancel or a consumed sweep discard the sequence.
function comboPunch(ring,nowMs,since){const G=GESTURE;let count=0,first=0,last=0,armed=true,previous=null;
 for(const s of ring){if(s.t<=since||nowMs-s.t>G.COMBO_WINDOW_MS)continue;
  if(previous!==null&&s.t-previous>G.SAMPLE_GAP_MS){count=0;armed=true;}previous=s.t;
  if(s.tot<G.COMBO_TOTAL||s.coh>G.COMBO_COH){count=0;armed=true;continue;}
  if(s.z[4]<=G.COMBO_LOW)armed=true;
  if(armed&&s.z[4]>=G.COMBO_HIGH){armed=false;
   if(count&&(s.t-last<G.COMBO_PERIOD_MIN||s.t-last>G.COMBO_PERIOD_MAX))count=0;
   if(!count)first=s.t;last=s.t;count++;
  }
 }
 return count>=3&&last-first>=G.COMBO_MIN_MS;}
// Slower, smaller sweeps need sustained flow and a continuous hand path, rather than relaxing the fast-sweep rule.
function slowSweepKey(ring,nowMs,since){const G=GESTURE;let trail=[];
 for(const s of ring){if(s.t<=since||nowMs-s.t>G.SLOW_SWEEP_MS)continue;
  // dx/dy are the mean flow over the whole frame; their length is global coherence. s.coh only covers
  // the configured punch region and can be zero for a coherent hand sweep near the edge of the camera.
  const p=trail[trail.length-1];if(s.bx===null||s.ba<G.SLOW_SWEEP_AREA){trail=[];continue;}
  if(p&&(s.t-p.t>G.SAMPLE_GAP_MS||Math.hypot(s.bx-p.bx,s.by-p.by)>G.SLOW_SWEEP_STEP))trail=[];
  trail.push(s);
 }
 if(trail.length<G.SLOW_SWEEP_SAMPLES)return null;
 const a=trail[0],b=trail[trail.length-1];if(nowMs-b.t>150||b.t-a.t<G.SLOW_SWEEP_MIN_MS)return null;
 const dx=b.bx-a.bx,dy=b.by-a.by,vert=Math.abs(dy)>Math.abs(dx),d=vert?dy:dx,sign=Math.sign(d);
 if(Math.abs(d)<G.SLOW_SWEEP_SPAN)return null;
 // The largest diff blob alternates between a hand's leading/trailing edges, so its centre may wobble even
 // during a straight pass. Use agreement of flow directions over time, not accumulated centroid backtracking.
 // A strong reverse vote rejects the pass; at least 75% of frames must positively support its direction.
 let votes=0,alignment=0;for(let i=1;i<trail.length;i++){const s=trail[i],along=(vert?s.dy:s.dx)*sign;
  if(along<=-FLOW_MIN)return null;if(along>=FLOW_MIN){votes++;alignment+=along/Math.hypot(s.dx,s.dy);}}
 if(votes/(trail.length-1)<G.SLOW_SWEEP_COH||alignment/Math.max(votes,1)<G.SLOW_SWEEP_COH)return null;
 return 'arrow'+(vert?(sign>0?'down':'up'):(sign>0?'right':'left'));}
// Per-gesture scores for the ring as of nowMs (samples at or before `since` are context only). Pure. detail (optional
// object) receives each gesture's terms, for margin reports and the test modal.
function gestureScores(ring,nowMs,since,punchSince,detail){const D=detail&&typeof detail==='object'?detail:null;const G=GESTURE,fl=Number.isFinite(since)?since:-Infinity,pf=Math.max(fl,Number.isFinite(punchSince)?punchSince:-Infinity),out={guard:0,raise:0,lean:0,throw:0,shove:0,punch:0};
 const S=(ring||[]).filter(s=>s.t>fl);if(!S.length)return out;const L=S[S.length-1],P=L.pose,moving=s=>s.tot>=G.STILL_TOT||Math.max(...s.z)>=G.STILL_ZONE;
 let lm=-1;for(let i=S.length-1;i>=0;i--)if(moving(S[i])){lm=i;break;}
 const hold=lm>=0&&lm<S.length-1?nowMs-S[lm].t:0;
 if(P&&hold>0){let peak=0,n=0,dx=0,dy=0;for(let i=lm;i>=0&&S[lm].t-S[i].t<=G.LOOKBACK_MS;i--){peak=Math.max(peak,...S[i].rc);if(moving(S[i])&&S[lm].t-S[i].t<G.RAISE_LOOK_MS){n++;dx+=S[i].dx;dy+=S[i].dy;}}
  if(n){dx/=n;dy/=n;}const act=ratio(peak,G.ACT_RC),up=-dy;
  const gT=[ratio(hold,G.GUARD_HOLD_MS),ratio(Math.max(Math.min(P[3],P[4]),Math.min(P[4],P[5])),G.GUARD_POSE),act];out.guard=Math.min(...gT);
  const rT=[ratio(hold,G.RAISE_HOLD_MS),ratio(Math.max(P[0],P[2]),G.RAISE_POSE),act,ratio(up,G.RAISE_UP),ratio(up,Math.max(Math.abs(dx),.01))];out.raise=Math.min(...rT);
  if(D){D.guard={hold:gT[0],pose:gT[1],act};D.raise={hold:rT[0],pose:rT[1],act,up:rT[3],vertical:rT[4]};}
  // lean: the centre column stayed changed (gaps under LEAN_GAP_MS allowed) for LEAN_AWAY_MS, and the motion that
  // emptied it was one-sided (one side column moving, at least LEAN_ASYM x the other; two raised hands are symmetric).
  const cp=s=>s.pose?Math.max(s.pose[1],s.pose[4]):0;
  if(cp(L)>=G.LEAN_POSE){let a=S.length-1,gap=null;for(let i=S.length-2;i>=0;i--){if(cp(S[i])>=G.LEAN_POSE){a=i;gap=null;}else{if(gap===null)gap=S[i+1].t;if(gap-S[i].t>G.LEAN_GAP_MS)break;}}
   let side=0;for(let i=a;i<=lm;i++){const s=S[i];if(!moving(s))continue;const z=s.rc,l=(z[3]+z[6])/2,r=(z[5]+z[8])/2,hi=Math.max(l,r),lo=Math.min(l,r);
    side=Math.max(side,Math.min(ratio(hi,G.LEAN_SIDE),ratio(hi/Math.max(lo,.01),G.LEAN_ASYM)));}
   const lT=[ratio(hold,G.LEAN_HOLD_MS),ratio(cp(L),G.LEAN_POSE),ratio(nowMs-S[a].t,G.LEAN_AWAY_MS),side];out.lean=Math.min(...lT);if(D)D.lean={hold:lT[0],pose:lT[1],away:lT[2],side};}}
 // A held guard can have a moving sleeve edge: coverage in the two arm cells stays stable even when a small
 // border exceeds STILL_ZONE. Keep the whole-frame motion cap, pose coverage and recent-activity requirements.
 if(P&&L.tot<G.STILL_TOT){for(const pair of [[3,4],[4,5]]){
  let first=S.length-1,peak=0;for(let i=S.length-1;i>=0;i--){const s=S[i];
   if(!s.pose||s.tot>=G.GUARD_MOTION_TOT||pair.some(k=>s.pose[k]<G.GUARD_POSE||Math.abs(s.pose[k]-P[k])>G.GUARD_JITTER))break;
   first=i;}
  for(let i=first;i>=0&&S[first].t-S[i].t<=G.LOOKBACK_MS;i--)peak=Math.max(peak,...S[i].rc);
  const score=Math.min(ratio(nowMs-S[first].t,G.GUARD_HOLD_MS),ratio(peak,G.ACT_RC));
  if(score>out.guard){out.guard=score;if(D)D.guard={hold:ratio(nowMs-S[first].t,G.GUARD_HOLD_MS),pose:ratio(Math.min(...pair.map(k=>P[k])),G.GUARD_POSE),act:ratio(peak,G.ACT_RC),stable:true,start:S[first].t};}
 }}
 // throw: a downward arc that started in a top corner (after a wind-up up that side) within THROW_MS and came across toward
 // the middle, ending at sample E; scored once E is THROW_FOLLOW_MS old and the hand has not come back up since. D.throw.end = E.t.
 const blob=s=>moving(s)&&s.bx!==null&&s.ba>=G.BLOB_MIN;
 for(let j=S.length-1;j>=0&&nowMs-S[j].t<=2*G.THROW_FOLLOW_MS;j--){const E=S[j];if(nowMs-E.t<G.THROW_FOLLOW_MS||!blob(E))continue;const jm=Math.abs(E.bx-.5);
  for(let i=j-1;i>=0&&E.t-S[i].t<=G.THROW_MS;i--){const s=S[i];if(!blob(s))continue;const im=Math.abs(s.bx-.5);if(jm>=im)continue;
   let fx=0,fn=0,rise=0,back=0,lo=s.by;const dir=Math.sign(E.bx-s.bx),sd=Math.sign(s.bx-.5);
   for(let k=i+1;k<S.length;k++)if(blob(S[k])){lo=Math.max(lo,S[k].by);back=Math.max(back,lo-S[k].by);}   // back up from the lowest point, over the arc and since
   for(let k=i-1;k>=0&&s.t-S[k].t<=G.THROW_WINDUP_MS;k--)if(blob(S[k])&&Math.sign(S[k].bx-.5)===sd&&Math.abs(S[k].bx-.5)>=G.THROW_SIDE)rise=Math.max(rise,S[k].by-s.by);
   for(let k=i+1;k<=j;k++)if(moving(S[k])){fx+=S[k].dx*dir;fn++;}
   const tT=[ratio(G.THROW_TOP,Math.max(s.by,.01)),ratio(im,G.THROW_SIDE),ratio(E.by-s.by,G.THROW_DROP),ratio(G.THROW_MID,Math.max(jm,.01)),ratio(Math.abs(E.bx-s.bx),G.THROW_ACROSS),ratio(fn?fx/fn:0,G.THROW_FLOW),ratio(rise,G.THROW_RISE),ratio(G.THROW_BACK,Math.max(back,.01))],v=Math.min(...tT);
   if(v>out.throw){out.throw=v;if(D)D.throw={top:tT[0],side:tT[1],drop:tT[2],mid:tT[3],across:tT[4],flow:tT[5],windup:tT[6],follow:tT[7],end:E.t};}}}
 // shove: the last SHOVE_WIN_MS of motion sits in the bottom-centre cell, dominates the upper cells, spreads (low
 // coherence) and stays put (palms grow toward the camera; rising forearms or a falling arm travel)
 {let n=0,b=0,c=0,nc=0,y0=null,y1=null,t0=0,t1=0;const up=[0,0,0,0,0,0];for(let i=S.length-1;i>=0&&nowMs-S[i].t<=G.SHOVE_WIN_MS;i--){const s=S[i];n++;b+=s.rc[7];if(blob(s)){if(y1===null){y1=s.by;t1=s.t;}y0=s.by;t0=s.t;}if(s.coh||s.dx||s.dy){c+=s.coh;nc++;}for(let k=0;k<6;k++)up[k]+=s.rc[k];}
  if(n>=G.SHOVE_MIN_N){b/=n;c=nc?c/nc:0;const u=Math.max(...up)/n;const sT=[ratio(b,G.SHOVE_Z),ratio(b/Math.max(u,.01),G.SHOVE_DOM),ratio(G.SHOVE_COH,Math.max(c,.01)),ratio(G.SHOVE_TRAVEL,Math.max(y0===null?0:Math.abs(y1-y0),.01)),ratio(t1-t0,G.SHOVE_SPAN_MS)];out.shove=Math.min(...sT);
   if(D)D.shove={bottom:sT[0],dominant:sT[1],spread:sT[2],still:sT[3],span:sT[4]};}}
 // punch: an onset at least PUNCH_DEFER_MS old (the wait lets a guard/raise/lean that starts like a punch win instead),
 // the scene still again and the centre back at rest (a lean or a held pose never returns); expires after PUNCH_GIVEUP_MS
 {const p=pendingPunch(ring,pf,nowMs);if(p!==null){let rest=P?Math.max(P[1],P[3],P[4],P[5]):0;
   // A raised fighting stance is already different from the camera's calm reference. Accept a return to that
   // stance too, but only when it was stable before the onset; never learn the extended fist as the baseline.
   const before=ring.filter(s=>s.t<p&&s.t>=p-300),base=before[before.length-1];
   if(P&&base&&base.pose&&before.length>=3&&base.t-before[0].t>=120&&before.every(s=>!moving(s)&&s.pose&&[1,3,4,5].every(k=>Math.abs(s.pose[k]-base.pose[k])<=G.GUARD_JITTER)))
    rest=Math.min(rest,Math.max(...[1,3,4,5].map(k=>Math.abs(P[k]-base.pose[k]))));
   const pT=[ratio(nowMs-p,G.PUNCH_DEFER_MS),moving(L)?0:G.SCORE_MAX,ratio(G.PUNCH_REST_POSE,Math.max(rest,.01))];out.punch=Math.min(...pT);
   if(D)D.punch={age:pT[0],still:pT[1],rest:pT[2]};}}
 if(comboPunch(S,nowMs,pf))out.punch=Math.max(out.punch,1);
 return out;}
// The gesture the ring shows now, in priority order, or null. allow: optional list of names to consider.
// opts: {since: floor for every gesture, punchSince: extra floor for punch onsets, allow: names to consider}.
function classifyGesture(ring,nowMs,opts){const o=opts||{},allow=o.allow||null,sc=gestureScores(ring,nowMs,o.since,o.punchSince);for(const g of GESTURES)if(sc[g]>=1&&(!allow||allow.includes(g)))return g;return null;}
// Menu: a gesture is an action (lean only moves the cursor to RUN). Commands: guard presses 'guard', throw presses 'catch'.
function gestureStep(t,intents,cmd,menu,runConfirm,nowMs){const G=GESTURE;
 if(menu){const g=classifyGesture(t.ring,nowMs,{since:t.gestureFloorMs,punchSince:t.punchFloorMs,allow:runConfirm?GESTURES.filter(x=>x!=='punch'):null});if(!g)return;
  intents.push({type:'action',id:GESTURE_ACTION[g]});t.pendingBurstAt=null;t.lastOnsetMs=nowMs;t.centreLow=false;
  t.gestureFloorMs=nowMs+(g==='lean'?G.LEAN_REFRACT_MS:G.ACTION_REFRACT_MS);if(g==='lean')t.leanAt=nowMs;return;}
 if(!cmd||!cmd.ready||cmd.waitingRelease)return;const allow=cmd.kind==='guard'?['guard']:cmd.kind==='catch'&&!cmd.held?['throw']:null;if(!allow)return;
 const g=classifyGesture(t.ring,nowMs,{since:t.gestureFloorMs,allow});if(!g)return;
 // a guard is recognised after its hold: date the press back to when the arms stopped (capped)
 let age=0;if(g==='throw'){const D={};gestureScores(t.ring,nowMs,t.gestureFloorMs,undefined,D);if(D.throw)age=Math.min(G.BACKDATE_MAX_MS,nowMs-D.throw.end);}   // a throw is recognised after its follow-through: date it to the arc end
 else if(g==='guard'){const D={};gestureScores(t.ring,nowMs,t.gestureFloorMs,undefined,D);
  if(D.guard&&D.guard.stable)age=Math.min(G.BACKDATE_MAX_MS,nowMs-D.guard.start);
  else for(let i=t.ring.length-1;i>=0;i--)if(t.ring[i].tot>=G.STILL_TOT||Math.max(...t.ring[i].z)>=G.STILL_ZONE){age=Math.min(G.BACKDATE_MAX_MS,nowMs-t.ring[i].t);break;}}
 intents.push(age>0?{type:'press',lagged:true,ageMs:age}:{type:'press',lagged:true});t.gestureFloorMs=nowMs+G.ACTION_REFRACT_MS;}
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
 NOISE_TAU_WARM:250,NOISE_TAU:1500,NOISE_TAU_LEAK:4000,NOISE_LEAK_MS:2000,NOISE_CAP:40,MHI_MS:500,FLOW_BLOCK:10,FLOW_STEP:2,FLOW_BLOCK_MIN:4,REARM:.5,AGE_EPS_MS:1,PUNCH_WIN_MS:133,RISE_MS:200,RISE_K:3,SOFT_FRAC:.5,COH_LO:.8,COH_HI:.95,PUNCH_FULL:.2,HIST:32,
 RECENT_MS:250,POSE_K:2,POSE_STILL:.06,POSE_STILL_ZONE:.15,POSE_REF_MS:300,POSE_SMALL:.1,POSE_ABSORB_MS:2000});
const DUP_RUN_MAX=3,GAIN_MIN=1,GAIN_MAX=9,GAIN_DEFAULT=5,LEGACY_GAIN=Object.freeze({LOW:3,MED:5,HIGH:7}),PUNCH_DEFAULT=.25,PUNCH_COOLDOWN_MS=350,PUNCH_MIN=.05,PUNCH_MAX=.6,SWEEP_SPAN_V2=.35,SWEEP_AREA_MIN=.01,BLOB_JUMP=.5,SWEEP_REFRACT_MS=700,FLOW_MIN=.35,ZONES_V2=Object.freeze(['CENTER','LEFT','RIGHT']),ZONE_INDEX=Object.freeze({LEFT:3,CENTER:4,RIGHT:5});
function gainK(gain){const g=Math.max(GAIN_MIN,Math.min(GAIN_MAX,Number.isFinite(gain)?gain:GAIN_DEFAULT));return V2.GAIN_K_MAX-(g-GAIN_MIN)*V2.GAIN_K_STEP;}
// Settings readers shared by the controller and host (mirror combat/commands.js normalizeSettings for raw objects).
function gainOf(s){const o=s||{},n=typeof o.webcamGain==='string'&&o.webcamGain.trim()!==''?Number(o.webcamGain):o.webcamGain;if(typeof n==='number'&&Number.isFinite(n))return Math.max(GAIN_MIN,Math.min(GAIN_MAX,Math.round(n)));return LEGACY_GAIN[o.webcamSensitivity]||GAIN_DEFAULT;}
function punchOf(s){const v=s&&s.webcamPunch;return typeof v==='number'&&Number.isFinite(v)?Math.max(PUNCH_MIN,Math.min(PUNCH_MAX,v)):PUNCH_DEFAULT;}
function zoneOfSetting(s){const z=s&&s.webcamZone;return ZONES_V2.includes(z)?z:'CENTER';}
function createMotionModel(){const N=FRAME_W*FRAME_H,BW=Math.ceil(FRAME_W/V2.FLOW_BLOCK),BH=Math.ceil(FRAME_H/V2.FLOW_BLOCK);
 return {N,cur:new Float32Array(N),prev:new Float32Array(N),tmp:new Float32Array(N),resid:new Float32Array(N),noise:new Float32Array(N),movingMs:new Float32Array(N),raw:new Uint8Array(N),ero:new Uint8Array(N),mask:new Uint8Array(N),
  mhi:new Float64Array(N).fill(-1e9),label:new Int32Array(N),stack:new Int32Array(N),hist:new Int32Array(511),bgx:new Float64Array(BW*BH),bgy:new Float64Array(BW*BH),bn:new Int32Array(BW*BH),BW,BH,
  histT:new Float64Array(V2.HIST),histE:new Float64Array(V2.HIST),histF:new Float64Array(V2.HIST),histS:new Float64Array(V2.HIST),histQ:new Float64Array(V2.HIST),histN:0,histI:0,histZone:-1,hasPrev:false,frames:0,t:0,learned:0,
  ref:new Float32Array(N),refValid:false,stillMs:0,heldMs:0};}
// Temporal reset (pause, halt): forget the previous frame, punch history and motion history; keep the learned noise.
function resetMotionTemporal(m){m.hasPrev=false;m.histN=0;m.histI=0;m.mhi.fill(-1e9);m.movingMs.fill(0);m.mask.fill(0);m.refValid=false;m.stillMs=0;m.heldMs=0;}
// Full reset (measureFloor): also forget the noise model, so warm-up re-learns the room.
function resetMotionModel(m){resetMotionTemporal(m);m.noise.fill(0);m.learned=0;}
function blur3(src,dst,tmp){const W=FRAME_W,H=FRAME_H;
 for(let y=0;y<H;y++){const o=y*W;for(let x=0;x<W;x++){const l=x>0?x-1:0,r=x<W-1?x+1:W-1;tmp[o+x]=(src[o+l]+src[o+x]+src[o+r])/3;}}
 for(let y=0;y<H;y++){const u=(y>0?y-1:0)*W,o=y*W,d=(y<H-1?y+1:H-1)*W;for(let x=0;x<W;x++)dst[o+x]=(tmp[u+x]+tmp[o+x]+tmp[d+x])/3;}}
// Robust brightness fit cur ~ a*prev + b: median diff, then two least-squares passes over inlier pixels.
// Too few inliers (the whole scene changed) means no correction.
function fitExposure(m,base){const N=m.N,c=m.cur,p=base||m.prev,h=m.hist;h.fill(0);for(let i=0;i<N;i++){let d=Math.round(c[i]-p[i]);d=d<-255?-255:d>255?255:d;h[d+255]++;}
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
 if(!m.hasPrev){m.prev.set(m.cur);m.hasPrev=true;m.frames++;m.ref.set(m.cur);m.refValid=true;m.stillMs=0;m.heldMs=0;return null;}
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
 const pz=ZONE_INDEX[zone],rcc=[0,0,0,0,0,0,0,0,0],rold=m.t-V2.RECENT_MS;for(let i=0;i<N;i++)if(m.mhi[i]>=rold)rcc[zm[i]]++;const recent=rcc.map((v,z)=>v/AREAS[z]);   // fps-independent activity
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
 let zmax=0;for(const v of zones)if(v>zmax)zmax=v;
 const pose=posePass(m,k,zm,moving/N>=V2.POSE_STILL||zmax>=V2.POSE_STILL_ZONE,dt);
 const t2=m.prev;m.prev=m.cur;m.cur=t2;m.frames++;
 const punchMin=Number.isFinite(o.punchMin)?o.punchMin:PUNCH_DEFAULT,noisy=rawZ.filter((v,z)=>v/AREAS[z]>=NOISY_MIN).length>=7;   // on the raw (pre-open) mask: speckle the open erases is still noise
 return {zones,total:moving/N,centroidX:moving?sx/moving/(W-1):null,centroidY:moving?sy/moving/(FRAME_H-1):null,event:noisy?'noisy':punch>=punchMin?'burst':null,
  blob,flow,punch,punchMin,zone,energy,rise:{e:E,q},exposure:{a,b},scale:sc,pose,recent};}
// Pose: per-zone fraction (display zones) of pixels that differ from a REFERENCE frame - the last calm scene - by more
// than POSE_K x the pixel's motion threshold, after an exposure fit against the reference. Frame-to-frame motion can't
// tell a held pose (guard, a raised hand, an empty chair) from a return to rest; this can. The reference refreshes after
// POSE_REF_MS of stillness when the scene matches it (lighting drift), and absorbs a changed scene only after
// POSE_ABSORB_MS of stillness, so a held gesture stays visible for seconds. Diagnostic + gesture input; punch ignores it.
function posePass(m,k,zm,moved,dt){const N=m.N,c=m.cur,r=m.ref,nz=m.noise,cnt=[0,0,0,0,0,0,0,0,0];if(!m.refValid)return null;
 const f=fitExposure(m,r),a=f.a,b=f.b,K=V2.POSE_K*k;
 for(let i=0;i<N;i++){const n=nz[i];if(Math.abs(c[i]-(a*r[i]+b))>K*(n>V2.MIN_NOISE?n:V2.MIN_NOISE))cnt[zm[i]]++;}
 const pose=cnt.map((v,z)=>v/AREAS[z]);let big=0;for(const v of pose)if(v>big)big=v;
 // stillMs: time without motion; heldMs: the part of it spent in a changed scene. Matching scene -> refresh after
 // POSE_REF_MS; changed scene -> absorbed only after POSE_ABSORB_MS of it held still.
 m.stillMs=moved?0:m.stillMs+dt;m.heldMs=moved||big<V2.POSE_SMALL?0:m.heldMs+dt;
 if(big<V2.POSE_SMALL?m.stillMs>=V2.POSE_REF_MS:m.heldMs>=V2.POSE_ABSORB_MS){r.set(c);m.heldMs=0;}
 return pose;}
// Per-zone mean of the learned noise (raw grey levels), for the noiseFloor getter.
function noiseSummary(m,mirror){const s=[0,0,0,0,0,0,0,0,0];for(let y=0;y<FRAME_H;y++)for(let x=0;x<FRAME_W;x++)s[zoneOf(mirror?FRAME_W-1-x:x,y)]+=m.noise[y*FRAME_W+x];return s.map((v,z)=>v/AREAS[z]);}
// --- Clip codec (pure). A recorded clip: {v:1,w,h,label,mirror,gain,zone,punchMin,t:[ms...],frames:[Uint8Array w*h...]}.
// JSON with base64 frames. decodeClip validates everything and returns null on garbage (never throws).
const CLIP_V=1,CLIP_LABELS=Object.freeze(['punch','guard','throw','shove','raise','lean','sweep','cancel','idle','talk']),CLIP_MAX_FRAMES=300,
 CLIP_MAX_CHARS=CLIP_MAX_FRAMES*Math.ceil(FRAME_W*FRAME_H/3)*4+65536;   // 10 s at 30 Hz, plus room for the header and t[]
const B64='ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/',B64_LUT=(()=>{const a=new Int16Array(128).fill(-1);for(let i=0;i<64;i++)a[B64.charCodeAt(i)]=i;return a;})();
function b64enc(u){const parts=[];let i=0;for(;i+2<u.length;i+=3){const n=u[i]<<16|u[i+1]<<8|u[i+2];parts.push(B64[n>>18&63]+B64[n>>12&63]+B64[n>>6&63]+B64[n&63]);}
 const r=u.length-i;if(r===1){const n=u[i]<<16;parts.push(B64[n>>18&63]+B64[n>>12&63]+'==');}else if(r===2){const n=u[i]<<16|u[i+1]<<8;parts.push(B64[n>>18&63]+B64[n>>12&63]+B64[n>>6&63]+'=');}return parts.join('');}
function b64dec(s,len){if(typeof s!=='string'||s.length!==Math.ceil(len/3)*4)return null;const pad=len%3?3-len%3:0,out=new Uint8Array(len),v=[0,0,0,0];let o=0;
 for(let i=0;i<s.length;i+=4){for(let k=0;k<4;k++){const j=i+k,c=s.charCodeAt(j);if(j>=s.length-pad){if(c!==61)return null;v[k]=0;continue;}const x=c<128?B64_LUT[c]:-1;if(x<0)return null;v[k]=x;}
  const n=v[0]<<18|v[1]<<12|v[2]<<6|v[3];if(o<len)out[o++]=n>>16&255;if(o<len)out[o++]=n>>8&255;if(o<len)out[o++]=n&255;}return out;}
function clipHeaderOk(c){if(!c||typeof c!=='object'||Array.isArray(c))return false;
 if(c.v!==CLIP_V||c.w!==FRAME_W||c.h!==FRAME_H||!CLIP_LABELS.includes(c.label)||typeof c.mirror!=='boolean')return false;
 if(!Number.isInteger(c.gain)||c.gain<GAIN_MIN||c.gain>GAIN_MAX||!ZONES_V2.includes(c.zone)||!Number.isFinite(c.punchMin)||c.punchMin<PUNCH_MIN||c.punchMin>PUNCH_MAX)return false;
 if(!Array.isArray(c.t)||!Array.isArray(c.frames)||c.t.length<1||c.t.length>CLIP_MAX_FRAMES||c.frames.length!==c.t.length)return false;
 for(let i=0;i<c.t.length;i++)if(!Number.isFinite(c.t[i])||c.t[i]<0||i&&c.t[i]<c.t[i-1])return false;return true;}
function encodeClip(clip){if(!clipHeaderOk(clip))return null;const N=FRAME_W*FRAME_H,frames=[];
 for(const f of clip.frames){if(!ArrayBuffer.isView(f)||f.BYTES_PER_ELEMENT!==1||f.length!==N)return null;frames.push(b64enc(f));}
 return JSON.stringify({v:CLIP_V,w:clip.w,h:clip.h,label:clip.label,mirror:clip.mirror,gain:clip.gain,zone:clip.zone,punchMin:clip.punchMin,t:clip.t.slice(),frames});}
function decodeClip(json){if(typeof json!=='string'||json.length>CLIP_MAX_CHARS)return null;let c;try{c=JSON.parse(json);}catch(_){return null;}
 if(!clipHeaderOk(c))return null;const N=FRAME_W*FRAME_H,frames=[];for(const s of c.frames){const f=b64dec(s,N);if(!f)return null;frames.push(f);}
 return {v:CLIP_V,w:c.w,h:c.h,label:c.label,mirror:c.mirror,gain:c.gain,zone:c.zone,punchMin:c.punchMin,t:c.t.slice(),frames};}
function createWebcamController(o){
 const g=o.global||global,doc=o.doc||g.document,now=o.now||(()=>g.performance.now()),setT=o.setTimeout||((f,ms)=>g.setTimeout(f,ms)),clearT=o.clearTimeout||(id=>g.clearTimeout(id));
 const gen=()=>o.pauseGeneration?o.pauseGeneration():0;
 let stream=null,video=null,ctx=null,timer=null,tracker=createTracker(),state='off',token=0,epoch=0,failed=false,disposed=false,wantStop=false;
 let warmupMs=WARMUP_MS,settleMs=0,prevT=0,readySince=null,gray=new Uint8Array(FRAME_W*FRAME_H),startedAt=0,lastGen=gen(),pendingRelease=null,slow=0,fast=0,interval=33,meter=0,listener=null;
 // v2: one stateful motion model owns the blurred previous frame, so the capture buffer is reused every tick.
 const model=createMotionModel();let last=null,lastMirror=true,pipeMs=0,lastVideoTime=null,dupRun=0;
 const settings=()=>o.getSettings?o.getSettings()||{}:{};
 // Gestures are opt-in by the game's phase. 'menu' only counts when the game can take an action (battleAction): without
 // it, the battle menu keeps the double-punch confirm instead of silently losing it.
 const phaseOf=()=>{const p=o.getPhase?o.getPhase():null;return typeof p!=='string'||p===''||p==='menu'&&typeof o.battleAction!=='function'?null:p;};
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
  // The listener gets (motion, t, frame, state): frame is a COPY of the grey frame (the capture buffer is reused every tick).
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
   if(motion&&listener){listener(motion,t,curr.slice(),state);if(stale())return;}
   if(t-startedAt>=settleMs+warmupMs){lastGen=gen();setState('live');}return;}
  if(!motion)return;
  if(listener){listener(motion,t,curr.slice(),state);if(stale())return;}
  const g2=gen(),paused=g2!==lastGen;lastGen=g2;
  const r=stepTracker(tracker,{motion,command:o.getCommand?o.getCommand():null,phase:phaseOf()},t);tracker=r.tracker;
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
  else if(i.type==='press'||i.type==='release'){// ageMs (a gesture recognised after its hold) is real time like the lag, so it shares lagToCommandTime's LAG_SCALE:
   // the command clock runs at real time x 0.55 (the game steps commands with dt*.55).
   const lag=Number.isFinite(s.webcamLagMs)?s.webcamLagMs:0,at=lagToCommandTime(o.commandClock(),i.ageMs>0?lag+i.ageMs:s.webcamLagMs);if(i.type==='press')o.commandInput(true,false,at);else o.commandInput(false,true,at);}
  else if(i.type==='action'){if(typeof o.battleAction==='function')o.battleAction(i.id);}
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
 CAL_FLOOR,CAL_NUIS_K,CAL_ONSET,CAL_PEAK_MS,PUNCH_NORM_PX,CLIP_V,CLIP_LABELS,CLIP_MAX_FRAMES,CLIP_MAX_CHARS,encodeClip,decodeClip,
 GESTURE,GESTURES,GESTURE_ACTION,gestureScores,classifyGesture,
 classifyMotion,createTracker,stepTracker,burstLevel,computeLag,calibratePunch,toGray,lagToCommandTime,gainK,gainOf,punchOf,zoneOfSetting,createMotionModel,resetMotionModel,resetMotionTemporal,stepMotion,noiseSummary,createWebcamController};
});
