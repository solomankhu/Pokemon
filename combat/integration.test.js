'use strict';
const assert=require('node:assert/strict'),vm=require('node:vm'),fs=require('node:fs');
function load(){const store={};const c={console,MonsterCommands:require('./commands.js'),localStorage:{getItem:k=>store[k]||null,setItem:(k,v)=>store[k]=v}};c.globalThis=c;vm.runInNewContext(fs.readFileSync("claude's monsters.html",'utf8').match(/<script>([\s\S]*)<\/script>/)[1],c);return {g:c.__GAME__,c,store};}
const {g,c}=load();let checks=0;const ok=(v,m)=>{assert.ok(v,m);checks++;};
function rng(seed){let s=seed;return ()=>((s=Math.imul(s,1664525)+1013904223>>>0)/4294967296);}
const atk=g.makeMon('emberling',20),def=g.makeMon('sprigling',20);
for(let seed=0;seed<100;seed++){
 let n1=0,n2=0,r1=rng(seed),r2=rng(seed);const a=g.damageCalc(atk,def,'ember',{}, {},()=>{n1++;return r1();});
 const b=g.damageCalc(atk,def,'ember',{}, {},()=>{n2++;return r2();},1,0);
 ok(JSON.stringify(a)===JSON.stringify(b)&&n1===n2,'default RNG/results identical '+seed);
}
const base=g.damageCalc(atk,def,'ember',{}, {},()=>.5),perfect=g.damageCalc(atk,def,'ember',{}, {},()=>.5,1.2,.05);
ok(perfect.dmg===Math.floor(base.dmg*1.2),'timing modifies final damage');
ok(g.damageCalc(atk,def,'ember',{}, {},()=>.5,999,999).dmg===perfect.dmg,'modifier caps');
ok(g.damageCalc(atk,def,'ember',{}, {},()=>.5,NaN,NaN).dmg===base.dmg,'nonfinite modifiers baseline');
ok(typeof g.qCommand==='function'&&typeof g.qAction==='function','queue exposes command/action steps');
const G=g.G;G.party=[atk];G.settings={actionMode:'ON',quality:'STANDARD',basicMode:false,reducedMotion:false};g.startBattle(def);
ok(G.battle.hiddenMine&&G.battle.hiddenFoe,'both slots wait for their own send-out');
g.pumpQueue(G.battle,0);ok(G.battle.hiddenMine&&!G.battle.hiddenFoe&&G.battle.action.actor==='foe','only the announced foe enters first');
const b=G.battle;b.queue=[];b.step=null;b.phase='anim';
let contacts=0;g.qAction(b,{actor:'mine',moveId:'ember',target:'foe',result:{dmg:10},duration:.8,contactAt:.4},()=>{contacts++;def.hp-=10;});
g.pumpQueue(b,0);g.pumpQueue(b,.39);ok(contacts===0,'no damage before contact');g.pumpQueue(b,.02);ok(contacts===1,'damage on contact');g.pumpQueue(b,1);ok(contacts===1&&!b.step,'no duplicate contact after recovery');
function ready(){g.commandInput(true,false);g.commandInput(false,true);}
g.qCommand(b,'strike',r=>{b.judged=r;});g.pumpQueue(b,0);ok(b.command&&b.command.kind==='strike','command appears');
g.pumpQueue(b,10);ok(b.command.elapsed===0&&!b.judged,'guide waits indefinitely before starting');ready();g.commandInput(true,false,.65);g.pumpQueue(b,0);ok(b.judged.tier==='PERFECT','input reaches command queue');
g.qCommand(b,'strike',r=>{b.judged=r;});g.pumpQueue(b,0);ready();g.commandInput(true,false,.65);g.commandInput(false,true,.66);g.pumpQueue(b,0);ok(b.judged.tier==='PERFECT'&&!b.command,'one-frame press and release retains strike input');
g.startBattle(g.makeMon('dripling',20),{fishing:true});
ok(G.battle.arena==='shore','fishing uses the shore arena from an inland bank');
const guided=G.battle;G.fadeDir=0;guided.queue=[];guided.step=null;guided.phase='menu';guided.cursor=0;
const hp=guided.mine.hp;g.confirmKey();g.confirmKey();
ok(guided.phase==='choice'&&guided.pendingChoice.t==='attack','attack displays a confirmation guide');g.pumpQueue(guided,10);
ok(guided.mine.hp===hp&&guided.queue.length===0,'reading an attack guide never spends a turn');g.cancelKey();ok(guided.phase==='fight','cancel returns to move choice');
guided.phase='menu';guided.cursor=4;g.confirmKey();ok(guided.phase==='choice'&&guided.pendingChoice.t==='defend','defense displays its own explanation');
guided.foe.moves=['tackle'];const foeHp=guided.foe.hp;g.confirmKey();g.pumpQueue(guided,0);ok(guided.defending&&guided.step.t==='msg','confirmed defense braces before the foe acts');
g.confirmKey();g.pumpQueue(guided,0);ok(guided.command.kind==='guard'&&!guided.command.ready,'incoming attack waits for defense readiness');
ready();g.pumpQueue(guided,2);g.confirmKey();g.pumpQueue(guided,0);
ok(guided.action.guardTier==='GUARD'&&guided.mine.hp===hp,'defend grants a shield without committing damage early');
g.pumpQueue(guided,1.7);ok(guided.foe.hp===foeHp,'defending does not secretly attack');
console.log(checks+' integration checks passed.');
