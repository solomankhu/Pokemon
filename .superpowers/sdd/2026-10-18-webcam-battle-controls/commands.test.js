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
