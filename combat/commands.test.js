'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs');
assert.ok(fs.existsSync(__dirname+'/commands.js'),'command module must exist');
const C=require('./commands.js');let checks=0;
const ok=(v,m)=>{assert.ok(v,m);checks++;};
for(const kind of ['strike','charge','guard','catch'])for(const mode of ['ON','ASSIST'])for(const context of ['normal','hunt','ace']){
  const p=C.PROFILES[kind],scale=(mode==='ASSIST'?2:1)*(context==='hunt'?.8:context==='ace'?.9:1);
  const tier=kind==='catch'?'EXCELLENT':'PERFECT',w=kind==='catch'?p.excellent:p.perfect;
  ok(C.judgeCommand(kind,p.target+w*scale,mode,context).tier===tier,'inclusive upper edge '+kind+mode+context);
  ok(C.judgeCommand(kind,p.target-w*scale,mode,context).tier===tier,'inclusive lower edge '+kind+mode+context);
  ok(C.judgeCommand(kind,p.target+w*scale+1e-6,mode,context).tier!==tier,'outside edge '+kind+mode+context);
}
ok(C.normalizeSettings({}).actionMode==='ON','old settings ON');
ok(C.normalizeSettings({quality:'FAKE',actionMode:'FAKE'}).quality==='STANDARD','invalid quality safe');
ok(C.normalizeSettings({actionMode:'ASSIST',quality:'LOW',basicMode:true}).basicMode,'explicit basic mode');
{const d=C.normalizeSettings({});ok(d.webcam==='OFF'&&d.webcamSensitivity==='MED'&&d.webcamMirror===true&&d.webcamLagMs===120&&d.webcamCalibrated===false,'webcam defaults');}
{const j=C.normalizeSettings({webcam:'yes',webcamSensitivity:'MAX',webcamMirror:'no',webcamLagMs:'abc',webcamCalibrated:'true'});ok(j.webcam==='OFF'&&j.webcamSensitivity==='MED'&&j.webcamMirror===true&&j.webcamLagMs===120&&j.webcamCalibrated===false,'junk webcam values fall back');}
ok(C.normalizeSettings({webcam:'ON',webcamSensitivity:'HIGH',webcamMirror:false,webcamCalibrated:true}).webcam==='ON','webcam ON kept');
ok(C.normalizeSettings({webcamMirror:false}).webcamMirror===false,'mirror off kept');
ok(C.normalizeSettings({webcamLagMs:-1}).webcamLagMs===0&&C.normalizeSettings({webcamLagMs:301}).webcamLagMs===300,'lag clamps');
ok(C.normalizeSettings({webcamLagMs:'150'}).webcamLagMs===150&&C.normalizeSettings({webcamLagMs:NaN}).webcamLagMs===120&&C.normalizeSettings({webcamLagMs:null}).webcamLagMs===120,'lag parses strings, rejects NaN/null');
{const s=C.normalizeSettings({actionMode:'ASSIST',quality:'LOW',reducedMotion:true,basicMode:true});ok(s.actionMode==='ASSIST'&&s.quality==='LOW'&&s.reducedMotion&&s.basicMode,'old keys unchanged');}
// v2 webcam keys: gain 1..9 (legacy sensitivity maps LOW 3 / MED 5 / HIGH 7; an existing gain wins), punch 0.05..0.6 or null, zone, overlay
{const d=C.normalizeSettings({});ok(d.webcamGain===5&&d.webcamPunch===null&&d.webcamZone==='CENTER'&&d.webcamOverlay===false,'v2 webcam defaults');}
ok(C.normalizeSettings({webcamSensitivity:'HIGH'}).webcamGain===7&&C.normalizeSettings({webcamSensitivity:'LOW'}).webcamGain===3&&C.normalizeSettings({webcamSensitivity:'MED'}).webcamGain===5,'legacy sensitivity derives the gain');
ok(C.normalizeSettings({webcamSensitivity:'HIGH',webcamGain:2}).webcamGain===2,'an existing gain wins over the legacy sensitivity');
ok(C.normalizeSettings({webcamSensitivity:'HIGH',webcamGain:2}).webcamSensitivity==='HIGH','legacy sensitivity is kept (frozen)');
ok(C.normalizeSettings({webcamGain:0}).webcamGain===1&&C.normalizeSettings({webcamGain:12}).webcamGain===9&&C.normalizeSettings({webcamGain:'6'}).webcamGain===6&&C.normalizeSettings({webcamGain:4.6}).webcamGain===5,'gain clamps, rounds and parses strings');
ok(C.normalizeSettings({webcamGain:'loud'}).webcamGain===5&&C.normalizeSettings({webcamGain:NaN,webcamSensitivity:'LOW'}).webcamGain===3,'junk gain falls back (to the legacy value when present)');
ok(C.normalizeSettings({webcamPunch:.3}).webcamPunch===.3&&C.normalizeSettings({webcamPunch:.01}).webcamPunch===.05&&C.normalizeSettings({webcamPunch:2}).webcamPunch===.6,'punch threshold kept and clamped');
ok([null,undefined,'x',true,NaN,{}].every(v=>C.normalizeSettings({webcamPunch:v}).webcamPunch===null),'junk punch threshold is null (default)');
ok(C.normalizeSettings({webcamZone:'LEFT'}).webcamZone==='LEFT'&&C.normalizeSettings({webcamZone:'RIGHT'}).webcamZone==='RIGHT'&&C.normalizeSettings({webcamZone:'left'}).webcamZone==='CENTER','zone values');
ok(C.normalizeSettings({webcamOverlay:true}).webcamOverlay===true&&C.normalizeSettings({webcamOverlay:'true'}).webcamOverlay===false,'overlay is a strict boolean');
{const once=C.normalizeSettings({webcam:'ON',webcamSensitivity:'LOW',webcamLagMs:90,webcamCalibrated:true}),twice=C.normalizeSettings(once);ok(JSON.stringify(once)===JSON.stringify(twice)&&once.webcamGain===3,'an old save round-trips: gain derived once, then stable');}
assert.throws(()=>C.createCommand('invalid'));checks++;
for(const kind of ['strike','charge','guard','catch']){
  const c=C.createCommand(kind,'ON','normal'),copy=JSON.stringify(c);
  const expired=C.stepCommand(c,2,{});
  ok(expired.done&&expired.result.damageScale===1&&expired.result.throwScale===1,'timeout baseline '+kind);
  ok(JSON.stringify(c)===copy,'step is immutable '+kind);
  const auto=C.stepCommand(C.createCommand(kind,'AUTO','normal'),2,{});
  ok(auto.done,'auto finishes '+kind);
  ok(auto.result.tier==='AUTO'&&auto.result.tier===C.AUTO_TIER,'auto tier label '+kind);
  ok(auto.result.damageScale===1&&auto.result.critBonus===0&&auto.result.throwScale===1,'auto is the no-bonus baseline '+kind);
  const p=C.PROFILES[kind];
  const early=C.stepCommand(C.createCommand(kind,'AUTO','normal'),p.target-.05,{});
  ok(!early.done,'auto waits for the target '+kind);
  const atTarget=C.stepCommand(early,.05,{});
  ok(atTarget.done&&atTarget.result.tier==='AUTO','auto resolves at the target '+kind);
  let pressedAuto=C.stepCommand(C.createCommand(kind,'AUTO','ace'),p.target-.02,{pressed:true,held:true,at:p.target});
  pressedAuto=C.stepCommand(pressedAuto,0,{released:true,at:p.target});
  ok(!pressedAuto.done&&!pressedAuto.armed,'auto ignores timed input '+kind);
  pressedAuto=C.stepCommand(pressedAuto,.02,{pressed:true,at:p.target});
  ok(pressedAuto.done&&pressedAuto.result.damageScale===1&&pressedAuto.result.throwScale===1&&pressedAuto.result.critBonus===0,'auto with a perfect press still gives no bonus '+kind);
}
for(const kind of ['charge','catch']){
 let c=C.createCommand(kind);c=C.stepCommand(c,.2,{held:true});
 c=C.stepCommand(c,.2,{released:true});ok(!c.done,'stale held release cannot resolve '+kind);
 c=C.stepCommand(c,0,{pressed:true});c=C.stepCommand(c,0,{released:true,at:C.PROFILES[kind].target});
 ok(c.done&&['PERFECT','EXCELLENT'].includes(c.result.tier),'fresh hold/release resolves '+kind);
}
let paused=C.stepCommand(C.createCommand('charge'),.3,{pressed:true});
paused=C.stepCommand(paused,3,{paused:true});ok(paused.elapsed===.3&&!paused.armed,'blur pauses and disarms');
paused=C.stepCommand(paused,0,{released:true});ok(!paused.done,'resume release cannot win');
for(const hz of [30,60,120]){
 let c=C.createCommand('strike');for(let i=0;i<Math.floor(hz*.6);i++)c=C.stepCommand(c,1/hz,{});
 c=C.stepCommand(c,1/hz,{pressed:true,at:.65});ok(c.result.tier==='PERFECT','input timestamp independent of frame rate '+hz);
}
ok(C.judgeCommand('guard',.58).damageScale===.65,'perfect guard');
ok(C.judgeCommand('strike',.65).critBonus===.05,'perfect crit bonus cap');
console.log(checks+' command checks passed.');
