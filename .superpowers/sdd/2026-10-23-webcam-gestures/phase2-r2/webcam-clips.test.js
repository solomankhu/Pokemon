'use strict';
// Replays the player's own recorded webcam clips (SETTINGS -> Test gestures -> RECORD; see combat/clips/README.md)
// through the REAL controller with getPhase 'menu' and a battleAction stub, and checks each file's label.
// Clips are personal images: this test only reads them, prints derived numbers (actions, keys, scores), never pixels,
// and never copies them. It passes (and says "skipped") when there are no clips.
// Folders: combat/Webcam/ (where the first clips were saved) and combat/clips/.
//
// Replay start (one rule for every clip): clips begin AFTER the game's warm-up, so the clip's first diff has no punch
// history (a cold model scores any motion as a rise out of silence). The replay therefore starts the way the controller
// resumes after a pause: frame 0 is the first frame, a pause on frame 1 drops that cold diff (tracker re-arms, motion
// history restarts), and the noise model is NOT re-learned with learn:'all' - one 'all' frame on an arm already moving
// lifts those pixels' threshold ~4x for over a second, which is not what the game saw after its warm-up on a calm player.
//
// Bars (plan docs/plans/2026-10-23-webcam-gesture-set.md): no clip ever gives a WRONG action (strict); idle/talk/sweep/
// cancel clips give no action (strict); action clips give their own action - over all of them >= RECALL_MIN, and per
// gesture >= RECALL_MIN once it has >= PER_LABEL_MIN clips (one clip per gesture can't measure a rate, so a single miss
// is reported, loudly, not failed). sweep/cancel keys are reported against the same rule.
const fs=require('node:fs'),path=require('node:path');
const W=require('./webcam.js');let checks=0;const fails=[];const ok=(v,m)=>{checks++;if(!v)fails.push(m);};
// WEBCAM_CLIP_DIRS (path-delimited) replaces the folders, e.g. to check the empty case.
const DIRS=process.env.WEBCAM_CLIP_DIRS!==undefined?process.env.WEBCAM_CLIP_DIRS.split(path.delimiter).filter(Boolean):['Webcam','clips'].map(d=>path.join(__dirname,d)),RECALL_MIN=.8,PER_LABEL_MIN=3;
const ACTION={punch:'attack',guard:'defend',throw:'ball',shove:'swap',raise:'bag',lean:'run-cursor'},KEYS={sweep:/^arrow/,cancel:/^x$/},QUIET=['idle','talk','sweep','cancel'];
const files=[];for(const d of DIRS){let names=[];try{names=fs.readdirSync(d);}catch(_){continue;}for(const n of names.sort())if(/^webcam-clip-[a-z]+-\d+\.json$/.test(n))files.push(path.join(d,n));}
if(!files.length){console.log('webcam clips: skipped (no clips in combat/Webcam/ or combat/clips/)');process.exit(0);}
function replay(c){
 const settings={webcam:'ON',webcamMirror:c.mirror,webcamGain:c.gain,webcamZone:c.zone,webcamPunch:c.punchMin,webcamLagMs:0};
 const actions=[],keys=[];let clock=0,gen=0,skip=false,sh=W.createTracker();const peak={},D0={};
 const ctl=W.createWebcamController({global:{navigator:{}},doc:{body:{appendChild(){}},createElement(){return {};}},now:()=>clock,setTimeout:()=>0,clearTimeout(){},
  getSettings:()=>settings,setSettings(){},getCommand:()=>null,commandClock:()=>1,pauseGeneration:()=>gen,isInputOpen:()=>true,getPhase:()=>'menu',
  battleAction:id=>actions.push({ms:Math.round(clock),id}),press:k=>keys.push({ms:Math.round(clock),key:k}),release(){},commandInput(){}});
 // shadow tracker on the same samples (the listener sees them first): per-gesture peak scores, for the margins table
 ctl.setCalibrationListener((m,t)=>{if(ctl.state==='warmup'||skip)return;sh=W.stepTracker(sh,{motion:m,command:null,phase:'menu'},t).tracker;const D={},s=W.gestureScores(sh.ring,t,-Infinity,-Infinity,D);
  for(const g of W.GESTURES)if(!(g in peak)||s[g]>peak[g]){peak[g]=s[g];D0[g]=D[g]||null;}});
 ctl.measureFloor(0,0);
 for(let i=0;i<c.frames.length;i++){skip=i===1;if(i===1)gen++;clock=c.t[i];ctl.processFrame(c.frames[i],c.t[i]);}
 return {actions,keys,peak,detail:D0};}
const rows=[],per={};
for(const f of files){const name=path.basename(f),label=name.split('-')[2],c=W.decodeClip(fs.readFileSync(f,'utf8'));
 ok(!!c,name+': decodes');if(!c)continue;ok(c.label===label,name+': header label matches the file name ('+c.label+')');
 const r=replay(c),acts=r.actions.map(a=>a.id),want=ACTION[label];
 const wrong=acts.filter(a=>a!==want);ok(wrong.length===0,name+': no wrong action ('+(acts.join()||'-')+')');
 if(QUIET.includes(label))ok(acts.length===0,name+': a '+label+' clip gives no action ('+(acts.join()||'-')+')');
 let hit=null;if(want)hit=acts.includes(want);else if(KEYS[label])hit=r.keys.some(k=>KEYS[label].test(k.key));
 if(hit!==null){(per[label]=per[label]||{n:0,hit:0}).n++;if(hit)per[label].hit++;}
 // margin: the expected gesture's peak score (>=1 fires); the closest other gesture (wrong-label risk, <1 is safe)
 const others=W.GESTURES.filter(g=>ACTION[g]!==want).map(g=>[g,r.peak[g]||0]).sort((a,b)=>b[1]-a[1])[0];
 rows.push([name,(r.actions.map(a=>a.id+'@'+a.ms).join(' ')||'-')+' | keys '+(r.keys.map(k=>k.key+'@'+k.ms).join(' ')||'-'),want?label+' '+(r.peak[label]||0).toFixed(2):'-',others[0]+' '+others[1].toFixed(2),hit===null?'':hit?'hit':'MISS']);}
let n=0,h=0;for(const [label,p] of Object.entries(per)){if(ACTION[label]){n+=p.n;h+=p.hit;}if(p.n>=PER_LABEL_MIN)ok(p.hit/p.n>=RECALL_MIN,label+': '+p.hit+'/'+p.n+' clips detected (>= '+RECALL_MIN*100+'%)');}
if(n)ok(h/n>=RECALL_MIN,'action clips: '+h+'/'+n+' give their own action (>= '+RECALL_MIN*100+'%)');
{const w=[0,1,2,3,4].map(i=>Math.max(...rows.map(r=>String(r[i]).length),['clip','actions | keys','own peak','closest other','own'][i].length)),line=r=>r.map((v,i)=>String(v).padEnd(w[i])).join(' | ');
 console.log(line(['clip','actions | keys','own peak','closest other','own']));console.log(w.map(k=>'-'.repeat(k)).join('-|-'));for(const r of rows)console.log(line(r));
 console.log('per label: '+Object.entries(per).map(([l,p])=>l+' '+p.hit+'/'+p.n).join(', ')+(Object.values(per).some(p=>p.hit<p.n)?'  (a MISS below '+PER_LABEL_MIN+' clips is reported, not failed)':''));}
if(fails.length){console.error('webcam clips: '+fails.length+' of '+checks+' checks FAILED:\n - '+fails.join('\n - '));process.exitCode=1;}else console.log('webcam clips: '+checks+' checks passed ('+files.length+' clips)');
