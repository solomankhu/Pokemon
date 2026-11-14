const assert=require('assert'),fs=require('fs'),vm=require('vm');
const R=require('./recipes');
const s=fs.readFileSync("claude's monsters.html",'utf8');const moves=vm.runInNewContext('('+s.match(/const MOVES = (\{[\s\S]*?\n\});/)[1]+')');
assert.equal(Object.keys(R.RECIPES).length,Object.keys(moves).length);
for(const id of Object.keys(moves)){const r=R.recipeFor(id);assert(Object.isFrozen(r));assert(r.weapon&&r.emitter&&r.family);for(const t of [0,r.windup,r.contactAt,r.duration]){const p=R.sampleAction(r,t);assert(Number.isFinite(p.progress));}assert.equal(R.sampleAction(r,r.contactAt).phase,'contact');assert.equal(R.sampleAction(r,r.duration).phase,'done');}
assert.throws(()=>R.recipeFor('missing'));
assert.equal(R.recipeFor('infernofang').weapon,'fang');assert.equal(R.recipeFor('aquatail').weapon,'tail');assert.equal(R.recipeFor('gust').weapon,'wing');assert.equal(R.recipeFor('harden').target,'self');
console.log('recipes: all '+Object.keys(moves).length+' move timelines covered');
