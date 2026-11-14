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
 cam.processFrame(still,200);cam.processFrame(still,233);g.pumpQueue(b,.65/.55);ok(Math.abs(b.command.elapsed-.65)<1e-9,'command clock advanced to the target');
 cam.processFrame(burst,500);g.pumpQueue(b,0);ok(r&&r.tier==='PERFECT','webcam strike on the target is PERFECT');
 let k=null;g.qCommand(b,'strike',x=>{k=x;});g.pumpQueue(b,0);g.commandInput(true,false);g.commandInput(false,true);g.pumpQueue(b,.65/.55);g.commandInput(true,false);g.pumpQueue(b,0);ok(k&&k.tier===r.tier,'same tier as the keyboard at the same time');
 G.settings=s;}
// pause counter: a modal between samples drops the lagged press
{let r=null;g.qCommand(b,'strike',x=>{r=x;});g.pumpQueue(b,0);const cam=W.createWebcamController(Object.assign({},opts,{global:{navigator:{}},now:()=>0}));
 cam.measureFloor(0);cam.processFrame(still,0);cam.processFrame(still,1);cam.processFrame(burst,100);cam.processFrame(still,200);cam.processFrame(still,233);g.pumpQueue(b,.3);
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
// determinism: a real player attack (FIGHT -> QUICK ATTACK, damage rolled) driven once by keys and once by
// the webcam at the same command time, each from a fresh page with the same seeded Math.random.
function realTurn(useCam){
 const {g:h,c:x}=load(),H=h.G;
 vm.runInContext('globalThis.__rng=0;{let s=12345;Math.random=()=>{globalThis.__rng++;return (s=Math.imul(s,1664525)+1013904223>>>0)/4294967296;};}',x);
 H.party=[h.makeMon('emberling',20)];H.settings=h.normalizeCombatSettings({actionMode:'ON',webcamLagMs:0});
 const foe=h.makeMon('sprigling',20);foe.moves=['growl'];h.startBattle(foe);const bb=H.battle;bb.queue=[];bb.step=null;
 x.__rng=0;const hp0=foe.hp;h.takeTurn(bb,{t:'fight',move:'quickattack'});
 let struck=false,cam=null;
 for(let i=0;i<2000&&H.battle===bb&&(bb.step||bb.queue.length);i++){
  bb.dispMine=bb.mine.hp;bb.dispFoe=bb.foe.hp;
  if(bb.step&&bb.step.t==='msg'){bb.step=null;continue;}
  if(bb.command&&bb.command.kind==='strike'&&!struck){struck=true;
   if(useCam){cam=W.createWebcamController(Object.assign({},h.webcamOptions(),{global:{navigator:{}},now:()=>0}));cam.measureFloor(0);cam.processFrame(still,0);cam.processFrame(still,1);
    cam.processFrame(burst,100);cam.processFrame(still,200);cam.processFrame(still,233);h.pumpQueue(bb,.65/.55);cam.processFrame(burst,500);}
   else{h.commandInput(true,false);h.commandInput(false,true);h.pumpQueue(bb,.65/.55);h.commandInput(true,false);}
   continue;}
  h.pumpQueue(bb,1/60);
 }
 return {struck,calls:x.__rng,hp:foe.hp,hp0,tier:bb.actionFeedback&&bb.actionFeedback.tier};
}
{const k=realTurn(false),w=realTurn(true);
 ok(k.struck&&w.struck,'both turns reached the strike command');
 ok(k.hp<k.hp0,'keyboard strike dealt damage ('+(k.hp0-k.hp)+')');
 ok(k.calls>0,'the turn consumed engine randomness ('+k.calls+' calls)');
 ok(w.tier===k.tier&&k.tier==='PERFECT','same PERFECT tier from keys and webcam');
 ok(w.calls===k.calls,'same Math.random call count ('+k.calls+')');
 ok(w.hp===k.hp,'same foe HP afterwards ('+k.hp+')');}
// webcam menu gestures: getPhase/battleAction (the HTML side of the tracker's {type:'action', id} intents)
function loadNoCC(){const store={};const c={console,MonsterWebcam:W,localStorage:{getItem:k=>store[k]||null,setItem:(k,v)=>store[k]=v}};c.globalThis=c;vm.runInNewContext(fs.readFileSync("claude's monsters.html",'utf8').match(/<script>([\s\S]*)<\/script>/)[1],c);return {g:c.__GAME__,c};}
const IDS=['attack','defend','ball','swap','bag','run-cursor'];
function menuBattle(h,opts){const H=h.G;H.settings=Object.assign({},H.settings,{webcam:'ON'});H.party=[h.makeMon('emberling',20),h.makeMon('sprigling',20)];H.balls=5;H.bag={};H.fadeDir=0;h.CFX.lungeAge=null;h.CFX.pendingConfirm=false;
 const foe=h.makeMon('sprigling',20);foe.moves=['growl'];h.startBattle(foe,opts);const bb=H.battle;bb.queue=[];bb.step=null;bb.phase='menu';bb.cursor=0;bb.scare=null;return bb;}
// drain the queue the way a player would: dismiss messages, answer commands with a press
function drain(h,bb){const H=h.G;for(let i=0;i<5000&&H.battle===bb;i++){bb.dispMine=bb.mine.hp;bb.dispFoe=bb.foe.hp;
  if(bb.phase==='menu'&&!bb.step&&!bb.queue.length)return true;
  if(bb.step&&bb.step.t==='msg'){bb.step=null;continue;}
  if(bb.command){h.commandInput(true,false);h.commandInput(false,true);h.pumpQueue(bb,.3);h.commandInput(true,false);h.commandInput(false,true);}
  h.pumpQueue(bb,1/60);}
 return false;}
const snap=bb=>JSON.stringify({p:bb.phase,c:bb.cursor,q:bb.queue.length,s:!!bb.step,pc:bb.pendingChoice||null});
{const {g:h,c:x}=load(),H=h.G,o=h.webcamOptions();
 ok(o.getPhase===h.webcamPhase&&o.battleAction===h.webcamBattleAction,'webcamOptions exposes getPhase and battleAction');
 H.settings=h.normalizeCombatSettings({actionMode:'ON',webcam:'ON'});
 let bb=menuBattle(h);ok(o.getPhase()==='menu','getPhase is menu in the idle battle menu');
 // every guard: getPhase null and every id a no-op
 const guards=[
  ['intro queue',()=>{bb.queue=[{t:'msg',s:'x'}];},()=>{bb.queue=[];}],
  ['mid-message step',()=>{bb.step={t:'msg',s:'x'};},()=>{bb.step=null;}],
  ['mid-wait step',()=>{bb.step={t:'wait',ms:1};},()=>{bb.step=null;}],
  ['phase anim',()=>{bb.phase='anim';},()=>{bb.phase='menu';}],
  ['phase fight',()=>{bb.phase='fight';},()=>{bb.phase='menu';}],
  ['phase bag',()=>{bb.phase='bag';},()=>{bb.phase='menu';}],
  ['phase choice',()=>{bb.phase='choice';},()=>{bb.phase='menu';}],
  ['fading',()=>{H.fadeDir=1;},()=>{H.fadeDir=0;}],
  ['combatModal',()=>vm.runInContext('combatModal=true',x),()=>vm.runInContext('combatModal=false',x)],
  ['campaignBusy',()=>vm.runInContext('campaignBusy=true',x),()=>vm.runInContext('campaignBusy=false',x)],
  ['unfocused',()=>vm.runInContext('battleFocused=false',x),()=>vm.runInContext('battleFocused=true',x)],
  ['lunge pending',()=>{h.CFX.lungeAge=0;},()=>{h.CFX.lungeAge=null;}],
  ['confirm buffered behind a lunge',()=>{h.CFX.pendingConfirm=true;},()=>{h.CFX.pendingConfirm=false;}],
  ['mode overworld',()=>{H.mode='overworld';},()=>{H.mode='battle';}],
  ['webcam OFF',()=>{H.settings=Object.assign({},H.settings,{webcam:'OFF'});},()=>{H.settings=Object.assign({},H.settings,{webcam:'ON'});}],
 ];
 for(const [name,on,off] of guards){on();ok(o.getPhase()===null,'getPhase null: '+name);
  const before=snap(bb),balls=H.balls;let acted=false;for(const id of IDS)acted=o.battleAction(id)||acted;
  ok(!acted&&snap(bb)===before&&H.balls===balls&&H.battle===bb,'every id is a no-op: '+name);off();}
 ok(o.getPhase()==='menu','guards restored');
 // a live timed command: 'command' (guard/throw triggers may press), never a menu action
 {const cmdCase=(kind)=>{bb.phase='anim';bb.step={t:'cmd',kind};bb.queue=[{t:'msg',s:'after'}];bb.command={kind};};
  for(const kind of ['guard','catch','strike']){cmdCase(kind);ok(o.getPhase()==='command','getPhase is command during a live '+kind+' command');
   const before=snap(bb),balls=H.balls;let acted=false;for(const id of IDS)acted=o.battleAction(id)||acted;
   ok(!acted&&snap(bb)===before&&H.balls===balls&&bb.command&&bb.command.kind===kind,'every id is a no-op under command ('+kind+')');}
  cmdCase('guard');
  for(const [name,on,off] of guards){if(/^(intro queue|mid-|phase )/.test(name))continue;on();ok(o.getPhase()===null,'getPhase null with a live command: '+name);
   const before=snap(bb);let acted=false;for(const id of IDS)acted=o.battleAction(id)||acted;ok(!acted&&snap(bb)===before,'every id is a no-op with a live command: '+name);off();}
  {const keep=H.battle;H.battle=null;ok(o.getPhase()===null,'no battle: null even after a command');H.battle=keep;}
  bb.command=null;bb.step=null;bb.queue=[];bb.phase='menu';ok(o.getPhase()==='menu','command over: back to menu');}
 {const keep=H.battle;H.battle=null;ok(o.getPhase()===null&&o.battleAction('attack')===false,'no battle: null and no-op');H.battle=5;let threw=false;try{o.getPhase();o.battleAction('attack');}catch(e){threw=true;}ok(!threw&&o.getPhase()===null,'a junk battle never throws');H.battle=keep;}
 // attack: the move list, never a move; a second attack does nothing more
 ok(o.battleAction('attack')===true&&bb.phase==='fight'&&bb.cursor===0&&!bb.pendingChoice&&!bb.queue.length,'attack opens the move list');
 ok(o.getPhase()===null&&o.battleAction('attack')===false&&bb.phase==='fight'&&!bb.pendingChoice&&!bb.queue.length&&!bb.step,'a second quick attack never picks a move');
 bb=menuBattle(h);ok(o.battleAction('defend')===true&&bb.phase==='choice'&&bb.pendingChoice&&bb.pendingChoice.t==='defend'&&!bb.queue.length,'defend opens the DEFEND choice (confirm still needed)');
 bb=menuBattle(h);H.bag={potion:1};ok(o.battleAction('bag')===true&&bb.phase==='bag'&&bb.cursor===0&&!bb.queue.length&&H.balls===5,'bag opens the battle bag');
 bb=menuBattle(h);ok(o.battleAction('swap')===true&&bb.phase==='swap'&&bb.cursor===0&&!bb.forcedSwap&&!bb.queue.length,'swap opens the party screen');
 bb=menuBattle(h);ok(o.battleAction('nonsense')===false&&o.battleAction(4)===false&&o.battleAction('toString')===false&&snap(bb)===JSON.stringify({p:'menu',c:0,q:0,s:false,pc:null}),'unknown ids are no-ops');
 // run-cursor: cursor only, repeatedly, never a flee
 bb=menuBattle(h);for(let i=0;i<3;i++)ok(o.battleAction('run-cursor')===true&&bb.cursor===3&&bb.phase==='menu'&&!bb.queue.length&&!bb.step&&!bb.ran&&!bb.result&&H.battle===bb&&H.mode==='battle','run-cursor only moves the cursor to RUN ('+(i+1)+')');
 // ball: a wild battle throws a plain BALL through the BAG path; exactly one ball per throw
 const prev=h.setCatchRoll(()=>({caught:false,shakes:1}));
 try{bb=menuBattle(h);H.bag={potion:2};
  for(let i=0;i<2;i++){const n=H.balls,pot=H.bag.potion;ok(o.battleAction('ball')===true&&bb.phase==='anim','wild battle: ball throws ('+(i+1)+')');
   ok(drain(h,bb)&&H.battle===bb,'the turn plays out back to the menu ('+(i+1)+')');ok(H.balls===n-1&&H.bag.potion===pot,'exactly one BALL used, nothing else ('+(i+1)+')');}
  const tr={id:'t',name:'HIKER',intro:'Hi!',team:[['sprigling',20]]};
  bb=menuBattle(h,{trainer:tr});const t0=snap(bb);ok(o.getPhase()==='menu'&&o.battleAction('ball')===false&&snap(bb)===t0&&H.balls===5,'trainer battle: ball is a no-op');
  bb=menuBattle(h,{hunt:true});const h0=snap(bb);ok(o.getPhase()==='menu'&&o.battleAction('ball')===false&&snap(bb)===h0&&H.balls===5,'hunt battle: ball is a no-op');
  bb=menuBattle(h);H.balls=0;H.bag={potion:1};const z0=snap(bb);ok(o.battleAction('ball')===false&&snap(bb)===z0&&H.balls===0,'no balls: ball is a no-op');
 }finally{h.setCatchRoll(prev);}
}
// without CombatCommands: the plain FIGHT/BAG/SWAP/RUN menu, where cursor 4 would mean RUN
{const {g:h}=loadNoCC(),H=h.G,o=h.webcamOptions();
 let bb=menuBattle(h);ok(o.getPhase()==='menu','plain menu: getPhase is menu');
 ok(o.battleAction('defend')===false&&bb.phase==='menu'&&bb.cursor===0&&!bb.queue.length&&!bb.ran&&H.battle===bb,'plain menu: defend is rejected (never RUN)');
 ok(o.battleAction('attack')===true&&bb.phase==='fight'&&!bb.queue.length,'plain menu: attack opens the move list');
 bb=menuBattle(h);ok(o.battleAction('run-cursor')===true&&bb.cursor===3&&bb.phase==='menu'&&!bb.queue.length&&!bb.ran,'plain menu: run-cursor only moves the cursor');
 const prev=h.setCatchRoll(()=>({caught:false,shakes:0}));
 try{bb=menuBattle(h);const n=H.balls;ok(o.battleAction('ball')===true&&drain(h,bb)&&H.balls===n-1,'plain menu: ball throws one BALL');}finally{h.setCatchRoll(prev);}
}
// a real guard command: the controller's guard GESTURE press (recognised after its hold, back-dated) lands in COMMAND
// time. The clock runs at real x 0.55, so the back-date is hold x LAG_SCALE: recognised at target + 231 ms x 0.55, the
// press lands on target (PERFECT). Subtracting real seconds would land at .476 (GUARD tier) - the bug this pins.
{const {g:h}=load(),H=h.G;let bb=menuBattle(h);H.settings=Object.assign({},h.normalizeCombatSettings({actionMode:'ON'}),{webcam:'ON',webcamLagMs:0,webcamMirror:true,webcamZone:'LEFT',webcamPunch:.6});
 let r=null;bb.phase='anim';h.qCommand(bb,'guard',x=>{r=x;});h.pumpQueue(bb,0);ok(h.webcamOptions().getPhase()==='command'&&bb.command&&bb.command.kind==='guard','a live guard command: phase command');
 h.commandInput(true,false);h.commandInput(false,true);   // arm with the keyboard, as a player would
 const HOLD=.231,E=.58+HOLD*W.LAG_SCALE;h.pumpQueue(bb,E/.55);ok(Math.abs(bb.command.elapsed-E)<1e-9&&!bb.command.done,'command clock at target + hold x LAG_SCALE');
 const ats=[],o=h.webcamOptions(),cam=W.createWebcamController(Object.assign({},o,{commandInput:(p,rl,at)=>{ats.push(at);h.commandInput(p,rl,at);},global:{navigator:{}},now:()=>0}));
 // forearms slide into the middle row from the right (display x 37..79: away from the LEFT punch box, so no punch onset presses first)
 const FW=W.FRAME_W,fr=(rows,v,bg)=>{const f=new Uint8Array(N).fill(bg);for(let y=20;y<20+rows;y++)for(let x=0;x<=42;x++)f[y*FW+x]=v;return f;};
 cam.measureFloor(0);cam.processFrame(fr(0,0,0),0);cam.processFrame(fr(0,0,1),33);cam.processFrame(fr(0,0,0),66);
 let t=100;for(let k=1;k<=5;k++,t+=33)cam.processFrame(fr(4*k,255,k%2),t);          // moving: last frame at 232
 for(;t<=700&&!ats.length;t+=33)cam.processFrame(fr(20,t%2?255:254,t%2),t);           // held still
 ok(ats.length===1,'the guard gesture presses once ('+ats.length+')');
 ok(Math.abs(ats[0]-(E-(t-33-232)/1000*W.LAG_SCALE))<1e-9&&Math.abs(ats[0]-.58)<.02,'the press is back-dated by the hold in command time ('+(ats[0]||0).toFixed(4)+')');
 h.pumpQueue(bb,0);ok(r&&r.tier==='PERFECT','guard gesture recognised after its hold still scores PERFECT ('+(r&&r.tier)+')');
 ok(Math.abs((E-HOLD)-.58)>.045,'an unscaled back-date would have missed PERFECT (sanity)');}
console.log('webcam integration: '+checks+' checks passed');
