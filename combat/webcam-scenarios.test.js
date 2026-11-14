'use strict';
// Synthetic 80x60 "videos" for the webcam pipeline: a person, a room, sensor noise, exposure and flicker, rendered per
// timestamp and fed through the real controller (v2) and through the old classifyMotion + legacy-tracker path, so the
// table shows what v2 changed. All randomness is a seeded mulberry32 that lives in this test only.
// SCENARIO PARAMETERS ARE FROZEN (reviewer bar, 2026-10-18): tune combat/webcam.js, never these numbers.
// "Passes synthetic" is the claim; real-camera feel is a manual user check.
const assert=require('node:assert/strict');
const W=require('./webcam.js');let checks=0;const fails=[];const ok=(v,m)=>{checks++;if(!v)fails.push(m);};
const FW=W.FRAME_W,FH=W.FRAME_H,N=FW*FH,SEEDS=[1,2,3,4,5],NUIS_S=60;
function mulberry32(a){return function(){a|=0;a=a+0x6D2B79F5|0;let t=Math.imul(a^a>>>15,1|a);t=t+Math.imul(t^t>>>7,61|t)^t;return ((t^t>>>14)>>>0)/4294967296;};}
const gauss=r=>(r()+r()+r()+r()-2)*1.73;   // ~N(0,1)
const U=(r,a,b)=>a+(b-a)*r();
// --- drawing (display coordinates; render() mirrors the frame, as the camera sees the user) ---
function disc(buf,cx,cy,r,v){if(r<=0)return;const x0=Math.max(0,Math.floor(cx-r-1)),x1=Math.min(FW-1,Math.ceil(cx+r+1)),y0=Math.max(0,Math.floor(cy-r-1)),y1=Math.min(FH-1,Math.ceil(cy+r+1));
 for(let y=y0;y<=y1;y++)for(let x=x0;x<=x1;x++){const a=Math.max(0,Math.min(1,r-Math.hypot(x-cx,y-cy)+.5));if(a>0){const i=y*FW+x;buf[i]=buf[i]*(1-a)+v*a;}}}
function ellipse(buf,cx,cy,rx,ry,v){const x0=Math.max(0,Math.floor(cx-rx-1)),x1=Math.min(FW-1,Math.ceil(cx+rx+1)),y0=Math.max(0,Math.floor(cy-ry-1)),y1=Math.min(FH-1,Math.ceil(cy+ry+1));
 for(let y=y0;y<=y1;y++)for(let x=x0;x<=x1;x++){const a=Math.max(0,Math.min(1,(1-Math.hypot((x-cx)/rx,(y-cy)/ry))*Math.min(rx,ry)+.5));if(a>0){const i=y*FW+x;buf[i]=buf[i]*(1-a)+v*a;}}}
function rect(buf,x0,y0,x1,y1,v){for(let y=Math.max(0,Math.floor(y0));y<Math.min(FH,Math.ceil(y1));y++)for(let x=Math.max(0,Math.floor(x0));x<Math.min(FW,Math.ceil(x1));x++){const c=Math.min(1,y+1-y0,y1-y)*Math.min(1,x+1-x0,x1-x);if(c>0)buf[y*FW+x]=buf[y*FW+x]*(1-c)+v*c;}}
const ease=u=>1-Math.pow(1-Math.max(0,Math.min(1,u)),2);
// A scene: {seed, dur (s), sigma, bg:'room'|'stripes', layers(t,buf), gain(t), offset(t), flicker:Hz|0}.
function scene(def){const r=mulberry32(def.seed*97+13),bg=new Float32Array(N);
 for(let y=0;y<FH;y++)for(let x=0;x<FW;x++)bg[y*FW+x]=def.bg==='stripes'?(((x>>2)+(y>>3))%2?185:35):72+22*Math.sin(x/9+1)+14*Math.cos(y/7)+r()*10;
 return Object.assign({sigma:3,rng:mulberry32(def.seed*7919+1),bg,buf:new Float32Array(N)},def);}
function person(buf,o){const sx=o.sx||0,sy=o.sy||0,b=o.bob||0;ellipse(buf,40+sx*.5,54+sy,22,14+(o.chest||0),96);disc(buf,40+sx,24+sy+b,9,148);rect(buf,36+sx,29+sy+b,44+sx,29+sy+b+(o.jaw||0),70);}
function render(sc,t){const buf=sc.buf;buf.set(sc.bg);if(sc.layers)sc.layers(t,buf);
 const g=sc.gain?sc.gain(t):1,off=sc.offset?sc.offset(t):0,out=new Uint8Array(N),r=sc.rng,hz=sc.flicker||0;
 for(let y=0;y<FH;y++){const fl=hz?1+.03*Math.sin(2*Math.PI*2*hz*t)+.05*Math.sin(2*Math.PI*(2*hz*t-3*y/FH)):1;   // lamp flicker at 2x mains, rolling-shutter bands
  for(let x=0;x<FW;x++){let v=(buf[y*FW+x]*g+off)*fl+gauss(r)*sc.sigma;v=v<0?0:v>255?255:Math.round(v);out[y*FW+(FW-1-x)]=v;}}
 return out;}
const ZC={LEFT:[13,30],CENTER:[40,32],RIGHT:[67,30]};
// Fist toward the camera: from a guard spot 8 px low, approach 80-140 ms, hold 40-80 ms, retract 150-250 ms.
function punches(zone,starts,r){const ps=starts.map(t0=>({t0,a:U(r,.08,.14),h:U(r,.04,.08),b:U(r,.15,.25),R:U(r,10,14),v:U(r,175,210),jx:U(r,-3,3),jy:U(r,-2,2)}));
 return (t,buf)=>{const [cx,cy]=ZC[zone];for(const p of ps){const u=t-p.t0;if(u<0||u>p.a+p.h+p.b)continue;const k=u<p.a?ease(u/p.a):u<p.a+p.h?1:1-ease((u-p.a-p.h)/p.b);disc(buf,cx+p.jx,cy+p.jy+8*(1-k),4+(p.R-4)*k,p.v);}};}
// Hand sweep: enters off-frame and crosses in d s.
function sweep(dir,t0,d,off,rad){return (t,buf)=>{const u=(t-t0)/d;if(u<0||u>1)return;const s=-12+104*u;
 if(dir==='right')disc(buf,s,32+off,rad,190);else if(dir==='left')disc(buf,FW-s,32+off,rad,190);else if(dir==='down')disc(buf,40+off,-12+84*u,rad,190);else disc(buf,40+off,FH+12-84*u,rad,190);};}
const idle=t=>({chest:.8*Math.sin(t*1.8)});
// --- drivers ---
const strike={kind:'strike',ready:true,waitingRelease:false,held:false};
function frameTimes(sc,opt){const hz=opt.hz||30,step=1000/hz,r=mulberry32(sc.seed*31+(opt.vseed||3)),ts=[];
 for(let k=0;k*step<=sc.dur*1000;k++){const t=k*step;if(opt.drop&&t>1600&&r()<opt.drop)continue;ts.push({t:t+(opt.jitter?U(r,-opt.jitter,opt.jitter):0),dup:!!(opt.dup&&t>1600&&r()<opt.dup)});}return ts;}
// v2: the real controller in the menu context (keys), plus a strike tracker fed from the calibration listener with
// the same motion stream, so one pass gives both contexts.
function runNew(sc,opt={}){const settings=Object.assign({webcam:'ON',webcamMirror:true,webcamLagMs:0,webcamGain:W.GAIN_DEFAULT,webcamZone:opt.zone||'CENTER'},opt.settings);
 const keys=[],press=[];let clock=0,st=W.createTracker();
 const c=W.createWebcamController({global:{navigator:{}},doc:{body:{appendChild(){}},createElement(){return {};}},now:()=>clock,setTimeout:()=>0,clearTimeout(){},
  getSettings:()=>settings,setSettings(){},getCommand:()=>null,commandClock:()=>1,pauseGeneration:()=>0,isInputOpen:()=>true,press:k=>keys.push({ms:clock,key:k}),release(){},commandInput(){}});
 c.measureFloor(W.WARMUP_MS,W.SETTLE_MS);let live=false;
 c.setCalibrationListener((m,t)=>{if(c.state==='warmup')return;const r=W.stepTracker(st,{motion:m,command:strike},t);st=r.tracker;for(const i of r.intents)press.push({ms:t,key:'press'});});
 let prev=null;for(const f of frameTimes(sc,opt)){clock=f.t;const g=f.dup&&prev?prev:render(sc,f.t/1000);prev=g;c.processFrame(g,f.t);if(opt.trace&&c.lastMotion){const m=c.lastMotion;opt.trace.push([Math.round(f.t),m.punch.toFixed(2),m.event||'-',m.blob.area.toFixed(3),(m.blob.x===null?-1:m.blob.x).toFixed(2),(m.blob.y===null?-1:m.blob.y).toFixed(2),m.flow.dx.toFixed(2),m.flow.dy.toFixed(2),m.flow.coh.toFixed(2),m.rise.e.toFixed(3),m.rise.q.toFixed(3)].join(' '));}}
 return {keys,press};}
// old: classifyMotion at MED + the per-zone floor averaged over warm-up after settle (the v1 controller), legacy tracker.
function runOld(sc,opt={}){const keys=[],press=[];let t0=null,prev=null,acc=[0,0,0,0,0,0,0,0,0],n=0,floor=null,tm=W.createTracker(),ts=W.createTracker(),last=null;
 for(const f of frameTimes(sc,opt)){const g=f.dup&&last?last:render(sc,f.t/1000);last=g;const p=prev;prev=g;if(t0===null){t0=f.t;continue;}
  if(floor===null){const raw=W.classifyMotion(p,g,{threshold:W.THRESHOLDS.MED,mirror:true});if(f.t-t0>=W.SETTLE_MS){for(let z=0;z<9;z++)acc[z]+=raw.zones[z];n++;}
   if(f.t-t0>=W.SETTLE_MS+W.WARMUP_MS)floor=acc.map(v=>Math.min(W.BURST_MIN/2,v/Math.max(1,n)));continue;}
  const m=W.classifyMotion(p,g,{threshold:W.THRESHOLDS.MED,noiseFloor:floor,mirror:true});
  let r=W.stepTracker(tm,{motion:m,command:null},f.t);tm=r.tracker;for(const i of r.intents)keys.push({ms:f.t,key:i.key});
  r=W.stepTracker(ts,{motion:m,command:strike},f.t);ts=r.tracker;for(const i of r.intents)press.push({ms:f.t,key:'press'});}
 return {keys,press};}
function scoreHits(press,starts){const used=new Set();let hits=0;for(const s of starts){const i=press.findIndex((p,j)=>!used.has(j)&&p.ms>=s*1000-1&&p.ms<=s*1000+400);if(i>=0){hits++;used.add(i);}}return {hits,extra:press.length-used.size};}
const arrows=k=>k.filter(x=>x.key.startsWith('arrow'));
const rows=[];const row=(name,o,n)=>rows.push([name,o,n]);
// --- nuisance scenes: 60 s x 5 seeds, 0 false punches (strike context) and 0 menu keys ---
const NUIS={
 sway:s=>{const r=mulberry32(s*101),A=U(r,3,8),T=U(r,1.2,2.4),B=U(r,0,1.5),ph=r()*6;return scene({seed:s,layers:(t,b)=>person(b,{sx:A*Math.sin(2*Math.PI*t/T+ph),bob:B*Math.sin(4*Math.PI*t/T),chest:.8*Math.sin(t*1.8)})});},
 breathing:s=>{const r=mulberry32(s*103),T=U(r,2.5,5),A=U(r,1,2.2);return scene({seed:s,layers:(t,b)=>person(b,{chest:A*Math.sin(2*Math.PI*t/T),bob:A*.6*Math.sin(2*Math.PI*t/T)})});},
 jaw:s=>{const r=mulberry32(s*107),f=U(r,3,5);return scene({seed:s,layers:(t,b)=>person(b,{jaw:Math.max(0,1.6+1.6*Math.sin(2*Math.PI*(f*t+.4*Math.sin(t*2.3)))),bob:.6*Math.sin(2*Math.PI*t/0.9),sx:.8*Math.sin(t*1.3),chest:.8*Math.sin(t*1.8)})});},
 ramp:s=>{const r=mulberry32(s*109),P=U(r,6,12);const k=t=>.5-.5*Math.cos(2*Math.PI*t/P);return scene({seed:s,layers:(t,b)=>person(b,idle(t)),offset:t=>60*k(t)-20,gain:t=>.9+.25*k(t)});},
 stepAdd:s=>scene({seed:s,layers:(t,b)=>person(b,idle(t)),offset:t=>Math.floor(t/7)%2?40:0}),
 stepMul:s=>scene({seed:s,bg:'stripes',layers:(t,b)=>person(b,idle(t)),gain:t=>Math.floor(t/7)%2?1.3:1}),
 flicker50:s=>scene({seed:s,flicker:50,layers:(t,b)=>person(b,idle(t))}),
 flicker60:s=>scene({seed:s,flicker:60,layers:(t,b)=>person(b,idle(t))}),
 fan:s=>{const r=mulberry32(s*113);return scene({seed:s,layers:(t,b)=>{person(b,idle(t));for(let y=20;y<30;y+=2)for(let x=24;x<32;x+=2)rect(b,x,y,x+2,y+2,60+r()*60);}});},
};
const nuisPeak={};
for(const name of Object.keys(NUIS)){let fp=0,fk=0,peak=0;
 for(const s of SEEDS){const sc=NUIS[name](s);sc.dur=NUIS_S;sc.sigma=2+s;const tr=[];const n=runNew(sc,{trace:name==='breathing'||name==='jaw'?tr:null});fp+=n.press.length;fk+=n.keys.length;for(const l of tr)peak=Math.max(peak,+l.split(' ')[1]);
  ok(n.press.length===0&&n.keys.length===0,name+' seed '+s+': 0 false punches/keys ('+n.press.length+'/'+n.keys.map(k=>k.key).join()+')');}
 nuisPeak[name]=peak;const o=(()=>{const sc=NUIS[name](1);sc.dur=NUIS_S;sc.sigma=3;return runOld(sc);})();
 row(name+' 60s (false punches; false keys)',o.press.length+'; '+o.keys.length+' (seed 1)',fp+'; '+fk+' (5 seeds)');}
// --- punches per zone: 5 seeds x 10, each seed >= 9/10, no extras; menu context: no arrows ---
function punchScene(zone,s){const r=mulberry32(s*1009+zone.length),starts=[];for(let i=0;i<10;i++)starts.push(2+i*1.0+U(r,0,.15));const pl=punches(zone,starts,r);
 const sc=scene({seed:s,layers:(t,b)=>{person(b,idle(t));pl(t,b);}});sc.dur=12.5;sc.sigma=2+s;return {sc,starts};}
for(const zone of W.ZONES_V2){let hits=0,extra=0,arr=0,oh=0;
 for(const s of SEEDS){const {sc,starts}=punchScene(zone,s),n=runNew(sc,{zone}),h=scoreHits(n.press,starts);hits+=h.hits;extra+=h.extra;arr+=arrows(n.keys).length;
  ok(h.hits>=9,'punch '+zone+' seed '+s+' >= 9/10 ('+h.hits+')');ok(h.extra===0,'punch '+zone+' seed '+s+': no extra presses ('+h.extra+')');ok(arrows(n.keys).length===0,'punch '+zone+' seed '+s+' in a menu: no arrow ('+n.keys.map(k=>k.key).join()+')');
  if(zone==='CENTER'){oh+=scoreHits(runOld(sc).press,starts).hits;}}
 row('punch '+zone+' (hits/50, extra, menu arrows)',zone==='CENTER'?oh+'/50':'n/a (centre only)',hits+'/50, '+extra+', '+arr);}
// double punch in a menu confirms once; a single punch does nothing (the double-burst rule stays)
for(const zone of W.ZONES_V2){let good=0;for(const s of SEEDS){const r=mulberry32(s*1013),st=[2,2+U(r,.45,.6),6];const pl=punches(zone,st,r);const sc=scene({seed:s,layers:(t,b)=>{person(b,idle(t));pl(t,b);}});sc.dur=8;
  const n=runNew(sc,{zone}),k=n.keys.map(x=>x.key).join();if(k==='z'&&n.keys[0].ms<3000)good++;ok(k==='z'&&n.keys[0].ms<3000,'menu '+zone+' seed '+s+': double punch = one z, lone punch nothing ('+k+')');}
 row('menu double punch '+zone+' (one z, lone punch ignored)','-',good+'/5');}
// --- sweeps: 10 variants per direction ---
for(const dir of ['left','right','up','down']){let good=0,og=0;
 for(let v=0;v<10;v++){const r=mulberry32(5000+v*17+dir.length),d=U(r,.3,.5),off=U(r,-6,6),rad=U(r,7,10);const sc=scene({seed:v+1,layers:(t,b)=>{person(b,idle(t));sweep(dir,3,d,off,rad)(t,b);}});sc.dur=5;sc.sigma=3+v%5;
  const n=runNew(sc),k=n.keys.map(x=>x.key).join();if(k==='arrow'+dir)good++;ok(k==='arrow'+dir,'sweep '+dir+' variant '+v+' ('+k+')');if(runOld(sc).keys.map(x=>x.key).join()==='arrow'+dir)og++;}
 row('sweep '+dir+' (exactly one arrow)',og+'/10',good+'/10');}
{let n0=0,o0=0;for(const s of SEEDS){const r=mulberry32(s*1201),d=U(r,.3,.45);const sc=scene({seed:s,layers:(t,b)=>{person(b,idle(t));const u=Math.max(0,Math.min(1,(t-3)/d));if(t>=3&&t<=3+d+.2){disc(b,36-28*u,32,8,190);disc(b,44+28*u,32,8,190);}}});sc.dur=5;
  const n=arrows(runNew(sc).keys).length;n0+=n;o0+=arrows(runOld(sc).keys).length;ok(n===0,'two hands apart seed '+s+': no arrow ('+n+')');}
 row('two hands apart (arrows, 5 seeds)',o0,n0);}
// Regression: documented high two-hand wave must never become a confirm or strike.
{let oldFalse=0,newFalse=0;for(const seed of SEEDS){const make=()=>{const sc=scene({seed,layers:(t,b)=>{person(b,idle(t));if(t>=3&&t<13){const w=6*Math.sin(t*2*Math.PI*2.5);disc(b,12+w,10,9,190);disc(b,68-w,10,9,190);}}});sc.dur=14;return sc;};
 const n=runNew(make()),o=runOld(make());oldFalse+=o.keys.filter(k=>k.key==='z').length+o.press.length;newFalse+=n.keys.filter(k=>k.key==='z').length+n.press.length;
 ok(!n.keys.some(k=>k.key==='z')&&n.press.length===0,'two hands waving high seed '+seed+': no confirm or strike ('+n.keys.map(k=>k.key)+'; '+n.press.length+')');}
 row('two hands waving high 10s x5 (false confirm/strike)',oldFalse,newFalse);}
// Fast return sweeps cannot pair their initial motion into a menu confirm.
{let confirms=0;for(const seed of SEEDS){const sc=scene({seed,layers:(t,b)=>{person(b,idle(t));if(t>=3&&t<13){const u=((t-3)/.4)%2;disc(b,-12+104*(u<1?u:2-u),32,8,190);}}});sc.dur=14;const n=runNew(sc),z=n.keys.filter(k=>k.key==='z');confirms+=z.length;ok(z.length===0,'fast return sweep seed '+seed+': no confirm');}row('fast return sweeps 10s x5 (false confirms)','-',confirms);}
// --- frame rate / timing: identical intents within one frame at 15, 20, 30 Hz and jitter; drops and duplicates ---
{const fmt=a=>a.map(x=>x.key.replace('arrow','')).join(',')||'-';
 for(const s of [1,2]){const {sc,starts}=punchScene('CENTER',s),runs={30:runNew(sc,{hz:30}),20:runNew(sc,{hz:20}),15:runNew(sc,{hz:15}),jit:runNew(sc,{hz:30,jitter:12})};
  const same=(a,b)=>a.length===b.length&&a.every((p,i)=>Math.abs(p.ms-b[i].ms)<=1000/15+1);
  ok(same(runs[30].press,runs[20].press)&&same(runs[30].press,runs[15].press)&&same(runs[30].press,runs.jit.press),'punch seed '+s+': same presses at 30/20/15 Hz/jitter ('+[30,20,15,'jit'].map(k=>runs[k].press.length).join('/')+')');
  ok(scoreHits(runs[15].press,starts).hits>=9,'punch seed '+s+' at 15 Hz >= 9/10');
  const o={30:runOld(sc,{hz:30}).press.length,20:runOld(sc,{hz:20}).press.length,15:runOld(sc,{hz:15}).press.length};
  row('punch CENTER seed '+s+' presses 30/20/15 Hz/jitter',o[30]+'/'+o[20]+'/'+o[15],[30,20,15,'jit'].map(k=>runs[k].press.length).join('/'));
  for(const [name,opt] of [['dropped 15%',{drop:.15}],['duplicates 20%',{dup:.2}],['jitter 12 ms',{jitter:12}]]){const h=scoreHits(runNew(sc,opt).press,starts),ho=scoreHits(runOld(sc,opt).press,starts);
   row('punch CENTER seed '+s+', '+name,ho.hits+'/10, '+ho.extra,h.hits+'/10, '+h.extra);ok(h.hits>=9&&h.extra===0,'punch seed '+s+' '+name+' ('+h.hits+', extra '+h.extra+')');}}
 {const sc=NUIS.sway(3);sc.dur=NUIS_S;for(const [name,opt] of [['15 Hz',{hz:15}],['20 Hz',{hz:20}],['dropped 15%',{drop:.15}],['duplicates 20%',{dup:.2}],['jitter 12 ms',{jitter:12}]]){const n=runNew(sc,opt),o=runOld(sc,opt);
  row('sway 60s, '+name+' (false punches; keys)',o.press.length+'; '+o.keys.length,n.press.length+'; '+n.keys.length);ok(n.press.length===0&&n.keys.length===0,'sway '+name+': nothing ('+n.press.length+'/'+fmt(n.keys)+')');}}
 for(const dir of ['left','up']){const mk=()=>{const sc=scene({seed:9,layers:(t,b)=>{person(b,idle(t));sweep(dir,3,.4,0,8)(t,b);}});sc.dur=5;return sc;};
  const r=[30,20,15].map(hz=>fmt(runNew(mk(),{hz}).keys)),o=[30,20,15].map(hz=>fmt(runOld(mk(),{hz}).keys));row('sweep '+dir+' at 30/20/15 Hz',o.join(' / '),r.join(' / '));ok(r.every(k=>k===dir),'sweep '+dir+' identical at 30/20/15 Hz ('+r.join(' / ')+')');}
 // Real repeated-frame coverage is above (duplicates 20%) and in webcam.test.js; no no-op duplicate assertion.
}
// --- leak: 30 s of continuous active play, then a punch still hits ---
{const r=mulberry32(77),busy=[];for(let t=2;t<32;t+=.55)busy.push(t);const pl=punches('CENTER',busy,r),last=punches('CENTER',[34],r),A=U(r,3,6);
 const sc=scene({seed:7,layers:(t,b)=>{person(b,{sx:t<32?A*Math.sin(t*3.1):0,chest:.8*Math.sin(t*1.8)});if(t<32){pl(t,b);disc(b,62+8*Math.sin(t*4.3),20+6*Math.cos(t*3.7),7,185);}last(t,b);}});sc.dur=36;
 const n=runNew(sc),hit=scoreHits(n.press,[34]).hits;row('30 s active play, then one punch (hit)','-',hit?'hit':'miss');ok(hit===1,'after 30 s of active play a punch still hits');}
// --- calibration floor: weak punches can't set a threshold breathing/jaw can cross ---
{const nuis=Math.max(nuisPeak.breathing,nuisPeak.jaw),thr=W.calibratePunch([.06,.08,.07],0);ok(thr>nuis,'weak-punch calibration threshold '+thr.toFixed(3)+' is above the breathing/jaw peak '+nuis.toFixed(3));
 ok(W.calibratePunch([.06,.08,.07],.3)>.3,'calibration floors above a measured nuisance peak');row('calibrated threshold, 3 weak punches vs nuisance peak','-',thr.toFixed(3)+' > '+nuis.toFixed(3));}
// --- performance: pipeline only ---
{const m=W.createMotionModel(),sc=punchScene('CENTER',1).sc,frames=[];for(let i=0;i<60;i++)frames.push(render(sc,2+i/30));const t0=process.hrtime.bigint();
 for(let i=0;i<1000;i++)W.stepMotion(m,frames[i%60],33,{gain:5,mirror:true,zone:'CENTER'});const ms=Number(process.hrtime.bigint()-t0)/1e6/1000;row('pipeline cost per frame','-',ms.toFixed(3)+' ms');ok(ms<3,'pipeline < 3 ms/frame ('+ms.toFixed(3)+')');}
// --- gestures in the battle menu (plan docs/plans/2026-10-23-webcam-gesture-set.md, Phase 2). ADDED 2026-10-23;
// SCENE PARAMETERS FROZEN from here on, like the scenes above: tune combat/webcam.js, never these numbers.
// The real controller with getPhase 'menu' and a battleAction stub that counts actions. Each gesture scene starts at
// GT0 after idle and ends with the pose held (as the player's clips do), so one gesture must give exactly one action.
const GT0=2,glerp=(a,b,u)=>a+(b-a)*Math.max(0,Math.min(1,u));
function runGesture(sc,opt={}){const settings=Object.assign({webcam:'ON',webcamMirror:true,webcamLagMs:0,webcamGain:W.GAIN_DEFAULT,webcamZone:'CENTER'},opt.settings);
 const actions=[],keys=[];let clock=0;
 const c=W.createWebcamController({global:{navigator:{}},doc:{body:{appendChild(){}},createElement(){return {};}},now:()=>clock,setTimeout:()=>0,clearTimeout(){},
  getSettings:()=>settings,setSettings(){},getCommand:()=>null,commandClock:()=>1,pauseGeneration:()=>0,isInputOpen:()=>true,getPhase:()=>'menu',
  battleAction:id=>actions.push({ms:clock,id}),press:k=>keys.push({ms:clock,key:k}),release(){},commandInput(){}});
 c.measureFloor(W.WARMUP_MS,W.SETTLE_MS);
 let prev=null;for(const f of frameTimes(sc,opt)){clock=f.t;const g=f.dup&&prev?prev:render(sc,f.t/1000);prev=g;c.processFrame(g,f.t);}
 return {actions,keys};}
const GSCENE={
 // forearms rise from the lap and cross in front of the chest (a wide band over the middle row), then hold
 guard:s=>{const r=mulberry32(s*211),d=U(r,.3,.45),y=U(r,30,34),w=U(r,30,34),jx=U(r,-3,3);
  return scene({seed:s,layers:(t,b)=>{person(b,idle(t));if(t<GT0)return;const yy=glerp(64,y,ease((t-GT0)/d));rect(b,40+jx-w,yy-5,40+jx+w,yy+2,200);rect(b,40+jx-w,yy+2,40+jx+w,yy+8,185);}});},
 // one hand rises from the side to a top corner and stays up
 raise:s=>{const r=mulberry32(s*223),d=U(r,.3,.45),side=s%2?1:-1,x=40+side*U(r,24,28),y=U(r,8,11);
  return scene({seed:s,layers:(t,b)=>{person(b,idle(t));if(t<GT0)return;const yy=glerp(64,y,ease((t-GT0)/d));rect(b,x-4,yy+4,x+4,64,180);disc(b,x,yy,7,205);}});},
 // the whole person slides out of one side and stays out
 lean:s=>{const r=mulberry32(s*227),d=U(r,.5,.7),side=s%2?1:-1,far=U(r,64,80);
  return scene({seed:s,layers:(t,b)=>{const o=idle(t);o.sx=t<GT0?0:side*far*ease((t-GT0)/d);person(b,o);}});},
 // overhand: the hand rises in a top corner, then arcs down through the middle and drops out of view
 throw:s=>{const r=mulberry32(s*229),side=s%2?1:-1,x0=40+side*U(r,24,28),up=U(r,.25,.35),arc=U(r,.25,.35),down=.2,ex=40+side*U(r,-4,2);
  return scene({seed:s,layers:(t,b)=>{person(b,idle(t));const u=t-GT0;if(u<0||u>up+arc+down)return;let x,y;
   if(u<up){x=x0;y=glerp(44,8,ease(u/up));}else if(u<up+arc){const k=(u-up)/arc;x=glerp(x0,ex,k);y=glerp(8,50,k*k);}else{const k=(u-up-arc)/down;x=ex;y=glerp(50,72,k);}
   disc(b,x,y,6,205);}});},
 // both palms push toward the camera from the chest, once (bottom-centre motion that spreads and stays put)
 shove:s=>{const r=mulberry32(s*233),p=U(r,.6,.8),gap=U(r,7,9);
  return scene({seed:s,layers:(t,b)=>{person(b,idle(t));const u=t-GT0;if(u<0)return;const k=u<p?.5-.5*Math.cos(2*Math.PI*u/p):0;for(const sx of [-gap,gap])disc(b,40+sx,51-2*k,6+6*k,205);}});},
};
const GWANT={guard:'defend',raise:'bag',lean:'run-cursor',throw:'ball',shove:'swap',punch:'attack'};
const ids=a=>a.map(x=>x.id).join()||'-';
for(const g of Object.keys(GSCENE)){const per={};
 for(const hz of [30,15]){let good=0;for(const s of SEEDS){const sc=GSCENE[g](s);sc.dur=GT0+2.2;sc.sigma=2+s;const n=runGesture(sc,{hz});const k=ids(n.actions);if(k===GWANT[g])good++;
   ok(k===GWANT[g],'menu '+g+' seed '+s+' at '+hz+' Hz: exactly one '+GWANT[g]+' ('+k+')');}per[hz]=good;}
 row('menu gesture '+g+' -> '+GWANT[g]+' (30 Hz; 15 Hz)','n/a',per[30]+'/5; '+per[15]+'/5');}
// punch: one punch from stillness is ATTACK (deferred until the fist is back); a double punch is still ONE action and no 'z'
{let one=0,two=0;for(const s of SEEDS){const r=mulberry32(s*1301),a=[2+U(r,0,.1)],b=[2,2+U(r,.3,.45)];
  for(const [st,label] of [[a,'single'],[b,'double']]){const pl=punches('CENTER',st,mulberry32(s*1303));const sc=scene({seed:s,layers:(t,bf)=>{person(bf,idle(t));pl(t,bf);}});sc.dur=4.5;sc.sigma=2+s;
   const n=runGesture(sc),k=ids(n.actions),z=n.keys.filter(x=>x.key==='z').length;const good=k==='attack'&&z===0;if(good){if(label==='single')one++;else two++;}
   ok(good,'menu '+label+' punch seed '+s+': one attack, no z ('+k+'; z '+z+')');}}
 row('menu punch -> attack (single; double = one action, no z)','n/a',one+'/5; '+two+'/5');}
// nuisance in the menu: 0 actions (30 s x 3 seeds per scene, 30 Hz) - the battleAction stub counts them
{let total=0;for(const name of Object.keys(NUIS)){let n0=0;for(const s of [1,2,3]){const sc=NUIS[name](s);sc.dur=30;sc.sigma=2+s;const n=runGesture(sc);n0+=n.actions.length;ok(n.actions.length===0,'menu '+name+' seed '+s+': no action ('+ids(n.actions)+')');ok(n.keys.length===0,'menu '+name+' seed '+s+': no navigation or cancel');}total+=n0;}
 row('menu nuisance, 9 scenes x 3 seeds x 30 s (actions)','n/a',total);}
{let n0=0;for(const name of ['sway','jaw']){const sc=NUIS[name](4);sc.dur=30;const n=runGesture(sc,{hz:15});n0+=n.actions.length;ok(n.actions.length===0,'menu '+name+' at 15 Hz: no action ('+ids(n.actions)+')');ok(n.keys.length===0,'menu '+name+' at 15 Hz: no navigation or cancel');}row('menu sway + jaw at 15 Hz, 30 s (actions)','n/a',n0);}
// sweeps in the menu still give their arrow and no action; two hands waving high give no action
{let good=0;for(const dir of ['left','right','up','down'])for(let v=0;v<5;v++){const r=mulberry32(7000+v*19+dir.length),d=U(r,.3,.5),off=U(r,-6,6),rad=U(r,7,10);
  const sc=scene({seed:v+1,layers:(t,b)=>{person(b,idle(t));sweep(dir,3,d,off,rad)(t,b);}});sc.dur=5;sc.sigma=3+v%5;const n=runGesture(sc),k=n.keys.map(x=>x.key).join();
  const g=k==='arrow'+dir&&n.actions.length===0;if(g)good++;ok(g,'menu sweep '+dir+' variant '+v+': its arrow, no action ('+k+'; '+ids(n.actions)+')');}
 row('menu sweeps (arrow, no action)','n/a',good+'/20');}
{let acts=0;for(const seed of [1,2,3]){const sc=scene({seed,layers:(t,b)=>{person(b,idle(t));if(t>=3&&t<9){const w=6*Math.sin(t*2*Math.PI*2.5);disc(b,12+w,10,9,190);disc(b,68-w,10,9,190);}}});sc.dur=10;
  const n=runGesture(sc);acts+=n.actions.length;ok(n.actions.length===0,'menu two hands waving high seed '+seed+': no action ('+ids(n.actions)+')');}row('menu two hands waving high 6 s x3 (actions)','n/a',acts);}
// --- Phase 3 (2026-10-24): the player's camera runs at ~13 fps (75 ms frames). ADDED 2026-10-24; SCENE PARAMETERS FROZEN
// from here on, like the scenes above: tune combat/webcam.js, never these numbers.
// crosses: a combination of straight punches toward the camera, alternating fists, each leaving a high guard beside the
// head and driving in to the midline - dropping as the arm extends (a laptop camera sits below the face), the forearm
// showing under the fist - then back to the guard, the next one 0.45-0.6 s later with no rest. In blob terms that is a
// top-side start, a drop and an end near the middle, the shape that read as a throw (ball) on the player's punch clip.
// Physically never a throw: it leaves from the guard with no wind-up and comes back up. ATTACK or nothing, never another action.
// overhand: the hand rises up its side into the top corner, pauses, arcs across and down through the middle, drops out.
const HZ13=1000/75,G13={
 crosses:s=>{const r=mulberry32(s*241),first=s%2?1:-1,ps=[];let t0=GT0;for(let i=0;i<4;i++){const side=i%2?-first:first;ps.push({t0,side,x0:40+side*U(r,12,16),y0:U(r,10,14),xe:40-side*U(r,0,6),ye:U(r,26,32),R:U(r,12,15),a:U(r,.12,.16),h:U(r,.04,.08),b:U(r,.2,.3)});t0+=U(r,.45,.6);}
  return scene({seed:s,layers:(t,buf)=>{person(buf,idle(t));for(const side of [-1,1]){const p=ps.find(q=>q.side===side&&t>=q.t0&&t<=q.t0+q.a+q.h+q.b)||ps.find(q=>q.side===side);const u=t-p.t0,k=u<0||u>p.a+p.h+p.b?0:u<p.a?ease(u/p.a):u<p.a+p.h?1:1-ease((u-p.a-p.h)/p.b);
   const x=glerp(p.x0,p.xe,k),y=glerp(p.y0,p.ye,k);rect(buf,x-3,y,x+3,y+8+14*k,165);disc(buf,x,y,5+(p.R-5)*k,200);}}});},
 overhand:s=>{const r=mulberry32(s*251),side=s%2?1:-1,xs=40+side*U(r,14,18),xc=40+side*U(r,22,27),yc=U(r,6,10),up=U(r,.25,.35),pause=U(r,.05,.1),arc=U(r,.2,.3),xe=40-side*U(r,0,6),ye=U(r,44,50);
  return scene({seed:s,layers:(t,buf)=>{person(buf,idle(t));const u=t-GT0;if(u<0||u>up+pause+arc+.15)return;let x,y;
   if(u<up){x=glerp(xs,xc,ease(u/up));y=glerp(40,yc,ease(u/up));}else if(u<up+pause){x=xc;y=yc;}else if(u<up+pause+arc){const k=(u-up-pause)/arc;x=glerp(xc,xe,k);y=glerp(yc,ye,k*k);}else{x=xe;y=glerp(ye,72,(u-up-pause-arc)/.15);}
   disc(buf,x,y,6,205);}});},
};
for(const [g,want] of [['crosses','attack or nothing (never ball)'],['overhand','ball']]){const per=[];
 for(const hz of [HZ13,15,30]){let good=0,att=0;for(const s of SEEDS){const sc=G13[g](s);sc.dur=GT0+2.2;sc.sigma=2+s;const n=runGesture(sc,{hz}),k=ids(n.actions);
   const pass=g==='crosses'?n.actions.every(a=>a.id==='attack')&&n.actions.length<=1:k==='ball';if(pass)good++;if(k==='attack')att++;
   ok(pass,'menu '+g+' seed '+s+' at '+(Math.round(hz*10)/10)+' Hz: '+want+' ('+k+')');}per.push(good+'/5'+(g==='crosses'?' ('+att+' attack)':''));}
 row('menu '+g+' -> '+want+' (13.3; 15; 30 Hz)','n/a',per.join('; '));}
// 2026-11-14: independent chest-height two-hand wave. Parameters frozen; no recorded pixels.
for(const hz of [HZ13,15,30])for(const seed of SEEDS){const sc=scene({seed,layers:(t,b)=>{person(b,idle(t));if(t<GT0)return;const u=((t-GT0)*2.5)%1,tri=u<.5?u*2:2-u*2;disc(b,14+12*tri,32,10,205);disc(b,66-12*tri,32,10,205);}});sc.dur=GT0+3.4;sc.sigma=2+seed;const r=runGesture(sc,{hz});ok(r.keys.map(k=>k.key).join()==='x'&&r.actions.length===0,'chest-height wave seed '+seed+' at '+hz+' Hz: one cancel, no action ('+r.keys.map(k=>k.key).join()+'; '+ids(r.actions)+')');}
// --- the table ---
{const w=[0,1,2].map(i=>Math.max(...rows.map(r=>String(r[i]).length),8)),line=r=>r.map((v,i)=>String(v).padEnd(w[i])).join(' | ');
 console.log(line(['scenario','old (v1)','new (v2)']));console.log(w.map(n=>'-'.repeat(n)).join('-|-'));for(const r of rows)console.log(line(r));}
if(fails.length){console.error('webcam scenarios: '+fails.length+' of '+checks+' checks FAILED:\n - '+fails.join('\n - '));process.exitCode=1;}else console.log('webcam scenarios: '+checks+' checks passed');
module.exports={NUIS,punchScene,runNew,runOld,scene,person,render};
