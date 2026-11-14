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
console.log('webcam integration: '+checks+' checks passed');
