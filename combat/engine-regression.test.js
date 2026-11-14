'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
function load(file){const c={console,localStorage:{getItem(){return null;},setItem(){}}};c.globalThis=c;vm.runInNewContext(fs.readFileSync(file,'utf8').match(/<script>([\s\S]*)<\/script>/)[1],c);return c.__GAME__;}
const current=load("claude's monsters.html"),old=load(".superpowers/sdd/2026-10-17-3d-combat/backups/claude's monsters.html");
function generator(seed){let state=seed;const f=()=>{f.calls++;return ((state=Math.imul(state,1664525)+1013904223>>>0)/4294967296);};f.calls=0;return f;}
let checks=0;
for(const id of Object.keys(current.SPECIES))for(const move of Object.keys(current.MOVES))for(const seed of [1,19,999]){
 const a=current.makeMon(id,25),b=current.makeMon('thornmane',23),oa=old.makeMon(id,25),ob=old.makeMon('thornmane',23),r=generator(seed),or=generator(seed);
 assert.equal(JSON.stringify(current.damageCalc(a,b,move,{atk:-2,spa:1},{def:2,spd:-1},r)),JSON.stringify(old.damageCalc(oa,ob,move,{atk:-2,spa:1},{def:2,spd:-1},or)));assert.equal(r.calls,or.calls);checks++;
}
for(const id of Object.keys(current.SPECIES))for(const frac of [1,.5,.01])for(const seed of [1,9,51]){
 const a=current.makeMon(id,25),oa=old.makeMon(id,25);a.hp=oa.hp=Math.max(1,Math.floor(a.maxhp*frac));const r=generator(seed),or=generator(seed);
 assert.equal(JSON.stringify(current.catchRoll(a,1.5,r)),JSON.stringify(old.catchRoll(oa,1.5,or)));assert.equal(r.calls,or.calls);checks++;
}
console.log(checks+' prechange engine output/RNG comparisons passed.');
