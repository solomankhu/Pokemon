(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;root.MonsterCommands=api;})(typeof globalThis!=='undefined'?globalThis:this,function(){
 'use strict';
 const PROFILES=Object.freeze({
  strike:Object.freeze({duration:1,target:.65,good:.14,perfect:.055}),
  charge:Object.freeze({duration:1.2,target:.85,good:.16,perfect:.065}),
  guard:Object.freeze({duration:.9,target:.58,good:.12,perfect:.045}),
  catch:Object.freeze({duration:1.2,target:.95,nice:.22,great:.13,excellent:.055})
 });
 const modes=['ON','ASSIST','AUTO'],contexts=['normal','hunt','ace'];
 const AUTO_TIER='AUTO';
 function webcamLag(v){const n=typeof v==='string'&&v.trim()!==''?Number(v):v;return typeof n==='number'&&Number.isFinite(n)?Math.max(0,Math.min(300,Math.round(n))):120;}
 // v2 signal: webcamGain 1..9 replaces the LOW/MED/HIGH select. A save without it derives it from the legacy
 // webcamSensitivity (LOW 3 / MED 5 / HIGH 7), which is kept, normalised and frozen. webcamPunch is the calibrated
 // punch threshold 0.05..0.6, or null for the default (combat/webcam.js PUNCH_DEFAULT).
 function webcamGain(v,legacy){const n=typeof v==='string'&&v.trim()!==''?Number(v):v;if(typeof n==='number'&&Number.isFinite(n))return Math.max(1,Math.min(9,Math.round(n)));return {LOW:3,MED:5,HIGH:7}[legacy]||5;}
 function webcamPunch(v){const n=typeof v==='string'&&v.trim()!==''?Number(v):v;return typeof n==='number'&&Number.isFinite(n)?Math.max(.05,Math.min(.6,n)):null;}
 // webcam* keys belong to the browser-only webcam controls (combat/webcam.js); combat/commands.py deliberately omits them.
 function normalizeSettings(raw){const o=raw&&typeof raw==='object'?raw:{};return {actionMode:modes.includes(o.actionMode)?o.actionMode:'ON',quality:['HIGH','STANDARD','LOW'].includes(o.quality)?o.quality:'STANDARD',reducedMotion:o.reducedMotion===true,basicMode:o.basicMode===true,webcam:o.webcam==='ON'?'ON':'OFF',webcamSensitivity:['LOW','MED','HIGH'].includes(o.webcamSensitivity)?o.webcamSensitivity:'MED',webcamMirror:o.webcamMirror!==false,webcamLagMs:webcamLag(o.webcamLagMs),webcamCalibrated:o.webcamCalibrated===true,
  webcamGain:webcamGain(o.webcamGain,o.webcamSensitivity),webcamPunch:webcamPunch(o.webcamPunch),webcamZone:['CENTER','LEFT','RIGHT'].includes(o.webcamZone)?o.webcamZone:'CENTER',webcamOverlay:o.webcamOverlay===true};}
 function baseline(){return {tier:'OK',damageScale:1,critBonus:0,throwScale:1};}
 // AUTO resolves at the target with no timed input and no bonus: the baseline, labelled AUTO.
 function autoResult(){return {...baseline(),tier:AUTO_TIER};}
 function profile(kind){if(!Object.prototype.hasOwnProperty.call(PROFILES,kind))throw Error('Unknown action command: '+kind);return PROFILES[kind];}
 function judgeCommand(kind,elapsed,mode='ON',context='normal'){
  const p=profile(kind),out=baseline();if(typeof elapsed!=='number'||!Number.isFinite(elapsed))return out;
  const scale=(mode==='ASSIST'?2:1)*(context==='hunt'?.8:context==='ace'?.9:1),d=Math.abs(elapsed-p.target);
  const inside=w=>d<=Math.min(p.duration,w*scale)+1e-10;
  if(kind==='catch'){
   if(inside(p.excellent)){out.tier='EXCELLENT';out.throwScale=1.85;}else if(inside(p.great)){out.tier='GREAT';out.throwScale=1.5;}else if(inside(p.nice)){out.tier='NICE';out.throwScale=1.15;}
  }else if(inside(p.perfect)){out.tier='PERFECT';out.damageScale=kind==='guard'?.65:1.2;out.critBonus=kind==='guard'?0:.05;}
  else if(inside(p.good)){out.tier=kind==='guard'?'GUARD':'GOOD';out.damageScale=kind==='guard'?.8:1.1;}
  return out;
 }
 function createCommand(kind,mode='ON',context='normal'){profile(kind);return {kind,mode:modes.includes(mode)?mode:'ON',context:contexts.includes(context)?context:'normal',elapsed:0,armed:false,held:false,done:false,result:null,paused:false};}
 function stepCommand(command,dt,input={}){
  const c={...command},p=profile(c.kind);if(c.done)return c;
  if(input.paused){c.paused=true;c.armed=false;c.held=false;return c;}c.paused=false;
  const delta=Number.isFinite(dt)&&dt>0?dt:0;c.elapsed=Math.min(p.duration,c.elapsed+delta);
  if(c.mode==='AUTO'){c.armed=false;c.held=false;if(c.elapsed+1e-10>=p.target){c.done=true;c.result=autoResult();}return c;}
  const at=Number.isFinite(input.at)?Math.max(0,Math.min(p.duration,input.at)):c.elapsed;
  if(input.pressed){c.armed=true;c.held=true;if(c.kind==='strike'||c.kind==='guard'){c.result=judgeCommand(c.kind,at,c.mode,c.context);c.done=true;}}
  if(input.released){if(c.armed&&(c.kind==='charge'||c.kind==='catch')){c.result=judgeCommand(c.kind,at,c.mode,c.context);c.done=true;}c.held=false;}
  if(!c.done&&c.elapsed+1e-10>=p.duration){c.done=true;c.result=baseline();}
  return c;
 }
 return {PROFILES,AUTO_TIER,autoResult,normalizeSettings,judgeCommand,createCommand,stepCommand};
});
