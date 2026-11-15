'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const file = require('node:path').join(__dirname, 'campaign.js');
assert.ok(fs.existsSync(file), 'campaign module exists');
const C = require(file);
let count = 0;
function test(name, fn) { fn(); count++; console.log('PASS ' + name); }
test('old saves infer gym unlock without inventing progress', () => {
  assert.deepEqual(C.normalizeChapter(null, true), {v:1,unlocked:true,completed:false,active:false,stage:1});
  assert.equal(C.normalizeChapter(null, false).unlocked, false);
});
test('corrupt versions, booleans, arrays and stages fall back safely', () => {
  for (const raw of [[], 'bad', {v:9,completed:true}, {v:1,stage:99,active:true}, {v:1,stage:'2',active:true}]) {
    assert.deepEqual(C.normalizeChapter(raw, true), C.normalizeChapter(null, true));
  }
  assert.equal(C.normalizeChapter({v:1,stage:2,active:true,completed:'true'}, true).completed,false);
  assert.equal(C.normalizeChapter({v:1,stage:2,active:true,unlocked:true},false).active,false);
});
test('progress preserves explicit completion and stage checkpoint', () => {
  assert.deepEqual(C.normalizeChapter({v:1,stage:3,active:true,completed:true},true),{v:1,unlocked:true,stage:3,active:true,completed:true});
});
const msg = (type, stage) => ({namespace:'monsterTrail.chapter',v:1,session:'abc',type,...(stage === undefined ? {} : {stage})});
test('protocol rejects unsupported payloads', () => {
  assert.equal(C.validateChapterMessage(null),null);
  for(const d of [msg('evil'),{...msg('ready'),v:2},msg('checkpoint',0),msg('checkpoint','2'),{...msg('return'),session:''}]) assert.equal(C.validateChapterMessage(d),null);
  assert.equal(C.validateChapterMessage(msg('checkpoint',2)).stage,2);
});
test('source identity, served origin and current token are required', () => {
  const source = {};
  const event = {source,origin:'http://localhost:8765',data:msg('ready')};
  assert.ok(C.acceptMessage(event,source,'http://localhost:8765','abc'));
  assert.equal(C.acceptMessage({...event,source:{}},source,event.origin,'abc'),null);
  assert.equal(C.acceptMessage({...event,origin:'https://evil.test'},source,event.origin,'abc'),null);
  assert.equal(C.acceptMessage(event,source,event.origin,'stale'),null);
  assert.ok(C.acceptMessage({...event,origin:'null'},source,'null','abc'));
  assert.ok(C.acceptMessage({...event,origin:'null'},source,'file://','abc'),'local-file location.origin differs from message origin in Chromium');
});
test('campaign reducer is immutable and retains early-return checkpoint', () => {
  const initial=C.normalizeChapter(null,true), before=JSON.stringify(initial);
  let state = C.reduceChapter(initial,{type:'enter',stage:1});
  assert.equal(JSON.stringify(initial),before);
  assert.equal(state.active,true);
  state=C.reduceChapter(state,{type:'checkpoint',stage:2});
  state=C.reduceChapter(state,{type:'return'});
  assert.equal(state.active,true); assert.equal(state.stage,2);
  state=C.reduceChapter(state,{type:'completed'});
  assert.equal(state.completed,false,'cannot complete before stage 3');
  state=C.reduceChapter(state,{type:'checkpoint',stage:3});
  state=C.reduceChapter(state,{type:'completed'});
  assert.equal(state.completed,true); assert.equal(state.active,false);
  state=C.reduceChapter(state,{type:'enter',stage:1});
  assert.equal(state.completed,true); assert.equal(state.stage,1); assert.equal(state.active,true);
});
test('checkpoint messages cannot skip stages or bypass gym gate', () => {
  const locked=C.normalizeChapter(null,false);
  assert.deepEqual(C.reduceChapter(locked,{type:'enter',stage:1}),locked);
  let s=C.reduceChapter(C.normalizeChapter(null,true),{type:'enter',stage:1});
  assert.equal(C.reduceChapter(s,{type:'checkpoint',stage:3}).stage,1);
});
test('RPG save round trip retains chapter and all existing campaign data', () => {
  const store={};
  const context={console,MonsterCampaign:C,localStorage:{getItem:k=>store[k]||null,setItem:(k,v)=>store[k]=v},setTimeout,clearTimeout};
  context.globalThis=context;
  vm.runInNewContext(fs.readFileSync("claude's monsters.html",'utf8').match(/<script>([\s\S]*)<\/script>/)[1],context);
  const g=context.__GAME__, G=g.G;
  G.flags.gym=true; G.flags.starter=true; G.party=[g.makeMon('emberling',12)]; G.balls=7;
  G.gear={id:'spear',dur:3};
  G.chapter={v:1,unlocked:true,completed:false,active:true,stage:2};
  assert.equal(g.saveGame(),true);
  const saved=JSON.parse(store['monster-trail-save-v1']);
  assert.equal(saved.chapter.stage,2);
  assert.deepEqual(saved.gear,{id:'spear',dur:3});
  G.chapter=null; G.balls=0; G.gear=null;
  assert.equal(g.loadGame(),true); assert.equal(G.chapter.stage,2); assert.equal(G.balls,7);
  assert.equal(JSON.stringify(G.gear),JSON.stringify({id:'spear',dur:3}));
  saved.chapter={v:99,stage:3,completed:true}; store['monster-trail-save-v1']=JSON.stringify(saved);
  assert.equal(g.loadGame(),true); assert.equal(G.chapter.completed,false); assert.equal(G.balls,7);
  delete saved.chapter; store['monster-trail-save-v1']=JSON.stringify(saved);
  assert.equal(g.loadGame(),true); assert.equal(G.chapter.unlocked,true);
});
console.log(count+' campaign tests passed.');
