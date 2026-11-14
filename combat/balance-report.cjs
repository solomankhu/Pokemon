'use strict';
const vm=require('node:vm'),fs=require('node:fs'),path=require('node:path');
const c={console,localStorage:{getItem(){return null;},setItem(){}}};c.globalThis=c;vm.runInNewContext(fs.readFileSync("claude's monsters.html",'utf8').match(/<script>([\s\S]*)<\/script>/)[1],c);const g=c.__GAME__;
const C=require('./commands.js');
// Modifiers come from the command module itself, so the report can't drift from the game:
// no-input = timeout baseline, AUTO = what stepCommand resolves under AUTO, perfect = a dead-centre press.
function modifiers(mode){
 const pick=kind=>mode==='no-input'?C.stepCommand(C.createCommand(kind),C.PROFILES[kind].duration,{}).result
  :mode==='AUTO'?C.stepCommand(C.createCommand(kind,'AUTO'),C.PROFILES[kind].duration,{}).result
  :C.judgeCommand(kind,C.PROFILES[kind].target);
 const strike=pick('strike'),guard=pick('guard'),thrown=pick('catch');
 return {tier:strike.tier,attack:strike.damageScale,crit:strike.critBonus,guard:guard.damageScale,throwScale:thrown.throwScale};
}
function random(seed){let s=seed;return ()=>((s=Math.imul(s,1664525)+1013904223>>>0)/4294967296);}
const ids=Object.keys(g.SPECIES).filter(id=>g.makeMon(id,20).moves.some(m=>g.MOVES[m].pow>0)),results=[];
for(const mode of ['no-input','AUTO','perfect']){
 const mod=modifiers(mode);let wins=0,totalTurns=0,draws=0;
 for(let seed=1;seed<=1000;seed++){
  const rng=random(seed),id=ids[Math.floor(rng()*ids.length)],mine=g.makeMon(id,20),foe=g.makeMon(id,20),moves=mine.moves.filter(m=>g.MOVES[m].pow>0);let turns=0;
  while(mine.hp>0&&foe.hp>0&&turns++<100){
   const first=rng()<.5,{attack,guard,crit}=mod;
   for(const player of [first,!first]){const a=player?mine:foe,b=player?foe:mine;if(a.hp<=0||b.hp<=0)break;const move=moves[Math.floor(rng()*moves.length)];const r=g.damageCalc(a,b,move,{},{},rng,player?attack:guard,player?crit:0);b.hp=Math.max(0,b.hp-r.dmg);}
  }
  if(mine.hp>0&&foe.hp<=0)wins++;if(turns>=100)draws++;totalTurns+=turns;
 }
 results.push({mode,modifiers:mod,cohort:1000,wins,draws,winRate:wins/1000,meanTurns:totalTurns/1000});
}
const catchRates=[];
for(const scale of [...new Set([1,1.15,1.5,1.85,modifiers('AUTO').throwScale])]){let caught=0;for(let seed=1;seed<=5000;seed++){const m=g.makeMon('thornmane',20);m.hp=Math.floor(m.maxhp*.5);if(g.catchRoll(m,1.5,random(seed),scale).caught)caught++;}catchRates.push({throwScale:scale,caught,cohort:5000,rate:caught/5000});}
const report={method:'Seeded mirrored-species level-20 engine duels; random damaging learned moves, random first side per turn, no stat moves/items. Measures the approved command modifiers, not complete encounter win rates.',results,catchRates};
const out=path.join(__dirname,'../.superpowers/sdd/2026-10-17-3d-combat/balance-results.json');fs.writeFileSync(out,JSON.stringify(report,null,2));console.log(JSON.stringify(report,null,2));
