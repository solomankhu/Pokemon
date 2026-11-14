/* Headless test suite for "claude's monsters.html" (MONSTER TRAIL).
 *
 *     node "claude's monsters.test.js"
 *
 * The game's lower three layers (DATA / ENGINE / STATE) carry no DOM
 * dependency, and the file guards boot() behind a `document` check, so the
 * whole <script> body can be eval'd here and driven without a browser.
 * Exits non-zero if anything fails.
 */
'use strict';
const fs = require('fs');
const path = require('path');

const HTML = path.join(__dirname, "claude's monsters.html");

const store = {};
global.localStorage = {
  getItem: k => (k in store ? store[k] : null),
  setItem: (k, v) => { store[k] = String(v); }
};

(0, eval)(fs.readFileSync(HTML, 'utf8').match(/<script>([\s\S]*)<\/script>/)[1]);

const g = globalThis.__GAME__;
const G = g.G;
if (!g) { console.error('__GAME__ export missing — did the boot guard or export get removed?'); process.exit(1); }
// Battle conditions roll from the player's position. Every pre-existing test
// expects today's clear-weather behaviour, so force CLEAR (and today's look) for
// the whole suite; the CONDITIONS tests opt out locally and restore it (finally).
g.setForceCondition('clear');
g.setForceScene({ ...g.DEFAULT_SCENE });

let fail = 0, pass = 0;
const ok = (cond, msg) => { if (cond) { pass++; } else { console.log('  FAIL: ' + msg); fail++; } };
const section = s => console.log('\n== ' + s);
const key = (x, y) => x + ',' + y;

section('TITLE - existing save protection');
{
  const isolatedStore = {};
  const scope = { localStorage: { getItem: k => isolatedStore[k] ?? null, setItem: (k,v) => { isolatedStore[k] = String(v); } } };
  require('vm').createContext(scope);
  require('vm').runInContext(fs.readFileSync(HTML, 'utf8').match(/<script>([\s\S]*)<\/script>/)[1], scope);
  const title = scope.__GAME__, state = title.G, key = 'monster-trail-save-v1';
  const original = JSON.stringify({ party: [{id:'tidecoil',level:40}], coins:9000, flags:{gym:true} });
  isolatedStore[key] = original;
  title.confirmKey();
  ok(state.mode === 'title' && state.newGameConfirm && state.starterCursor === 0, 'NEW GAME asks with KEEP SAVE selected');
  title.confirmKey();
  ok(state.mode === 'title' && isolatedStore[key] === original, 'KEEP SAVE preserves exact saved bytes');
  title.confirmKey(); title.moveCursor(0,1); title.cancelKey();
  ok(state.mode === 'title' && !state.newGameConfirm && isolatedStore[key] === original, 'cancel preserves the save');
  state.starterCursor = 0; title.confirmKey(); title.moveCursor(0,1); title.confirmKey();
  const fresh = JSON.parse(isolatedStore[key]);
  ok(state.mode === 'dialogue' && !fresh.party.length && fresh.coins === title.START_COINS && !fresh.flags.gym, 'only explicit START NEW replaces the save');
  isolatedStore[key] = '{broken save'; state.mode = 'title'; state.starterCursor = 1;
  title.confirmKey();
  ok(state.mode === 'title' && state.toast && isolatedStore[key] === '{broken save', 'failed CONTINUE reports an error without replacing the save');
}

/* ------------------------------------------------------------------ MAP */
section('2D weather');
if(typeof g.weather2DStep!=='function')ok(false,'weather2DStep exported');
else {const saved=Math.random;try{Math.random=()=>{throw Error('weather used engine RNG');};
 for(const weather of ['rain','snow','leaves','dust','sparks','motes','fog','sun']){const scene={layout:123,time:'night',weather,camera:0},a=g.weather2DStep(null,scene,0,false),copy=JSON.stringify(a),b=g.weather2DStep(a,scene,.1,false),c=g.weather2DStep(a,scene,.1,true);
 ok(a.parts.length===g.WEATHER_2D[weather].n,'weather pool '+weather);
 ok(JSON.stringify(a)===copy,'pure weather step '+weather);
 ok(JSON.stringify(a)===JSON.stringify(c),'reduced motion freezes '+weather);
 ok(b.parts.every(p=>p[0]>=0&&p[0]<640&&p[1]>=0&&p[1]<360),'weather stays above text '+weather);
 if(a.parts.length)ok(JSON.stringify(a.parts)!==JSON.stringify(b.parts),'weather advances '+weather);}
}finally{Math.random=saved;}}
section('MAP — geometry, legend, connectivity');

const widths = new Set(g.MAP.map(r => r.length));
ok(widths.size === 1 && widths.has(g.MAP_W),
   'every map row is ' + g.MAP_W + ' wide, saw ' + [...widths].join(','));
g.MAP.forEach((r, i) => {
  if (r.length !== g.MAP_W) console.log('    row ' + i + ' len ' + r.length + ' |' + r + '|');
});

const legend = new Set('#.,;_~=sfBCcHDGSovKT');
const stray = new Set();
g.MAP.forEach(r => [...r].forEach(c => { if (!legend.has(c)) stray.add(c); }));
ok(stray.size === 0, 'unknown map characters: ' + [...stray].map(c => JSON.stringify(c)).join(' '));

const START = g.START_TILE;

// Flood fill under the rules the player actually moves by: ledges are
// enterable only downward and drop you a further tile; balls are solid.
const seen = new Set([key(...START)]);
const queue = [START];
while (queue.length) {
  const [x, y] = queue.shift();
  for (const [dx, dy] of [[0, -1], [0, 1], [-1, 0], [1, 0]]) {
    const nx = x + dx, ny = y + dy;
    if (nx < 0 || ny < 0 || nx >= g.MAP_W || ny >= g.MAP_H) continue;
    const t = g.tileAt(nx, ny);
    if (t === 'v') {
      if (dy !== 1) continue;
      const lx = nx, ly = ny + 1;
      if (g.SOLID.has(g.tileAt(lx, ly)) || seen.has(key(lx, ly))) continue;
      seen.add(key(lx, ly)); queue.push([lx, ly]);
      continue;
    }
    if (seen.has(key(nx, ny)) || g.SOLID.has(t)) continue;
    seen.add(key(nx, ny)); queue.push([nx, ny]);
  }
}
const adjacentToOpen = (x, y) =>
  [[0, -1], [0, 1], [-1, 0], [1, 0]].some(([dx, dy]) => seen.has(key(x + dx, y + dy)));

ok(!g.SOLID.has(g.tileAt(...START)), 'player start tile is walkable');
console.log('  ' + g.MAP_W + 'x' + g.MAP_H + ' map, ' + seen.size + ' reachable tiles');

// Gated reachability. `seen` above is the world with nothing mined, and every
// required thing (NPC, door, sign, trainer) must sit in it - the proof that
// nothing the trail needs is behind a mineable tile. `seenMined` is the same
// fill with every gate (K seams and T trees) broken. The only tiles it may add are
// every gated region (the GEODE and the two DEEPWOOD glades), and anything
// reachable only in `seenMined` (an item, a zone) is "gated" and must lie
// inside one of them. Every authoredOnly block in MAP is a gate: K seams on the
// GEODE, T thick trees on the glades.
function floodFill(edits) {
  const out = new Set([key(...START)]);
  const q = [START];
  while (q.length) {
    const [x, y] = q.shift();
    for (const [dx, dy] of [[0, -1], [0, 1], [-1, 0], [1, 0]]) {
      const nx = x + dx, ny = y + dy;
      if (nx < 0 || ny < 0 || nx >= g.MAP_W || ny >= g.MAP_H) continue;
      const t = g.tileAt(nx, ny, edits);
      if (t === 'v') {
        if (dy !== 1) continue;
        if (g.SOLID.has(g.tileAt(nx, ny + 1, edits)) || out.has(key(nx, ny + 1))) continue;
        out.add(key(nx, ny + 1)); q.push([nx, ny + 1]);
        continue;
      }
      if (out.has(key(nx, ny)) || g.SOLID.has(t)) continue;
      out.add(key(nx, ny)); q.push([nx, ny]);
    }
  }
  return out;
}
const GATES = [];
g.MAP.forEach((r, y) => [...r].forEach((c, x) => { if (g.BLOCKS[c] && g.BLOCKS[c].authoredOnly) GATES.push([x, y]); }));
GATES.sort((p, q) => p[0] - q[0] || p[1] - q[1]);
const SEAMS = GATES.filter(([x, y]) => g.tileAt(x, y) === g.SEAM);
const TREES = GATES.filter(([x, y]) => g.tileAt(x, y) === g.TREE);
const ALL_MINED = Object.fromEntries(GATES.map(([x, y]) => [key(x, y), g.BLOCKS[g.tileAt(x, y)].leaves]));
const seenMined = floodFill(ALL_MINED);
const [GX1, GY1, GX2, GY2] = g.GEODE;
const inGeode = (x, y) => x >= GX1 && x <= GX2 && y >= GY1 && y <= GY2;
const regionOf = (x, y) => g.GATED_REGIONS.find(r => x >= r[0] && x <= r[2] && y >= r[1] && y <= r[3]) || null;
const inGated = (x, y) => regionOf(x, y) !== null;
const adjacentToMined = (x, y) =>
  [[0, -1], [0, 1], [-1, 0], [1, 0]].some(([dx, dy]) => seenMined.has(key(x + dx, y + dy)));
const gated = (x, y) => !adjacentToOpen(x, y) && adjacentToMined(x, y) && inGated(x, y);
const openTiles = r => {
  const out = new Set();
  for (let y = r[1]; y <= r[3]; y++) for (let x = r[0]; x <= r[2]; x++) {
    if (!g.SOLID.has(g.tileAt(x, y)) || key(x, y) in ALL_MINED) out.add(key(x, y));
  }
  return out;
};
const GATED_OPEN = new Set();
for (const r of g.GATED_REGIONS) for (const k of openTiles(r)) GATED_OPEN.add(k);
const sameSet = (a, b) => a.size === b.size && [...a].every(v => b.has(v));
ok(sameSet(floodFill({}), seen), 'the gated fill with no edits is exactly the plain fill');
ok(g.GATED_REGIONS[0] === g.GEODE, 'the GEODE is the first gated region');
ok(SEAMS.length === 2 && SEAMS.every(([x, y]) => regionOf(x, y) === g.GEODE),
   'the map has exactly 2 cracked seams, both on the GEODE: ' + JSON.stringify(SEAMS));
ok(TREES.length === g.GATED_REGIONS.length - 1 && TREES.every(([x, y]) => regionOf(x, y) && regionOf(x, y) !== g.GEODE),
   'one thick tree per glade, each inside its glade: ' + JSON.stringify(TREES));
ok(GATES.length === SEAMS.length + TREES.length, 'every gate is a seam or a thick tree: ' + JSON.stringify(GATES));
ok([...seen].every(k => seenMined.has(k)), 'breaking a gate only ever adds ground');
const added = new Set([...seenMined].filter(k => !seen.has(k)));
ok(sameSet(added, GATED_OPEN), 'breaking every gate opens exactly the gated regions ('
   + added.size + ' vs ' + GATED_OPEN.size + ')');
for (const r of g.GATED_REGIONS) {
  ok(![...openTiles(r)].some(k => seen.has(k)), 'gated region ' + JSON.stringify(r) + ' is sealed until its gate breaks');
}
ok(g.GATED_REGIONS.every(r => GATES.some(([x, y]) => regionOf(x, y) === r && adjacentToOpen(x, y))),
   'every gated region has a gate that can be faced from the open world');
ok(GATES.every(([x, y]) => adjacentToMined(x, y)), 'every gate can be faced once its region is open');
ok(SEAMS.every(([x, y]) => !g.inSandbox(x, y) && g.inCave(y)), 'the seams sit in the DARK CAVE, outside ROCKY PASS');
ok(TREES.every(([x, y]) => g.regionName(y) === 'DEEPWOOD' && !g.inSandbox(x, y)), 'thick trees stand in DEEPWOOD');
ok(GATES.every(([x, y]) => g.DIRS4.every(([dx, dy]) => g.tileAt(x + dx, y + dy) !== '_')) &&
   !GATES.some(([x]) => x === 42 || x === 43), 'no gate touches the trunk road');
console.log('  gated: ' + GATES.length + ' gates (' + SEAMS.length + ' seams, ' + TREES.length + ' trees) open '
  + (GATED_OPEN.size - GATES.length) + ' tiles in ' + g.GATED_REGIONS.length + ' regions ('
  + seenMined.size + ' reachable with every gate broken)');

// --- the two DEEPWOOD glades (Part B): MOSS HOLLOW and OLD GROVE, each behind a THICK TREE ---
ok(JSON.stringify(g.MOSS_HOLLOW) === '[4,81,19,87]' && JSON.stringify(g.OLD_GROVE) === '[71,81,84,87]', 'the glade rects are pinned');
ok(g.GATED_REGIONS.length === 3 && g.GATED_REGIONS[0] === g.GEODE && g.GATED_REGIONS[1] === g.MOSS_HOLLOW &&
   g.GATED_REGIONS[2] === g.OLD_GROVE, 'three gated regions');
ok(JSON.stringify(TREES) === '[[19,84],[71,84]]', 'the thick trees stand at (19,84) and (71,84): ' + JSON.stringify(TREES));
ok(seen.has(key(20, 84)) && seen.has(key(70, 84)), 'both trees are faced from open ground');
for (const [zn, rect, lv] of [['MOSS', [6, 84, 16, 86], [12, 16]], ['GROVE', [74, 83, 82, 85], [16, 18]]]) {
  const zz = g.ZONES.find(q => q.x1 === rect[0] && q.y1 === rect[1] && q.x2 === rect[2] && q.y2 === rect[3]);
  ok(zz && zz.min === lv[0] && zz.max === lv[1], zn + ' zone ' + JSON.stringify(rect) + ' at L' + lv[0] + '-' + lv[1]);
  let allDark = !!zz;
  for (let y = rect[1]; y <= rect[3]; y++) for (let x = rect[0]; x <= rect[2]; x++) if (g.tileAt(x, y) !== ';') allDark = false;
  ok(allDark, zn + ' zone is all dark grass');
}
ok(g.ZONES[g.ZONES.length - 2].x1 === 6 && g.ZONES[g.ZONES.length - 1].x1 === 74, 'the glade zones are appended last, MOSS then GROVE');
ok(g.ITEMS['5,82'] === 6 && g.ITEMS['83,82'] === 8, 'glade item balls: 6 and 8');
ok(g.SIGNS['24,91'].some(l => l.includes('AXE')), 'the DEEPWOOD sign hints at the AXE');

const doors = {};
g.MAP.forEach((r, y) => [...r].forEach((c, x) => {
  if ('HDG'.includes(c)) (doors[c] = doors[c] || []).push([x, y]);
}));
for (const [c, label] of [['H', 'heal centre'], ['D', 'lab'], ['G', 'gym']]) {
  ok(doors[c], 'at least one ' + label + ' exists on the map');
  (doors[c] || []).forEach(pos => ok(adjacentToOpen(...pos),
    label + ' at ' + pos + ' can be stood next to'));
}
ok((doors.H || []).length >= 2, 'the bigger world has more than one heal centre');

for (const n of g.NPCS) {
  ok(!g.SOLID.has(g.tileAt(n.x, n.y)), 'NPC ' + n.id + ' is not embedded in a wall');
  ok(g.tileAt(n.x, n.y) !== 'v', 'NPC ' + n.id + ' is not standing on a ledge');
  ok(adjacentToOpen(n.x, n.y), 'NPC ' + n.id + ' at ' + n.x + ',' + n.y + ' is reachable');
}
const spots = g.NPCS.map(n => n.x + ',' + n.y);
ok(spots.length === new Set(spots).size, 'no two NPCs start on the same tile');

const trainers = g.NPCS.filter(n => n.kind === 'trainer');
ok(trainers.length >= g.GYM_REQUIREMENT,
   'enough trainers exist (' + trainers.length + ') for the gym requirement ('
   + g.GYM_REQUIREMENT + ')');
console.log('  cast: ' + g.NPCS.length + ' NPCs, ' + trainers.length + ' of them trainers');

const GRASS = [',', ';'];
ok(JSON.stringify(g.GRASS) === JSON.stringify(GRASS), "the game's GRASS (what tryEncounter rolls on) is , and ;");
const gatedZones = [];
for (const z of g.ZONES) {
  const rect = [];
  for (let y = z.y1; y <= z.y2; y++) for (let x = z.x1; x <= z.x2; x++) rect.push([x, y]);
  let n = rect.filter(([x, y]) => GRASS.includes(g.tileAt(x, y)) && seen.has(key(x, y))).length;
  if (n === 0 && rect.every(([x, y]) => inGated(x, y)) && new Set(rect.map(([x, y]) => regionOf(x, y))).size === 1) {
    gatedZones.push(regionOf(rect[0][0], rect[0][1]));       // gated: only behind its region's gate
    n = rect.filter(([x, y]) => GRASS.includes(g.tileAt(x, y)) && seenMined.has(key(x, y))).length;
  }
  ok(n > 0, 'encounter zone ' + JSON.stringify([z.x1, z.y1, z.x2, z.y2]) + ' has reachable grass (gated: with every gate broken)');
}
ok(gatedZones.length === g.GATED_REGIONS.length && g.GATED_REGIONS.every(r => gatedZones.includes(r)),
   'exactly one encounter zone is gated per gated region (' + gatedZones.length + ')');
const GEODE_ZONE = g.ZONES.find(z => z.x1 === 66 && z.y1 === 31 && z.x2 === 74 && z.y2 === 32);
ok(GEODE_ZONE && GEODE_ZONE.min === 24 && GEODE_ZONE.max === 28 &&
   JSON.stringify(GEODE_ZONE.pool) === JSON.stringify([['boulderon', 30], ['ironclad', 25], ['voltbloom', 15],
                                                        ['emberling', 15], ['sprigling', 15]]),
   "the GEODE zone is x66..74, y31..32, L24-28 with the creature-designer's pool");
const gzi = g.ZONES.indexOf(GEODE_ZONE);
ok(gzi > 0 && g.ZONES[gzi - 1].x1 === 64 && g.ZONES[gzi - 1].y1 === 27 && g.ZONES[gzi - 1].min === 23,
   'the GEODE zone sits right after the DARK CAVE 23-27 zone');

let orphan = 0;
g.MAP.forEach((r, y) => [...r].forEach((c, x) => { if (g.GRASS.includes(c) && !g.zoneAt(x, y)) orphan++; }));
ok(orphan === 0, orphan + ' grass tiles (any of ' + g.GRASS.join('') + ') sit outside every encounter zone');

const pathCols = new Set();
g.MAP.forEach(r => [...r].forEach((c, x) => { if (c === '_') pathCols.add(x); }));
ok(pathCols.size === 2, 'the trunk road occupies exactly 2 columns, saw ' + [...pathCols].join(','));

const tilesOf = ch => {
  const out = [];
  g.MAP.forEach((r, y) => [...r].forEach((c, x) => { if (c === ch) out.push([x, y]); }));
  return out;
};
const signTiles = tilesOf('S'), itemTiles = tilesOf('o');
const ledges = tilesOf('v'), water = tilesOf('~');

ok(Object.keys(g.SIGNS).length === signTiles.length,
   'every S tile has sign text (map ' + signTiles.length + ', table '
   + Object.keys(g.SIGNS).length + ')');
signTiles.forEach(([x, y]) => {
  ok(g.SIGNS[x + ',' + y], 'sign at ' + x + ',' + y + ' has text');
  ok(adjacentToOpen(x, y), 'sign at ' + x + ',' + y + ' can be read');
});
ok(Object.keys(g.ITEMS).length === itemTiles.length,
   'every o tile has an item amount (map ' + itemTiles.length + ', table '
   + Object.keys(g.ITEMS).length + ')');
itemTiles.forEach(([x, y]) => {
  ok(g.ITEMS[x + ',' + y] > 0, 'item at ' + x + ',' + y + ' gives a positive amount');
  ok(adjacentToOpen(x, y) || gated(x, y), 'item at ' + x + ',' + y + ' can be reached (gated: inside a gated region)');
});
const gatedItems = itemTiles.filter(([x, y]) => gated(x, y));
ok(gatedItems.some(([x, y]) => x === 75 && y === 30) &&
   JSON.stringify(gatedItems.map(([x, y]) => g.GATED_REGIONS.indexOf(regionOf(x, y))).sort()) === '[0,1,2]',
   'exactly one item is gated per gated region (the GEODE\'s at 75,30): ' + JSON.stringify(gatedItems));
ok(g.ITEMS['75,30'] === 8, 'the GEODE ball is worth 8');

ok(ledges.length > 0, 'the map has ledges');
ledges.forEach(([x, y]) => {
  ok(!g.SOLID.has(g.tileAt(x, y + 1)) && g.tileAt(x, y + 1) !== 'v',
     'ledge ' + [x, y] + ' has a clear landing below');
  ok(!g.SOLID.has(g.tileAt(x, y - 1)), 'ledge ' + [x, y] + ' can be approached from above');
});

const fishable = water.filter(([x, y]) => adjacentToOpen(x, y));
ok(fishable.length >= 10, 'at least 10 water tiles are fishable, got ' + fishable.length);
for (const w of g.WATER_ZONES) {
  const inside = fishable.filter(([x, y]) => x >= w.x1 && x <= w.x2 && y >= w.y1 && y <= w.y2);
  ok(inside.length > 0, 'water zone ' + JSON.stringify([w.x1, w.y1, w.x2, w.y2])
     + ' covers reachable water');
  for (const [sid] of w.pool) ok(g.SPECIES[sid], 'water zone references unknown species ' + sid);
}

const darkGrass = tilesOf(';'), caveFloor = tilesOf('c');
const sand = tilesOf('s'), bridge = tilesOf('=');
for (const [name, tiles] of [['dark grass', darkGrass], ['cave floor', caveFloor],
                             ['sand', sand], ['bridge', bridge]]) {
  ok(tiles.length > 0, 'the world has ' + name);
  ok(tiles.some(([x, y]) => seen.has(key(x, y))), name + ' is reachable');
}
const orphanDark = darkGrass.filter(([x, y]) => seenMined.has(key(x, y)) && !g.zoneAt(x, y)).length;
ok(orphanDark === 0, orphanDark + ' reachable dark-grass tiles sit outside every zone');
const geodeGrass = darkGrass.filter(([x, y]) => inGeode(x, y));
ok(geodeGrass.length && geodeGrass.every(([x, y]) => x >= 66 && x <= 74 && y >= 31 && y <= 32 && g.zoneAt(x, y) === GEODE_ZONE),
   'every GEODE dark-grass tile lies in the GEODE zone (' + geodeGrass.length + ')');
const landEnds = bridge.filter(([x, y]) =>
  [-1, 1].some(dx => seen.has(key(x + dx, y)) && g.tileAt(x + dx, y) !== '='));
ok(landEnds.length >= 2, 'the bridge meets land at both ends, saw ' + landEnds.length);

let named = 0;
for (let y = 0; y < g.MAP_H; y++) if (g.regionName(y) !== 'THE TRAIL') named++;
ok(named > g.MAP_H * 0.75, 'most rows belong to a named region (' + named + '/' + g.MAP_H + ')');
ok(g.inCave(Math.floor((g.CAVE_BAND[0] + g.CAVE_BAND[1]) / 2)), 'the cave band reports as cave');
ok(!g.inCave(START[1]), 'the start tile is not in the cave');

console.log('  furniture: ' + signTiles.length + ' signs, ' + itemTiles.length
  + ' items, ' + ledges.length + ' ledges, ' + fishable.length + ' fishable water');
console.log('  terrain: ' + darkGrass.length + ' dark grass, ' + caveFloor.length
  + ' cave floor, ' + sand.length + ' sand, ' + bridge.length + ' bridge');

/* --------------------------------------------------------------- ENGINE */
section('ENGINE — data integrity, damage, xp, catching');

for (const [id, sp] of Object.entries(g.SPECIES)) {
  for (const [, mid] of sp.learn) ok(g.MOVES[mid], id + ' references unknown move ' + mid);
  ok(sp.learn.some(l => l[0] === 1), id + ' has no level-1 move');
  if (sp.evo) ok(g.SPECIES[sp.evo.into], id + ' evolves into unknown species ' + (sp.evo || {}).into);
  for (const t of sp.types) ok(g.TYPE_CHART[t], id + ' has unknown type ' + t);
  for (let L = 1; L <= 60; L++) {
    const mv = g.movesForLevel(id, L);
    ok(mv.length >= 1 && mv.length <= 4, id + ' at L' + L + ' knows ' + mv.length + ' moves');
  }
}
for (const [id, mv] of Object.entries(g.MOVES)) ok(g.TYPE_CHART[mv.type], 'move ' + id + ' has unknown type');

ok(g.typeEffectiveness('Water', ['Fire']) === 2, 'water beats fire');
ok(g.typeEffectiveness('Fire', ['Grass']) === 2, 'fire beats grass');
ok(g.typeEffectiveness('Grass', ['Water']) === 2, 'grass beats water');
ok(g.typeEffectiveness('Electric', ['Water', 'Flying']) === 4, 'dual weakness stacks to 4x');
ok(g.typeEffectiveness('Grass', ['Bug', 'Flying']) === 0.25, 'dual resistance stacks to 0.25x');

const fixed = () => 0.5;
const fireMon = g.makeMon('emberling', 5);
const grassMon = g.makeMon('sprigling', 5);
ok(fireMon.maxhp > 0 && fireMon.hp === fireMon.maxhp, 'a new monster starts at full HP');

const superEff = g.damageCalc(fireMon, grassMon, 'ember', {}, {}, fixed);
ok(!superEff.missed && superEff.dmg > 0 && superEff.eff === 2, 'ember vs grass is super effective');
ok(superEff.dmg < grassMon.maxhp, 'a level-5 hit does not one-shot (' + superEff.dmg + '/' + grassMon.maxhp + ')');
ok(g.damageCalc(grassMon, fireMon, 'vinewhip', {}, {}, fixed).eff === 0.5, 'vine whip is resisted by fire');
ok(g.damageCalc(fireMon, grassMon, 'growl', {}, {}, fixed).dmg === 0, 'status moves deal no damage');

let missed = 0;
for (let i = 0; i < 500; i++) if (g.damageCalc(fireMon, grassMon, 'aerialace', {}, {}, Math.random).missed) missed++;
ok(missed === 0, 'a never-miss move never missed in 500 tries (missed ' + missed + ')');

let miss90 = 0;
for (let i = 0; i < 5000; i++) if (g.damageCalc(fireMon, grassMon, 'rockthrow', {}, {}, Math.random).missed) miss90++;
ok(miss90 / 5000 > 0.06 && miss90 / 5000 < 0.14,
   '90%-accuracy move missed ' + (100 * miss90 / 5000).toFixed(1) + '% of the time');

const boosted = g.damageCalc(fireMon, grassMon, 'ember', { spa: 2 }, {}, fixed).dmg;
const lowered = g.damageCalc(fireMon, grassMon, 'ember', { spa: -2 }, {}, fixed).dmg;
ok(boosted > superEff.dmg && superEff.dmg > lowered,
   'stat stages scale damage (' + lowered + ' < ' + superEff.dmg + ' < ' + boosted + ')');

const evolver = g.makeMon('emberling', 5);
const events = g.gainXp(evolver, g.xpForLevel(17) - evolver.xp);
ok(evolver.level >= 16, 'gained levels, reached ' + evolver.level);
ok(evolver.id === 'pyrelash', 'evolved into pyrelash, got ' + evolver.id);
ok(events.some(e => e.t === 'evolve'), 'an evolve event was emitted');
ok(evolver.moves.length <= 4, 'moveset stays capped at 4, got ' + evolver.moves.length);
ok(evolver.hp <= evolver.maxhp, 'HP stays within max after level-ups');

const nicknamed = g.makeMon('emberling', 15, 'SPARKY');
g.gainXp(nicknamed, g.xpForLevel(17));
ok(nicknamed.name === 'SPARKY', 'a nickname survives evolution, got ' + nicknamed.name);

const hurt = g.makeMon('nibbit', 5);
let caughtWeak = 0;
for (let i = 0; i < 2000; i++) { hurt.hp = 1; if (g.catchRoll(hurt, 1.5, Math.random).caught) caughtWeak++; }
ok(caughtWeak / 2000 > 0.7, 'a nearly-fainted nibbit is caught ' + (100 * caughtWeak / 2000).toFixed(0) + '% of the time');

const healthy = g.makeMon('nibbit', 5);
let caughtFull = 0;
for (let i = 0; i < 2000; i++) if (g.catchRoll(healthy, 1.5, Math.random).caught) caughtFull++;
ok(caughtFull < caughtWeak, 'a healthy monster is harder to catch than a hurt one');

for (const id of Object.keys(g.SPECIES)) {
  const mon = g.makeMon(id, 10);
  mon.hp = 1;
  const res = g.catchRoll(mon, 1.5, Math.random);
  ok(res.shakes >= 0 && res.shakes <= 4, id + ' produced ' + res.shakes + ' shakes (must be 0..4)');
}

for (const z of g.ZONES) for (const [id] of z.pool) ok(g.SPECIES[id], 'encounter table references unknown species ' + id);
for (const n of g.NPCS) if (n.team) for (const [id] of n.team) ok(g.SPECIES[id], 'trainer ' + n.id + ' uses unknown species ' + id);
for (const [id] of g.GYM_LEADER.team) ok(g.SPECIES[id], 'gym leader uses unknown species ' + id);

const probeMon = g.makeMon('dripling', 14);
const probeFoe = g.makeMon('zapmote', 12);
const hits = Math.ceil(probeFoe.maxhp / g.damageCalc(probeMon, probeFoe, 'waterpulse', {}, {}, fixed).dmg);
ok(hits >= 2 && hits <= 8, 'gym lead takes a sane number of hits to fell (' + hits + ')');
console.log('  balance probe: L14 dripling needs ~' + hits + ' water pulses for L12 zapmote');

/* --------------------------------------------------------------- BATTLE */
section('BATTLE — full fights driven to completion');

// Play a battle the way a person would: tick the clock, press through every
// message, and choose an action whenever the game asks for one.
function runBattle(chooseAction) {
  const log = [];
  let guard = 0;
  while (G.battle && G.battle.phase !== 'over' && guard++ < 20000) {
    const b = G.battle;
    g.updateBattle(1 / 60);
    b.dispMine = b.mine.hp;           // settle HP bars instantly
    b.dispFoe = b.foe.hp;
    if (b.step && b.step.t === 'msg') { log.push(b.step.s); b.step = null; continue; }
    if (b.step) continue;
    if (b.phase === 'menu') {
      g.takeTurn(b, chooseAction(b));
    } else if (b.phase === 'swap' && b.forcedSwap) {
      const next = G.party.find(m => m.hp > 0);
      if (!next) break;
      b.forcedSwap = false;
      b.mine = next; b.dispMine = next.hp; b.stagesMine = {};
      b.phase = 'menu';
    }
  }
  ok(guard < 20000, 'battle terminated instead of spinning (' + guard + ' ticks)');
  return log;
}

function freshBattle(mine, foe, trainer) {
  G.party = Array.isArray(mine) ? mine : [mine];
  G.balls = 20;
  G.fadeDir = 0; G.fadeCb = null; G.mode = 'overworld';
  g.startBattle(foe, trainer ? { trainer } : {});
}

// Message ordering. Steps queued from inside a running `do` must splice in at
// the current position — if they appended, the faint would be narrated before
// the attack that caused it.
freshBattle(g.makeMon('emberling', 40), g.makeMon('sprigling', 3));
let log = runBattle(() => ({ t: 'attack', move: 'ember' }));
console.log('  one-shot KO transcript:');
log.forEach(l => console.log('    ' + l));
const iUsed = log.findIndex(s => s.includes('used EMBER'));
const iFaint = log.findIndex(s => s.includes('fainted'));
const iExp = log.findIndex(s => s.includes('EXP'));
ok(iUsed >= 0, 'the attack was narrated');
ok(iFaint > iUsed, 'the faint is narrated after the attack that caused it');
ok(iExp > iFaint, 'EXP is narrated after the faint');

const ids = Object.keys(g.SPECIES);
for (let i = 0; i < 200; i++) {
  const mine = g.makeMon(ids[i % ids.length], 20);
  const foe = g.makeMon(ids[(i * 7 + 3) % ids.length], 20);
  freshBattle(mine, foe);
  runBattle(b => ({ t: 'attack', move: b.mine.moves[i % b.mine.moves.length] }));
  ok(mine.hp >= 0 && mine.hp <= mine.maxhp, 'HP stayed in range for ' + mine.id);
}
console.log('  200 randomised even fights resolved');

const maya = g.NPCS.find(n => n.id === 't2');
freshBattle(g.makeMon('tidecoil', 45), g.makeMon(maya.team[0][0], maya.team[0][1]), maya);
log = runBattle(() => ({ t: 'attack', move: 'aquatail' }));
ok(log.filter(s => s.includes('sent out')).length === maya.team.length,
   'trainer worked through all ' + maya.team.length + ' of their monsters');
ok(log.some(s => s.includes(maya.defeat)), 'trainer spoke their defeat line');
ok(G.beaten.t2 === true, 'trainer was recorded as beaten');

let joined = 0;
for (let i = 0; i < 60; i++) {
  freshBattle(g.makeMon('dripling', 30), g.makeMon('nibbit', 4));
  const before = G.party.length;
  runBattle(b => { b.foe.hp = 1; return { t: 'ball' }; });
  if (G.party.length > before) joined++;
}
ok(joined > 40, 'a weakened wild monster joined the party ' + joined + '/60 times');
ok(G.balls < 20, 'balls were actually consumed (' + G.balls + ' left)');

let escaped = 0;
for (let i = 0; i < 60; i++) {
  freshBattle(g.makeMon('zapmote', 30), g.makeMon('pebblit', 5));
  if (runBattle(() => ({ t: 'run' })).some(s => s.includes('Got away'))) escaped++;
}
ok(escaped > 30, 'a much faster monster escaped ' + escaped + '/60 times');

freshBattle(g.makeMon('sprigling', 3), g.makeMon('pyrelash', 50));
runBattle(() => ({ t: 'attack', move: 'tackle' }));
ok(!G.battle || G.battle.phase === 'over', 'a lost battle still ends cleanly');
ok(!g.partyAlive(), 'the party is wiped after a loss');

G.party = [g.makeMon('emberling', 20), g.makeMon('dripling', 20)];
G.fadeDir = 0; G.mode = 'overworld';
g.startBattle(g.makeMon('nibbit', 5), {});
let hasSwapped = false;
log = runBattle(b => {
  if (!hasSwapped) { hasSwapped = true; return { t: 'swap', index: 1 }; }
  return { t: 'attack', move: b.mine.moves[0] };
});
ok(log.some(s => s.includes('Come back')), 'swapping mid-fight was narrated');

// A status-only fight must still terminate, and the -6 stage floor must report.
freshBattle(g.makeMon('thornmane', 40), g.makeMon('nibbit', 3));
log = runBattle(() => ({ t: 'attack', move: 'growl' }));
ok(log.some(s => s.includes('ATTACK')), 'growl reported a stat change');
ok(log.some(s => s.includes("won't go lower")), 'the -6 stat-stage floor was reached and reported');

// -- the DARK CAVE hunt battle (GLOOMSTALK) ------------------------------------
{
  const sp = g.SPECIES.gloomstalk;
  const b6 = sp.base;
  ok(sp.name === 'GLOOMSTALK' && sp.types.join() === 'Dark', 'GLOOMSTALK is pure Dark');
  ok([b6.hp, b6.atk, b6.def, b6.spa, b6.spd, b6.spe].join() === '75,100,60,40,60,75',
     'GLOOMSTALK base stats 75/100/60/40/60/75 (BST 410)');
  ok(sp.catchRate === 3 && sp.baseExp === 190 && sp.evo === null, 'GLOOMSTALK: catch rate 3, base EXP 190, no evolution');
  ok(sp.art.kind === 'quad' && sp.art.big && sp.art.mane, 'GLOOMSTALK reuses the quad silhouette (big + mane)');
  ok(g.HUNT.species === 'gloomstalk', 'HUNT names GLOOMSTALK');
  ok(!g.ZONES.concat(g.WATER_ZONES).some(z => z.pool.some(([s]) => s === 'gloomstalk')),
     'GLOOMSTALK is in no grass or fishing pool, so it can never be caught');
  for (let lv = g.HUNT.lvMin; lv <= g.HUNT.lvMax; lv++) {
    ok(g.movesForLevel('gloomstalk', lv).join() === 'bite,quickattack,howl,crunch',
       'GLOOMSTALK L' + lv + ' knows BITE, QUICK ATTACK, HOWL, CRUNCH');
  }
  ok(g.huntLevel([1]) === 22 && g.huntLevel([23]) === 22 && g.huntLevel([24]) === 23, 'huntLevel: best - 1, floored at 22');
  ok(g.huntLevel([29]) === 28 && g.huntLevel([100]) === 28, 'huntLevel is capped at 28');
  ok(g.huntLevel([5, 26, 12]) === 25, "huntLevel reads the party's best level");
  const curve = Array.from({ length: 100 }, (_, i) => g.huntLevel([i + 1]));
  ok(curve.every((v, i) => v >= 22 && v <= 28 && (i === 0 || v >= curve[i - 1])),
     'huntLevel stays in 22..28 and never falls');

  const freshHunt = (mine, lv) => {
    G.party = Array.isArray(mine) ? mine : [mine];
    G.balls = 20; G.fadeDir = 0; G.fadeCb = null; G.mode = 'overworld';
    g.startBattle(g.makeMon('gloomstalk', lv || 25), { hunt: true });
    return G.battle;
  };
  const toMenu = events => {
    const out = [];
    let guard = 0;
    while (G.battle && G.battle.phase !== 'menu' && G.battle.phase !== 'over' && guard++ < 5000) {
      const b = G.battle;
      g.updateBattle(1 / 60);
      b.dispMine = b.mine.hp; b.dispFoe = b.foe.hp;
      if (b.step && b.step.t === 'msg') {
        out.push(b.step.s);
        if (events) events.push(['msg', b.scare]);
        b.step = null;
      }
    }
    return out;
  };

  // The jumpscare intro, through the queue only, with the global RNG untouched.
  const realRandom = Math.random;
  const realScare = g.SFX.scare;
  let draws = 0;
  const events = [];
  g.SFX.scare = () => events.push(['sfx', G.battle.scare]);
  Math.random = () => { draws++; return realRandom(); };
  let b = freshHunt(g.makeMon('pyrelash', 26));
  ok(b.hunt === true && b.trainer === null && b.scare === 'dark', 'startBattle({hunt}) stores b.hunt, foe hidden');
  ok(!b.queue.some(s => s.t === 'wait'), 'no held frame with motion on');
  const intro = toMenu(events);
  Math.random = realRandom;
  g.SFX.scare = realScare;
  ok(intro.join('|') === ['Something was breathing right behind you...', 'GLOOMSTALK lunged out of the dark!',
     "It's hunting you. There's no time to aim a BALL!", 'Go, PYRELASH!'].join('|'),
     'the scare intro narrates in order: ' + intro.join(' / '));
  ok(events.map(e => e.join(':')).join() === 'sfx:dark,msg:dark,msg:reveal,msg:reveal,msg:',
     'scare sfx, dark line, then the reveal lines, then Go: ' + events.map(e => e.join(':')).join());
  ok(draws === 0, 'the scare intro never calls Math.random (' + draws + ')');
  ok(b.scareFlash > 0 && b.scareFlash <= g.SCARE_FLASH_TIME && b.trauma > 0, 'the reveal fired one flash and a shake');
  ok(G.battle.phase === 'menu' && G.battle.scare === null, 'the intro ends at the menu with the scare over');

  // foePose: a lunge from close up that settles on the platform.
  const pose = (scare, t) => g.foePose({ scare, scareT: t });
  ok(pose('reveal', 0)[2] > 78 && pose('reveal', g.SCARE_LUNGE_TIME)[2] === 78 && pose(null, 0)[2] === 78,
     'the foe lunges in large and settles at its platform size');

  // BALL refused without using a turn.
  const hp0 = [b.mine.hp, b.foe.hp];
  draws = 0;
  Math.random = () => { draws++; return realRandom(); };
  g.takeTurn(b, { t: 'ball' });
  const refused = toMenu();
  Math.random = realRandom;
  ok(refused.join() === 'It melts into the dark before the BALL can land!', 'BALL in a hunt is refused: ' + refused);
  ok(G.balls === 20 && b.ballAnim === null && b.mine.hp === hp0[0] && b.foe.hp === hp0[1] && b.phase === 'menu',
     'the refused BALL was not spent, and no turn was used');
  ok(draws === 1, 'the refusal draws only the usual foe-move pick from Math.random (' + draws + ')');

  // RUN uses the fixed HUNT odds whatever the speeds; a failure gives a free attack.
  const huntLog = [];
  for (const [id, lv] of [['pebblit', 22], ['galebeak', 60]]) {
    for (const [roll, should] of [[g.HUNT.runOdds - 0.01, true], [g.HUNT.runOdds + 0.01, false]]) {
      b = freshHunt(g.makeMon(id, lv));
      toMenu();
      // foe-move pick first, then the run roll
      let n = 0;
      Math.random = () => (n++ === 0 ? 0 : roll);
      g.takeTurn(b, { t: 'run' });
      Math.random = realRandom;
      const out = toMenu();
      const tag = id + ' L' + lv + ', roll ' + roll.toFixed(2);
      if (should) {
        ok(out[0] === 'You bolted into the dark... it lost your scent. For now.', tag + ': RUN succeeds under the fixed odds');
        ok(b.phase === 'over' && b.result === 'run' && b.huntPaid, tag + ': the run ends the hunt through huntOver');
      } else {
        ok(out[0] === 'It cut you off!', tag + ': RUN fails above the fixed odds');
        ok(out.slice(1).some(s => s.startsWith('Foe GLOOMSTALK used')), tag + ': a failed RUN gives the foe its free attack');
        ok(b.phase === 'menu' && !b.huntPaid, tag + ': the fight goes on');
      }
    }
  }

  // huntOver rewards: first win vs repeat, conserved in materials.
  G.flags.huntBeaten = 0;
  G.materials = g.zeroMaterials();
  G.materials.stone = 5;
  const ores = [];
  for (let n = 1; n <= 3; n++) {
    b = freshHunt(g.makeMon('pyrelash', 60));
    const out = runBattle(() => ({ t: 'attack', move: 'infernofang' }));
    const want = n === 1 ? g.HUNT.rewardFirst.ore : g.HUNT.rewardRepeat.ore;
    const iF = out.findIndex(s => s.includes('Wild GLOOMSTALK fainted'));
    const iE = out.findIndex(s => s.includes('EXP'));
    const iO = out.findIndex(s => s.includes('behind in the dark'));
    ok(iF >= 0 && iF < iE && iE < iO && out[iO] === 'It left ' + want + ' ORE behind in the dark.',
       'win ' + n + ': faint, then EXP, then the ' + want + '-ORE line (splice order kept)');
    ok(b.result === 'win' && G.flags.huntBeaten === n, 'win ' + n + ': the win count is ' + n);
    ores.push(G.materials.ore);
    ok(G.materials.stone === 5 && Object.values(G.materials).reduce((a, c) => a + c, 0) === 5 + G.materials.ore,
       'win ' + n + ': only ORE was added');
  }
  ok(ores.join() === '3,4,5', 'ORE: +3 on the first win, +1 after (' + ores + ')');

  // Losing is the normal whiteout and pays nothing.
  G.flags.huntBeaten = 0;
  const ore0 = G.materials.ore;
  b = freshHunt(g.makeMon('nibbit', 5), 28);
  runBattle(() => ({ t: 'attack', move: 'tackle' }));
  ok(b.result === 'lose' && G.materials.ore === ore0 && G.flags.huntBeaten === 0, 'a lost hunt pays nothing');
  const cb = G.fadeCb; G.fadeCb = null; G.fadeDir = 0; cb();
  ok(G.mode === 'dialogue' && G.party[0].hp === G.party[0].maxhp &&
     G.player.tx === G.lastCentre[0] && G.player.ty === G.lastCentre[1],
     'a lost hunt whites out to the centre, healed, like any loss');
  G.mode = 'overworld'; G.dialogue = null;

  // Reduced motion: the normal fade, a held 0.4 s dark frame, no flash or lunge.
  try {
    g.setScareCalm(true);
    G.party = [g.makeMon('pyrelash', 26)];
    G.fadeDir = 0; G.fadeCb = null; G.mode = 'overworld'; G.battle = null;
    g.startHunt(g.makeMon('gloomstalk', 25));
    ok(G.battle === null && G.fadeDir === 1 && G.fadeCb, 'reduced motion: startHunt fades in normally');
    const c2 = G.fadeCb; G.fadeCb = null; G.fadeDir = 0; c2();
    b = G.battle;
    ok(b.queue.slice(0, 3).map(s => s.t + (s.ms || '')).join() === 'do,wait0.4,msg',
       'reduced motion: sfx, a held 0.4 s dark frame, then the first line');
    ok(toMenu().join('|') === intro.join('|'), 'reduced motion: the intro text is identical');
    ok(b.scareFlash === 0 && b.trauma === 0, 'reduced motion: no flash and no shake at the reveal');
    ok(g.foePose({ scare: 'reveal', scareT: 0 })[2] === 78, 'reduced motion: no lunge');
  } finally {
    g.setScareCalm(null);
  }
  ok(g.scareCalm() === g.REDUCED_MOTION, 'the scare override is restored');
  G.fadeDir = 0; G.fadeCb = null; G.mode = 'overworld'; G.battle = null;
  g.startHunt(g.makeMon('gloomstalk', 25));
  ok(G.mode === 'battle' && G.battle.hunt && G.fadeDir === 0, 'motion on: startHunt is a hard cut');
  G.battle = null; G.mode = 'overworld';
  ok([null, '3', -4, true, NaN, [], 0, 2, 2.9].map(v => g.huntCount(v)).join() === '0,0,0,0,0,0,0,2,2',
     'huntCount cleans a saved win count to a non-negative int');
}

/* ---------------------------------------------------------------- WORLD */
section('WORLD — trainer sight lines, save/load round-trip');

// BFS over tiles that are genuinely walkable, NPC bodies and ledges included.
function route(sx, sy, tx, ty) {
  const prev = new Map([[key(sx, sy), null]]);
  const q = [[sx, sy]];
  while (q.length) {
    const [x, y] = q.shift();
    if (x === tx && y === ty) {
      const out = [];
      let c = key(x, y);
      while (c) { out.unshift(c.split(',').map(Number)); c = prev.get(c); }
      return out;
    }
    for (const [dx, dy] of [[0, -1], [0, 1], [-1, 0], [1, 0]]) {
      const nx = x + dx, ny = y + dy;
      if (prev.has(key(nx, ny))) continue;
      if (g.tileAt(nx, ny) === 'v') {
        if (dy !== 1) continue;
        const lx = nx, ly = ny + 1;
        if (prev.has(key(lx, ly)) || g.blockedFor(lx, ly, 'down')) continue;
        prev.set(key(lx, ly), key(x, y)); q.push([lx, ly]);
        continue;
      }
      if (g.blockedFor(nx, ny)) continue;
      prev.set(key(nx, ny), key(x, y)); q.push([nx, ny]);
    }
  }
  return null;
}

function walkTo(tx, ty) {
  const p = G.player;
  const legs = route(p.tx, p.ty, tx, ty);
  if (!legs) return { unreachable: true };
  for (const [x, y] of legs.slice(1)) {
    p.dir = y < p.ty ? 'up' : y > p.ty ? 'down' : x < p.tx ? 'left' : 'right';
    p.tx = x; p.ty = y;
    g.checkTrainerSight();
    if (G.mode !== 'overworld') return { engaged: true, at: [x, y] };
  }
  return { arrived: true, steps: legs.length };
}

const ALL_TRAINERS = g.NPCS.filter(n => n.kind === 'trainer');
let GYM_DOOR = null;
g.MAP.forEach((r, y) => [...r].forEach((c, x) => { if (c === 'G') GYM_DOOR = [x, y]; }));
const APPROACH = [GYM_DOOR[0], GYM_DOOR[1] + 1];

G.flags.starter = true;
G.party = [g.makeMon('tidecoil', 40)];
G.beaten = {};
G.mode = 'overworld'; G.fadeDir = 0;
G.player.tx = g.START_TILE[0]; G.player.ty = g.START_TILE[1];

let r = walkTo(...APPROACH);
ok(r.engaged, 'walking the trail runs into a trainer: ' + JSON.stringify(r));
if (r.at) console.log('  first trainer sees you at ' + JSON.stringify(r.at)
  + ' (' + g.regionName(r.at[1]) + ')');

G.beaten = Object.fromEntries(ALL_TRAINERS.map(n => [n.id, true]));
G.mode = 'overworld';
G.player.tx = g.START_TILE[0]; G.player.ty = g.START_TILE[1];
r = walkTo(...APPROACH);
ok(r.arrived, 'the trail is walkable end to end once trainers are beaten: '
   + JSON.stringify(r));
if (r.arrived) console.log('  full traverse: ' + r.steps + ' tiles to the gym door');
ok(g.tileAt(...GYM_DOOR) === 'G', 'the gym door is where the walk ends');

let reachableTrainers = 0;
for (const n of ALL_TRAINERS) {
  const found = [[0, 1], [0, -1], [-1, 0], [1, 0]].some(([dx, dy]) =>
    route(g.START_TILE[0], g.START_TILE[1], n.x + dx, n.y + dy));
  if (found) reachableTrainers++;
  else ok(false, 'trainer ' + n.id + ' cannot be reached from the start');
}
ok(reachableTrainers >= g.GYM_REQUIREMENT,
   'at least ' + g.GYM_REQUIREMENT + ' trainers reachable (found ' + reachableTrainers + ')');

// the gym refuses you until the requirement is met, then opens
G.beaten = {};
G.mode = 'overworld';
G.player.tx = APPROACH[0]; G.player.ty = APPROACH[1]; G.player.dir = 'up';
G.dialogue = null;
g.interact();
ok(G.mode === 'dialogue' && G.dialogue.lines.some(l => /budge|rule/i.test(l)),
   'the gym turns you away before the requirement is met');
G.dialogue = null; G.mode = 'overworld';
G.beaten = Object.fromEntries(ALL_TRAINERS.map(n => [n.id, true]));
g.interact();
ok(G.mode === 'dialogue' && G.dialogue.lines.join(' ').includes('slide open'),
   'the gym opens once enough trainers are beaten');
G.dialogue = null; G.mode = 'overworld';

// --- save / load round-trip, now carrying picked items and the last centre ---
G.mode = 'overworld';
G.beaten = { t1: true };
G.party = [g.makeMon('umbrawing', 26), g.makeMon('ironclad', 24)];
G.party[0].hp = 7;
G.balls = 13;
G.picked = new Set(['20,89', '52,68']);
G.lastCentre = [12, 59];
G.flags = { starter: true, gym: false };
G.player.tx = 44; G.player.ty = 60; G.player.dir = 'left';

ok(g.saveGame(), 'saveGame reported success');
const snapshot = JSON.stringify(G.party.map(m => [m.id, m.level, m.hp, m.moves.join('|')]));
G.party = []; G.balls = 0; G.beaten = {}; G.picked = new Set();
G.flags = { starter: false, gym: false };
G.lastCentre = g.START_TILE.slice();

ok(g.loadGame(), 'loadGame reported success');
ok(JSON.stringify(G.party.map(m => [m.id, m.level, m.hp, m.moves.join('|')])) === snapshot,
   'the party round-tripped exactly');
ok(G.balls === 13, 'ball count round-tripped, got ' + G.balls);
ok(G.beaten.t1 === true, 'beaten-trainer flags round-tripped');
ok(G.picked.has('20,89') && G.picked.has('52,68') && G.picked.size === 2,
   'picked items round-tripped, got ' + [...G.picked].join(' '));
ok(G.lastCentre[0] === 12 && G.lastCentre[1] === 59, 'last heal centre round-tripped');
ok(G.player.tx === 44 && G.player.ty === 60, 'map position round-tripped');
ok(G.player.px === 44 * 32, 'pixel position rebuilt from the tile position');

// --- picking an item is one-way and credits the pouch ---
G.picked = new Set();
G.balls = 0;
const ipos = Object.keys(g.ITEMS)[0];
const [ix, iy] = ipos.split(',').map(Number);
G.dialogue = null;
g.pickUp(ix, iy);
ok(G.balls === g.ITEMS[ipos], 'picking up ' + ipos + ' gave ' + g.ITEMS[ipos] + ' balls');
ok(G.picked.has(ipos), 'the item is marked as taken');
ok(!g.blockedFor(ix, iy), 'a taken item stops blocking its tile');
const beforeBalls = G.balls;
G.dialogue = null;
g.pickUp(ix, iy);
ok(G.balls === beforeBalls, 'picking the same item twice gives nothing more');

// --- ledges only yield downward ---
let led = null;
g.MAP.forEach((rr2, y) => [...rr2].forEach((c, x) => { if (c === 'v' && !led) led = [x, y]; }));
ok(g.blockedFor(led[0], led[1], 'up'), 'a ledge blocks you going up');
ok(g.blockedFor(led[0], led[1], 'left'), 'a ledge blocks you going sideways');
ok(!g.blockedFor(led[0], led[1], 'down'), 'a ledge lets you drop south');

store['monster-trail-save-v1'] = '{"party":[{"id":"NOPE","level":5}],"balls":3}';
ok(g.loadGame() === true, 'a save naming an unknown species still loads');
ok(G.party.length === 0, 'the unknown species was dropped rather than crashing');
store['monster-trail-save-v1'] = 'not json at all';
ok(g.loadGame() === false, 'a corrupt save is rejected cleanly');

/* --------------------------------------------------------------- SANDBOX */
section('SANDBOX — mining, crafting, building in ROCKY PASS, the seam and the GEODE');

const MAP_BEFORE = g.MAP.join('\n');
const ROCK = g.ROCK_BAND;
const BOULDERS = [];
for (let y = ROCK[0]; y <= ROCK[1]; y++) {
  for (let x = 2; x < g.MAP_W - 2; x++) if (g.MAP[y][x] === '#') BOULDERS.push([x, y]);
}
const ORE_TILES = BOULDERS.filter(([x, y]) => g.mineDrop('#', x, y).ore);
const has = (o, k) => Object.prototype.hasOwnProperty.call(o, k);
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);

// --- tables ---
ok(!g.MAP.join('').includes(g.WALL), 'the WALL glyph is never authored into MAP');
ok(g.SOLID.has(g.WALL) && g.SOLID.has('#') && g.SOLID.has(g.SEAM) && g.SOLID.has(g.TREE),
   'walls, boulders, seams and thick trees are solid');
ok(same(Object.keys(g.BLOCKS).sort(), ['#', g.WALL, g.SEAM, g.TREE].sort()),
   'only boulders, built walls, the seam and thick trees can be broken');
ok(g.BLOCKS['#'].tier === 1 && g.BLOCKS[g.WALL].tier === 1 && g.BLOCKS[g.SEAM].tier === 2 && g.BLOCKS[g.TREE].tier === 1,
   'boulders and walls need PICK 1, the seam PICK 2, a thick tree AXE 1');
ok(['#', g.WALL, g.SEAM].every(k => g.BLOCKS[k].tool === 'pick') && g.BLOCKS[g.TREE].tool === 'axe',
   'every block names its tool');
ok(same(Object.keys(g.BLOCKS).filter(k => g.BLOCKS[k].authoredOnly).sort(), [g.SEAM, g.TREE].sort()),
   'only the seam and the thick tree are authoredOnly');
ok(same(g.BLOCKS[g.TREE].drops, {}) && g.BLOCKS[g.TREE].leaves === '.', 'a thick tree drops nothing and leaves ground');
ok(!has(g.BLOCKS, 'C'), 'cave wall (C) is never mineable');
for (const r of g.RECIPES) {
  ok(g.MATERIALS.includes(r.out) || r.out === 'balls' || r.setsTier || r.setsTool || has(g.GOODS, r.out) ||
     ((r.out === 'lantern' || r.out === 'pulse') && 'cap' in r), 'recipe ' + r.id + ' makes a known thing');
  ok(!!g.craftLabel(r.out), 'recipe ' + r.id + ' has a label');
  ok(r.count > 0 && Object.keys(r.needs).every(k => (g.MATERIALS.includes(k) || (has(g.GOODS, k) && g.GOODS[k].kind === 'loot')) && r.needs[k] > 0),
     'recipe ' + r.id + ' needs known materials or loot');
}
const wallRecipe = g.RECIPES.find(r => r.out === 'wall');
ok(same(g.BLOCKS[g.WALL].drops, wallRecipe.needs), 'mining a WALL refunds exactly what it cost to craft');
ok(g.MENU_ITEMS[3] === 'CRAFT', 'CRAFT sits in the overworld menu');

// --- mine_drop: deterministic, ore ~1 in 4, only boulders ---
ok(BOULDERS.every(([x, y]) => same(g.mineDrop('#', x, y), g.mineDrop('#', x, y))), 'mineDrop is pure');
ok(BOULDERS.every(([x, y]) => g.mineDrop('#', x, y).stone === 1), 'every boulder gives 1 STONE');
ok(BOULDERS.length >= 40, 'ROCKY PASS has plenty of boulders (' + BOULDERS.length + ')');
ok(ORE_TILES.length >= BOULDERS.length / 8 && ORE_TILES.length <= BOULDERS.length / 2,
   'ORE turns up in roughly 1 in 4 boulders (' + ORE_TILES.length + ' of ' + BOULDERS.length + ')');
ok(!ORE_TILES.some(([x, y]) => g.mineDrop(g.WALL, x, y).ore), 'a WALL on an ore spot never yields ORE');
ok(same(g.mineDrop('.', 30, 45), {}) && same(g.mineDrop('_', 42, 45), {}), 'ground drops nothing');
ok(g.tileHash(87, 51) >= 0 && g.tileHash(87, 51) < 65536, 'tileHash stays in 16 bits');
console.log('  ' + BOULDERS.length + ' boulders, ' + ORE_TILES.length + ' hold ORE');

// --- canMine ---
ok(BOULDERS.every(([x, y]) => g.canMine('#', x, y, true)), 'every pass boulder is mineable');
ok(!BOULDERS.some(([x, y]) => g.canMine('#', x, y, false)), 'nothing breaks without a PICK');
const outsideRock = [];
g.MAP.forEach((row, y) => [...row].forEach((c, x) => {
  if (c === '#' && (y < ROCK[0] || y > ROCK[1])) outsideRock.push([x, y]);
}));
ok(outsideRock.length && !outsideRock.some(([x, y]) => g.canMine('#', x, y, true)),
   'trees and rock outside ROCKY PASS stay solid (' + outsideRock.length + ' checked)');
let edgeMineable = false;
for (let y = ROCK[0]; y <= ROCK[1]; y++) {
  for (const x of [0, 1, g.MAP_W - 2, g.MAP_W - 1]) if (g.canMine('#', x, y, true)) edgeMineable = true;
}
ok(!edgeMineable, "the world-edge columns can't be dug");
ok(!g.canMine('#', 43, ROCK[0] - 1, true) && !g.canMine('#', 10, ROCK[1] + 1, true),
   "the band's bounding rows of rock stay solid");
for (const glyph of 'CB~.,_S') ok(!g.canMine(glyph, 30, 45, true), glyph + ' is not mineable');

// --- the overlay never mutates MAP ---
const b0 = BOULDERS[0];
const e1 = g.withEdit({}, b0[0], b0[1], '.');
ok(g.tileAt(b0[0], b0[1], e1) === '.' && g.tileAt(b0[0], b0[1]) === '#',
   'tileAt reads the overlay only when it is passed');
const e2 = g.withEdit(e1, b0[0], b0[1], '#');
ok(same(e2, {}) && same(e1, { [key(...b0)]: '.' }), 'restoring the authored glyph drops the diff; withEdit copies');
ok(g.tileAt(-1, 45, { '-1,45': '.' }) === '#', 'off-map is rock whatever the overlay says');

// --- craft conserves exactly and refuses when short ---
const inv = { stone: 7, ore: 3, wall: 1, balls: 7,          // Part B: loot needs come from the BAG
              twig: 3, flint: 3, leaf: 3, dewdrop: 3, copperwire: 3, emberdust: 3, shadowsilk: 3 };
const frozen = JSON.stringify(inv);
for (const r of g.RECIPES) {
  const after = g.craft(inv, r, 1);
  ok(JSON.stringify(inv) === frozen, 'craft(' + r.id + ') does not mutate its input');
  ok(after !== null, 'craft(' + r.id + ') succeeds with enough');
  const keys = new Set([...Object.keys(after), ...Object.keys(inv)]);
  const delta = {}, want = {};
  for (const k of keys) { const d = (after[k] || 0) - (inv[k] || 0); if (d) delta[k] = d; }
  for (const k in r.needs) want[k] = -r.needs[k];
  if (!(r.setsTier || r.setsTool)) want[r.out] = (want[r.out] || 0) + r.count;   // a tool raises a flag, not a counter
  ok(same(Object.entries(delta).sort(), Object.entries(want).filter(([, v]) => v).sort()),
     'craft(' + r.id + ') moves exactly the recipe: ' + JSON.stringify(delta));
  const short = {};
  for (const k in r.needs) short[k] = r.needs[k] - 1;
  ok(g.craft(short, r) === null && g.craft({}, r) === null, 'craft(' + r.id + ') refuses when short');
  ok(g.craft(Object.assign({}, r.needs), r) !== null, 'craft(' + r.id + ') works with exactly enough');
}

// --- PICK tiers, the seam, the IRON PICK, loadEdits and the backstop ---
for (const [v, want] of [[true, 1], [false, 0], [null, 0], [undefined, 0], [0, 0], [1, 1], [2, 2], [3, 2],
                         [-1, 0], ['2', 0], [1.5, 0]]) {
  ok(g.pickTier(v) === want, 'pickTier(' + JSON.stringify(v) + ') is ' + want);
}
for (const [sx, sy] of SEAMS) {
  ok(!g.canMine(g.SEAM, sx, sy, 0) && !g.canMine(g.SEAM, sx, sy, 1) && !g.canMine(g.SEAM, sx, sy, true),
     'seam ' + sx + ',' + sy + ' does not break at tier 0/1');
  ok(g.canMine(g.SEAM, sx, sy, 2), 'seam ' + sx + ',' + sy + ' breaks with the IRON PICK');
  ok(same(g.mineDrop(g.SEAM, sx, sy), { ore: 2 }), 'seam ' + sx + ',' + sy + ' always drops exactly 2 ORE');
}
ok(!g.canMine(g.SEAM, 70, 35, 2) && !g.canMine(g.SEAM, 30, 45, 2), 'K breaks only where MAP authored it');
ok(!g.canMine('c', 70, 34, 2), "a mined seam's floor is not mineable again");
const caveWalls = [];
g.MAP.forEach((row, y) => [...row].forEach((c, x) => { if (c === 'C') caveWalls.push([x, y]); }));
ok(!caveWalls.some(([x, y]) => g.canMine('C', x, y, 2)), 'no cave wall breaks even with the IRON PICK (' + caveWalls.length + ')');
ok(BOULDERS.every(([x, y]) => g.canMine('#', x, y, 2)) && g.canMine(g.WALL, 30, 44, 2), 'the IRON PICK still breaks boulders and walls');
ok(!outsideRock.some(([x, y]) => g.canMine('#', x, y, 2)), "the IRON PICK still can't fell trees");

const IRON = g.RECIPES.find(r2 => r2.id === 'iron_pick');
ok(IRON.setsTier === 2 && g.PICK_MAX === 2 && same(IRON.needs, { ore: 3, stone: 6 }),
   'the IRON PICK is 3 ORE + 6 STONE and sets the PICK to tier 2');
const haveI = { stone: 6, ore: 3, wall: 1, balls: 5 };
const gotIron = g.craft(haveI, IRON, 1);
ok(same(gotIron, { stone: 0, ore: 0, wall: 1, balls: 5 }), 'crafting the IRON PICK takes exactly its needs: ' + JSON.stringify(gotIron));
ok(gotIron && !has(gotIron, 'iron_pick'), 'the IRON PICK is never stored in materials');
ok(same(haveI, { stone: 6, ore: 3, wall: 1, balls: 5 }), 'craft(iron_pick) does not mutate its input');
ok(g.craft(haveI, IRON, 2) === null && g.craft({ stone: 99, ore: 99 }, IRON, 2) === null, "the IRON PICK can't be crafted a second time");
ok(g.craft({ stone: 5, ore: 3 }, IRON, 1) === null && g.craft({ stone: 6, ore: 2 }, IRON, 1) === null,
   'the IRON PICK refuses when short of either material');
ok(same(g.craft({ stone: 4 }, wallRecipe, 2), { stone: 2, wall: 1 }), 'ordinary recipes ignore the tier');

ok(same(Object.entries(g.loadEdits({ '70,34': 'c', '65,33': 'c' })).sort(), [['65,33', 'c'], ['70,34', 'c']]),
   'loadEdits keeps both authored seams mined to cave floor');
for (const [bk, bv, why] of [['70,34', '.', 'a seam mined to grass'], ['70,34', 'W', 'a wall on the seam'],
                             ['70,34', 'K', 'the seam as itself'], ['64,33', 'c', 'a cave wall opened'],
                             ['71,34', 'c', 'a cave wall beside the seam'], ['70,35', 'K', 'a seam painted onto floor'],
                             ['30,45', 'K', 'a seam in the pass'], ['69,31', 'c', 'geode grass rewritten']]) {
  ok(same(g.loadEdits({ [bk]: bv }), {}), 'loadEdits drops ' + why + ' (' + bk + '=' + bv + ')');
}

ok(same(g.ORE_DEPOSITS, ORE_TILES), 'ORE_DEPOSITS is every ORE boulder (' + g.ORE_DEPOSITS.length + ')');
const ALL_DUG = Object.fromEntries(g.ORE_DEPOSITS.map(([x, y]) => [key(x, y), '.']));
ok(same(g.quarryBackstop({ stone: 4, ore: 1, wall: 0 }, 1, ALL_DUG), { stone: 4, ore: 4, wall: 0 }),
   'the backstop gives 3 ORE to a tier-1 player with < 3 ORE once every deposit is gone');
ok(same(g.quarryBackstop({ ore: 0 }, true, Object.assign({}, ALL_DUG, { [key(...g.ORE_DEPOSITS[0])]: g.WALL })), { ore: 3 }),
   'a WALL on a dug deposit still counts as dug; an old true pick is tier 1');
const oneLeft = Object.fromEntries(g.ORE_DEPOSITS.slice(1).map(([x, y]) => [key(x, y), '.']));
for (const [args, why] of [[[{ ore: 0 }, 0, ALL_DUG], 'no PICK at all'], [[{ ore: 0 }, 2, ALL_DUG], 'already has the IRON PICK'],
                           [[{ ore: 3 }, 1, ALL_DUG], 'already has enough ORE'], [[{ ore: 0 }, 1, {}], 'ORE still in the ground'],
                           [[{ ore: 0 }, 1, oneLeft], 'one deposit left']]) {
  ok(g.quarryBackstop(...args) === null, 'no backstop when ' + why);
}
const frozenM = { ore: 1 };
g.quarryBackstop(frozenM, 1, ALL_DUG);
ok(same(frozenM, { ore: 1 }), 'quarryBackstop does not mutate its input');

// --- placement: every forbidden case ---
const NPC_T = new Set(g.NPCS.map(n => key(n.home ? n.home.x : n.x, n.home ? n.home.y : n.y)));
const NONE = new Set();
const P0 = [30, 44];
ok(g.placementOk(30, 43, {}, NONE, NPC_T, P0)[0], 'a wall goes on open scree next to you');
const forbidden = [
  [[30, 44], "the player's own tile"], [[42, 44], 'the trunk road'], [[43, 46], 'the trunk road (east)'],
  [[10, 42], 'tall grass'], [[24, 41], 'a boulder'], [[30, 60], 'outside ROCKY PASS'],
  [[2, 39], "the band's edge row"], [[1, 45], 'the world-edge column'],
  [[28, 41], 'right beside the pass sign'], [[50, 50], 'right beside the item ball'],
  [[34, 46], 'right beside the QUARRY HAND'], [[35, 46], 'the QUARRY HAND himself']];
for (const [[x, y], why] of forbidden) {
  ok(!g.placementOk(x, y, {}, NONE, NPC_T, P0)[0], 'no wall on ' + why + ' ' + x + ',' + y);
}

const ringEdits = {};
for (let x = 29; x <= 31; x++) for (let y = 43; y <= 45; y++) ringEdits[key(x, y)] = g.WALL;
delete ringEdits[key(30, 44)]; delete ringEdits[key(31, 44)];
const [gapOk, gapWhy] = g.placementOk(31, 44, ringEdits, NONE, NPC_T, [30, 44]);
ok(!gapOk && gapWhy.includes('wall off'), 'closing the last gap around the player is refused (' + gapWhy + ')');
ok(!g.placementOk(31, 44, ringEdits, NONE, NPC_T, [32, 44])[0], 'walling off an empty pocket is refused');

const IX = 50, IY = 51;
ok(g.tileAt(IX, IY) === 'o', 'the ROCKY PASS item ball is where the test expects');
const penEdits = {};
for (let x = IX - 2; x <= IX + 2; x++) penEdits[key(x, IY - 2)] = g.WALL;
for (let y = IY - 2; y <= IY; y++) { penEdits[key(IX - 2, y)] = g.WALL; penEdits[key(IX + 2, y)] = g.WALL; }
for (const k of Object.keys(penEdits)) if (g.tileAt(...k.split(',').map(Number)) !== '.') delete penEdits[k];
delete penEdits[key(IX + 2, IY - 1)];
const penReach = g.reachable([40, 45], penEdits, NONE, NPC_T);
ok(g.DIRS4.some(([dx, dy]) => penReach.has(key(IX + dx, IY + dy))), 'the pen still lets you reach the ball');
ok(!g.placementOk(IX + 2, IY - 1, penEdits, NONE, NPC_T, [IX + 3, IY - 1])[0],
   'sealing the item ball inside a pen is refused');

const west = {};
for (let y = 40; y <= 51; y++) if (g.tileAt(30, y) === '.' && y !== 45) west[key(30, y)] = g.WALL;
ok(!g.placementOk(30, 45, west, NONE, NPC_T, [31, 45])[0], 'closing the only door through a dividing wall is refused');
ok(g.placementOk(31, 44, west, NONE, NPC_T, [31, 45])[0], 'a wall beside that door, cutting nothing off, is allowed');

// --- Game: scripted playthrough: pick -> pass -> mine -> craft BALL -> place ---
G.mode = 'title';
delete store['monster-trail-save-v1'];
G.starterCursor = 0;
g.confirmKey();                                    // NEW GAME
G.dialogue = null; G.mode = 'overworld';
G.flags.starter = true;
G.party = [g.makeMon('tidecoil', 40)];
G.beaten = Object.fromEntries(ALL_TRAINERS.map(n => [n.id, true]));
ok(same(G.edits, {}) && same(G.materials, { stone: 0, ore: 0, wall: 0 }) && !G.flags.pick,
   'a new game starts with no edits, no materials and no PICK');

const quarry = g.npcById('quarry');
ok(quarry && quarry.y >= ROCK[0] && quarry.y <= ROCK[1], 'the QUARRY HAND stands in ROCKY PASS');
G.player.tx = g.START_TILE[0]; G.player.ty = g.START_TILE[1];
r = walkTo(quarry.x - 1, quarry.y);
ok(r.arrived, 'you can walk from CEDAR TOWN to the QUARRY HAND: ' + JSON.stringify(r));

G.player.tx = 34; G.player.ty = 46; G.player.dir = 'left';
g.interact();
ok(G.mode === 'dialogue' && G.dialogue.lines.join(' ').includes('PICK') && same(G.edits, {}),
   'a boulder without a PICK just says you need one');
G.dialogue = null; G.mode = 'overworld';
G.player.dir = 'right';
g.interact();
ok(G.flags.pick && G.mode === 'dialogue' && G.dialogue.lines.some(l => l.includes('PICK')),
   'the QUARRY HAND hands over a PICK');
G.dialogue = null; G.mode = 'overworld';
g.interact();
ok(G.mode === 'dialogue' && G.dialogue.lines.join(' ').includes('CRAFT'), 'talking again gives tips, not a second pick');
G.dialogue = null; G.mode = 'overworld';

function faceAndMine(bx, by) {
  for (const [dx, dy, d] of [[1, 0, 'left'], [-1, 0, 'right'], [0, 1, 'up'], [0, -1, 'down']]) {
    const sx = bx + dx, sy = by + dy;
    if (g.blockedFor(sx, sy) || g.tileHere(sx, sy) === 'v') continue;
    const res = walkTo(sx, sy);
    if (res.arrived) {
      G.player.dir = d;
      const before = Object.assign({}, G.materials);
      g.interact();
      const out = {};
      for (const k in G.materials) out[k] = G.materials[k] - before[k];
      return out;
    }
  }
  return null;
}

const got = faceAndMine(33, 46);
ok(same(got, { stone: 1, ore: 1, wall: 0 }), 'mining the ore boulder at 33,46 gives STONE + ORE: ' + JSON.stringify(got));
ok(g.tileHere(33, 46) === '.' && g.MAP[46][33] === '#', 'the boulder is ground in the overlay only');
ok(G.toast && G.toast.s.includes('STONE') && G.toast.s.includes('ORE'), 'mining toasts what you got');
ok(!g.blockedFor(33, 46), 'you can walk onto a mined boulder');
const again = JSON.stringify(G.materials);
g.interact();
ok(JSON.stringify(G.materials) === again, "the same tile can't be mined twice");

let mined = 1;
for (const [x, y] of ORE_TILES) {
  if (G.materials.ore >= 2) break;
  if (x === 33 && y === 46) continue;
  if (faceAndMine(x, y)) mined++;
}
ok(G.materials.ore >= 2, 'walking the pass turns up a second ORE (' + mined + ' mined)');

const balls0 = G.balls;
G.mode = 'menu'; G.menu = { cursor: 0 };
for (let i = 0; i < 3; i++) g.moveCursor(0, 1);
g.confirmKey();
ok(G.mode === 'craft', 'menu row 4 opens CRAFT');
G.craftCursor = g.RECIPES.findIndex(r2 => r2.out === 'balls');
const ore0 = G.materials.ore;
g.confirmKey();
ok(G.balls === balls0 + 1 && G.materials.ore === ore0 - 2,
   'crafting turns 2 ORE into 1 BALL in the pouch (' + balls0 + ' -> ' + G.balls + ')');
G.materials.ore = 0;
g.confirmKey();
ok(G.balls === balls0 + 1 && G.craftMsg.includes('Need'), 'crafting without ORE refuses: ' + G.craftMsg);

for (const [x, y] of BOULDERS) {
  if (G.materials.stone >= 2) break;
  if (g.tileHere(x, y) === '#') faceAndMine(x, y);
}
G.mode = 'craft';
G.craftCursor = g.RECIPES.findIndex(r2 => r2.out === 'wall');
const st0 = G.materials.stone;
g.confirmKey();
ok(G.materials.wall === 1 && G.materials.stone === st0 - 2, '2 STONE craft 1 WALL');
G.craftCursor = g.RECIPES.length;
g.confirmKey();
ok(G.mode === 'overworld' && G.building, 'BUILD WALLS drops you into build mode');

walkTo(30, 44);
G.player.dir = 'up';
g.interact();
ok(g.tileHere(30, 43) === g.WALL && G.materials.wall === 0, 'confirm while building places a WALL');
ok(g.blockedFor(30, 43), 'a built WALL is solid');
ok(g.MAP.join('\n') === MAP_BEFORE, 'MAP is untouched after mining and building');
G.player.dir = 'left';
g.interact();
ok(g.tileHere(29, 44) === '.' && G.toast.s.includes('No WALL'), 'with no WALLs left nothing is placed');
g.cancelKey();
ok(!G.building && G.mode === 'overworld', 'B leaves build mode instead of opening the menu');
g.cancelKey();
ok(G.mode === 'menu', 'and the next B opens the menu as usual');
G.mode = 'overworld'; G.menu = null;

G.player.dir = 'up';
const st1 = G.materials.stone;
g.interact();
ok(g.tileHere(30, 43) === '.' && !has(G.edits, '30,43') && G.materials.stone === st1 + 2,
   'mining your own WALL returns its 2 STONE and leaves no diff');

G.materials.wall = 1; G.building = true;
walkTo(41, 45);
G.player.dir = 'right';
g.interact();
ok(g.tileHere(42, 45) === '_' && G.materials.wall === 1 && G.toast.s.includes('bare ground'),
   'the Game refuses a WALL on the trunk road, and says why: ' + G.toast.s);
G.building = false;

const t6 = g.npcById('t6');
G.beaten = {};
G.edits = { [key(t6.x, t6.y + 1)]: g.WALL };       // injected; the rules forbid it on the road
G.player.tx = t6.x; G.player.ty = t6.y + 2; G.mode = 'overworld';
g.checkTrainerSight();
ok(G.mode === 'overworld', "a WALL in a trainer's line of sight blocks it");
G.edits = {};
g.checkTrainerSight();
ok(G.mode === 'dialogue', 'without the wall the trainer spots you');
G.dialogue = null; G.mode = 'overworld';
G.beaten = Object.fromEntries(ALL_TRAINERS.map(n => [n.id, true]));

// --- save / load round-trip, a tampered save, and an old-format save ---
G.edits = { '33,46': '.', '30,43': 'W', '24,41': 'W' };
G.materials = { stone: 3, ore: 1, wall: 2 };
G.flags.pick = true;
G.player.tx = 30; G.player.ty = 44;
ok(g.saveGame(), 'a sandbox save writes');
const raw = JSON.parse(store['monster-trail-save-v1']);
ok(same(raw.edits, { '24,41': 'W', '30,43': 'W', '33,46': '.' }), 'edits save as an x,y diff');
G.edits = {}; G.materials = { stone: 0, ore: 0, wall: 0 }; G.flags = { starter: false, gym: false };
ok(g.loadGame(), 'the sandbox save loads');
ok(same(Object.entries(G.edits).sort(), [['24,41', 'W'], ['30,43', 'W'], ['33,46', '.']]), 'edits round-tripped');
ok(same(G.materials, { stone: 3, ore: 1, wall: 2 }), 'materials round-tripped');
ok(G.flags.pick === 1, 'the PICK round-tripped as tier 1');
ok(g.tileHere(33, 46) === '.' && g.blockedFor(30, 43), 'the loaded overlay is live');

Object.assign(raw.edits, { '10,100': 'W', '42,45': 'W', 'nope': 'W', '30,44': '#', '31,44': '.' });
raw.materials = { stone: -4, ore: '2', wall: null, gold: 9 };
store['monster-trail-save-v1'] = JSON.stringify(raw);
ok(g.loadGame(), 'a tampered sandbox save still loads');
ok(same(Object.keys(G.edits).sort(), ['24,41', '30,43', '33,46']), 'impossible edits are dropped on load');
ok(same(G.materials, { stone: 0, ore: 2, wall: 0 }), 'materials are sanitised on load: ' + JSON.stringify(G.materials));

G.balls = 4; G.picked = new Set(['20,89']);
g.saveGame();
const old = JSON.parse(store['monster-trail-save-v1']);
delete old.edits; delete old.materials; delete old.flags.pick;
store['monster-trail-save-v1'] = JSON.stringify(old);
G.edits = { '1,1': 'W' }; G.materials = { stone: 9, ore: 9, wall: 9 }; G.flags.pick = true;
ok(g.loadGame(), 'an old save without sandbox fields loads');
ok(same(G.edits, {}) && same(G.materials, { stone: 0, ore: 0, wall: 0 }) && !G.flags.pick,
   'an old save means no edits, no materials, no PICK');
ok(G.balls === 4 && G.picked.has('20,89') && G.picked.size === 1, 'and the rest of the old save is intact');
console.log('  playthrough: PICK -> ' + mined + '+ boulders mined -> 1 BALL crafted -> WALL built and mined back');

// An old save from before tiers stored the PICK as true: it loads as tier 1.
old.flags.pick = true;
store['monster-trail-save-v1'] = JSON.stringify(old);
ok(g.loadGame() && G.flags.pick === 1 && G.flags.backstop === false, 'an old save with pick=true loads as tier 1, no backstop paid');
for (const junk of ['yes', 7, -2, null]) {
  old.flags.pick = junk;
  store['monster-trail-save-v1'] = JSON.stringify(old);
  ok(g.loadGame() && G.flags.pick === g.pickTier(junk), 'a junk pick flag ' + JSON.stringify(junk) + ' loads as tier ' + g.pickTier(junk));
}

// --- Game: IRON PICK -> the seam -> the GEODE: grass, the ball, save/load ---
{
  G.flags = { starter: true, gym: false, pick: 1 };
  G.party = [g.makeMon('tidecoil', 40)];
  G.beaten = Object.fromEntries(ALL_TRAINERS.map(n => [n.id, true]));
  G.edits = {}; G.picked = new Set(); G.building = false; G.mode = 'overworld'; G.dialogue = null;
  G.materials = { stone: 6, ore: 3, wall: 0 };
  G.player.tx = g.START_TILE[0]; G.player.ty = g.START_TILE[1];
  r = walkTo(70, 35);
  ok(r.arrived, 'you can walk from CEDAR TOWN to the seam face at 70,35: ' + JSON.stringify(r));
  G.player.dir = 'up';
  ok(same(g.facingTile(G.player), [70, 34]) && g.tileHere(70, 34) === g.SEAM, 'standing on 70,35 faces the seam');
  g.interact();
  ok(G.mode === 'dialogue' && G.dialogue.lines.join(' ').includes('IRON PICK') && same(G.edits, {}),
     'a plain PICK skids off the seam and says what it needs');
  G.dialogue = null; G.mode = 'overworld';

  G.mode = 'menu'; G.menu = { cursor: 0 };
  for (let i = 0; i < 3; i++) g.moveCursor(0, 1);
  g.confirmKey();
  G.craftCursor = g.RECIPES.indexOf(IRON);
  g.confirmKey();
  ok(G.flags.pick === 2 && same(G.materials, { stone: 0, ore: 0, wall: 0 }) && G.craftMsg.startsWith('Crafted'),
     'CRAFT turns 3 ORE + 6 STONE into the IRON PICK: ' + G.craftMsg);
  G.materials = { stone: 6, ore: 3, wall: 0 };
  g.confirmKey();
  ok(G.flags.pick === 2 && same(G.materials, { stone: 6, ore: 3, wall: 0 }) && G.craftMsg.includes('already'),
     'a second IRON PICK is refused and costs nothing: ' + G.craftMsg);
  G.materials = { stone: 0, ore: 0, wall: 0 };
  g.cancelKey();
  ok(G.mode === 'overworld', 'B leaves CRAFT');

  G.player.dir = 'up';
  g.interact();
  ok(g.tileHere(70, 34) === 'c' && g.MAP[34][70] === g.SEAM && same(G.edits, { '70,34': 'c' }),
     'the IRON PICK opens the seam, in the overlay only');
  ok(same(G.materials, { stone: 0, ore: 2, wall: 0 }) && G.toast.s.includes('ORE'), 'the seam drops 2 ORE and toasts it: ' + G.toast.s);
  ok(!g.blockedFor(70, 34), 'the opened seam is walkable');
  r = walkTo(70, 31);
  ok(r.arrived, 'you can walk into the GEODE: ' + JSON.stringify(r));

  // Seeded Math.random so the encounter roll is reproducible.
  const realRandom = Math.random;
  let seed = 2024;
  Math.random = () => { seed = (Math.imul(seed, 1103515245) + 12345) >>> 0; return (seed >>> 8) / 16777216; };
  let foe = null, tries = 0;
  while (!foe && tries < 400) {
    G.player.tx = 66 + tries % 9; G.player.ty = 31 + Math.floor(tries / 9) % 2;
    g.tryEncounter();
    foe = G.pendingEncounter;
    tries++;
  }
  ok(foe, 'walking the GEODE dark grass fires an encounter (' + tries + ' steps)');
  if (foe) {
    ok(GEODE_ZONE.pool.some(([id]) => id === foe.id) && foe.level >= 24 && foe.level <= 28,
       'the GEODE foe comes from its pool at L24-28: ' + foe.id + ' L' + foe.level);
  }
  G.pendingEncounter = null; G.fadeDir = 0; G.fade = 0; G.fadeCb = null; G.mode = 'overworld';
  const dead = [];
  for (const z of g.ZONES) {
    let spot = null;
    for (let y = z.y1; y <= z.y2 && !spot; y++) for (let x = z.x1; x <= z.x2 && !spot; x++) {
      if (GRASS.includes(g.tileAt(x, y))) spot = [x, y];
    }
    let fired = false;
    for (let i = 0; i < 200; i++) {
      G.player.tx = spot[0]; G.player.ty = spot[1];
      g.tryEncounter();
      if (G.pendingEncounter) {
        fired = z.pool.some(([id]) => id === G.pendingEncounter.id);
        G.pendingEncounter = null; G.fadeDir = 0; G.fade = 0; G.fadeCb = null;
        break;
      }
    }
    if (!fired) dead.push(spot);
  }
  ok(dead.length === 0, 'every zone, tall grass or dark grass, can fire an encounter (dead: ' + JSON.stringify(dead) + ')');
  Math.random = realRandom;

  G.player.tx = 70; G.player.ty = 31;
  const balls0g = G.balls;
  r = walkTo(75, 31);
  G.player.dir = 'up';
  g.interact();
  ok(r.arrived && G.balls === balls0g + 8 && G.picked.has('75,30'), 'the GEODE ball is worth 8 BALLS (' + balls0g + ' -> ' + G.balls + ')');
  G.dialogue = null; G.mode = 'overworld';
  r = walkTo(66, 33);
  G.player.dir = 'left';
  g.interact();
  ok(r.arrived && g.tileHere(65, 33) === 'c' && G.materials.ore === 4, 'the inner seam at 65,33 is mined from inside for 2 more ORE');
  ok(!g.blockedFor(65, 33) && g.blockedFor(64, 33), 'it opens one tile; the C wall behind it holds');

  ok(g.saveGame(), 'a GEODE save writes');
  const rawG = JSON.parse(store['monster-trail-save-v1']);
  ok(same(rawG.edits, { '65,33': 'c', '70,34': 'c' }) && rawG.flags.pick === 2,
     'the opened seams and the tier save: ' + JSON.stringify(rawG.edits) + ' ' + rawG.flags.pick);
  G.edits = {}; G.picked = new Set(); G.flags = { starter: false, gym: false }; G.balls = 0;
  ok(g.loadGame(), 'the GEODE save loads');
  ok(g.tileHere(70, 34) === 'c' && !g.blockedFor(70, 34) && G.flags.pick === 2,
     'after loading the GEODE is still open and the IRON PICK still held');
  ok(G.picked.has('75,30') && !g.blockedFor(75, 30), 'after loading the GEODE ball is still gone');
  G.player.tx = 70; G.player.ty = 35;
  ok(walkTo(70, 31).arrived, 'and you can walk back into the GEODE');
  G.player.tx = 75; G.player.ty = 31; G.player.dir = 'up';
  const balls1g = G.balls;
  g.interact();
  ok(G.balls === balls1g && G.dialogue.lines.join(' ').includes('Nothing'), 'the taken ball gives nothing twice');
  G.dialogue = null; G.mode = 'overworld';

  // --- the QUARRY HAND's backstop: once, and only when ORE has truly run out ---
  G.player.tx = quarry.x - 1; G.player.ty = quarry.y; G.player.dir = 'right';
  G.flags.pick = 1; G.flags.backstop = false;
  G.materials = { stone: 6, ore: 0, wall: 0 }; G.edits = {};
  g.interact();
  ok(G.materials.ore === 0 && G.dialogue.lines.join(' ').includes('IRON PICK'), 'with ORE in the ground he only hints at the seam');
  G.dialogue = null; G.mode = 'overworld';
  G.edits = Object.assign({}, ALL_DUG);
  G.materials.ore = 1;
  g.interact();
  ok(G.materials.ore === 1 + g.BACKSTOP_ORE && G.flags.backstop === true && G.dialogue.lines.join(' ').includes('3 ORE'),
     'out of ORE for good, he hands over 3 ORE');
  G.dialogue = null; G.mode = 'overworld';
  G.materials.ore = 0;
  g.interact();
  ok(G.materials.ore === 0 && G.dialogue.lines.join(' ').includes('IRON PICK'), 'the backstop pays exactly once');
  G.dialogue = null; G.mode = 'overworld';
  g.saveGame();
  G.flags.backstop = false;
  g.loadGame();
  ok(G.flags.backstop === true, 'the paid backstop survives a save/load');
  G.player.tx = quarry.x - 1; G.player.ty = quarry.y; G.player.dir = 'right';
  G.flags.pick = 2; G.flags.backstop = false;
  g.interact();
  ok(G.materials.ore === 0, 'an IRON PICK holder never gets the backstop');
  G.dialogue = null; G.mode = 'overworld';
  G.edits = {}; G.picked = new Set();
  console.log('  GEODE: IRON PICK crafted -> seam mined -> grass fight in ' + tries + ' steps -> 8-BALL item -> save/load');
}
// --- Part B: the AXE and loot recipes ---
// MAP is a mutable array read uncached by tileAt, so a temporary row swap
// plants a fake authored THICK TREE at (20, 85) - DEEPWOOD ground, outside
// ROCKY PASS. Every swap is restored in finally.
{
  ok(g.AXE_MAX === 1, 'the AXE has one tier');
  for (const [v, want] of [[undefined, 0], [null, 0], [0, 0], [1, 1], [true, 1], [false, 0], [2, 1], [-3, 0],
                           ['1', 0], [1.5, 0], [[], 0]]) {
    ok(g.axeTier(v) === want, 'axeTier(' + JSON.stringify(v) + ') is ' + want);
  }
  ok(g.MATERIAL_LABEL.axe === 'AXE', 'the AXE has a label');

  const [bx, by] = ORE_TILES[0];
  const [sx2, sy2] = SEAMS[0];
  for (let tier = 0; tier < 3; tier++) {
    for (let axe = 0; axe < 2; axe++) {
      ok(g.canMine('#', bx, by, tier, axe) === (tier >= 1), 'boulder: pick ' + tier + ' axe ' + axe);
      ok(g.canMine(g.SEAM, sx2, sy2, tier, axe) === (tier >= 2), 'seam: pick ' + tier + ' axe ' + axe);
    }
  }
  const row85 = g.MAP[85];
  g.MAP[85] = row85.slice(0, 20) + 'T' + row85.slice(21);     // (20, 85): a fake authored tree
  try {
    for (let tier = 0; tier < 3; tier++) ok(!g.canMine('T', 20, 85, tier, 0), 'no PICK tier cuts a thick tree (' + tier + ')');
    ok(g.canMine('T', 20, 85, 0, 1), 'the AXE cuts an authored thick tree');
    ok(!g.canMine('T', 21, 85, 2, 1), 'the AXE cannot cut a T that MAP does not hold there');
    ok(!g.canMine('#', bx, by, 0, 1), 'the AXE cannot break a boulder');
    ok(same(g.loadEdits({ '20,85': '.' }), { '20,85': '.' }), 'loadEdits keeps an authored tree cut to ground');
    ok(same(g.loadEdits({ '20,85': 'W' }), {}) && same(g.loadEdits({ '21,85': '.' }), {}),
       'loadEdits drops a tree turned to anything else, and a cut where MAP holds no tree');
  } finally {
    g.MAP[85] = row85;
  }
  ok(g.canMine('#', bx, by, 1) && !g.canMine('T', 20, 85, 2), 'old 4-argument calls still work');

  const AXE_R = g.RECIPES.find(r => r.setsTool);
  ok(AXE_R.id === 'axe' && same(AXE_R.needs, { twig: 2, flint: 1 }) && same(AXE_R.setsTool, ['axe', 1]),
     'the AXE is 2 TWIG + 1 FLINT and sets the axe to 1');
  ok(same(g.RECIPES.map(r => r.id), ['wall', 'ball', 'iron_pick', 'oil', 'pulse', 'axe', 'potion', 'greatball', 'smoke']),
     "recipe order: the first five unchanged, then Part B's four");
  const haveA = { twig: 2, flint: 1, stone: 0 };
  ok(same(g.craft(haveA, AXE_R, 0, 0), { twig: 0, flint: 0, stone: 0 }), 'the AXE spends exactly its needs and stores nothing');
  ok(g.craft(haveA, AXE_R, 0, 1) === null, 'the AXE is refused once owned');
  ok(g.craft({ twig: 1, flint: 1 }, AXE_R, 0, 0) === null, 'the AXE is refused when short');
  for (const [rid, needs] of [['potion', { leaf: 2, dewdrop: 1 }], ['greatball', { flint: 2, copperwire: 1 }],
                              ['smoke', { emberdust: 1, shadowsilk: 1 }]]) {
    const r = g.RECIPES.find(x => x.id === rid);
    ok(same(r.needs, needs) && r.out === rid && r.count === 1, 'recipe ' + rid + ' is ' + JSON.stringify(needs));
    const h = Object.assign({}, needs, { potion: 3 });
    const after = g.craft(h, r);
    ok(after !== null && Object.keys(needs).every(k => after[k] === 0) && (after[rid] || 0) === (h[rid] || 0) + 1,
       'crafting ' + rid + ' conserves items exactly');
    ok(Object.keys(needs).reduce((a, k) => a + g.GOODS[k].price * needs[k], 0) < g.GOODS[rid].price,
       'economy: ' + rid + " loot sells for less than the shop charges");
  }
  ok(![...g.MATERIALS, 'balls', 'lantern', 'pulse'].some(k => has(g.GOODS, k)),
     'material and counter ids never collide with BAG ids');

  // integration through the Game: BAG routing, messages, rows, interact, saves
  const keep = { flags: G.flags, bag: G.bag, materials: G.materials, balls: G.balls, lantern: G.lantern,
                 pulses: G.pulses, edits: G.edits, toast: G.toast, craftMsg: G.craftMsg, building: G.building };
  const keepPos = { tx: G.player.tx, ty: G.player.ty, dir: G.player.dir };
  const saveKey0 = Object.keys(store).find(k => k.startsWith('monster-trail-save'));
  const saveBefore = saveKey0 === undefined ? undefined : store[saveKey0];
  const ids = g.RECIPES.map(r => r.id);
  const axeI = ids.indexOf('axe'), potI = ids.indexOf('potion'), ballI = ids.indexOf('ball');
  const newFlags = () => ({ starter: true, gym: false, huntBeaten: 0, gymBonus: false, axe: 0 });
  try {
    G.flags = newFlags();
    G.materials = { stone: 0, ore: 0, wall: 0 };
    G.bag = { twig: 2, flint: 3, leaf: 2, dewdrop: 1 };
    ok(g.craftRecipe(axeI) && G.flags.axe === 1 && same(G.bag, { flint: 2, leaf: 2, dewdrop: 1 }),
       'crafting the AXE spends TWIG/FLINT from the BAG and sets flags.axe: ' + JSON.stringify(G.bag));
    ok(G.craftMsg === 'Crafted the AXE. Thin trees give way now.', 'AXE message: ' + G.craftMsg);
    const before = JSON.stringify(G.bag);
    ok(!g.craftRecipe(axeI) && G.craftMsg === 'You already have the AXE.' && JSON.stringify(G.bag) === before,
       'a second AXE is refused and spends nothing');
    ok(g.craftRecipe(potI) && same(G.bag, { flint: 2, potion: 1 }) && G.craftMsg === 'Crafted 1 POTION.',
       'a POTION crafts into the BAG: ' + JSON.stringify(G.bag) + ' ' + G.craftMsg);
    G.bag = { leaf: 2, dewdrop: 1, potion: g.BAG_MAX };
    g.noteFound();
    ok(g.craftCells()[potI].state === 'locked', 'a full POTION stack shows the cell as locked');
    ok(!g.craftRecipe(potI) && G.craftMsg === 'Your BAG is full of POTION.'
       && same(G.bag, { leaf: 2, dewdrop: 1, potion: g.BAG_MAX }), 'a full BAG refuses and spends nothing');
    G.bag = {};
    ok(!g.craftRecipe(potI) && G.craftMsg === 'Need 2 LEAF, 1 DEW DROP.', 'short: ' + G.craftMsg);
    let cells = g.craftCells();
    ok(cells.length === g.RECIPES.length + 1 && cells[cells.length - 1].kind === 'build',
       'one CRAFT cell per recipe plus BUILD (no BACK row)');
    ok(cells[axeI].state === 'owned' && cells[axeI].name === 'AXE', 'owned AXE cell: ' + JSON.stringify(cells[axeI]));
    G.flags.axe = 0; G.bag = { twig: 2, flint: 1 }; g.noteFound();
    cells = g.craftCells();
    ok(cells[axeI].state === 'ready' && same(cells[axeI].needs, [['twig', 2, 2], ['flint', 1, 1]]),
       'craftable AXE cell: ' + JSON.stringify(cells[axeI]));
    ok(cells[potI].state === 'locked' && cells[potI].name === 'POTION'
       && same(cells[potI].needs.map(n => g.craftLabel(n[0])), ['LEAF', 'DEW DROP']), 'loot cell uses GOODS names');
    G.bag = { leaf: 5 }; G.materials = { stone: 0, ore: 4, wall: 0 }; G.balls = 2;
    ok(g.craftRecipe(ballI) && G.balls === 3 && same(G.materials, { stone: 0, ore: 2, wall: 0 }) && same(G.bag, { leaf: 5 }),
       'a BALL still spends materials into the pouch and leaves the BAG alone');

    G.flags = newFlags();
    G.materials = { stone: 0, ore: 0, wall: 0 }; G.edits = {}; G.building = false;
    const row = g.MAP[85]; g.MAP[85] = row.slice(0, 20) + 'T' + row.slice(21);
    try {
      G.player.tx = 20; G.player.ty = 84; G.player.dir = 'down';
      g.interact();
      ok(G.mode === 'dialogue' && same(G.dialogue.lines, ['This tree is thinner than the rest. An AXE could cut it.'])
         && same(G.edits, {}), 'no AXE: the tree says what it needs, and nothing is cut');
      G.dialogue = null; G.mode = 'overworld';
      G.flags.pick = 2;
      g.interact(); G.dialogue = null; G.mode = 'overworld';
      ok(same(G.edits, {}), 'an IRON PICK does not cut a tree');
      G.flags.axe = 1;
      g.interact();
      ok(same(G.edits, { '20,85': '.' }) && G.toast.s === 'You cut down the THICK TREE.' && G.materials.stone === 0,
         'with the AXE the tree is cut, drops nothing, and says so');
      ok(!g.blockedFor(20, 85, 'down'), 'the cut tree is walkable ground');
    } finally {
      g.MAP[85] = row;
    }
    G.edits = {};
    for (const [junk, want] of [[null, 0], ['yes', 0], [5, 1], [true, 1], [-1, 0]]) {
      G.flags = newFlags(); G.flags.axe = junk;
      g.saveGame();
      ok(g.loadGame() && G.flags.axe === want, 'a saved axe of ' + JSON.stringify(junk) + ' loads as ' + want);
    }
    G.flags = newFlags();
    g.saveGame();
    const savedKey = Object.keys(store).find(k => k.startsWith('monster-trail-save'));
    const saved = JSON.parse(store[savedKey]);
    delete saved.flags.axe;
    store[savedKey] = JSON.stringify(saved);
    ok(g.loadGame() && G.flags.axe === 0, 'a save from before Part B (no axe key) loads with axe 0');
  } finally {
    Object.assign(G, keep);
    Object.assign(G.player, keepPos);
    for (const k of Object.keys(store)) if (k.startsWith('monster-trail-save')) delete store[k];
    if (saveKey0 !== undefined) store[saveKey0] = saveBefore;
    G.dialogue = null; G.mode = 'overworld';
  }
  console.log('  Part B: AXE crafted from BAG loot -> thick tree cut -> loot recipes conserve -> axe saved');
}
// --- visual CRAFT, chunk 3: icons, found, craftCells, gridMove, the hook (mirrors the .py SANDBOX tests) ---
{
  const ICON_WANT = [...Object.keys(g.GOODS), 'stone', 'ore', 'wall', 'balls', 'pick', 'iron_pick', 'axe',
                     'lantern', 'pulse', 'coins'].sort();
  ok(same(Object.keys(g.ICONS).sort(), ICON_WANT), 'ICONS has exactly one icon per drawable id (' + ICON_WANT.length + ')');
  ok(!has(g.ICON_PALETTE, '.'), "'.' is transparent and never a palette key");
  ok(Object.entries(g.ICON_PALETTE).every(([k, v]) => k.length === 1 && v.length === 3 &&
       v.every(c => Number.isInteger(c) && c >= 0 && c <= 255)), 'palette keys are single chars, values RGB triples');
  ok(g.ICON_SHADOW.length === 3 && Math.max(...g.ICON_SHADOW) - Math.min(...g.ICON_SHADOW) < 24,
     'ICON_SHADOW is one dark, unsaturated RGB triple');
  for (const [k, rows] of Object.entries(g.ICONS)) {
    ok(rows.length === 16 && rows.every(r => r.length === 16), 'icon ' + k + ' is 16x16');
    ok(rows.every(r => [...r].every(c => c === '.' || has(g.ICON_PALETTE, c))), 'icon ' + k + ' uses only palette chars');
    ok(rows.join('').split('').filter(c => c !== '.').length >= 24, 'icon ' + k + ' is not (nearly) empty');
  }
  ok(new Set(Object.values(g.ICONS).map(v => v.join('|'))).size === Object.keys(g.ICONS).length, 'no two icons are identical');
  const allGoods = Object.fromEntries(Object.keys(g.GOODS).map(k => [k, 1]));
  const bagIds = [];
  for (const b of [0, 5]) for (const row of g.bagRows(b, allGoods, { stone: 1, ore: 1, wall: 1 })) {
    if (['item', 'mat', 'loot'].includes(row[0])) bagIds.push(row[1]);
  }
  const iconIds = g.RECIPES.map(r => r.out).concat(g.RECIPES.flatMap(r => Object.keys(r.needs)),
                    Object.keys(g.GOODS), bagIds, g.SHOP_STOCK, ['coins']);
  ok(iconIds.every(i => has(g.ICONS, g.iconId(i))), 'iconId resolves every recipe, BAG, shop and coins id');
  ok(g.iconId('ball') === 'balls' && g.iconId('twig') === 'twig', 'iconId maps only ball -> balls');

  const keepC = { flags: G.flags, bag: G.bag, materials: G.materials, balls: G.balls, lantern: G.lantern,
                  pulses: G.pulses, edits: G.edits, craftMsg: G.craftMsg, found: G.found, mode: G.mode,
                  starterCursor: G.starterCursor, newGameConfirm: G.newGameConfirm, building: G.building,
                  party: G.party, coins: G.coins, battles: G.battles, beaten: G.beaten, steps: G.steps,
                  picked: G.picked, lastCentre: G.lastCentre, dialogue: G.dialogue, chapter: G.chapter,
                  toast: G.toast };
  const snapC = Object.assign({}, G);
  const keepPosC = { tx: G.player.tx, ty: G.player.ty, px: G.player.px, py: G.player.py, dir: G.player.dir, moving: G.player.moving };
  const saveKeyC = Object.keys(store).find(k => k.startsWith('monster-trail-save'));
  const saveBeforeC = saveKeyC === undefined ? undefined : store[saveKeyC];
  const newGame = () => {
    for (const k of Object.keys(store)) if (k.startsWith('monster-trail-save')) delete store[k];
    G.mode = 'title'; G.newGameConfirm = false; G.starterCursor = 0;
    g.confirmKey();
    G.dialogue = null; G.mode = 'overworld';
  };
  const cellsOf = () => g.craftCells();
  const cell = rid => cellsOf().find(c => c.kind === 'recipe' && g.RECIPES[c.recipe].id === rid);
  try {
    // -- discovery: G.found --
    newGame();
    ok(same([...G.found].sort(), ['balls', 'lantern']), 'a new game has found only what it starts with (BALLs, lamp)');
    G.bag.twig = 1; g.noteFound();
    ok(G.found.has('twig'), 'holding a TWIG once records it');
    delete G.bag.twig; g.noteFound();
    ok(G.found.has('twig'), 'spending it never un-finds it');
    G.flags.pick = 2; G.flags.axe = 1; G.pulses = 1; G.materials.ore = 1; g.noteFound();
    ok(['pick', 'iron_pick', 'axe', 'pulse', 'ore'].every(k => G.found.has(k)), 'tool tiers, PULSE counter and materials are found');
    ok(!G.found.has('stone'), 'a zero count is not found');
    ok(same([...g.cleanFound(['twig', 'axe', 'twig'])].sort(), ['axe', 'twig']), 'cleanFound keeps known ids');
    ok(same([...g.cleanFound(['twig', 3, null, 'nosuch', ['axe']])], ['twig']), 'cleanFound drops junk entries');
    ok([null, 'twig', { twig: 1 }, 7].every(v => g.cleanFound(v) instanceof Set && g.cleanFound(v).size === 0), 'a non-list loads as empty');
    // -- save / load / new game --
    ok(g.saveGame(), 'the found save writes');
    G.found = new Set();
    ok(g.loadGame() && ['twig', 'pick', 'iron_pick', 'axe'].every(k => G.found.has(k)), 'found survives a save and load');
    const sk = Object.keys(store).find(k => k.startsWith('monster-trail-save'));
    let raw = JSON.parse(store[sk]);
    ok(same(raw.found, raw.found.slice().sort()), 'found is saved as a sorted list');
    delete raw.found; raw.bag = { flint: 2 };
    store[sk] = JSON.stringify(raw);
    G.found = new Set(); G.bag = {};
    ok(g.loadGame() && G.found.has('flint') && !G.found.has('twig'), 'an old save without found is seeded from holdings');
    raw.found = ['twig', 9, 'zzz'];
    store[sk] = JSON.stringify(raw);
    G.found = new Set(); G.bag = {};
    ok(g.loadGame() && G.found.has('twig') && !G.found.has('zzz'), 'junk in a saved found list is dropped');
    // the title confirm with a save present, confirmed: the reset path
    G.mode = 'title'; G.newGameConfirm = true; G.starterCursor = 1;
    g.confirmKey();
    G.dialogue = null; G.mode = 'overworld';
    ok(same([...G.found].sort(), ['balls', 'lantern']), 'new game after a load keeps no old discoveries');

    // -- craftCells: the state matrix --
    newGame();
    const cells = cellsOf();
    ok(cells.length === g.RECIPES.length + 1 && cells[cells.length - 1].kind === 'build', 'one cell per recipe, then BUILD');
    ok(same(cells.filter(c => c.kind === 'recipe' && ['axe', 'potion', 'greatball', 'smoke'].includes(g.RECIPES[c.recipe].id))
              .map(c => c.state), ['hidden', 'hidden', 'hidden', 'hidden']), 'a fresh game hides the four loot recipes');
    ok(['wall', 'ball', 'iron_pick', 'oil', 'pulse'].every(r => cell(r).state !== 'hidden'), 'sandbox recipes are never hidden');
    ok(cell('wall').state === 'locked' && cell('oil').state === 'locked', 'fresh WALL and OIL are locked');
    const h = cell('axe');
    ok(h.name === '???' && h.blurb === g.CRAFT_MSG.hidden, 'a hidden cell names nothing');
    ok(same(h.needs, [['twig', 0, 2], ['flint', 0, 1]]), 'a hidden cell keeps the real needs (the screen hides them)');
    G.bag.twig = 1; g.noteFound();
    ok(cell('axe').state === 'locked', 'after holding a TWIG once the AXE is locked, not hidden');
    G.bag.twig = 2; G.bag.flint = 1;
    ok(cell('axe').state === 'ready', '2 TWIG + 1 FLINT: the AXE is ready');
    ok(cell('axe').name === 'AXE' && cell('axe').blurb === 'Cuts thin trees.', "a revealed cell's name and blurb");
    const calls = [];
    g.setCraftHook((i, before) => calls.push([i, Object.assign({}, before)]));
    const axeI2 = g.RECIPES.findIndex(r => r.id === 'axe');
    ok(g.craftRecipe(axeI2) === true, 'a successful craft returns true');
    ok(calls.length === 1 && calls[0][0] === axeI2 && same(calls[0][1], { twig: 2, flint: 1 }),
       'the craft hook fires once with the counts from before spending: ' + JSON.stringify(calls));
    ok(cell('axe').state === 'owned', 'after crafting, the AXE is owned');
    ok(g.craftRecipe(axeI2) === false && calls.length === 1, 'a refused craft returns false and fires no hook');
    const potI2 = g.RECIPES.findIndex(r => r.id === 'potion');
    ok(g.craftRecipe(potI2) === false && calls.length === 1, 'a short craft fires no hook');
    g.setCraftHook(() => {});
    ok(cells[cells.length - 1].state === 'locked' && same(cells[cells.length - 1].needs, [['wall', 0, 1]]), 'BUILD is locked with no WALLs');
    ok(cells[cells.length - 1].recipe === null, 'BUILD has recipe: null, never undefined');
    G.materials.wall = 2;
    ok(cellsOf()[cells.length - 1].state === 'ready', 'BUILD is ready once a WALL is held');
    G.lantern = 40;
    ok(cell('oil').blurb === 'Fills the lamp (now 40%).', 'the OIL blurb shows the lamp: ' + cell('oil').blurb);
    ok(cell('pulse').blurb === 'Stuns the stalker. Have ' + G.pulses + '/3.', 'the PULSE blurb shows have/cap');
    ok(same(Object.keys(g.CRAFT_BLURB).sort(), g.RECIPES.map(r => r.id).concat('build').sort()), 'one blurb per recipe plus BUILD');
    ok(Object.values(g.CRAFT_BLURB).every(b => g.fmtMsg(b, ...(b.includes('%d%%') ? [100] : b.includes('%d') ? [3, 3] : []))
         .replace('%%', '%').length <= 48), 'every blurb fits 48 chars');

    // -- gridMove: exhaustive, n = 1..15 --
    let gmOk = true;
    for (let n = 1; n <= 15; n++) for (let i = 0; i < n; i++) for (const d of ['up', 'down', 'left', 'right']) {
      const j = g.gridMove(i, d, n, g.CRAFT_COLS);
      if (!(j >= 0 && j < n)) gmOk = false;
      if ((d === 'left' || d === 'right') && Math.floor(j / g.CRAFT_COLS) !== Math.floor(i / g.CRAFT_COLS)) gmOk = false;
      if (d === 'down' && Math.floor(i / g.CRAFT_COLS) < Math.floor((n - 1) / g.CRAFT_COLS) &&
          Math.floor(j / g.CRAFT_COLS) !== Math.floor(i / g.CRAFT_COLS) + 1) gmOk = false;
    }
    ok(gmOk, 'gridMove never leaves the grid, keeps left/right in-row, and down always reaches the next row');
    ok(g.gridMove(0, 'left', 10, 5) === 0 && g.gridMove(4, 'right', 10, 5) === 4, 'no wrapping at row ends');
    ok(g.gridMove(7, 'down', 9, 5) === 7 && g.gridMove(3, 'down', 7, 5) === 6, 'down clamps to the last cell');
    ok(g.CRAFT_COLS === 5, 'CRAFT_COLS');

    // the real hooks, not noteFound by hand: update() and saveGame() record holdings
    newGame();
    G.bag.twig = 1;
    g.update(0.016);
    delete G.bag.twig;
    ok(G.found.has('twig'), 'update records what is held, even if it is spent before the next frame');
    // ... even while the campaign has the RPG paused (updateBody returns early; noteFound still runs)
    G.found.delete('twig'); G.bag.twig = 1;
    try {
      g.setCampaignBusy(true);
      g.update(0.016);
      ok(G.found.has('twig'), 'update records holdings while campaignBusy pauses the RPG');
    } finally { g.setCampaignBusy(false); }
    delete G.bag.twig;
    G.bag.flint = 1;
    g.saveGame(); G.found = new Set(); g.loadGame();
    ok(G.found.has('flint'), 'saveGame records holdings before writing found');
  } finally {
    g.setCraftHook((i, before) => g.CRFX.start(i, before));   // the shipped default
    g.CRFX.clear();
    Object.assign(G, keepC);
    for (const k of Object.keys(G)) if (!(k in snapC)) delete G[k];
    Object.assign(G, snapC);
    Object.assign(G.player, keepPosC);
    for (const k of Object.keys(store)) if (k.startsWith('monster-trail-save')) delete store[k];
    if (saveKeyC !== undefined) store[saveKeyC] = saveBeforeC;
    G.dialogue = null; G.mode = 'overworld';
  }
  console.log('  visual CRAFT: icons, found, craftCells, gridMove and the craft hook');
}
ok(g.MAP.join('\n') === MAP_BEFORE, 'MAP is byte-identical after the whole SANDBOX section');

// --- input: a tap pressed and released between two frames still turns + steps ---
{
  G.flags.starter = true;
  G.edits = {}; G.mode = 'overworld'; G.fadeDir = 0; G.fade = 0; G.battle = null;
  G.beaten = Object.fromEntries(g.NPCS.filter(n => n.kind === 'trainer').map(n => [n.id, true]));
  const p = G.player;
  const put = (x, y, d) => { p.tx = x; p.ty = y; p.px = x * 32; p.py = y * 32; p.moving = false; p.dir = d; };
  put(30, 44, 'up');
  g.press('arrowleft'); g.release('arrowleft');
  ok(g.TAPS.left === true, 'press() latches a direction tap in the overworld');
  g.update(1 / 60);
  ok(p.dir === 'left' && p.moving && p.tx === 29, 'a one-frame tap turns the player and starts a step: ' +
     p.dir + ' ' + p.tx);
  ok(!g.TAPS.left, 'the latch is consumed after one frame');
  for (let i = 0; i < 60 && p.moving; i++) g.update(1 / 60);
  ok(!p.moving && p.tx === 29, 'the tapped step completes and stops (no phantom repeat)');
  // A tap against a wall still turns you: face (33,46)'s boulder from (34,46).
  put(34, 46, 'up');
  g.press('a'); g.release('a');
  g.update(1 / 60);
  ok(p.dir === 'left' && !p.moving && p.tx === 34, 'a tap toward a boulder turns without moving');
  // Held keys behave exactly as before: held for several frames = continuous steps.
  put(30, 44, 'up');
  g.press('arrowright');
  for (let i = 0; i < 40; i++) g.update(1 / 60);
  g.release('arrowright');
  ok(p.tx >= 32 && p.ty === 44, 'a held key keeps walking (tx ' + p.tx + ')');
  for (let i = 0; i < 60 && p.moving; i++) g.update(1 / 60);
  // Menus never latch: a cursor press in the menu does not walk you after closing it.
  put(30, 44, 'up');
  G.mode = 'menu'; G.menu = { cursor: 0 };
  g.press('arrowdown'); g.release('arrowdown');
  ok(G.menu.cursor === 1 && !g.TAPS.down, 'a menu cursor press moves the cursor and latches nothing');
  G.mode = 'overworld'; G.menu = null;
  g.update(1 / 60);
  ok(p.tx === 30 && p.ty === 44 && !p.moving && p.dir === 'up', 'closing the menu does not replay the press as a step');
  console.log('  input: one-frame taps turn and step; holds, walls and menus unchanged');
}

/* ------------------------------------------------------- CONDITIONS */
// Battle weather: tables (emitted from the .py), the seed, the roll, the damage
// nudge, the scene descriptor and the startBattle wiring. Mirrors the Python
// CONDITIONS section one for one. Shared G state is snapshotted and restored, and
// Math.random plus the force seams are restored in finally.
section('CONDITIONS - battle weather');
{
  const C = g.CONDITIONS;
  ok(Object.keys(C).join() === 'clear,rain,sun,fog,night,tremor,static', 'seven conditions in table order');
  ok(JSON.stringify(C.rain.boost) === '{"Water":1.2}' && JSON.stringify(C.static.boost) === '{"Electric":1.15}'
     && C.fog.acc === -10 && C.clear.msg === '', 'rain boosts Water, static Electric x1.15, fog accuracy, clear has no message');
  for (const [cid, c] of Object.entries(C)) {
    ok(Object.keys(c).sort().join() === 'acc,boost,msg,name', cid + ' has exactly name/msg/boost/acc');
    ok(Object.keys(c.boost).every(t => t in g.TYPE_CHART), cid + ' boosts only real types');
    ok(Object.values(c.boost).every(v => v > 1), cid + ' only boosts, never a penalty');
  }
  const regions = g.REGIONS.map(r => r[2]).concat(['THE TRAIL', 'FISHING']);
  ok(Object.keys(g.REGION_CONDITIONS).sort().join() === regions.slice().sort().join(),
     'every region, THE TRAIL and FISHING have a weight row');
  for (const [reg, pool] of Object.entries(g.REGION_CONDITIONS))
    ok(pool.every(([cid, w]) => cid in C && w > 0), reg + ' weights name real conditions');

  // seed: the same fixed values as the Python suite
  ok(g.CONDITION_SALT === 0xC0DE7 && g.SCENE_SALT === 0x5CE7E, 'the two salts are pinned');
  ok(g.conditionSeed(0, 0, 0) === 0xC0DE7, 'seed(0,0,0) is the salt');
  ok(g.conditionSeed(1, 2, 3) === ((31 + 1954 + 393) ^ 0xC0DE7), 'seed formula');
  ok(g.conditionSeed(1e7, 87, 109) === Number((BigInt(1e7 * 31 + 87 * 977 + 109 * 131) ^ 0xC0DE7n) & 0xFFFFFFFFn),
     'seed wraps to uint32');

  // battleCondition: pure, deterministic, fixed cases
  const bc = g.battleCondition;
  const range = n => Array.from({ length: n }, (_, i) => i);
  ok(bc('DARK CAVE', null, true, 5) === 'static', 'a hunt is always static');
  ok(range(200).every(s => bc('DEEPWOOD', { id: 'gym' }, false, s) === 'clear'), 'the gym is always clear');
  ok(['CEDAR TOWN', 'ROUTE ONE'].every(r => range(200).every(s => bc(r, null, false, s) === 'clear')),
     'the starting regions are always clear');
  ok(range(50).map(s => bc('DEEPWOOD', null, false, s)).join() === range(50).map(s => bc('DEEPWOOD', null, false, s)).join(),
     'deterministic per seed');
  ok(bc('NOWHERE', null, false, 7) === bc('THE TRAIL', null, false, 7), 'an unknown region uses THE TRAIL row');
  for (const [reg, pool] of Object.entries(g.REGION_CONDITIONS)) {
    const allowed = new Set(pool.map(([c]) => c));
    const seen = range(2000).map(s => bc(reg, null, false, s));
    ok(seen.every(c => allowed.has(c)), reg + ' only rolls its own conditions');
    const total = pool.reduce((s, [, w]) => s + w, 0);
    for (const [cid, w] of pool) {
      const share = seen.filter(c => c === cid).length / 2000;
      ok(Math.abs(share - w / total) < 0.05, reg + ' rolls ' + cid + ' near ' + (w / total).toFixed(2) + ' (saw ' + share.toFixed(3) + ')');
    }
  }

  // damageCalc(..., condition): boost after the type chart, fog shifts accuracy,
  // and the number of rng draws never changes.
  const rollSeq = vals => { let i = 0; const r = () => { r.calls++; return vals[i++]; }; r.calls = 0; return r; };
  const atk = g.makeMon('pyrelash', 20), dfn = g.makeMon('nibbit', 20);   // Normal: neutral to Water and Fire
  const mvs = Object.entries(g.MOVES);
  const water = mvs.find(([, v]) => v.type === 'Water' && v.pow > 0 && v.acc === 100)[0];
  const fire = mvs.find(([, v]) => v.type === 'Fire' && v.pow > 0 && v.acc === 100)[0];
  const never = (mvs.find(([, v]) => v.acc >= 999) || [null])[0];
  const seq = [.5, .9, .5];
  const dc = (m, vals, cond, d) => g.damageCalc(atk, d || dfn, m, {}, {}, rollSeq(vals), 1, 0, cond);
  const J = o => JSON.stringify(o);
  const base = g.damageCalc(atk, dfn, water, {}, {}, rollSeq(seq));
  for (const cid of [undefined, null, 'clear']) ok(J(dc(water, seq, cid)) === J(base), String(cid) + " = today's result");
  const rain = dc(water, seq, 'rain');
  ok(rain.dmg > base.dmg, 'rain boosts Water (' + base.dmg + ' -> ' + rain.dmg + ')');
  const fb = g.damageCalc(atk, dfn, fire, {}, {}, rollSeq(seq));
  ok(J(dc(fire, seq, 'rain')) === J(fb), 'rain leaves Fire alone (boost only)');
  ok(dc(fire, seq, 'sun').dmg > fb.dmg, 'sun boosts Fire');
  ok(J(dc(fire, seq, 'night')) === J(fb), 'night leaves Fire alone');
  for (const [cid, c] of Object.entries(C)) {
    const bad = mvs.find(([m, v]) => v.pow > 0 && !(v.type in c.boost)
      && J(g.damageCalc(atk, dfn, m, {}, {}, rollSeq([0, .9, .5]))) !== J(dc(m, [0, .9, .5], cid)));
    ok(!bad, cid + ' leaves every unboosted type alone' + (bad ? ' (changed ' + bad[0] + ')' : ''));
  }
  ok(!g.damageCalc(atk, dfn, water, {}, {}, rollSeq([.95, .9, .5])).missed, '0.95 hits an acc-100 move');
  ok(dc(water, [.95, .9, .5], 'fog').missed, 'fog turns 0.95 into a miss');
  ok(never !== null, "MOVES has a move that can't miss (acc >= 999) to test fog against");
  if (never) ok(!dc(never, [.999, .9, .5], 'fog').missed, "fog never touches a move that can't miss");
  for (const cid of Object.keys(C)) {
    const r1 = rollSeq([.5, .9, .5, .5]); g.damageCalc(atk, dfn, water, {}, {}, r1);
    const r2 = rollSeq([.5, .9, .5, .5]); g.damageCalc(atk, dfn, water, {}, {}, r2, 1, 0, cid);
    ok(r1.calls === r2.calls, cid + ' draws the same number of rolls');
  }
  const psy = (mvs.find(([, v]) => v.type === 'Psychic' && v.pow > 0) || [null])[0];
  const dark = Object.keys(g.SPECIES).find(s => g.SPECIES[s].types.includes('Dark')) || null;
  ok(!!(psy && dark), 'a damaging Psychic move and a Dark species exist for the immunity check');
  if (psy && dark) for (const cid of Object.keys(C))
    ok(dc(psy, [.1, .9, .5], cid, g.makeMon(dark, 20)).dmg === 0, 'PSYCHIC on DARK stays 0 under ' + cid);
  const fz = g.mulberry32(4);
  const dmgMoves = mvs.filter(([, v]) => v.pow > 0).map(([m]) => m);
  let same = true;
  for (let i = 0; i < 500; i++) {
    const m = dmgMoves[Math.floor(fz() * dmgMoves.length)];
    const vals = [fz(), fz(), fz()];
    same = same && J(g.damageCalc(atk, dfn, m, {}, {}, rollSeq(vals))) === J(dc(m, vals, null));
  }
  ok(same, 'condition=null matches the default over 500 calls');

  // arenaKind and battleScene
  const ak = g.arenaKind;
  ok(ak('DARK CAVE', '.', false, true, false) === 'cave' && ak('DEEPWOOD', '.', true, false, false) === 'shore',
     'hunt -> cave, fishing -> shore');
  ok(ak('SPIRE RUINS', '.', false, false, false) === 'ruins' && ak('ROCKY PASS', '.', false, false, false) === 'pass',
     'ruins and pass by region');
  ok(ak('DEEPWOOD', '.', false, false, true) === 'pass', 'the sandbox is pass');
  ok(ak('SEASIDE', '.', false, false, false) === 'shore', 'SEASIDE is shore (the deliberate fix)');
  ok(ak('DEEPWOOD', ',', false, false, false) === 'meadow', 'default meadow');
  const sc = g.battleScene;
  const s1 = sc('rain', 'meadow', 1234);
  ok(Object.keys(s1).sort().join() === 'camera,layout,time,weather' && J(s1) === J(sc('rain', 'meadow', 1234)),
     'scene is deterministic');
  ok(s1.weather === 'rain' && s1.camera >= 0 && s1.camera < g.CAMERA_PRESETS && s1.layout >= 0 && s1.layout < 2 ** 32
     && Number.isInteger(s1.layout), 'scene fields');
  ok(range(50).every(s => sc('night', 'meadow', s).time === 'night'), 'night condition forces night');
  ok(range(50).every(s => sc('clear', 'cave', s).time === 'night'), 'the cave is always night');
  ok(sc('clear', 'pass', 3).weather === 'snow' && sc('clear', 'shore', 3).weather === 'none', 'regional extras');
  ok(new Set(range(400).map(s => sc('clear', 'meadow', s).time)).size === 4, 'meadow sees all four times');
  ok(new Set(range(100).map(s => sc('clear', 'meadow', s).layout)).size > 90, 'layouts vary');
  ok(new Set(range(100).map(s => sc('clear', 'meadow', s).camera)).size === g.CAMERA_PRESETS, 'every camera preset is reachable');
  ok(J(g.DEFAULT_SCENE) === J({ layout: 0, time: 'day', weather: 'none', camera: 0 }), "DEFAULT_SCENE is today's look");
  const fx0 = g.fxSeed;
  for (const k of ['meadow', 'cave', 'pass']) sc('rain', k, 99);
  ok(g.fxSeed === fx0, 'battleScene never advances the fxRand seed');

  // the seams: only well-formed values count
  for (const junk of [['rain'], { id: 'rain' }, 3, 'bogus', null, undefined]) {
    g.setForceCondition(junk);
    ok(g.forceCondition === null, 'setForceCondition(' + J(junk) + ') is ignored (null)');
  }
  g.setForceCondition('rain');
  ok(g.forceCondition === 'rain', 'setForceCondition accepts a CONDITIONS id');
  for (const junk of ['day', ['day'], { layout: 0, time: 'day' }, { ...g.DEFAULT_SCENE, extra: 1 }, {}, null,
                      Object.assign(Object.create({ x: 1 }), g.DEFAULT_SCENE)]) {
    g.setForceScene(junk);
    ok(g.forceScene === null, 'setForceScene(' + J(junk) + ') is ignored (null)');
  }
  const ds = { ...g.DEFAULT_SCENE };
  g.setForceScene(ds);
  ok(J(g.forceScene) === J(g.DEFAULT_SCENE) && g.forceScene !== ds, 'setForceScene stores a copy of a well-formed scene');

  // startBattle wiring, with shared G state snapshotted and restored
  const keep = { party: G.party, balls: G.balls, fadeDir: G.fadeDir, fadeCb: G.fadeCb, mode: G.mode, battle: G.battle,
                 steps: G.steps, tx: G.player.tx, ty: G.player.ty, edits: G.edits };
  const keepStore = { ...store };
  const realRandom = Math.random;
  const dw = g.REGIONS.find(r => r[2] === 'DEEPWOOD');
  let deepGrass = null;
  for (let y = dw[0]; y <= dw[1] && !deepGrass; y++)
    for (let x = 0; x < g.MAP_W && !deepGrass; x++)
      if (g.tileAt(x, y, {}) === ',' && !g.inSandbox(x, y)) deepGrass = [x, y];
  ok(deepGrass !== null, 'DEEPWOOD has a tall-grass tile to start the condition battles on');
  deepGrass = deepGrass || [0, dw[0]];
  const msgs = b => b.queue.filter(s => s.t === 'msg').map(s => s.s);
  const begin = (opts, at, steps, foe) => {
    G.party = [g.makeMon('pyrelash', 20)];
    G.balls = 20; G.fadeDir = 0; G.fadeCb = null; G.mode = 'overworld'; G.edits = {};
    G.steps = steps || 0;
    [G.player.tx, G.player.ty] = at || deepGrass;
    g.startBattle(foe || g.makeMon(g.STARTERS[0], 5), opts || {});
    return G.battle;
  };
  const toMenuHere = () => {
    let guard = 0;
    while (G.battle && !['menu', 'over'].includes(G.battle.phase) && guard++ < 20000) {
      const b = G.battle;
      g.updateBattle(1 / 60);
      b.dispMine = b.mine.hp; b.dispFoe = b.foe.hp;
      if (b.step && b.step.t === 'msg') b.step = null;
    }
  };
  const wild = 'A wild ' + g.SPECIES[g.STARTERS[0]].name + ' appeared!';
  let clearLoss = 0, rainLoss = 0, want = null;
  try {
    g.setForceCondition(null); g.setForceScene(null);
    const seed1 = g.conditionSeed(0, deepGrass[0], deepGrass[1]);
    want = bc('DEEPWOOD', null, false, seed1);
    let draws = 0;
    Math.random = () => { draws++; return realRandom(); };
    const fxBefore = g.fxSeed;
    let b = begin();
    Math.random = realRandom;
    ok(draws === 0, 'startBattle never calls Math.random (' + draws + ')');
    ok(g.fxSeed === fxBefore, 'startBattle never advances the fxRand seed');
    ok(b.condition === want, 'the battle rolls battleCondition from conditionSeed (' + want + ')');
    ok(b.arena === 'meadow' && J(b.scene) === J(sc(want, 'meadow', seed1)), 'arena and scene stored on the battle');
    const snap = g.battleSnapshot();
    ok(snap.condition === want && J(snap.scene) === J(b.scene) && snap.arena === 'meadow',
       'battleSnapshot carries condition, scene and arena');
    // both a clear and a non-clear DEEPWOOD battle, over step counts
    const got = {};
    for (let st = 0; st < 200 && Object.keys(got).length < 2; st++) {
      b = begin({}, deepGrass, st);
      const k = b.condition === 'clear' ? 'clear' : 'other';
      if (!got[k]) got[k] = [b.condition, msgs(b)];
    }
    ok(got.clear && got.other, 'DEEPWOOD rolls both clear and non-clear battles over 200 step counts');
    if (got.clear) ok(J(got.clear[1]) === J([wild, 'Go, PYRELASH!']), "a clear wild battle queues exactly today's two lines");
    if (got.other) ok(J(got.other[1]) === J([wild, C[got.other[0]].msg, 'Go, PYRELASH!']),
                      'a ' + got.other[0] + ' wild battle: intro, condition line, then Go');
    // trainer: after both trainer lines
    g.setForceCondition('sun');
    b = begin({ trainer: { id: 't_test', name: 'HIKER TEST', intro: 'Hi!' } });
    ok(J(msgs(b).slice(-3)) === J(['HIKER TEST sent out ' + g.SPECIES[g.STARTERS[0]].name + '!', C.sun.msg, 'Go, PYRELASH!']),
       'a trainer battle: both trainer lines, then the condition, then Go');
    // the gym: clear unless forced
    g.setForceCondition(null);
    ok(begin({ trainer: g.GYM_LEADER }).condition === 'clear', 'the gym battle is always clear');
    g.setForceCondition('rain');
    ok(begin({ trainer: g.GYM_LEADER }).condition === 'rain', 'FORCE rain beats the gym rule');
    g.setForceCondition(['rain']);
    ok(begin({ trainer: g.GYM_LEADER }).condition === 'clear', 'a junk forced id is ignored (the gym stays clear)');
    for (const force of ['rain', 'fog']) {
      g.setForceCondition(force);
      ok(begin({ hunt: true }, null, 0, g.makeMon('gloomstalk', 25)).condition === force, 'FORCE ' + force + ' beats the hunt rule');
    }
    g.setForceCondition('bogus');
    b = begin({ hunt: true }, [50, 30], 0, g.makeMon('gloomstalk', 25));
    ok(b.condition === 'static' && b.arena === 'cave' && g.battleSnapshot().arena === 'cave',
       'an unknown forced id is ignored; the hunt is static in the cave');
    const m3 = msgs(b), gi3 = m3.findIndex(m => m.startsWith('Go, '));
    ok(gi3 >= 4 && m3[gi3 - 1] === C.static.msg && m3[gi3 - 2] === "It's hunting you. There's no time to aim a BALL!",
       "the hunt's static line comes after the whole scare, right before Go");
    g.setForceCondition(null);
    const fishIds = new Set(g.REGION_CONDITIONS.FISHING.map(([c]) => c)), fishSeen = new Set();
    let fishOk = true;
    for (let st = 0; st < 60; st++) {
      b = begin({ fishing: true }, [40, 70], st);
      if (st === 0) ok(b.arena === 'shore', 'a fishing battle is on the shore');
      fishSeen.add(b.condition);
      fishOk = fishOk && b.condition === bc('FISHING', null, false, g.conditionSeed(st, 40, 70));
    }
    ok(fishOk && [...fishSeen].every(c => fishIds.has(c)) && fishSeen.size > 1,
       'fishing rolls the FISHING row (' + [...fishSeen].sort().join() + ')');
    g.setForceScene({ ...g.DEFAULT_SCENE });
    b = begin();
    ok(J(b.scene) === J(g.DEFAULT_SCENE) && b.scene !== g.DEFAULT_SCENE, 'FORCE scene beats battleScene (a copy)');
    // the battle's damage uses b.condition: one Water turn, rain vs clear
    const waterTurn = force => {
      g.setForceCondition(force);
      G.party = [g.makeMon('dripling', 20)];
      G.party[0].moves = ['waterpulse'];
      G.balls = 20; G.fadeDir = 0; G.fadeCb = null; G.mode = 'overworld';
      g.startBattle(g.makeMon('nibbit', 20), {});
      toMenuHere();
      const bb = G.battle, hp0 = bb.foe.hp;
      Math.random = () => 0.5;            // hit, no crit, mid roll, every time
      try { g.takeTurn(bb, { t: 'attack', move: 'waterpulse' }); toMenuHere(); }
      finally { Math.random = realRandom; }
      return hp0 - bb.foe.hp;
    };
    clearLoss = waterTurn('clear'); rainLoss = waterTurn('rain');
    ok(clearLoss > 0 && rainLoss > clearLoss, "rain makes the battle's Water hit land harder (" + clearLoss + ' -> ' + rainLoss + ' HP)');
    // never saved: a live non-clear battle leaves no condition/scene in the save
    g.setForceCondition('rain');
    begin();
    const before = new Set(Object.keys(store));
    g.saveGame();
    const written = Object.keys(store).filter(k => typeof store[k] === 'string').map(k => store[k]).join('\n');
    ok(written.length > 0 && !/"(condition|scene|forceCondition|forceScene)"/.test(written),
       'condition and scene are never written to the save (' + [...new Set(Object.keys(store))].filter(k => !before.has(k)).length + ' new keys)');
  } finally {
    Math.random = realRandom;
    g.setForceCondition('clear'); g.setForceScene({ ...g.DEFAULT_SCENE });
    Object.assign(G, { party: keep.party, balls: keep.balls, fadeDir: keep.fadeDir, fadeCb: keep.fadeCb,
                       mode: keep.mode, battle: keep.battle, steps: keep.steps, edits: keep.edits });
    G.player.tx = keep.tx; G.player.ty = keep.ty;
    for (const k of Object.keys(store)) delete store[k];
    Object.assign(store, keepStore);
  }
  ok(g.forceCondition === 'clear' && J(g.forceScene) === J(g.DEFAULT_SCENE), 'the suite-wide seams are restored');
  console.log('  conditions: ' + Object.keys(C).length + ' ids, ' + Object.keys(g.REGION_CONDITIONS).length
              + ' region rows; DEEPWOOD battle rolled ' + want + '; Water turn clear ' + clearLoss + ' HP vs rain ' + rainLoss + ' HP');
}

/* ------------------------------------------------------------------ LOOT */
section('LOOT - goods, drops, coins, shop, save cleaning');
// G is shared: everything the section touches is snapshotted and restored in finally.
{
  const keep = { party: G.party, balls: G.balls, bag: G.bag, coins: G.coins, battles: G.battles, flags: { ...G.flags },
                 steps: G.steps, mode: G.mode, battle: G.battle, tx: G.player.tx, ty: G.player.ty, dir: G.player.dir,
                 lastCentre: G.lastCentre, beaten: { ...G.beaten }, dialogue: G.dialogue, materials: { ...G.materials } };
  const realRandom = Math.random;
  try {
    const SHOP_IDS = ['greatball', 'potion', 'superpotion', 'smoke'];
    const LOOT_IDS = ['softfur', 'twig', 'treesap', 'shell', 'seasalt', 'grit', 'flint', 'glowmoss', 'glowcrystal',
      'dust', 'relicshard', 'scale', 'pearl', 'emberdust', 'dewdrop', 'leaf', 'copperwire', 'venomsac', 'feather',
      'shadowsilk'];
    ok(JSON.stringify(Object.keys(g.GOODS)) === JSON.stringify(SHOP_IDS.concat(LOOT_IDS)), 'GOODS has the 24 spec ids in order');
    ok(Object.values(g.GOODS).every(v => v.name && v.kind && v.price > 0 && v.desc), 'every GOODS entry has name, kind, price, desc');
    ok(g.GOODS.greatball.bonus === 1.5 && g.GOODS.potion.heal === 20 && g.GOODS.superpotion.heal === 60, 'GOODS extras');
    ok(Object.keys(g.LOOT_TYPE).length === 12 && Object.keys(g.TYPE_CHART).every(t => g.GOODS[g.LOOT_TYPE[t]].kind === 'loot'),
       'LOOT_TYPE covers all 12 types with loot');
    ok(Object.entries(g.LOOT_AREA).every(([r, pool]) => (r === 'FISHING' || g.REGIONS.some(x => x[2] === r))
       && pool.every(([i, w]) => g.GOODS[i].kind === 'loot' && w > 0)), 'LOOT_AREA rows are regions/FISHING with loot');
    ok(JSON.stringify([g.BALL_PRICE, g.START_COINS, g.COINS_MAX, g.BAG_MAX, g.COUNT_MAX, g.LOOT_WIN_CHANCE, g.LOOT_AREA_SHARE,
                       g.LOOT_SALT, g.SAFETY_BALLS, g.GYM_BONUS, g.WILD_COIN_RATE, g.TRAINER_COIN_RATE, g.SHOP_QTY_MAX])
       === JSON.stringify([20, 100, 99999, 999, 0x7FFFFFFF, 0.4, 0.7, 0x1007, 5, 300, 3, 20, 10]), 'the loot constants');
    ok(g.forceNoLoot === false, 'forceNoLoot is off for the suite');
    ok(g.MENU_ITEMS[2] === 'BAG' && g.menuLabel('BAG') === 'BAG', 'the overworld menu row is BAG');

    // pure functions
    ok(JSON.stringify([g.lootSeed(0, 0, 0, 0, 0), g.lootSeed(1, 2, 3, 4, 5), g.lootSeed(120, 36, 95, 5, 3),
                       g.lootSeed(1e9, 87, 109, 100, 1e6)]) === JSON.stringify([4103, 561796, 409208, 2585909101]),
       'lootSeed gives the fixed values and wraps to 32 bits');
    let drops = 0, area = 0, twig = 0, allCaught = true;
    for (let s = 0; s < 2000; s++) {
      if (g.lootRoll('DEEPWOOD', ['Grass'], false, null, false, s)) drops++;
      const c = g.lootRoll('DEEPWOOD', ['Grass'], true, null, false, s);
      if (!c) allCaught = false;
      if (c === 'twig' || c === 'treesap') { area++; if (c === 'twig') twig++; }
    }
    ok(Math.abs(drops / 2000 - 0.4) <= 0.04 && allCaught, 'win drop ~40%, a catch always drops (' + drops / 2000 + ')');
    ok(Math.abs(area / 2000 - 0.7) <= 0.04 && Math.abs(twig / area - 0.75) <= 0.05, 'area share ~70%, TWIG 3:1');
    ok([0, 1, 2, 3].every(s => g.lootRoll('DEEPWOOD', ['Grass'], true, { id: 't1' }, false, s) === null
       && g.lootRoll('DARK CAVE', ['Dark'], true, null, true, s) === null), 'trainers and hunts never drop');
    ok(new Set(Array.from({ length: 300 }, (_, s) => g.lootRoll('RIDGE TOWN', ['Water'], true, null, false, s))).size === 1,
       'RIDGE TOWN gives only the type item');
    const draws = [0];
    Math.random = () => { draws[0]++; return realRandom(); };
    g.lootRoll('SEASIDE', ['Bug'], true, null, false, 9); g.lootSeed(1, 2, 3, 4, 5);
    Math.random = realRandom;
    ok(draws[0] === 0, 'lootRoll/lootSeed never call Math.random');
    ok(g.coinReward(10, null, false, false) === 30 && g.coinReward(5, 12, false, false) === 240
       && g.coinReward(5, 12, true, false) === 540 && g.coinReward(5, 12, true, true) === 240, 'coinReward');
    ok(JSON.stringify([0, 1, 3, 4, 7, 99999].map(g.blackoutCoins)) === JSON.stringify([0, 1, 3, 3, 6, 75000]), 'blackoutCoins');
    const bag0 = { twig: 2 };
    ok(JSON.stringify(g.bagAdd(bag0, 'twig', 3)) === '{"twig":5}' && bag0.twig === 2 && JSON.stringify(g.bagAdd(bag0, 'twig', -2)) === '{}',
       'bagAdd adds, drops zeros, never mutates');
    ok(JSON.stringify(g.shopBuy(100, 3, {}, 'potion', 2)) === JSON.stringify([40, 3, { potion: 2 }, true, null])
       && JSON.stringify(g.shopBuy(100, 3, {}, 'ball', 5)) === JSON.stringify([0, 8, {}, true, null]), 'shopBuy conserves coins');
    ok(g.shopBuy(59, 0, {}, 'greatball', 1)[4] === 'coins' && g.shopBuy(1000, 995, {}, 'ball', 5)[4] === 'full'
       && g.shopBuy(1000, 0, {}, 'potion', 0)[4] === 'qty' && g.shopBuy(1000, 0, {}, 'potion', true)[4] === 'qty'
       && g.shopBuy(1000, 0, {}, 'twig', 1)[4] === 'item', 'shopBuy refusal reasons');
    ok(JSON.stringify(g.shopSell(10, { twig: 3 }, 'twig', 2)) === JSON.stringify([22, { twig: 1 }, true, null])
       && g.shopSell(10, { twig: 1 }, 'twig', 2)[3] === 'qty' && g.shopSell(10, { potion: 1 }, 'potion', 1)[3] === 'item'
       && g.shopSell(99990, { pearl: 1 }, 'pearl', 1)[3] === 'full', 'shopSell');
    ok(JSON.stringify([g.ballSafetyNet(0, 19), g.ballSafetyNet(0, 20), g.ballSafetyNet(1, 0)]) === '[5,0,0]', 'ballSafetyNet');
    const canon = o => JSON.stringify(Object.keys(o).sort().map(k => [k, o[k]]));
    ok(canon(g.cleanBag({ twig: 2, nope: 4, leaf: true, potion: 1.0, smoke: 1.5, pearl: -3, scale: '7', feather: 5000 }))
       === canon({ twig: 2, potion: 1, feather: 999 }) && JSON.stringify(g.cleanBag([1])) === '{}', 'cleanBag');
    ok(JSON.stringify([undefined, null, 250, 1.5, true, -5, '50', NaN, Infinity, 1e9].map(g.cleanCoins))
       === JSON.stringify([100, 100, 250, 0, 0, 0, 0, 0, 0, 99999]), 'cleanCoins');
    ok(JSON.stringify([undefined, null, 7, 2.5, true, -1].map(g.cleanCount)) === JSON.stringify([0, 0, 7, 0, 0, 0]), 'cleanCount');

    // state and battle flow
    const DW = g.REGIONS.find(r => r[2] === 'DEEPWOOD');
    let DX = 0, DY = DW[0];
    outer: for (let y = DW[0]; y <= DW[1]; y++) for (let x = 0; x < g.MAP_W; x++)
      if (g.tileAt(x, y) === ',' && !g.inSandbox(x, y)) { DX = x; DY = y; break outer; }
    const LV = 5;
    function lootSetup(x, y, mons) {
      G.party = mons || [g.makeMon('pyrelash', 20)];
      G.balls = 20; G.bag = {}; G.coins = 100; G.battles = 0; G.steps = 0;
      G.flags.gymBonus = false; G.fadeDir = 0; G.fadeCb = null; G.mode = 'overworld'; G.battle = null;
      G.player.tx = x === undefined ? g.START_TILE[0] : x; G.player.ty = y === undefined ? g.START_TILE[1] : y;
    }
    function lootRun(policy) {
      const msgs = [];
      for (let i = 0; i < 40000 && G.battle; i++) {
        const b = G.battle;
        if (b.phase === 'over' && !b.step && !b.queue.length) {
          const cb = G.fadeCb; G.fadeCb = null; G.fadeDir = 0; if (cb) cb(); break;
        }
        if (b.phase === 'menu' && !b.step && !b.queue.length) { if (!policy) break; g.takeTurn(b, policy(b)); }
        g.updateBattle(1 / 60);
        b.dispMine = b.mine.hp; b.dispFoe = b.foe.hp;
        if (b.step && b.step.t === 'msg') { msgs.push(b.step.s); b.step = null; }
      }
      return msgs;
    }
    const queued = () => G.battle.queue.filter(s => s.t === 'msg').map(s => s.s);
    const best = b => ({ t: 'attack', move: b.mine.moves.slice().sort((p, q) => g.MOVES[q].pow - g.MOVES[p].pow)[0] });
    let ST_DROP = 0, ST_NONE = 0;
    while (!g.lootRoll('DEEPWOOD', ['Grass'], false, null, false, g.lootSeed(ST_DROP, DX, DY, LV, 1))) ST_DROP++;
    while (g.lootRoll('DEEPWOOD', ['Grass'], false, null, false, g.lootSeed(ST_NONE, DX, DY, LV, 1))) ST_NONE++;
    const DROP = g.lootRoll('DEEPWOOD', ['Grass'], false, null, false, g.lootSeed(ST_DROP, DX, DY, LV, 1));

    lootSetup(DX, DY); G.steps = ST_DROP;
    let foe = g.makeMon('sprigling', LV);
    g.startBattle(foe, {});
    let b = G.battle;
    ok(G.battles === 1 && b.fishing === false && b.rewardPaid === false && b.lootSeed === g.lootSeed(ST_DROP, DX, DY, LV, 1),
       'startBattle counts the battle and fixes the loot seed');
    lootRun();
    g.endBattle(b, 'win');
    const wantDrop = 'The wild ' + foe.name + ' dropped a ' + g.GOODS[DROP].name + '!';
    let q = queued();
    ok(JSON.stringify(q) === JSON.stringify(['You got 15 coins!', wantDrop]) && G.fadeDir === 0 && b.rewardPaid && b.phase !== 'over',
       'a wild win queues coins then the drop, before the fade: ' + JSON.stringify(q));
    ok(G.coins === 115 && G.bag[DROP] === 1, 'coins and loot are paid');
    ok(JSON.stringify(lootRun()) === JSON.stringify(q) && G.battle === null, 'every reward line is shown');
    lootSetup(DX, DY); g.startBattle(g.makeMon('nibbit', 3), { fishing: true });
    ok(G.battles === 1 && G.battle.fishing === true, 'a fishing battle is flagged');

    lootSetup(DX, DY, [g.makeMon('pyrelash', 30)]); G.steps = ST_DROP;
    g.startBattle(g.makeMon('sprigling', LV), {});
    const logF = lootRun(best);
    const iExp = logF.findIndex(s => s.includes('EXP')), iCoin = logF.indexOf('You got 15 coins!');
    ok(iExp >= 0 && iExp < iCoin && iCoin === logF.length - 2 && logF[logF.length - 1].endsWith('dropped a ' + g.GOODS[DROP].name + '!'),
       'a fought win narrates EXP, coins, then the drop');

    lootSetup(DX, DY); G.steps = ST_DROP; G.bag = { [DROP]: g.BAG_MAX };
    g.startBattle(g.makeMon('sprigling', LV), {}); lootRun(); g.endBattle(G.battle, 'win');
    ok(JSON.stringify(queued().slice(1)) === JSON.stringify([wantDrop, '...but your bag is full.']) && G.bag[DROP] === g.BAG_MAX,
       'a full bag narrates the drop and keeps the count');

    const tr2 = g.npcById('t2');
    lootSetup(); g.startBattle(g.makeMon(tr2.team[0][0], tr2.team[0][1]), { trainer: tr2 }); lootRun();
    g.endBattle(G.battle, 'win');
    ok(JSON.stringify(queued()) === '["You got 160 coins!"]' && G.coins === 260 && !Object.keys(G.bag).length, 'a trainer win pays coins only');
    lootRun();
    lootSetup(undefined, undefined, [g.makeMon('pyrelash', 60)]);
    for (const want of [940, 640]) {
      G.fadeDir = 0; G.mode = 'overworld';
      g.startBattle(g.makeMon(g.GYM_LEADER.team[0][0], g.GYM_LEADER.team[0][1]), { trainer: g.GYM_LEADER }); lootRun();
      const c0 = G.coins;
      g.endBattle(G.battle, 'win');
      ok(JSON.stringify(queued()) === JSON.stringify(['You got ' + want + ' coins!']) && G.coins === c0 + want && G.flags.gymBonus === true,
         'the gym pays ' + want);
      lootRun();
    }
    G.flags.gym = keep.flags.gym;

    lootSetup(DX, DY); G.steps = ST_NONE; foe = g.makeMon('sprigling', LV);
    g.startBattle(foe, {});
    const held = g.lootRoll('DEEPWOOD', g.SPECIES[foe.id].types, true, null, false, G.battle.lootSeed);
    lootRun(); g.endBattle(G.battle, 'caught');
    ok(JSON.stringify(queued()) === JSON.stringify([foe.name + ' was holding a ' + g.GOODS[held].name + '!']) && G.coins === 100
       && G.bag[held] === 1, 'a catch finds the held loot, no coins');
    lootRun();
    // The real throw path: keep() joins or releases, then endBattle('caught') pays the held loot.
    for (const full of [false, true]) {
      const prevRoll = g.setCatchRoll(() => ({ caught: true, shakes: 3 }));
      try {
        lootSetup(DX, DY, full ? Array.from({ length: 6 }, () => g.makeMon('nibbit', 10)) : [g.makeMon('pyrelash', 20)]);
        G.steps = ST_NONE;
        const f = g.makeMon('sprigling', LV);
        g.startBattle(f, {});
        const h = g.lootRoll('DEEPWOOD', g.SPECIES[f.id].types, true, null, false, G.battle.lootSeed);
        lootRun();
        g.takeTurn(G.battle, { t: 'ball' });
        const msgs = [];
        let heldWhileBattle = false;
        for (let i = 0; i < 40000 && G.battle; i++) {
          const bb = G.battle;
          if (bb.phase === 'over' && !bb.step && !bb.queue.length) {
            const cb = G.fadeCb; G.fadeCb = null; G.fadeDir = 0; if (cb) cb(); break;
          }
          g.updateBattle(1 / 60);
          bb.dispMine = bb.mine.hp; bb.dispFoe = bb.foe.hp;
          if (bb.step && bb.step.t === 'msg') {
            msgs.push(bb.step.s);
            if (bb.step.s.includes('was holding')) heldWhileBattle = G.battle === bb;
            bb.step = null;
          }
        }
        const want = full ? f.name + ' was released.' : f.name + ' joined your team.';
        const iKeep = msgs.findIndex(m => m.endsWith(want));
        const iHeld = msgs.indexOf(f.name + ' was holding a ' + g.GOODS[h].name + '!');
        ok(iKeep >= 0 && iHeld > iKeep && iHeld === msgs.length - 1,
           (full ? 'a released' : 'a joined') + ' catch narrates the keep line, then the held loot: ' + JSON.stringify(msgs.slice(-3)));
        ok(heldWhileBattle && G.battle === null, 'the holding line is shown while the battle is up, and the battle ends after it');
        ok(G.bag[h] === 1 && G.coins === 100 && G.party.length === (full ? 6 : 2),
           (full ? 'a released' : 'a joined') + ' catch keeps its loot and pays no coins');
      } finally { g.setCatchRoll(prevRoll); }
    }

    lootSetup(); g.startBattle(g.makeMon('nibbit', 3), {}); lootRun(); g.endBattle(G.battle, 'lose');
    ok(JSON.stringify(queued()) === '["You dropped 25 coins..."]' && G.coins === 75, 'a blackout drops a quarter');
    lootRun();
    ok(G.mode === 'dialogue' && G.dialogue.lines.length === 2 && G.balls === 20, 'the whiteout with balls left says nothing about BALLs');
    lootSetup(); G.coins = 24; G.balls = 0;
    g.startBattle(g.makeMon('nibbit', 3), {}); lootRun(); g.endBattle(G.battle, 'lose'); lootRun();
    ok(G.coins === 18 && G.balls === 5 && G.dialogue.lines[G.dialogue.lines.length - 1] === g.NURSE_GIFT,
       'the coin loss comes first, so the whiteout gifts BALLs');
    G.dialogue = null; G.mode = 'overworld';

    lootSetup(undefined, undefined, [g.makeMon('pyrelash', 60)]);
    g.startBattle(g.makeMon('gloomstalk', 25), { hunt: true }); lootRun(); g.endBattle(G.battle, 'win');
    ok(JSON.stringify(queued()) === '["It left 3 ORE behind in the dark."]' && G.coins === 100, 'a won hunt pays ORE only');
    lootRun();
    lootSetup(); g.startBattle(g.makeMon('gloomstalk', 25), { hunt: true }); lootRun();
    b = G.battle; g.endBattle(b, 'lose');
    ok(JSON.stringify(queued()) === '["You dropped 25 coins..."]' && G.coins === 75 && b.rewardPaid === false && b.huntPaid,
       'a lost hunt drops a quarter through huntOver');
    lootRun(); G.dialogue = null; G.mode = 'overworld';

    lootSetup(); g.startBattle(g.makeMon('nibbit', 3), {}); lootRun(); g.endBattle(G.battle, 'run');
    ok(queued().length === 0 && G.coins === 100, 'running pays nothing');
    lootRun();
    g.setForceNoLoot(true);
    try {
      lootSetup(DX, DY); G.steps = ST_DROP; g.startBattle(g.makeMon('sprigling', LV), {}); lootRun(); g.endBattle(G.battle, 'win');
      ok(queued().length === 0 && G.coins === 100, 'forceNoLoot: a win pays nothing');
      lootRun();
      lootSetup(); g.startBattle(g.makeMon('nibbit', 3), {}); lootRun(); g.endBattle(G.battle, 'lose');
      ok(queued().length === 0 && G.coins === 100, 'forceNoLoot: a loss costs nothing');
      lootRun(); G.dialogue = null; G.mode = 'overworld';
    } finally { g.setForceNoLoot(false); }

    // The random-stream proof: the same seeded battle draws Math.random the same number of times.
    function seeded(noLoot) {
      let seed = 1234, calls = 0;
      g.setForceNoLoot(noLoot);
      Math.random = () => { calls++; seed = (Math.imul(seed, 1103515245) + 12345) >>> 0; return (seed >>> 8) / 16777216; };
      try {
        lootSetup(DX, DY, [g.makeMon('tidecoil', 22)]); G.steps = ST_DROP;
        g.startBattle(g.makeMon('sprigling', LV), {});
        lootRun(best);
        return [calls, seed, G.coins, Object.keys(G.bag).length];
      } finally { Math.random = realRandom; g.setForceNoLoot(false); }
    }
    const ra = seeded(false), rb = seeded(true);
    ok(ra[2] > 100 && ra[3] === 1 && rb[2] === 100 && rb[3] === 0, 'the seeded battle paid out only with loot on');
    ok(ra[0] === rb[0] && ra[1] === rb[1], 'rewards never touch Math.random (' + ra[0] + ' vs ' + rb[0] + ' calls)');

    // saves
    lootSetup(); G.bag = { twig: 3, potion: 2 }; G.coins = 1234; G.battles = 17; G.flags.gymBonus = true;
    g.saveGame();
    G.bag = {}; G.coins = 0; G.battles = 0; G.flags.gymBonus = false;
    ok(g.loadGame() && canon(G.bag) === canon({ twig: 3, potion: 2 }) && G.coins === 1234 && G.battles === 17
       && G.flags.gymBonus === true, 'bag, coins, battles and the gym bonus round-trip');
    const saveKey = Object.keys(store).find(k => store[k] && store[k].includes('"party"'));
    const old = JSON.parse(store[saveKey]);
    delete old.bag; delete old.coins; delete old.battles; delete old.flags.gymBonus;
    store[saveKey] = JSON.stringify(old);
    ok(g.loadGame() && JSON.stringify(G.bag) === '{}' && G.coins === 100 && G.battles === 0 && G.flags.gymBonus === false,
       'an old save loads with an empty bag, 100 coins, 0 battles');
    store[saveKey] = JSON.stringify(Object.assign(old, { bag: { twig: '9', leaf: 2, x: 1 }, coins: true, battles: -4,
                                                         flags: Object.assign(old.flags, { gymBonus: 'yes' }) }));
    ok(g.loadGame() && JSON.stringify(G.bag) === '{"leaf":2}' && G.coins === 0 && G.battles === 0 && G.flags.gymBonus === true,
       'a junk save is cleaned');

    // healParty and the CENTRE door
    lootSetup(); G.balls = 3;
    ok(g.healParty() === 0 && G.balls === 3, 'healParty no longer tops balls up');
    G.balls = 0; G.coins = 19;
    ok(g.healParty() === 5 && G.balls === 5, 'the safety net gives 5');
    for (const [balls, coins, extra] of [[4, 0, []], [0, 10, [g.NURSE_GIFT]]]) {
      lootSetup(); G.balls = balls; G.coins = coins; G.party[0].hp = 1;
      G.player.tx = 12; G.player.ty = 107; G.player.dir = 'up';
      g.interact();
      ok(G.mode === 'dialogue' && JSON.stringify(G.dialogue.lines) === JSON.stringify(['MEDIC: Rest here a moment...', 'Your team is fully healed!'].concat(extra)),
         'the CENTRE door heals' + (extra.length ? ' and gifts BALLs' : ''));
      G.dialogue = null; G.mode = 'overworld';
    }
    ok(JSON.stringify(g.SIGNS['18,59']) === '["CENTRE: free healing, and a shop. No catch."]'
       && g.npcById('nurse1').lines[0] === 'The CENTRE door heals your whole team, and its shop sells balls.', 'the CENTRE texts');
    lootSetup(); G.mode = 'menu'; G.menu = { cursor: 2 }; G.coins = 42; G.balls = 7; G.toast = null;
    g.confirmKey();
    ok(G.mode === 'bag' && G.bagCursor === 0 && !G.toast, 'the overworld BAG row opens the BAG screen (the toast is gone)');
    G.mode = 'overworld'; G.menu = null; G.toast = null;

    // the battle BAG list
    lootSetup(DX, DY); G.bag = { smoke: 2, potion: 1, twig: 4 };
    g.startBattle(g.makeMon('sprigling', LV), {}); lootRun(); b = G.battle;
    ok(JSON.stringify(g.battleBagItems()) === '["ball","potion","smoke"]', 'the battle BAG lists owned usable items in order');
    b.cursor = 1; g.confirmKey();
    ok(b.phase === 'bag' && b.cursor === 0, 'BAG opens the item list');
    const moves = [];
    for (const [dx, dy] of [[0, 1], [1, 0], [0, 1], [0, 1], [0, -1]]) { g.moveCursor(dx, dy); moves.push(b.cursor); }
    ok(JSON.stringify(moves) === '[1,1,2,2,1]', 'the BAG cursor moves one row and clamps: ' + JSON.stringify(moves));
    g.cancelKey();
    ok(b.phase === 'menu' && !b.queue.length, 'cancel leaves the BAG with no turn used');
    lootSetup(DX, DY); G.balls = 0; G.bag = { twig: 1 };
    g.startBattle(g.makeMon('sprigling', LV), {}); lootRun(); b = G.battle;
    b.cursor = 1; g.confirmKey();
    ok(b.phase === 'anim' && JSON.stringify(queued()) === '["Your bag is empty!"]', 'an empty BAG is narrated');
    ok(JSON.stringify(lootRun()) === '["Your bag is empty!"]' && b.phase === 'menu', '...and returns to the menu');
    g.takeTurn(b, { t: 'ball' });
    ok(JSON.stringify(lootRun()) === '["You have no balls left!"]' && b.phase === 'menu', 'a direct BALL turn with none is guarded');
    G.balls = 1; b.cursor = 1; g.confirmKey(); g.confirmKey();
    const lb = lootRun();
    ok(G.balls === 0 && lb.includes('You threw a BALL!'), 'BAG -> BALL throws through confirmKey');
    lootRun();

    // GREAT BALL, POTION, SMOKE
    const bonuses = [];
    const realCatchRoll = g.setCatchRoll(function (mon, bonus) { bonuses.push(bonus); return { caught: false, shakes: 1 }; });
    try {
      lootSetup(DX, DY, [g.makeMon('pyrelash', 40)]); G.bag = { greatball: 2 };
      g.startBattle(g.makeMon('sprigling', LV), {}); lootRun();
      g.takeTurn(G.battle, { t: 'ball', item: 'greatball' });
      let lg = lootRun();
      ok(JSON.stringify(bonuses) === '[2.25]' && G.bag.greatball === 1 && G.balls === 20 && lg.includes('You threw a GREAT BALL!'),
         'a GREAT BALL throws at 2.25x from the bag');
      bonuses.length = 0;
      g.takeTurn(G.battle, { t: 'ball' }); lg = lootRun();
      ok(JSON.stringify(bonuses) === '[1.5]' && G.balls === 19 && lg.includes('You threw a BALL!'), 'a plain BALL is unchanged');
      lootSetup(); G.bag = { greatball: 1 };
      g.startBattle(g.makeMon(tr2.team[0][0], tr2.team[0][1]), { trainer: tr2 }); lootRun();
      g.takeTurn(G.battle, { t: 'ball', item: 'greatball' });
      ok(JSON.stringify(lootRun()) === JSON.stringify(["You can't catch another trainer's monster!"]) && G.bag.greatball === 1,
         'a refused GREAT BALL is kept');
    } finally { g.setCatchRoll(realCatchRoll); }
    lootSetup(DX, DY, [g.makeMon('pyrelash', 40)]); G.bag = { potion: 3, superpotion: 2 };
    g.startBattle(g.makeMon('sprigling', 3), {}); lootRun(); b = G.battle;
    const me = b.mine, foeHp = b.foe.hp;
    let n = 0; Math.random = () => { n++; return realRandom(); };
    try { g.takeTurn(b, { t: 'item', item: 'potion' }); } finally { Math.random = realRandom; }
    ok(JSON.stringify(lootRun()) === '["It won\'t have any effect."]' && G.bag.potion === 3 && b.foe.hp === foeHp && n === 1,
       'a POTION at full HP is refused, nothing used, only the foe-move pick drawn');
    g.takeTurn(b, { t: 'item', item: 'superpotion' });
    ok(JSON.stringify(lootRun()) === '["It won\'t have any effect."]' && G.bag.superpotion === 2, 'a SUPER POTION at full HP is refused');
    me.hp = me.maxhp - 30;
    g.takeTurn(b, { t: 'item', item: 'potion' });
    const qq = b.queue;
    ok(qq[0].t === 'do' && qq[1].t === 'msg' && qq[1].s === me.name + ' recovered 20 HP!' && qq[2].t === 'hp'
       && qq.length > 5 && qq[qq.length - 2].t === 'hp'
       && qq[qq.length - 1].t === 'do', 'the queue runs: heal sfx, message, HP bar, foe move ..., faint check');
    ok(me.hp === me.maxhp - 10 && G.bag.potion === 2, 'a POTION heals 20 and is used up');
    const lp = lootRun();
    ok(lp[0] === me.name + ' recovered 20 HP!' && lp.slice(1).some(s => s.startsWith('Foe ')), 'the foe takes its turn after');
    me.hp = me.maxhp - 70;
    g.takeTurn(b, { t: 'item', item: 'superpotion' });
    ok(lootRun()[0] === me.name + ' recovered 60 HP!' && G.bag.superpotion === 1, 'a SUPER POTION heals 60');
    for (const kind of ['trainer', 'hunt']) {
      lootSetup(undefined, undefined, [g.makeMon('pyrelash', 60)]); G.bag = { smoke: 1 };
      if (kind === 'trainer') g.startBattle(g.makeMon(tr2.team[0][0], tr2.team[0][1]), { trainer: tr2 });
      else g.startBattle(g.makeMon('gloomstalk', 25), { hunt: true });
      lootRun();
      g.takeTurn(G.battle, { t: 'item', item: 'smoke' });
      ok(JSON.stringify(lootRun()) === JSON.stringify(["The smoke won't help here!"]) && G.bag.smoke === 1 && G.battle.phase === 'menu',
         'SMOKE is refused in a ' + kind + ' battle');
    }
    lootSetup(DX, DY); G.bag = { smoke: 2 };
    g.startBattle(g.makeMon('sprigling', LV), {}); lootRun(); b = G.battle;
    n = 0; Math.random = () => { n++; return realRandom(); };
    let ls;
    try { g.takeTurn(b, { t: 'item', item: 'smoke' }); ls = lootRun(); } finally { Math.random = realRandom; }
    ok(JSON.stringify(ls) === '["You vanished in a puff of smoke!"]' && b.result === 'run' && G.bag.smoke === 1 && n === 1,
       'SMOKE ends a wild battle as a run; only the foe-move pick is drawn (' + n + ')');
    console.log('  loot: drop seed ' + ST_DROP + ' -> ' + DROP + '; seeded battle ' + ra[0] + ' Math.random calls either way');
  } finally {
    Math.random = realRandom;
    g.setForceNoLoot(false);
    Object.assign(G, { party: keep.party, balls: keep.balls, bag: keep.bag, coins: keep.coins, battles: keep.battles,
                       flags: keep.flags, steps: keep.steps, mode: keep.mode, battle: keep.battle, lastCentre: keep.lastCentre,
                       beaten: keep.beaten, dialogue: keep.dialogue, materials: keep.materials, fadeDir: 0, fadeCb: null });
    G.player.tx = keep.tx; G.player.ty = keep.ty; G.player.dir = keep.dir;
    G.player.px = keep.tx * 32; G.player.py = keep.ty * 32;
  }
}

/* ------------------------------------------------------- SHELL JUICE */
// The HTML shell has no canvas here, but its world-fx state, tells and
// constants are plain functions behind __GAME__, so the polish rules that do
// not need pixels are checked headlessly (pixels: the Python RENDER pass and
// a browser playtest).
section('SHELL JUICE — seam tell, GEODE glints, tier-2 break, HUD/menu layout (headless)');
{
  const realRandom = Math.random;
  let engineRolls = 0;
  Math.random = () => { engineRolls++; return realRandom(); };
  const p = G.player;
  const put = (x, y, d) => { p.tx = x; p.ty = y; p.px = x * 32; p.py = y * 32; p.moving = false; p.dir = d || 'up'; };
  const over = (fn, period) => {               // every spot that glints over two periods
    const seen = new Set(); let bad = 0;
    for (let i = 0; i < Math.ceil(2 * period * 60); i++) {
      G.time = i / 60;
      for (const [x, y, k] of fn()) { seen.add(x + ',' + y); if (!(k >= 0 && k <= 1)) bad++; }
    }
    return { seen, bad };
  };
  const [gx1, gy1, gx2, gy2] = g.GEODE;
  const inGeode = (x, y) => x >= gx1 && x <= gx2 && y >= gy1 && y <= gy2;
  G.mode = 'overworld'; G.battle = null; G.edits = {}; G.picked = new Set(); G.flags.starter = true;
  ok(!g.REDUCED_MOTION, 'node has no matchMedia, so reduced motion is off');
  ok(same(g.GEODE_DOOR, [70, 34]), 'GEODE_DOOR is the seam on the GEODE bottom row: ' + g.GEODE_DOOR);
  ok(g.GEODE_SPOTS.length > 0 && g.GEODE_SPOTS.every(([x, y]) => inGeode(x, y) && 'c;,'.includes(g.MAP[y][x])),
     g.GEODE_SPOTS.length + ' GEODE crystals, all on open tiles inside GEODE');

  // Sealed: no glints, and the pocket is masked as rock; the mask stays inside GEODE.
  G.flags.pick = 2;
  put(70, 35);
  ok(!g.geodeOpen() && over(g.geodeGlints, g.GEODE_GLINT_PERIOD).seen.size === 0, 'sealed: no GEODE glints');
  ok(g.geodeMasked(70, 32) && g.geodeMasked(75, 30) && !g.geodeMasked(70, 34) && !g.geodeMasked(64, 32) &&
     !g.geodeMasked(70, 35), 'sealed: the pocket (grass, ball) is masked, the seam and the outside are not');

  // Sealed glades draw as forest: gladeMasked is pure over MAP + the edits passed,
  // and overworldGlyph (what drawOverworld draws) substitutes '#' for it.
  {
    ok(g.GLADES.length === 2 && g.GLADES[0] === g.MOSS_HOLLOW && g.GLADES[1] === g.OLD_GROVE &&
       JSON.stringify(g.GLADE_GATES) === JSON.stringify([[g.MOSS_HOLLOW, [19, 84]], [g.OLD_GROVE, [71, 84]]]),
       "GLADE_GATES finds each glade's unique THICK TREE: " + JSON.stringify(g.GLADE_GATES));
    const cutW = g.withEdit({}, 19, 84, '.'), cutE = g.withEdit({}, 71, 84, '.');
    for (const [x, y] of [[10, 85], [5, 82], [4, 81]]) {
      ok(g.gladeMasked(x, y, {}) && g.gladeMasked(x, y, cutE) && !g.gladeMasked(x, y, cutW),
         'MOSS HOLLOW ' + [x, y] + ' is masked while (19,84) stands, and only its own cut unmasks it');
    }
    for (const [x, y] of [[75, 84], [83, 82], [84, 87]]) {
      ok(g.gladeMasked(x, y, {}) && g.gladeMasked(x, y, cutW) && !g.gladeMasked(x, y, cutE),
         'OLD GROVE ' + [x, y] + ' is masked while (71,84) stands, and only its own cut unmasks it');
    }
    ok(![[19, 84], [71, 84]].some(([x, y]) => [{}, cutW, cutE].some(e => g.gladeMasked(x, y, e))),
       "a glade's gate tile is never masked");
    ok(![[19, 85], [19, 81], [71, 85], [71, 81]].some(([x, y]) => g.gladeMasked(x, y, {})),
       'authored forest (#) inside a glade rect is never masked');
    ok(![[20, 84], [3, 84], [10, 80], [10, 88], [70, 84], [85, 84], [70, 32], [0, 0]].some(([x, y]) => g.gladeMasked(x, y, {})),
       'tiles outside both glade rects are never masked');
    let allSealed = true, noneCut = true;
    const both = g.withEdit(cutW, 71, 84, '.');
    for (const r of g.GLADES) for (let y = r[1]; y <= r[3]; y++) for (let x = r[0]; x <= r[2]; x++) {
      if (g.gladeMasked(x, y, {}) !== (g.MAP[y][x] !== '#' && g.MAP[y][x] !== g.TREE)) allSealed = false;
      if (g.gladeMasked(x, y, both)) noneCut = false;
    }
    ok(allSealed, 'sealed, every non-#, non-T tile of both glade rects is masked');
    ok(noneCut, 'with both trees cut nothing is masked');
    // The draw path: G.edits drives it (and gladeMasked's edits argument), the ball and grass stay hidden.
    const keepEdits = G.edits, keepPicked = G.picked;
    try {
      G.edits = {}; G.picked = new Set();
      const opened = g.geodeOpen();
      ok(g.gladeMasked(10, 85, G.edits) && g.overworldGlyph(10, 85, opened) === '#' && g.overworldGlyph(5, 82, opened) === '#' &&
         g.overworldGlyph(83, 82, opened) === '#' && g.overworldGlyph(19, 84, opened) === g.TREE &&
         g.overworldGlyph(20, 84, opened) === g.MAP[84][20],
         "sealed: the overworld draws the glades' grass and balls as forest, the gate as its THICK TREE");
      G.edits = cutW;
      ok(!g.gladeMasked(10, 85, G.edits) && g.overworldGlyph(10, 85, opened) === ';' && g.overworldGlyph(5, 82, opened) === 'o' &&
         g.overworldGlyph(19, 84, opened) === '.' && g.overworldGlyph(83, 82, opened) === '#',
         'west cut: MOSS HOLLOW draws its dark grass and ball; OLD GROVE stays forest');
      G.picked = new Set(['5,82']);
      ok(g.overworldGlyph(5, 82, opened) === g.pickedGround(5, 82), 'a picked glade ball draws its ground once cut');
    } finally { G.edits = keepEdits; G.picked = keepPicked; }
  }

  // Seam tell: tier 2 only, near, unmined, open face only.
  G.flags.pick = 1;
  ok(over(g.seamTells, g.SPARKLE_PERIOD).seen.size === 0, 'plain PICK: no seam sparkle');
  G.flags.pick = 2;
  const t2 = over(g.seamTells, g.SPARKLE_PERIOD);
  ok(same([...t2.seen], ['70,34']) && t2.bad === 0, 'IRON PICK: the faced seam sparkles: ' + [...t2.seen]);
  put(62, 33);
  ok(over(g.seamTells, g.SPARKLE_PERIOD).seen.size === 0, 'the sealed inner seam (65,33) has no open face: no sparkle');
  put(30, 44);
  ok(over(g.seamTells, g.SPARKLE_PERIOD).seen.size === 0, 'far from any seam: no sparkle');

  // The tier-2 break: heavy trauma (clamped), a world-fx hold, more debris, a deeper sound.
  const sounds = [];
  const realHeavy = g.SFX.mineHeavy, realMine = g.SFX.mine;
  g.SFX.mineHeavy = () => sounds.push('mineHeavy');
  g.SFX.mine = () => sounds.push('mine');
  put(70, 35, 'up');
  G.materials = { stone: 0, ore: 0, wall: 0 };
  g.resetWorldFx();
  g.interact();
  ok(g.tileHere(70, 34) === 'c' && sounds[sounds.length - 1] === 'mineHeavy', 'a seam break plays mineHeavy');
  ok(Math.abs(g.WFX.trauma - Math.min(1, g.TRAUMA_MINE_HEAVY)) < 1e-9 && g.TRAUMA_MINE_HEAVY > g.TRAUMA_MINE_ORE,
     'a seam break adds TRAUMA_MINE_HEAVY (' + g.WFX.trauma + ')');
  ok(Math.abs(g.WFX.freeze - g.MINE_HITSTOP) < 1e-9, 'a seam break starts a MINE_HITSTOP hold');
  ok(g.liveDebris() === g.DEBRIS_BURST_HEAVY + g.DEBRIS_BURST_HEAVY_ORE, 'a seam break sprays ' +
     (g.DEBRIS_BURST_HEAVY + g.DEBRIS_BURST_HEAVY_ORE) + ' bits, saw ' + g.liveDebris());
  const before = JSON.stringify([g.WFX.trauma, [...g.WFX.cracks], Object.keys(g.WFX)]);
  const rolls0 = engineRolls;
  // The game runs on through the hold: update() moves the player while world fx stay put.
  g.press('arrowleft');
  g.update(1 / 60);
  ok(p.dir === 'left' && p.moving, 'input is never blocked: during the hold the player turns and steps');
  ok(JSON.stringify([g.WFX.trauma, [...g.WFX.cracks], Object.keys(g.WFX)]) === before,
     'hit-stop frame 1: trauma and the crack frame hold');
  g.release('arrowleft');
  let holdFrames = 1;
  while (g.WFX.freeze > 0 && holdFrames < 30) { g.updateWorldFx(1 / 60); holdFrames++; }
  ok(holdFrames === Math.ceil(g.MINE_HITSTOP * 60 - 1e-9), 'the hold lasts MINE_HITSTOP (' + holdFrames + ' frames)');
  const tr = g.WFX.trauma;
  g.updateWorldFx(1 / 60);
  ok(g.WFX.trauma < tr, 'after the hold the shake decays again');
  for (let i = 0; i < 120 && p.moving; i++) g.update(1 / 60);
  for (let i = 0; i < 5; i++) g.worldFx('mine', 70, 34, g.SEAM, { ore: 2 });
  let peak = 0;
  for (let i = 0; i < 3000; i++) { const [a, b] = g.worldOffset(); peak = Math.max(peak, Math.abs(a), Math.abs(b)); }
  ok(g.WFX.trauma === 1 && peak <= g.WORLD_SHAKE_MAX && Math.abs(g.WFX.freeze - g.MINE_HITSTOP) < 1e-9,
     'stacked seam breaks clamp trauma at 1 (peak ' + peak + ' px <= WORLD_SHAKE_MAX) and never stack the hold');
  ok(g.liveDebris() <= g.DEBRIS_MAX, 'stacked seam breaks stay inside DEBRIS_MAX');
  g.resetWorldFx();
  put(34, 46, 'left');
  g.interact();
  ok(sounds[sounds.length - 1] === 'mine' && g.WFX.freeze === 0, 'a boulder still plays mine and never holds');
  g.SFX.mineHeavy = realHeavy; g.SFX.mine = realMine;
  g.resetWorldFx();

  // Opened: glints only inside GEODE; the inner seam sparkles from inside.
  G.edits = { '70,34': 'c' };
  put(70, 32);
  const og = over(g.geodeGlints, g.GEODE_GLINT_PERIOD);
  ok(g.geodeOpen() && !g.geodeMasked(70, 32) && og.seen.size > 0 && og.bad === 0 &&
     [...og.seen].every(k => g.GEODE_SPOTS.some(([x, y]) => x + ',' + y === k)),
     'opened: ' + og.seen.size + ' crystals glint, all GEODE spots');
  put(66, 33);
  ok(over(g.seamTells, g.SPARKLE_PERIOD).seen.has('65,33'), 'opened: the inner seam sparkles from inside');
  ok(engineRolls === rolls0, 'tells, glints, the hold and the shake never call Math.random (the engine stream)');
  Math.random = realRandom;

  // HUD and menu rectangles: nothing overlaps at 640x480.
  const hit = (a, b) => a[0] < b[0] + b[2] && b[0] < a[0] + a[2] && a[1] < b[1] + b[3] && b[1] < a[1] + a[3];
  const menuR = [640 - g.MENU_W - 16, g.MENU_Y, g.MENU_W, 26 * g.MENU_ITEMS.length + 24];
  const hud = { region: [8, 8, 150, 30], mats: g.HUD_MAT_RECT, lead: g.HUD_LEAD_RECT,
                build: [640 / 2 - 148, 8, 296, 30], toast: [640 / 2 - 130, 480 - 60, 260, 34] };
  for (const [name, r] of Object.entries(hud)) ok(!hit(menuR, r), 'the MENU ' + menuR + ' clears the ' + name + ' panel ' + r);
  ok(menuR[1] + menuR[3] <= 480 && menuR[0] + menuR[2] <= 640, 'the MENU fits in 640x480');
  ok(!hit(hud.build, hud.mats) && !hit(hud.build, hud.lead) && g.HUD_MAT_RECT[1] + g.HUD_MAT_RECT[3] <= g.CRAFT_RECT[1],
     'the wider materials panel clears the BUILDING banner and ends above CRAFT');
  ok(same(g.CRAFT_TIER_NAME, ['NONE', 'PICK', 'IRON PICK']), 'the HUD tier labels are NONE / PICK / IRON PICK');

  // The picked-ball line follows the ground.
  ok(g.pickedText(20, 28).includes('cave floor') && g.pickedText(52, 68).includes('sand') &&
     g.pickedText(50, 51).includes('scree') && g.pickedText(56, 100).includes('grass'),
     'picked-ball lines: cave floor / sand / scree / grass');
  G.picked = new Set(['20,28']);
  g.pickUp(20, 28);
  ok(G.dialogue && G.dialogue.lines[0] === 'Nothing left here but a scuff on the cave floor.',
     'a taken cave ball says: ' + (G.dialogue && G.dialogue.lines[0]));
  G.dialogue = null; G.mode = 'overworld'; G.picked = new Set(); G.edits = {}; G.flags.pick = 0;
  console.log('  shell: seam tell at tier 2 only, ' + og.seen.size + ' GEODE glints once open, ' + holdFrames +
              '-frame hold, menu clear of ' + Object.keys(hud).length + ' HUD panels');
}

/* ------------------------------------------------------------ SHELL: CRAFT */
// The CRAFT grid, its detail pane and the craft animation, through the pure
// craftView() that drawCraft draws from (mirrors the Python RENDER checks).
section('SHELL CRAFT - grid, detail pane, craft animation, wrapLines (headless)');
{
  const keepS = Object.assign({}, G);
  const keepPosS = Object.assign({}, G.player);
  const keepSettings = Object.assign({}, G.settings);
  const [x, y, w, h] = g.CRAFT_RECT;
  const inRect = (r, pad) => r[0] - pad >= x && r[1] - pad >= y && r[0] + r[2] + pad <= x + w && r[1] + r[3] + pad <= y + h;
  const ids = g.RECIPES.map(r => r.id);
  const axeC = ids.indexOf('axe'), wallC = ids.indexOf('wall'), buildC = g.RECIPES.length;
  const fresh = cursor => {
    G.mode = 'craft'; G.battle = null; G.fade = 0; G.fadeDir = 0; G.dialogue = null;
    G.flags = Object.assign({}, G.flags, { pick: 0, axe: 0 });
    G.materials = { stone: 0, ore: 0, wall: 0 }; G.bag = {}; G.balls = 0; G.lantern = 100; G.pulses = 0;
    G.found = new Set(['balls', 'lantern']); G.craftCursor = cursor; G.craftMsg = ''; G.building = false;
    g.CRFX.clear();
  };
  const tap = k => { g.press(k); g.release(k); };
  const axeReady = () => { fresh(axeC); G.bag = { twig: 2, flint: 1 }; g.noteFound(); };
  const realRandom = Math.random;
  let draws = 0;
  try {
    // -- layout: every cell (with its 3 px outline) inside CRAFT_RECT, none overlapping, sel = cursor --
    fresh(3);
    let v = g.craftView();
    ok(v.cells.length === g.RECIPES.length + 1 && v.top === 0 && !v.cueUp && !v.cueDown,
       'the shipped ' + v.cells.length + '-cell grid shows every cell and never scrolls');
    ok(v.cells.every(c => inRect([c.x, c.y, c.w, c.h], 4)), 'every CRAFT cell and outline sits inside CRAFT_RECT');
    ok(v.cells.every((a, i) => v.cells.slice(i + 1).every(b => a.x + a.w <= b.x || b.x + b.w <= a.x || a.y + a.h <= b.y || b.y + b.h <= a.y)),
       'no two CRAFT cells overlap');
    ok(v.cells.filter(c => c.sel).map(c => c.k).join() === '3', 'sel marks exactly the cursor cell');
    ok(v.cells.every(c => c.x + c.w + 4 < x + 298) && v.cueX + 5 < x + 298 && v.cueX - 5 > x + g.CRAFT_GRID_X + 4 * (g.CRAFT_SLOT + g.CRAFT_GAP) + g.CRAFT_SLOT + 3,
       'the grid, its outline and the scroll cue column end left of the detail divider');
    ok(v.cells[0].k === 0 && v.cells[0].x === x + g.CRAFT_GRID_X && v.cells[0].y === y + g.CRAFT_GRID_Y &&
       v.cells[6].x === x + g.CRAFT_GRID_X + (g.CRAFT_SLOT + g.CRAFT_GAP) && v.cells[6].y === y + g.CRAFT_GRID_Y + g.CRAFT_SLOT + g.CRAFT_GAP,
       'cells sit on the CRAFT_GRID_X/Y + CRAFT_SLOT/GAP lattice');
    // a hidden cell reveals neither its name nor its needs
    fresh(axeC);
    v = g.craftView();
    ok(v.cells[axeC].state === 'hidden' && v.detail.name === '???' && v.detail.hidden &&
       v.detail.needs.length === 2 && v.detail.needs.every(n => n.name === '' && n.have === '?' && n.n === '?'),
       'a hidden cell shows ???, no need names and ? counts');
    ok(!v.detail.enabled && v.detail.button === 'Z: CRAFT', 'a hidden cell greys its button');
    fresh(buildC);
    v = g.craftView();
    ok(v.detail.button === 'Z: BUILD' && !v.detail.enabled && v.detail.needs[0].ok === false, 'BUILD with no WALL: greyed Z: BUILD');
    v.detail.needs.forEach(n => ok(inRect(n.slot, 0) && n.slot[1] + n.slot[3] <= y + h - 34, 'need slot inside the pane'));

    // -- Z on cells, through press() like a real key --
    fresh(axeC);
    const hold = JSON.stringify([G.bag, G.materials, G.balls, G.flags]);
    tap('z');
    ok(G.mode === 'craft' && G.craftMsg === g.CRAFT_MSG.hidden && JSON.stringify([G.bag, G.materials, G.balls, G.flags]) === hold
       && !g.CRFX.active(), 'Z on a hidden cell crafts nothing and says ' + G.craftMsg);
    fresh(buildC);
    tap('z');
    ok(G.mode === 'craft' && !G.building && G.craftMsg === g.CRAFT_MSG.nowall, 'Z on BUILD with no WALLs stays in CRAFT');
    G.materials.wall = 1;
    tap('z');
    ok(G.mode === 'overworld' && G.building, 'Z on BUILD with a WALL enters build mode');
    G.building = false;
    fresh(0);
    tap('x');
    ok(G.mode === 'overworld', 'X closes CRAFT');
    // the cursor clamps, never wraps
    fresh(0);
    tap('arrowleft'); tap('arrowup');
    ok(G.craftCursor === 0, 'the CRAFT cursor clamps at the top-left');
    for (let i = 0; i < 9; i++) tap('arrowright');
    ok(G.craftCursor === g.CRAFT_COLS - 1, 'right stops at the end of the row');
    for (let i = 0; i < 9; i++) tap('arrowdown');
    ok(G.craftCursor === g.RECIPES.length, 'down clamps at the last cell');

    // -- a real AXE craft: one 'craft' ding, CRFX from fxRand, never Math.random --
    axeReady();
    const played = [];
    const realCraft = g.SFX.craft, realLevel = g.SFX.level;
    g.SFX.craft = () => played.push('craft'); g.SFX.level = () => played.push('level');
    Math.random = () => { draws++; return realRandom(); };
    try { tap('z'); } finally { g.SFX.craft = realCraft; g.SFX.level = realLevel; }
    ok(G.flags.axe === 1 && same(played, ['craft']), "a craft plays one 'craft' ding, not 'level': " + played);
    ok(g.CRFX.active() && g.CRFX.recipe === axeC && same(g.CRFX.before, { twig: 2, flint: 1 }) &&
       g.CRFX.sparks.length === g.CRAFT_SPARKS, 'the craft hook starts CRFX with the before counts and its sparks');
    const frames = {};
    for (const t of [0, 0.15, 0.3, 0.425, 0.5]) {
      if (g.CRFX.active() && t > g.CRFX.t) g.CRFX.update(t - g.CRFX.t);
      frames[t] = { active: g.CRFX.active(), v: g.craftView() };
    }
    ok(Object.values(frames).every(f => f.active), 'the animation is still running at t = 0.5');
    g.CRFX.update(g.CRAFT_FLY_T + g.CRAFT_POP_T - g.CRFX.t + 1e-9);
    ok(!g.CRFX.active(), 'the animation ends at CRAFT_FLY_T + CRAFT_POP_T');
    const fly = frames[0.15].v.anim, pop = frames[0.425].v.anim;
    ok(!fly.showIcon && fly.ghosts.length === 2 && fly.sparks.length === 0 && !fly.glow,
       'flying: the result slot is empty and two ghosts fly');
    ok(frames[0.15].v.detail.needs.every(n => n.ok && n.have === n.n), 'flying: the need rows show the before counts');
    ok(fly.ghosts.every(gh => gh.x > frames[0].v.anim.ghosts[0].x - 1 && gh.x <= x + 390), 'the ghosts move toward the result');
    ok(pop.showIcon && pop.glow && pop.scale > 1 && pop.scale <= g.CRAFT_POP_SCALE && pop.sparks.length === g.CRAFT_SPARKS,
       'popping: the result scales up over the glow with ' + pop.sparks.length + ' sparks');
    ok(frames[0.425].v.detail.needs.every(n => !n.ok && n.have === 0), 'from the pop on, the live counts show');
    ok(Object.values(frames).every(f => f.v.anim.sparks.every(([sx, sy]) => inRect([sx, sy, 4, 4], 0)) &&
       f.v.anim.ghosts.every(gh => inRect([gh.x - 8, gh.y - 8, 16, 16], 0)) &&
       inRect([f.v.anim.res[0] + 30 - f.v.anim.side / 2, f.v.anim.res[1] + 30 - f.v.anim.side / 2, f.v.anim.side, f.v.anim.side], 0)),
       'every animation frame stays inside CRAFT_RECT');
    const settled = g.craftView().anim;
    ok(settled.showIcon && settled.scale === 1 && settled.side === 48 && !settled.glow && !settled.sparks.length,
       'settled: the result at exactly 3x');
    // a key during the fly skips to the end and is still handled
    axeReady();
    tap('z');
    g.CRFX.update(0.1);
    ok(g.CRFX.flying(), 'a second craft is mid-fly');
    G.flags.axe = 1;
    tap('z');
    ok(!g.CRFX.active() && G.craftMsg === 'You already have the AXE.', 'Z mid-fly skips the animation and is handled: ' + G.craftMsg);
    // leaving CRAFT clears it on the next frame
    axeReady();
    tap('z');
    G.mode = 'overworld';
    g.updateCaveFx(1 / 60);
    ok(!g.CRFX.active(), 'the first frame outside CRAFT clears CRFX');
    ok(draws === 0, 'the craft and CRFX never call Math.random (' + draws + ')');
    Math.random = realRandom;

    // -- reduced motion through the in-game setting (not the OS const alone) --
    G.settings.reducedMotion = true;
    axeReady();
    tap('z');
    v = g.craftView();
    ok(g.crfxCalm() && g.CRFX.active() && g.CRFX.sparks.length === 0 && !g.CRFX.flying() && g.CRFX.total() === g.CRAFT_GLOW_T,
       'reduced motion: no sparks, no fly, a ' + g.CRAFT_GLOW_T + ' s glow');
    ok(v.anim.glow && v.anim.showIcon && v.anim.scale === 1 && v.anim.side === 48 && !v.anim.ghosts.length,
       'reduced motion: the glow and the icon at exactly 3x, no ghosts');
    g.CRFX.update(g.CRAFT_GLOW_T);
    ok(!g.CRFX.active(), 'the glow ends after CRAFT_GLOW_T');
    G.settings.reducedMotion = false;

    // -- a synthetic 23-cell grid scrolls by rows --
    fresh(0);
    const base = g.craftCells();
    const many = Array.from({ length: 23 }, (_, k) => Object.assign({}, base[k % base.length]));
    const rowsN = Math.ceil(23 / g.CRAFT_COLS);
    let scrollOk = true, sawUp = false, sawDn = false;
    for (let cur = 0; cur < 23; cur++) {
      G.craftCursor = cur;
      const sv = g.craftView(many);
      const want = g.listTop(rowsN, Math.floor(cur / g.CRAFT_COLS), g.CRAFT_GRID_ROWS);
      const sel = sv.cells.find(c => c.sel);
      if (sv.top !== want || !sel || sel.k !== cur || sv.cueUp !== (want > 0) || sv.cueDown !== (want + g.CRAFT_GRID_ROWS < rowsN)
          || !sv.cells.every(c => inRect([c.x, c.y, c.w, c.h], 4))) scrollOk = false;
      sawUp = sawUp || sv.cueUp; sawDn = sawDn || sv.cueDown;
    }
    ok(scrollOk && sawUp && sawDn, 'a 23-cell grid scrolls by rows, keeps the cursor cell on screen and shows both cues');

    // -- drawCraft through a recording context: draws, and every string sits inside CRAFT_RECT --
    let texts = [];
    const sizeOf = f => +((/(\d+)px/.exec(f) || [0, 14])[1]);
    const base2 = {
      font: '14px x', textAlign: 'left', textBaseline: 'alphabetic', fillStyle: '', strokeStyle: '', lineWidth: 1,
      imageSmoothingEnabled: true,
      measureText(s) { return { width: String(s).length * sizeOf(this.font) * 0.6 }; },
      fillText(s, tx, ty) {
        const px = sizeOf(this.font), tw = String(s).length * px * 0.6;
        const x0 = this.textAlign === 'right' ? tx - tw : this.textAlign === 'center' ? tx - tw / 2 : tx;
        texts.push({ s: String(s), x0, x1: x0 + tw, top: ty - px * 0.8, bottom: ty + px * 0.25 });
      },
    };
    const stub = new Proxy(base2, { get: (t, k) => (k in t ? t[k] : () => {}), set: (t, k, val) => { t[k] = val; return true; } });
    const drawn = () => { texts = []; g.withCtx(stub, () => g.drawCraft()); return texts; };
    const states = [['fresh', () => fresh(0)], ['axe-ready', axeReady], ['hidden', () => fresh(axeC)],
                    ['mid-pop', () => { axeReady(); tap('z'); g.CRFX.update(0.425); G.craftMsg = 'Crafted the AXE. Thin trees give way now.'; }]];
    for (const [tag, set] of states) {
      set();
      const ts = drawn();
      const out = ts.filter(t => !(t.x0 >= x + 4 && t.x1 <= x + w - 4 && t.top >= y + 4 && t.bottom <= y + h - 4));
      ok(ts.length >= 8 && !out.length, 'drawCraft ' + tag + ': ' + ts.length + ' strings inside CRAFT_RECT' +
         (out.length ? ' (outside: ' + out.map(t => t.s).join(' | ') + ')' : ''));
    }
    g.CRFX.clear();

    // -- wrapLines: the pure rule PARITY compares --
    const m7 = t => t.length * 7;
    const six = 'one two three four five six';
    ok(same(g.wrapLines(six, 70, m7), ['one two', 'three four', 'five six']), 'wrapLines breaks greedily');
    ok(same(g.wrapLines(six, 70, m7, 2), ['one two', 'three f...']) && same(g.wrapLines(six, 70, m7, 1), ['one two...']),
       'wrapLines cuts at maxLines with a fitting ...');
    ok(same(g.wrapLines(six, 70, m7, 3), g.wrapLines(six, 70, m7)), 'a limit that is not reached changes nothing');
    ok(same(g.wrapLines('', 70, m7), []) && same(g.wrapLines('a  b', 70, m7), ['a b']),
       'wrapLines: an empty string draws nothing; double spaces collapse like the pygame .strip()');
  } finally {
    Math.random = realRandom;
    g.CRFX.clear();
    for (const k of Object.keys(G)) if (!(k in keepS)) delete G[k];
    Object.assign(G, keepS);
    Object.assign(G.player, keepPosS);
    Object.assign(G.settings, keepSettings);
    for (const k of Object.keys(keepSettings)) G.settings[k] = keepSettings[k];
  }
  console.log('  craft: ' + (g.RECIPES.length + 1) + ' cells, ' + g.CRAFT_SPARKS + ' sparks, ' +
              (g.CRAFT_FLY_T + g.CRAFT_POP_T).toFixed(2) + ' s animation, reduced motion ' + g.CRAFT_GLOW_T + ' s glow');
}

/* --------------------------------------------- SHELL: BAG, SHOP, BATTLE BAG */
// The overworld BAG, the party picker, the CENTRE shop at every H door and the
// polished battle BAG list: the same input flows the Python RENDER pass drives,
// the pure list builders, and (through a recording 2D context) every string
// each screen draws stays inside its panel. Text width is Courier's 0.6 em.
section('SHELL BAG/SHOP - BAG screen, party picker, CENTRE shop, battle BAG list (headless)');
{
  // A 2D context that records fillText boxes and ignores everything else.
  let texts = [];
  const sizeOf = f => +((/(\d+)px/.exec(f) || [0, 14])[1]);
  const base = {
    font: '14px x', textAlign: 'left', textBaseline: 'alphabetic', fillStyle: '', strokeStyle: '', lineWidth: 1, globalAlpha: 1,
    measureText(s) { return { width: String(s).length * sizeOf(this.font) * 0.6 }; },
    fillText(s, x, y) {
      const px = sizeOf(this.font), w = String(s).length * px * 0.6;
      const x0 = this.textAlign === 'right' ? x - w : this.textAlign === 'center' ? x - w / 2 : x;
      texts.push({ s: String(s), x0, x1: x0 + w, top: y - px * 0.8, bottom: y + px * 0.25 });
    },
    createLinearGradient() { return { addColorStop() {} }; },
    createRadialGradient() { return { addColorStop() {} }; },
    getImageData() { return { data: new Uint8ClampedArray(4) }; }
  };
  // Chunk 5: list and COINS icons. Headless iconCanvas has no canvas to build, so
  // prime the 1x cache with tagged stand-ins and record every drawImage blit
  // (with the index of the next string drawn: the row's name). The stand-ins live
  // only for one recorded draw: draw() unprimes them in a finally, even on a throw.
  let imgs = [];
  base.drawImage = (cv, x, y, w, h) => { imgs.push({ id: cv.iconId, x, y, w, h, ti: texts.length }); };
  const stub = new Proxy(base, { get: (t, k) => (k in t ? t[k] : () => {}), set: (t, k, v) => { t[k] = v; return true; } });
  const draw = fn => {
    texts = []; imgs = [];
    const primed = [];
    try {
      for (const id of Object.keys(g.ICONS)) {
        const key = id + '|1|normal';
        if (!g.ICON_CACHE.has(key)) { g.ICON_CACHE.set(key, { iconId: id }); primed.push(key); }
      }
      g.withCtx(stub, fn);
    } finally {
      for (const key of primed) g.ICON_CACHE.delete(key);
    }
    return texts;
  };
  const rowRects = (x0, y0, w0, rh, n) => Array.from({ length: n }, (_, j) => [x0, y0 + j * rh, w0, rh - 2]);
  const within = (m, [x, y, w, h]) => m.x >= x && m.y >= y && m.x + m.w <= x + w && m.y + m.h <= y + h;
  // Every row icon is 16x16 inside a row rect; the name starts at its right edge + 4 px
  // or later, about level with it; the next string on the row starts 4 px past the
  // name. With coinsIn, exactly one COINS icon lies inside it, its text 4+ px right.
  const iconsOk = (tag, rects, want, coinsIn) => {
    const got = imgs.filter(m => m.id !== 'coins'), bad = [];
    for (const m of got) {
      const nm = texts[m.ti], after = texts[m.ti + 1];
      if (!nm || !rects.some(r => within(m, r)) || m.w !== 16 || m.h !== 16 || nm.x0 < m.x + m.w + 4
          || Math.abs((nm.top + nm.bottom) / 2 - (m.y + 8)) > 3
          || (after && after.top < nm.bottom && after.x0 < nm.x1 + 4)) bad.push(m.id + '@' + m.x + ',' + m.y + (nm ? ' ' + nm.s : ''));
    }
    ok(got.length === want && !bad.length, tag + ': ' + got.length + ' row icons (want ' + want + '), inside their rows, name 4+ px right'
       + (bad.length ? ' (bad: ' + bad.slice(0, 3).join(' | ') + ')' : ''));
    if (coinsIn) {
      const cs = imgs.filter(m => m.id === 'coins'), [cx, cy, cw, ch] = coinsIn;
      const good = cs.filter(m => within(m, [cx + 4, cy + 4, cw - 8, ch - 8]) && texts[m.ti] && texts[m.ti].s.startsWith('COINS ')
        && texts[m.ti].x0 >= m.x + 16 + 4 && texts[m.ti].x0 - m.x === g.COIN_ICON_GAP
        && Math.abs((texts[m.ti].top + texts[m.ti].bottom) / 2 - (m.y + 8)) <= 3);
      ok(cs.length === 1 && good.length === 1, tag + ': the COINS icon sits inside ' + coinsIn + ', its text COIN_ICON_GAP right');
    }
    return got.map(m => m.id);
  };
  const bagWindow = () => {
    const rows = g.bagRows(G.balls, G.bag, G.materials), ent = g.bagEntries(rows);
    const top = g.listTop(rows.length, ent[Math.max(0, Math.min(G.bagCursor, ent.length - 1))], g.BAG_ROWS);
    const win = rows.slice(top, top + g.BAG_ROWS).map(r => r[0]).filter(k => k === 'item' || k === 'mat' || k === 'loot');
    return [win.length, win];
  };
  const bagRowRects = rowRects(g.BAG_RECT[0] + 16, g.BAG_RECT[1] + 56, g.BAG_RECT[2] - 32, g.BAG_ROW_H, g.BAG_ROWS);
  const shopRowRects = rowRects(g.SHOP_RECT[0] + 16, g.SHOP_RECT[1] + 56, g.SHOP_RECT[2] - 32, g.SHOP_ROW_H, g.SHOP_ROWS);
  const bbagRowRects = rowRects(28, 480 - 94 - 3, g.BBAG_SPLIT_X - 40, g.BBAG_ROW_H, g.BBAG_ROWS);
  const kindsSeen = new Set();
  const bagIcons = tag => { const [n, kinds] = bagWindow(); kinds.forEach(k => kindsSeen.add(k)); return iconsOk(tag, bagRowRects, n, g.BAG_RECT); };
  const inside = (ts, [x, y, w, h], pad) => ts.filter(t => !(t.x0 >= x + pad && t.x1 <= x + w - pad && t.top >= y + pad && t.bottom <= y + h - pad));
  const boxed = (tag, ts, rect, need) => {
    const out = inside(ts, rect, 4);
    ok(ts.length >= need && !out.length, tag + ': ' + ts.length + ' strings inside ' + rect + (out.length ? ' (outside: ' + out.slice(0, 3).map(t => t.s).join(' | ') + ')' : ''));
    return ts.map(t => t.s);
  };
  const mons = [['emberling', 12], ['nibbit', 8], ['dripling', 9], ['pyrelash', 40], ['sprigling', 5], ['ironclad', 24]]
    .map(([s, l]) => g.makeMon(s, l));
  const stand = (x, y) => { const p = G.player; p.tx = x; p.ty = y; p.px = x * 32; p.py = y * 32; p.moving = false; p.dir = 'up';
    G.mode = 'overworld'; G.battle = null; G.fade = 0; G.fadeDir = 0; G.dialogue = null; G.shop = null; G.bagPick = null; };
  G.party = mons; G.flags.starter = true;
  const [bx, by, bw, bh] = g.BAG_RECT;

  // Pure list builders.
  const empty = g.bagRows(0, {}, { stone: 0, ore: 0, wall: 0 });
  ok(same(empty.map(r => r[0]), ['head', 'none', 'head', 'mat', 'mat', 'mat', 'head', 'none']) && same(g.bagEntries(empty), [3, 4, 5]),
     'an empty BAG: three sections, (none) for ITEMS and LOOT, the materials selectable');
  const some = g.bagRows(5, { twig: 3, potion: 2, pearl: 1, smoke: 1 }, { stone: 4, ore: 0, wall: 1 });
  ok(same(some.filter(r => r[0] !== 'head').map(r => r[1]), ['ball', 'potion', 'smoke', 'stone', 'ore', 'wall', 'twig', 'pearl']),
     'BAG rows: BALL first, then items, materials and loot in GOODS order');
  ok(same(g.shopRows('buy', {}).map(r => r[0]), g.SHOP_STOCK) && g.shopRows('buy', {})[0][2] === g.BALL_PRICE,
     'BUY lists SHOP_STOCK with BALL at BALL_PRICE');
  ok(same(g.shopRows('sell', { potion: 3, pearl: 2, twig: 12 }), [['twig', 'TWIG', 6, 12], ['pearl', 'PEARL', 30, 2]]),
     'SELL lists owned loot only, with price and count');
  ok(g.shopQtyCap('sell', ['pearl', 'PEARL', 30, 2]) === 2 && g.shopQtyCap('sell', ['twig', 'TWIG', 6, 12]) === g.SHOP_QTY_MAX
     && g.shopQtyCap('buy', ['ball', 'BALL', 20]) === g.SHOP_QTY_MAX, 'the quantity cap is what you own (max 10) when selling');
  let badTop = 0;
  for (let n = 0; n < 30; n++) for (const s of [3, 6, 8]) for (let c = 0; c < n; c++) {
    const t = g.listTop(n, c, s);
    if (!(t >= 0 && t <= c && c < t + s && t + Math.min(s, n) <= n)) badTop++;
  }
  ok(badTop === 0, 'listTop keeps the cursor inside a full window for every list');
  ok(g.fmtMsg(g.BAG_MSG.healed, 'NIBBIT', 20) === 'NIBBIT recovered 20 HP!', 'fmtMsg fills %s and %d in order');

  // The menu's BAG row opens the screen; empty / full / scrolled draw inside the panel.
  stand(12, 107);
  G.balls = 0; G.bag = {}; G.coins = 100; G.materials = { stone: 0, ore: 0, wall: 0 };
  G.mode = 'menu'; G.menu = { cursor: g.MENU_ITEMS.indexOf('BAG') }; G.toast = null;
  g.confirmKey();
  ok(G.mode === 'bag' && G.bagCursor === 0 && !G.toast, 'MENU -> BAG opens the BAG screen');
  let s = boxed('BAG (empty)', draw(g.drawBag), g.BAG_RECT, 8);
  bagIcons('BAG (empty) icons');
  ok(s.includes('COINS 100') && s.filter(t => t === '(none)').length === 2, 'the empty BAG shows COINS and (none) twice');
  g.confirmKey();
  ok(G.mode === 'bag' && !G.bagPick, 'confirm on a material is read-only');
  g.cancelKey();
  ok(G.mode === 'overworld', 'cancel leaves the BAG');
  G.balls = g.BAG_MAX; G.coins = g.COINS_MAX; G.materials = { stone: 999, ore: 999, wall: 999 };
  G.bag = {}; for (const k of Object.keys(g.GOODS)) G.bag[k] = g.BAG_MAX;
  g.openBag();
  s = boxed('BAG (full)', draw(g.drawBag), g.BAG_RECT, 10);
  ok(bagIcons('BAG (full) icons').includes('balls'), 'the BAG BALL row draws the balls icon (iconId maps ball -> balls)');
  ok(s.includes('COINS ' + g.COINS_MAX) && s.includes('x' + g.BAG_MAX), 'the full BAG shows 99999 coins and x999');
  const nEnt = g.bagEntries(g.bagRows(G.balls, G.bag, G.materials)).length;
  for (let i = 0; i < nEnt + 3; i++) g.moveCursor(0, 1);
  ok(G.bagCursor === nEnt - 1, 'the BAG cursor clamps at the last row');
  s = boxed('BAG (scrolled)', draw(g.drawBag), g.BAG_RECT, 8);
  bagIcons('BAG (scrolled) icons');
  ok(same([...kindsSeen].sort(), ['item', 'loot', 'mat']), 'BAG icons were checked on item, mat and loot rows');
  ok(s.includes('SHADOW SILK') && !s.includes('BALL') && s.join(' ').includes(g.GOODS.shadowsilk.desc),
     'scrolled to the end: the last loot and its description show, BALL has scrolled off');

  // The POTION party picker.
  G.bag = { potion: 2, superpotion: 1 }; G.balls = 3;
  for (const m of mons) m.hp = m.maxhp;
  mons[1].hp = 3; mons[2].hp = 0;
  g.openBag(); g.moveCursor(0, 1); g.confirmKey();
  ok(G.bagPick === 'potion', 'confirm on POTION opens the party picker');
  s = boxed('party picker', draw(g.drawBag).slice(-14), g.BAG_PICK_RECT, 13);
  ok(s.includes('FAINTED') && s.includes('Use POTION on which monster?'), 'the picker names the item and shows FAINTED');
  g.confirmKey();
  ok(G.bagPick === 'potion' && G.bag.potion === 2 && G.bagMsg === g.BAG_MSG.full, 'full HP: refused, nothing used, the picker stays open');
  g.moveCursor(0, 2); g.confirmKey();
  ok(mons[2].hp === 0 && G.bag.potion === 2 && G.bagMsg === g.BAG_MSG.fainted, 'fainted: never revived, nothing used');
  g.moveCursor(0, -1); g.confirmKey();
  const healed = Math.min(20, mons[1].maxhp - 3);
  ok(mons[1].hp === 3 + healed && G.bag.potion === 1 && !G.bagPick && G.bagMsg === mons[1].name + ' recovered ' + healed + ' HP!',
     'a POTION heals min(20, missing), uses one and closes the picker');
  boxed('BAG + message', draw(g.drawBag), g.BAG_RECT, 5);
  g.moveCursor(0, 1); g.confirmKey(); g.cancelKey();
  ok(G.mode === 'bag' && !G.bagPick, 'cancel closes the picker first');
  g.cancelKey();
  ok(G.mode === 'overworld', 'then cancel leaves the BAG');

  // The CENTRE shop at every H door.
  const doors = [];
  g.MAP.forEach((row, y) => [...row].forEach((ch, x) => { if (ch === 'H') doors.push([x, y]); }));
  let opened = 0;
  for (const [fx, fy] of doors) {
    stand(fx, fy + 1); g.interact();
    while (G.mode === 'dialogue') g.confirmKey();
    if (G.mode === 'shop' && G.shop.page === 'offer') opened++;
    g.cancelKey();
  }
  ok(opened === doors.length && G.mode === 'overworld', 'every H door (' + doors.length + ') offers SHOP / LEAVE after the heal');
  stand(12, 107); g.interact();
  ok(same(G.dialogue.lines.slice(0, 2), g.CENTRE_HEAL), 'the heal lines come first');
  while (G.mode === 'dialogue') g.confirmKey();
  const [mx, my, mw] = g.SHOP_MENU_RECT;
  s = boxed('SHOP / LEAVE', draw(g.drawShop), [mx, my, mw, 42 + 26 * 2 + 8], 3);
  ok(same(s.slice(1), g.SHOP_OFFER), 'the offer menu lists SHOP and LEAVE');
  iconsOk('SHOP / LEAVE icons', [], 0, [mx, my, mw, 42 + 26 * 2 + 8]);
  g.moveCursor(0, 1); g.confirmKey();
  ok(G.mode === 'overworld' && G.shop === null, 'LEAVE closes the shop');
  g.openShop(); g.confirmKey();
  s = boxed('BUY / SELL / BACK', draw(g.drawShop), [mx, my, mw, 42 + 26 * 3 + 8], 4);
  ok(same(s.slice(1), g.SHOP_MAIN), 'SHOP opens BUY / SELL / BACK');
  iconsOk('BUY / SELL / BACK icons', [], 0, [mx, my, mw, 42 + 26 * 3 + 8]);
  G.coins = 1000; G.balls = 5; G.bag = {};
  g.confirmKey();
  ok(G.shop.page === 'buy', 'BUY opens the buy list');
  s = boxed('BUY', draw(g.drawShop), g.SHOP_RECT, 15);
  iconsOk('BUY icons', shopRowRects, Math.min(g.SHOP_ROWS, g.SHOP_STOCK.length), g.SHOP_RECT);
  {
    // Worst case (stub widths, 0.6 em): the widest "N each" (13 px, right edge x+262)
    // against "have 999" (11 px, right edge x+SHOP_HAVE_DX), and that against the
    // widest "< 10 >" (15 px, centred on x+374).
    const eachEnd = 262, widestEach = Math.max(...g.shopRows('buy', {}).map(r => (r[2] + ' each').length));
    const haveLeft = g.SHOP_HAVE_DX - ('have ' + g.BAG_MAX).length * 11 * 0.6;
    const qtyLeft = 374 - ('< ' + g.SHOP_QTY_MAX + ' >').length * 15 * 0.6 / 2;
    ok(eachEnd - widestEach * 13 * 0.6 > 0 && eachEnd + 4 <= haveLeft && g.SHOP_HAVE_DX + 4 <= qtyLeft,
       'BUY: "each" ends 4+ px before "have ' + g.BAG_MAX + '" (gap ' + (haveLeft - eachEnd).toFixed(1)
       + ' px), and "have" ends 4+ px before the quantity');
  }
  ok(g.SHOP_STOCK.every(k => s.includes(g.bagName(k))) && s.includes(g.BALL_PRICE + ' each'), 'BUY lists the stock with prices');
  for (let i = 0; i < 13; i++) g.moveCursor(1, 0);
  ok(G.shop.qty === g.SHOP_QTY_MAX, 'RIGHT raises the quantity to SHOP_QTY_MAX and stops');
  for (let i = 0; i < 13; i++) g.moveCursor(-1, 0);
  ok(G.shop.qty === 1, 'LEFT lowers it to 1 and stops');
  g.moveCursor(1, 0); g.moveCursor(1, 0);
  s = boxed('BUY with a quantity', draw(g.drawShop), g.SHOP_RECT, 15);
  ok(s.includes('< 3 >') && s.includes('= 60'), 'the quantity and total show');
  g.confirmKey();
  ok(G.balls === 8 && G.coins === 940 && same(G.bag, {}) && G.shop.msg === 'Bought 3 BALL for 60 coins.',
     'buying 3 BALLs fills the balls counter and costs exactly 60');
  g.moveCursor(0, 1);
  ok(G.shop.qty === 1 && G.shop.msg === '', 'moving rows resets the quantity');
  G.coins = 59; g.confirmKey();
  ok(same(G.bag, {}) && G.coins === 59 && G.shop.msg === 'Not enough coins.', 'a GREAT BALL at 59 coins: Not enough coins.');
  boxed('BUY refusal', draw(g.drawShop), g.SHOP_RECT, 10);
  G.coins = 1000; G.bag = { greatball: g.BAG_MAX }; g.confirmKey();
  ok(G.bag.greatball === g.BAG_MAX && G.coins === 1000 && G.shop.msg === 'Your bag is full.', 'a GREAT BALL with 999 owned: Your bag is full.');
  g.cancelKey();
  ok(G.shop.page === 'main' && G.shop.cursor === 0, 'cancel from BUY returns to the menu on BUY');
  G.bag = { pearl: 2, twig: 12, potion: 3 };
  g.moveCursor(0, 1); g.confirmKey();
  ok(G.shop.page === 'sell', 'SELL opens the sell list');
  s = boxed('SELL', draw(g.drawShop), g.SHOP_RECT, 10);
  iconsOk('SELL icons', shopRowRects, g.shopRows('sell', G.bag).length, g.SHOP_RECT);
  ok(s.includes('TWIG') && s.includes('PEARL') && !s.includes('POTION'), 'SELL lists owned loot only');
  for (let i = 0; i < 13; i++) g.moveCursor(1, 0);
  ok(G.shop.qty === g.SHOP_QTY_MAX, 'selling TWIG (12 owned) caps the quantity at 10');
  let c0 = G.coins; g.confirmKey();
  ok(G.coins === c0 + 60 && G.bag.twig === 2, 'selling 10 TWIG pays exactly 60');
  g.moveCursor(0, 1); for (let i = 0; i < 5; i++) g.moveCursor(1, 0);
  ok(G.shop.qty === 2, 'selling PEARL (2 owned) caps the quantity at 2');
  g.confirmKey(); g.moveCursor(0, -1); g.moveCursor(1, 0); g.confirmKey();
  ok(same(G.bag, { potion: 3 }) && G.shop.msg.endsWith(g.SHOP_MSG.empty), 'selling the last loot says there is nothing left to sell');
  s = boxed('SELL (empty)', draw(g.drawShop), g.SHOP_RECT, 3);
  iconsOk('SELL (empty) icons', shopRowRects, 0, g.SHOP_RECT);
  ok(s.includes(g.SHOP_MSG.empty), 'an empty SELL list says so');
  G.coins = g.COINS_MAX - 5; G.bag = { relicshard: 1 }; g.confirmKey();
  ok(same(G.bag, { relicshard: 1 }) && G.coins === g.COINS_MAX - 5 && G.shop.msg === g.SHOP_MSG.purse, 'a sale past COINS_MAX is refused');
  g.cancelKey();
  ok(G.shop.page === 'main' && G.shop.cursor === 1, 'cancel from SELL returns to the menu on SELL');
  g.moveCursor(0, 1); g.confirmKey();
  ok(G.mode === 'overworld' && G.shop === null, 'BACK leaves the shop');
  // Touch reaches the same seams: the D-pad and A/B buttons press the canonical keys.
  stand(12, 107); g.openShop();
  g.press('z'); g.release('z'); g.press('z'); g.release('z');
  g.press('arrowright'); g.release('arrowright');
  ok(G.shop.page === 'buy' && G.shop.qty === 2, 'press()/release() (keyboard and touch) drive the shop: A, A, RIGHT');
  g.press('x'); g.release('x'); g.press('x'); g.release('x');
  ok(G.mode === 'overworld', 'B, B backs out of the shop');

  // The polished battle BAG list, and the 3D cues it feeds.
  stand(12, 107);
  for (const m of mons) m.hp = m.maxhp;
  G.balls = 999; G.bag = {}; for (const k of g.BATTLE_BAG) G.bag[k] = g.BAG_MAX;
  g.startBattle(g.makeMon('sprigling', 5), {});
  const settle = () => { for (let i = 0; i < 3000; i++) { const b = G.battle; if (!b || (b.phase === 'menu' && !b.step && !b.queue.length)) break;
    g.updateBattle(1 / 60); b.dispMine = b.mine.hp; b.dispFoe = b.foe.hp; if (b.step && b.step.t === 'msg') b.step = null; } };
  settle();
  let b = G.battle;
  b.cursor = 1; g.confirmKey();
  ok(b.phase === 'bag', 'BAG opens the battle BAG list');
  const panel = [16, 480 - 118, 640 - 32, 102];   // the battle's bottom panel (W=640, H=480)
  for (const cur of [0, g.battleBagItems().length - 1]) {
    b.cursor = cur;
    const low = draw(g.drawBattle).filter(t => t.top >= 480 - 118);
    boxed('battle BAG (cursor ' + cur + ')', low, panel, 7);
    ok(low.some(t => t.s === g.bagName(g.battleBagItems()[cur])), 'the selected item is listed');
    imgs = imgs.filter(m => m.y >= 480 - 118);
    iconsOk('battle BAG (cursor ' + cur + ') icons', bbagRowRects, Math.min(g.BBAG_ROWS, g.battleBagItems().length));
  }
  // The longest real battle BAG name, after its icon, still ends 4+ px left of x999 (stub widths: 0.6 em).
  const longest = Math.max(...['ball', ...g.BATTLE_BAG].map(k => g.bagName(k).length)) * 13 * 0.6;
  ok(50 + g.LIST_ICON_GAP + longest + 4 <= g.BBAG_SPLIT_X - 30 - ('x' + g.BAG_MAX).length * 13 * 0.6,
     'battle BAG: the longest name plus its count end left of BBAG_SPLIT_X');
  g.cancelKey();
  ok(b.phase === 'menu', 'cancel closes the battle BAG');
  // A POTION queues a 'heal' action (actor mine) from inside its first step: glow, then the message.
  b.mine.hp = b.mine.maxhp - 30;
  g.takeTurn(b, { t: 'item', item: 'potion' });
  ok(b.queue[0].t === 'do' && b.queue[1].t === 'msg', 'the POTION queue still opens with its step, then the message');
  let sawHeal = null, healBeforeMsg = false;
  for (let i = 0; i < 600 && !sawHeal; i++) {
    g.updateBattle(1 / 60);
    if (b.step && b.step.t === 'action' && b.action && b.action.kind === 'heal') { sawHeal = g.battleSnapshot().action; healBeforeMsg = b.queue.some(q => q.t === 'msg' && / recovered /.test(q.s)); }
    if (b.step && b.step.t === 'msg') b.step = null;
  }
  ok(sawHeal && sawHeal.actor === 'mine' && sawHeal.target === 'mine' && healBeforeMsg,
     'the battle snapshot carries kind heal on the active monster, before "recovered"');
  settle();
  // A GREAT BALL throw carries item greatball on its throw and catch actions; a BALL carries item ball.
  g.setCatchRoll(() => ({ caught: false, shakes: 1 }));
  try {
    for (const item of ['greatball', 'ball']) {
      const kinds = {};
      g.takeTurn(b, { t: 'ball', item });
      for (let i = 0; i < 3000; i++) {
        g.updateBattle(1 / 60);
        if (b.action && (b.action.kind === 'throw' || b.action.kind === 'catch')) kinds[b.action.kind] = g.battleSnapshot().action.item;
        if (b.step && b.step.t === 'msg') b.step = null;
        if (b.phase === 'menu' && !b.step && !b.queue.length) break;
      }
      ok(kinds.throw === item && kinds.catch === item, 'a ' + item + ' throw and catch carry item ' + item + ' (' + JSON.stringify(kinds) + ')');
    }
  } finally { g.setCatchRoll(null); }
  G.battle = null; G.mode = 'overworld';
  G.bag = {}; G.coins = g.START_COINS; G.balls = 20; G.party = []; G.flags.starter = false;
  console.log('  bag/shop: ' + doors.length + ' H doors open the shop; BAG, picker, BUY/SELL and the battle BAG keep text inside their panels');
}

/* ----------------------------------------------------------------- CAVE */
section('CAVE — lantern, tension, the GLOOMSTALK\'s hunt, the PULSE (DARK CAVE horror kit)');
{
  const CNPC = new Set(g.NPCS.map(n => n.x + ',' + n.y));
  const SEAMS_OPEN = {};
  g.MAP.forEach((r, y) => [...r].forEach((c, x) => { if (c === g.SEAM) SEAMS_OPEN[x + ',' + y] = 'c'; }));
  const L = g.LANTERN, T = g.TENSION, HA = g.HUNT_AI, PU = g.PULSE;
  const NONE = new Set();
  const D4 = [[0, -1], [0, 1], [-1, 0], [1, 0]];
  const eq = (a, b) => JSON.stringify(a) === JSON.stringify(b);

  // Shortest player path from start to the north mouth row (y=24).
  function trunkRoute(avoid, edits, start) {
    avoid = avoid || NONE; edits = edits || {}; start = start || [42, 39];
    const prev = new Map([[start + '', null]]);
    let frontier = [start];
    while (frontier.length) {
      const nxt = [];
      for (const [x, y] of frontier) {
        if (y === 24) {
          const out = []; let cur = [x, y];
          while (cur) { out.unshift(cur); cur = prev.get(cur + ''); }
          return out;
        }
        for (const [dx, dy] of D4) {
          const n = [x + dx, y + dy];
          if (prev.has(n + '') || avoid.has(n + '') || n[1] < 23 || n[1] > 40) continue;
          if (g.tileBlocked(n[0], n[1], 'none', edits, NONE, CNPC)) continue;
          prev.set(n + '', [x, y]); nxt.push(n);
        }
      }
      frontier = nxt;
    }
    return null;
  }

  function caveGame(x, y) {
    G.party = [g.makeMon('pyrelash', 26)]; G.balls = 20;
    G.flags = { starter: true, gym: false, huntBeaten: 0, pick: 0 };
    G.materials = g.zeroMaterials(); G.edits = {}; G.picked = new Set();
    g.loadCave(null);
    G.mode = 'overworld'; G.battle = null; G.fade = 0; G.fadeDir = 0; G.fadeCb = null;
    G.dialogue = null; G.pendingEncounter = null; G.toast = null; G.building = false;
    const p = G.player;
    p.tx = x; p.ty = y; p.px = x * 32; p.py = y * 32; p.moving = false; p.dir = 'up';
    g.syncCave();
  }

  function stepTo(x, y) {
    const p = G.player;
    const k = y < p.ty ? 'arrowup' : y > p.ty ? 'arrowdown' : x < p.tx ? 'arrowleft' : 'arrowright';
    g.press(k); g.release(k);
    g.update(1 / 60);
    for (let i = 0; i < 60 && p.moving; i++) g.update(1 / 60);
    return G.mode;
  }

  function finish(result) {
    g.endBattle(G.battle, result);
    for (let i = 0; i < 2000 && (G.battle || G.fadeDir); i++) {
      g.update(1 / 60);
      if (G.battle && G.battle.step && G.battle.step.t === 'msg') G.battle.step = null;
    }
  }

  // --- tables ---
  ok(g.ENC_BASE === 0.14, 'ENC_BASE keeps the old 0.14 wild roll');
  ok(g.MENU_ITEMS.indexOf('PULSE') === 4 && g.MENU_ITEMS.indexOf('CLOSE') === 5, 'PULSE is menu row 4, CLOSE row 5');
  const oil = g.RECIPES.find(r => r.id === 'oil'), pul = g.RECIPES.find(r => r.id === 'pulse');
  ok(eq(oil, { id: 'oil', out: 'lantern', count: L.oil, needs: { ore: 1 }, cap: L.max }), 'OIL: 1 ORE -> +50 lantern, capped');
  ok(eq(pul, { id: 'pulse', out: 'pulse', count: 1, needs: { ore: 1, stone: 2 }, cap: PU.max }), 'PULSE: 1 ORE + 2 STONE, carry 3');

  // --- 1. lantern ---
  const radii = Array.from({ length: 101 }, (_, c) => g.lanternRadius(c));
  ok(Math.min(...radii) >= L.rMin && radii[0] === L.rMin && radii[100] === L.rMax, 'the lantern never shrinks below R_MIN');
  ok(radii.every((r, i) => i === 0 || radii[i - 1] <= r), 'lanternRadius is monotone');
  ok(eq([0, 1, 12, 13, 50, 99, 100, 150, -5].map(g.lanternBucket), [0, 1, 1, 2, 4, 8, 8, 8, 0]), 'lanternBucket: ceil to eighths');
  ok(g.lanternStep(100, true) === 99 && g.lanternStep(0, true) === 0 && g.lanternStep(57, false) === 57 &&
     g.lanternStep(150, false) === 100, 'lanternStep drains 1 in the cave only');
  caveGame(43, 33);
  for (let i = 0; i < 5; i++) g.caveStep();
  ok(G.lantern === 95, 'five cave steps drain the lantern to 95 (got ' + G.lantern + ')');
  G.player.ty = 45; g.caveStep();
  ok(G.lantern === 95, 'a step outside the cave never drains it');
  g.healParty();
  ok(G.lantern === 100, 'healParty refills it');
  caveGame(43, 33);
  G.materials.ore = 2; G.lantern = 40;
  const oi = g.RECIPES.indexOf(oil), pi = g.RECIPES.indexOf(pul);
  ok(g.craftRecipe(oi) && G.lantern === 90 && G.materials.ore === 1 && G.craftMsg === 'Lantern refilled to 90%.',
     'OIL refills 40 -> 90 for 1 ORE: ' + G.craftMsg);
  ok(g.craftRecipe(oi) && G.lantern === 100 && G.materials.ore === 0, 'a second OIL caps at 100');
  G.materials.ore = 1;
  ok(!g.craftRecipe(oi) && G.materials.ore === 1, 'OIL is refused at a full lantern, spending nothing');
  G.materials.ore = 5; G.materials.stone = 10;
  const made = [0, 1, 2, 3].map(() => g.craftRecipe(pi));
  ok(eq(made, [true, true, true, false]) && G.pulses === 3 && G.materials.ore === 2 && G.materials.stone === 4,
     'PULSE crafts to its cap of 3, then refuses without spending');

  // --- 2. tension ---
  ok(eq([100, 50, 49, 20, 19, 0].map(c => g.tensionStep(10, c, false, false) - 10), [1, 1, 2, 2, 4, 4]),
     'tension climbs +1 base, +1 under 50% light, +2 more under 20%');
  ok(g.tensionStep(10, 100, true, false) === 14 && g.tensionStep(10, 0, true, true) === 8, '+3 hunted; safe -2');
  ok(eq(['win', 'run', 'pulse', 'nonsense'].map(e => g.tensionEvent(50, e)), [40, 55, 35, 50]), 'tensionEvent table');
  ok(g.encounterRate(0) === 0.14 && Math.abs(g.encounterRate(100) - 0.245) < 1e-12, 'encounterRate 0.14 .. 0.245');
  // Same number of Math.random() calls at any tension.
  const realRandom = Math.random;
  const calls = {};
  try {
    for (const v of [0.5, 0.2, 0.1]) for (const t of [0, 100]) {
      caveGame(20, 30); G.tension = t;
      let n = 0; Math.random = () => { n++; return v; };
      g.tryEncounter();
      calls[v + '/' + t] = [n, !!G.pendingEncounter];
    }
  } finally { Math.random = realRandom; }
  ok(eq(calls['0.5/0'], calls['0.5/100']) && eq(calls['0.5/0'], [1, false]) && eq(calls['0.1/0'], calls['0.1/100']) &&
     calls['0.1/0'][1], 'tryEncounter makes the same Math.random() calls at tension 0 and 100: ' + JSON.stringify(calls));
  ok(eq(calls['0.2/0'], [1, false]) && calls['0.2/100'][1], 'a 0.2 roll misses calm but hits at full tension');
  G.pendingEncounter = null; G.fadeDir = 0; G.fadeCb = null; G.fade = 0;

  // --- 3. domain ---
  const dom = [];
  for (let y = 0; y < g.MAP_H; y++) for (let x = 0; x < g.MAP_W; x++) if (g.stalkerWalkable(x, y, {}, NONE, CNPC)) dom.push([x, y]);
  ok(dom.length === 505, 'the stalker domain is 505 tiles (got ' + dom.length + ')');
  let rowBad = false;
  for (const ed of [{}, SEAMS_OPEN]) for (const y of [24, 25, 26, 37, 38, 39]) for (let x = 0; x < g.MAP_W; x++)
    rowBad = rowBad || g.stalkerWalkable(x, y, ed, NONE, CNPC);
  ok(!rowBad, 'it never stands on a chokepoint or mouth row');
  ok(!g.stalkerWalkable(42, 31, {}, NONE, CNPC), "CAVER NOX's tile is solid to it");
  const legs = HA.patrol.map((w, i) => g.caveDist(w, {}, NONE, CNPC).get(HA.patrol[(i + 1) % 12] + ''));
  ok(HA.patrol.every(([x, y]) => g.stalkerWalkable(x, y, {}, NONE, CNPC)) && legs.every(v => v !== undefined),
     'every patrol waypoint is walkable and every leg connected: ' + legs);

  // --- 4. can't block ---
  const blockers = dom.filter(([x, y]) => !trunkRoute(new Set([[x, y], ...D4.map(([dx, dy]) => [x + dx, y + dy])].map(p => p + ''))));
  ok(blockers.length === 0, "even solid with its 4 neighbours, no stalker position seals the trunk: " + blockers.slice(0, 3));
  caveGame(43, 33); G.stalker = g.newStalker(43, 32);
  ok(!g.blockedFor(43, 32), 'the stalker is never in blockedFor');

  // --- 5. always completable ---
  const route = trunkRoute();
  let finished = 0, worst = 0, contacts = 0;
  dom.forEach(([sx, sy], si) => {
    const rng = g.mulberry32(si);
    let st = g.newStalker(sx, sy), rest = 0, i = 0, steps = 0, c = 0;
    while (i < route.length - 1 && steps < 400) {
      steps++;
      const nxt = route[i + 1];
      let hit;
      if (st && g.bump(st, nxt)) hit = true;
      else {
        i++; hit = false;
        if (rest > 0) {
          rest--;
          if (rest === 0) { const sp = g.stalkerSpawn(route[i], {}, NONE, CNPC); st = g.newStalker(sp[0], sp[1]); }
        } else if (st) {
          const r = g.stalkerTick(st, route[i], 0, 100, {}, NONE, CNPC, rng);
          st = r[0]; hit = r[1] === 'lunge';
        }
      }
      if (hit) { c++; st = null; rest = HA.restLose; i = 0; }
    }
    if (i === route.length - 1) finished++;
    contacts += c; worst = Math.max(worst, c);
  });
  ok(finished === dom.length && worst <= 1, 'zero light, max tension, no PULSE: every start crosses with at most one lost fight (' +
     finished + '/' + dom.length + ', worst ' + worst + ')');
  console.log('  always completable: ' + finished + '/' + dom.length + ' starts cross (' + contacts + ' contacts); ' +
              "can't block: all " + dom.length + ' positions leave the trunk open');

  // --- 6. light shield ---
  {
    const prng = g.mulberry32(99), srng = g.mulberry32(3);
    let pp = [43, 32], st = g.newStalker(38, 30), lunges = 0, bad = 0;
    for (let k = 0; k < 1000; k++) {
      const opts = D4.map(([dx, dy]) => [pp[0] + dx, pp[1] + dy]).filter(([x, y]) => y >= 26 && y <= 37 &&
        !g.tileBlocked(x, y, 'none', {}, NONE, CNPC) && !(x === st.x && y === st.y));
      if (opts.length) pp = opts[Math.floor(prng() * opts.length)];
      const charge = 50 + Math.floor(prng() * 51), tension = Math.floor(prng() * 75);
      const before = [st.x, st.y];
      const [s2, ev] = g.stalkerTick(st, pp, charge, tension, {}, NONE, CNPC, srng);
      st = s2;
      if (ev === 'lunge') lunges++;
      const man = Math.abs(st.x - pp[0]) + Math.abs(st.y - pp[1]);
      if ((st.x !== before[0] || st.y !== before[1]) && ev !== 'retreat' && man < g.keepOut(charge, tension)) bad++;
    }
    ok(lunges === 0 && bad === 0, '1000 ticks at >= 50% light, tension < 75: no lunge, no move inside keepOut (' + lunges + ', ' + bad + ')');
  }
  let st = Object.assign(g.newStalker(42, 32), { grace: 3 });
  const gseq = [];
  for (let k = 0; k < 4; k++) {
    const r = g.stalkerTick(st, [43, 32], 0, 100, {}, NONE, CNPC, g.mulberry32(1));
    st = r[0]; st.x = 42; st.y = 32; gseq.push(r[1]);
  }
  ok(!gseq.slice(0, 2).includes('lunge') && gseq[2] === 'lunge', 'no lunge during grace, then the lunge: ' + gseq);

  // --- 7. determinism ---
  function trace(seed) {
    const rng = g.mulberry32(seed);
    const sp = g.stalkerSpawn([43, 30], {}, NONE, CNPC);
    let s = g.newStalker(sp[0], sp[1]);
    const walk = [[43, 30], [44, 30], [45, 30], [46, 30], [47, 30], [48, 30]];
    const out = [];
    for (let k = 0; k < 300; k++) {
      const pp = walk[Math.floor(k / 25) % walk.length];
      const r = g.stalkerTick(s, pp, Math.max(0, 100 - Math.floor(k / 2)), Math.min(100, Math.floor(k / 3)), {}, NONE, CNPC, rng);
      s = r[0];
      out.push([s.x, s.y, s.mode, s.stun, r[1]]);
    }
    return out;
  }
  ok(eq(trace(7), trace(7)) && !eq(trace(7), trace(8)), 'the same seed replays an identical 300-tick trace');
  const r1 = g.mulberry32(1);
  ok(eq([r1(), r1(), r1()].map(v => Math.round(v * 1e6) / 1e6), [0.627074, 0.002736, 0.527447]), 'mulberry32(1) reference values');

  // --- 8. pace, sense, no movement without a step ---
  st = g.newStalker(...HA.lair);
  const srng = g.mulberry32(11), moved = [];
  for (let k = 0; k < 200; k++) {
    const b = [st.x, st.y];
    st = g.stalkerTick(st, [42, 25], 100, 0, {}, NONE, CNPC, srng)[0];
    moved.push([st.tick, st.x !== b[0] || st.y !== b[1]]);
  }
  const nMoved = moved.filter(m => m[1]).length;
  ok(moved.every(([t, m]) => !m || t % 2 === 0) && nMoved >= 70 && nMoved <= 100, 'patrol moves only on every other step (' + nMoved + '/100)');
  st = Object.assign(g.newStalker(20, 30), { mode: 'hunt' });
  const hm = [];
  for (let k = 0; k < 10; k++) {
    const b = [st.x, st.y];
    st = g.stalkerTick(st, [8, 30], 0, 0, {}, NONE, CNPC, g.mulberry32(1))[0];
    hm.push([st.tick, st.x !== b[0] || st.y !== b[1]]);
  }
  ok(hm.every(([t, m]) => !m || t % 5 !== 4) && hm.filter(m => m[1]).length === 8, 'hunting moves 4 steps in 5');
  ok(eq([[100, 0], [50, 0], [0, 0], [0, 100], [100, 24], [100, 25]].map(([c, t]) => g.stalkerSense(c, t)), [4, 6, 8, 12, 4, 5]),
     'stalkerSense table');
  caveGame(43, 33);
  G.stalker = Object.assign(g.newStalker(30, 30), { mode: 'hunt' });
  const snapSt = JSON.stringify(G.stalker);
  for (let k = 0; k < 300; k++) g.update(1 / 60);
  ok(JSON.stringify(G.stalker) === snapSt && G.lantern === 100, 'standing still: the stalker never moves, the lantern never drains');

  // --- 9. PULSE ---
  let pr = g.pulseApply(g.newStalker(10, 28), [10, 31], {}, NONE, CNPC);
  ok(!pr[1] && pr[0].stun === 0, 'the PULSE reaches by path, not through rock');
  pr = g.pulseApply(g.newStalker(12, 31), [10, 31], {}, NONE, CNPC);
  const dd = g.caveDist([10, 31], {}, NONE, CNPC, true);
  ok(pr[1] && pr[0].stun === PU.stun && dd.get(pr[0].x + ',' + pr[0].y) > dd.get('12,31'), 'a hit stuns and shoves it further off');
  caveGame(20, 30);
  G.stalker = Object.assign(g.newStalker(21, 30), { stun: 5 });
  ok(stepTo(21, 30) === 'overworld' && G.player.tx === 21 && !G.battle, 'you walk straight past a stunned stalker');
  caveGame(20, 30);
  G.stalker = g.newStalker(30, 30);
  const before0 = JSON.stringify([G.stalker, G.tension, G.pulses]);
  G.mode = 'menu'; G.menu = { cursor: 4 };
  g.confirmKey();
  ok(JSON.stringify([G.stalker, G.tension, G.pulses]) === before0 && G.mode === 'menu' && G.toast.s.includes('No PULSE'),
     'PULSE with 0 charges: a toast and no state change');
  G.pulses = 2; G.tension = 40;
  g.confirmKey();
  ok(G.pulses === 1 && G.tension === 25 && G.mode === 'overworld' && G.toast.s.includes('nothing.'),
     'a PULSE with nothing in reach is still spent');
  ok(g.menuLabel('PULSE') === 'PULSE x1', 'the menu row reads PULSE x1');
  caveGame(20, 30);
  G.lantern = 0; G.tension = 100; G.pulses = 1; G.stalker = g.newStalker(22, 30);
  ok(stepTo(21, 30) === 'overworld' && !G.battle && G.pulses === 0 && G.stalker.stun > 0,
     'a lunge with a PULSE carried fires it by reflex');
  caveGame(20, 30);
  G.pulses = 1; G.stalker = g.newStalker(21, 30);
  g.setScareCalm(false);
  ok(stepTo(21, 30) === 'battle' && G.battle.hunt && G.pulses === 1 && G.player.tx === 20,
     'bumping into it is a deliberate fight, and never spends a PULSE');

  // --- 10. handoff ---
  ok(G.battle.foe.id === g.HUNT.species && G.battle.foe.level === g.huntLevel([26]), 'the hunt is GLOOMSTALK at huntLevel(party)');
  caveGame(20, 30);
  G.lantern = 0; G.tension = 100; G.stalker = g.newStalker(22, 30);
  let n = 0;
  Math.random = () => { n++; return realRandom(); };
  try { stepTo(21, 30); } finally { Math.random = realRandom; }
  ok(G.mode === 'battle' && G.battle.hunt && !G.pendingEncounter, 'a lunge on dark grass starts the hunt and skips the wild roll');
  finish('win');
  ok(G.huntGone && !G.stalker && G.tension === 0 && G.mode === 'overworld', 'win: the stalker is gone, tension 0');
  for (let k = 0; k < 100; k++) g.caveStep();
  ok(!G.stalker, 'a beaten stalker stays gone');
  g.healParty();
  ok(!G.huntGone, '...until healParty');
  caveGame(20, 30); G.stalker = g.newStalker(21, 30); stepTo(21, 30); finish('run');
  ok(G.huntRest === HA.restRun && !G.stalker, 'run: it rests ' + HA.restRun + ' cave steps');
  for (let k = 0; k < HA.restRun - 1; k++) g.caveStep();
  const stillGone = !G.stalker;
  g.caveStep();
  const sp = g.stalkerSpawn([G.player.tx, G.player.ty], G.edits, G.picked, g.npcTiles());
  ok(stillGone && G.stalker && G.stalker.x === sp[0] && G.stalker.y === sp[1], 'it returns, far away, when the rest runs out');
  caveGame(20, 30); G.lastCentre = [12, 59]; G.lantern = 3; G.stalker = g.newStalker(21, 30); stepTo(21, 30); finish('lose');
  ok(G.huntRest === HA.restLose && G.player.tx === 12 && G.player.ty === 59 && G.lantern === 100 && !G.stalker && !G.caveIn,
     'lose: the normal whiteout, lantern refilled, the stalker rests ' + HA.restLose);
  G.mode = 'overworld'; G.dialogue = null;
  let seen2 = false, inCaveSteps = 0;
  G.player.tx = 42; G.player.ty = 39;
  for (const [x, y] of route.slice(1)) {
    G.player.tx = x; G.player.ty = y; g.caveStep();
    if (g.inCave(y)) inCaveSteps++;
    seen2 = seen2 || !!G.stalker;
  }
  ok(!seen2 && G.huntRest === HA.restLose - inCaveSteps, 'walking back in, the whole trunk crossing is stalker-free');
  caveGame(20, 30); G.stalker = g.newStalker(30, 30); G.tension = 50;
  g.startBattle(g.makeMon('nocturn', 22), {});
  finish('win');
  ok(G.stalker.grace === HA.grace && G.tension === 40, 'a wild win in the cave: grace, tension -10');

  // --- 11. save round-trip ---
  caveGame(43, 33);
  Object.assign(G, { lantern: 37, tension: 44, pulses: 2, huntRest: 12, huntGone: true });
  ok(g.saveGame(), 'save with the cave counters');
  const raw = JSON.parse(localStorage.getItem('monster-trail-save-v1'));
  ok(eq(raw.cave, { lantern: 37, tension: 44, pulses: 2, rest: 12, gone: true }), 'the save carries cave=' + JSON.stringify(raw.cave));
  caveGame(10, 100);
  ok(g.loadGame() && eq([G.lantern, G.tension, G.pulses, G.huntRest, G.huntGone], [37, 44, 2, 12, true]) && !G.stalker,
     'the cave counters round-trip');
  for (const [caveRaw, want, label] of [[undefined, [100, 0, 0, 0, false], 'an old save'],
                                        [[], [100, 0, 0, 0, false], 'a non-object cave'],
                                        [{ lantern: 'abc', tension: -5, pulses: 99, rest: null, gone: 'yes' }, [100, 0, 3, 0, false], 'garbage'],
                                        [{ lantern: 12.9, tension: '30', pulses: true, rest: 999, gone: true }, [12, 30, 0, 80, true], 'odd types']]) {
    const r2 = Object.assign({}, raw);
    if (caveRaw === undefined) delete r2.cave; else r2.cave = caveRaw;
    localStorage.setItem('monster-trail-save-v1', JSON.stringify(r2));
    ok(g.loadGame() && eq([G.lantern, G.tension, G.pulses, G.huntRest, G.huntGone], want), label + ' loads as ' + want);
  }
  localStorage.setItem('monster-trail-save-v1', JSON.stringify(Object.assign({}, raw, { cave: { lantern: 80, rest: 0 }, x: 43, y: 33 })));
  g.loadGame();
  const sp2 = g.stalkerSpawn([43, 33], G.edits, G.picked, g.npcTiles());
  ok(G.stalker && G.stalker.x === sp2[0] && G.stalker.y === sp2[1] && G.caveIn, 'loading inside the cave spawns it at the farthest waypoint');
  delete store['monster-trail-save-v1'];

  // --- 12. shell: HUD / menu / craft layout (headless numbers) ---
  const hitR = (a, b) => a[0] < b[0] + b[2] && b[0] < a[0] + a[2] && a[1] < b[1] + b[3] && b[1] < a[1] + a[3];
  const menuR = [640 - g.MENU_W - 16, g.MENU_Y, g.MENU_W, 26 * g.MENU_ITEMS.length + 24];
  ok(![[8, 8, 150, 30], g.HUD_LEAD_RECT, g.HUD_MAT_RECT, menuR].some(r => hitR(r, g.HUD_CAVE_RECT)),
     'the cave HUD overlaps no other HUD panel or the menu');
  const [cx0, cy0, , ch0] = g.CRAFT_RECT;
  const pitchC = g.CRAFT_SLOT + g.CRAFT_GAP;
  const visBottom = cy0 + g.CRAFT_GRID_Y + (g.CRAFT_GRID_ROWS - 1) * pitchC + g.CRAFT_SLOT + 4;   // + outline
  ok(visBottom <= cy0 + ch0 - 34,
     'the ' + g.CRAFT_GRID_ROWS + ' visible CRAFT grid rows end above the message line (' + visBottom + ' <= ' + (cy0 + ch0 - 34) + ')');
  ok(g.craftCells().length === g.RECIPES.length + 1, 'CRAFT has one cell per recipe, then BUILD');
  let craftWinOk = true;
  for (let n = 1; n < 16; n++) {
    for (let cur = 0; cur < n; cur++) {
      const top = g.listTop(n, cur, g.CRAFT_GRID_ROWS);
      if (!(top <= cur && cur < top + g.CRAFT_GRID_ROWS && top >= 0 && top <= Math.max(0, n - g.CRAFT_GRID_ROWS))) {
        craftWinOk = false;
        ok(false, 'CRAFT window keeps row ' + cur + ' of ' + n + ' visible (top ' + top + ')');
      }
    }
  }
  ok(craftWinOk, 'the CRAFT grid window keeps the cursor row visible for 1..15 rows');
  g.setScareCalm(null);
  caveGame(43, 107);
  G.mode = 'overworld';
  console.log('  cave: lantern ' + L.rMin + '-' + L.rMax + ' tiles, ' + dom.length + '-tile domain, rest ' + HA.restRun + '/' +
              HA.restLose + ', 300-tick traces deterministic');
}

section('CAVE FEEL — lantern mask, tension screen, stalker eyes, lunge, PULSE ring, HUD bars (headless)');
{
  // The HTML build's canvas drawing needs a browser (see browser-playtest); here
  // the pure feel helpers and the CFX state machine are driven directly.
  const eq = (a, b) => JSON.stringify(a) === JSON.stringify(b);
  const L = g.LANTERN, TILE = 32;
  function caveGame(x, y) {
    G.party = [g.makeMon('pyrelash', 26)]; G.balls = 20;
    G.flags = { starter: true, gym: false, huntBeaten: 0, pick: 0 };
    G.materials = g.zeroMaterials(); G.edits = {}; G.picked = new Set();
    g.loadCave(null);
    G.mode = 'overworld'; G.battle = null; G.fade = 0; G.fadeDir = 0; G.fadeCb = null;
    G.dialogue = null; G.pendingEncounter = null; G.toast = null; G.building = false;
    const p = G.player;
    p.tx = x; p.ty = y; p.px = x * 32; p.py = y * 32; p.moving = false; p.dir = 'up';
    g.syncCave();
    g.resetCaveFx(); g.resetWorldFx();
  }
  const frames = (n, dt) => { for (let i = 0; i < n; i++) g.updateCaveFx(dt || 1 / 60); };

  // --- lantern mask ---
  const holes = [];
  for (let b = 0; b <= L.buckets; b++) {
    const c = Math.floor(b * L.max / L.buckets);
    const lit = Math.round(g.lanternRadius(c) * TILE), r = g.lampHoleRadius(c);
    holes.push(r);
    ok(r === Math.ceil(lit * g.LAMP_FEATHER[1]), 'bucket ' + b + ': hole radius ' + r + ' = lit ' + lit + ' x feather');
    let clear = true, mono = true, prev = 0;
    for (let d = 0; d <= L.corePx; d++) if (g.lampProfile(d, lit)[1] !== 0) clear = false;
    for (let d = L.corePx + 1; d <= r; d++) { const a = g.lampProfile(d, lit)[1]; if (a + 1 < prev) mono = false; prev = a; }
    ok(clear, 'bucket ' + b + ': the ' + L.corePx + ' px core is clear (4 neighbouring tiles lit)');
    ok(mono && g.lampProfile(r, lit)[1] >= g.LAMP_DARK_ALPHA - 1, 'bucket ' + b + ': soft monotone falloff into the dark');
    const warm = g.lampProfile(Math.floor((L.corePx + lit * g.LAMP_FEATHER[0]) / 2), lit)[0];
    ok(warm[0] > warm[2] + 40, 'bucket ' + b + ': the lit ring is tinted warm ' + warm);
  }
  ok(holes.every((r, i) => i === 0 || r >= holes[i - 1]) && holes[0] < holes[L.buckets], 'hole radius grows with the bucket: ' + holes);
  ok(g.lampFlickerAmp(10, false) > 0 && g.lampFlickerAmp(10, true) === 0 && g.lampFlickerAmp(25, false) === 0 &&
     g.lampFlickerAmp(0, false) === 1, 'the flame gutters below 25% only, never with reduced motion');

  // --- tension screen ---
  ok(eq([0, 49, 50, 75, 100].map(g.vignetteAlpha), [0, 0, g.VIGNETTE_MIN, 75, g.VIGNETTE_MAX]), 'vignette alpha at t 0/49/50/75/100');
  ok(g.heartHz(74) === 0 && g.heartHz(75) === g.HEART_HZ_MIN && g.heartHz(100) === g.HEART_HZ_MAX, 'heartbeat 1.2 -> 1.8 Hz from fear');
  ok(g.heartEnv(0) === 1 && g.heartEnv(g.HEART_DUB) > 0.6 && g.heartEnv(0.9) < 0.01, 'lub-dub envelope');
  for (const [t, calm] of [[74, false], [75, false], [100, true]]) {
    const fx = g.tensionFx(t, calm), want = t >= 75 && !calm;
    ok(fx.pulse === want && fx.grain === want && fx.tears === want && (fx.heart > 0) === (t >= 75),
       'tensionFx(' + t + (calm ? ', reduced' : '') + '): pulse/grain/tears ' + want + ', heartbeat sound ' + (t >= 75));
  }
  for (const [t, calm, want] of [[60, false, false], [80, false, true], [100, true, false], [74, false, false]]) {
    caveGame(43, 30);
    g.setCaveCalm(calm);
    G.lantern = 100; G.tension = t; G.stalker = null;
    const grains = new Set(); let tears = 0;
    const b0 = g.CFX.beats;
    for (let i = 0; i < 300; i++) { g.updateCaveFx(1 / 60); grains.add(g.CFX.grainX + ',' + g.CFX.grainY); tears = Math.max(tears, g.tearsLive()); }
    const tag = 'tension ' + t + (calm ? ' + reduced motion' : '');
    ok((grains.size > 1) === want, tag + ': film grain ' + (want ? 'rolls' : 'never runs'));
    ok((tears > 0) === want, tag + ': tear lines ' + (want ? 'appear' : 'never appear'));
    const hz = g.heartHz(t), beats = g.CFX.beats - b0;
    ok(hz ? Math.abs(beats - (1 + Math.floor(5 * hz))) <= 1 : beats === 0, tag + ': ' + beats + ' heartbeats in 5 s');
  }
  for (const [charge, calm, want] of [[10, false, true], [10, true, false], [60, false, false]]) {
    caveGame(43, 30);
    g.setCaveCalm(calm);
    G.lantern = charge; G.tension = 0;
    let peak = 0;
    for (let i = 0; i < 120; i++) { g.updateCaveFx(1 / 60); peak = Math.max(peak, g.CFX.flicker * g.lampFlickerAmp(charge, calm)); }
    ok((peak > 0.05) === want, 'lantern ' + charge + (calm ? ' + reduced motion' : '') + ': the flame ' + (want ? 'flickers' : 'holds steady'));
  }
  g.setCaveCalm(null);

  // --- the stalker's eyes, glide and trail ---
  const s0 = g.stalkerSense(100, 0);
  ok(g.stalkerEyes(Object.assign(g.newStalker(38, 30), { mode: 'hunt' }), [43, 30], 0, 0) === 'hunt', 'eyes while hunting within sense');
  ok(g.stalkerEyes(Object.assign(g.newStalker(43 - s0 - 2, 30), { mode: 'hunt' }), [43, 30], 100, 0) === null, 'no eyes hunting beyond sense');
  ok(g.stalkerEyes(g.newStalker(38, 30), [43, 30], 0, 0) === null, 'no eyes while it patrols');
  ok(g.stalkerEyes(Object.assign(g.newStalker(38, 30), { stun: 4 }), [43, 30], 0, 0) === 'stun', 'dimmed eyes while stunned');
  caveGame(43, 30);
  G.stalker = Object.assign(g.newStalker(38, 30), { mode: 'hunt' });
  frames(1);
  G.stalker = Object.assign({}, G.stalker, { x: 39 });
  frames(1);
  const mid = g.stalkerPx(G.stalker)[0];
  ok(38 * TILE + 16 < mid && mid < 39 * TILE + 16 && g.CFX.trail.filter(t => t.t > 0).length === 1,
     'a hunting step glides the body (' + mid.toFixed(1) + ') and leaves one eye ghost');
  frames(30);
  ok(g.stalkerPx(G.stalker)[0] === 39 * TILE + 16 && g.CFX.trail.every(t => t.t === 0), 'the glide settles and the trail fades');
  g.setCaveCalm(true);
  G.stalker = Object.assign({}, G.stalker, { x: 40 });
  frames(1);
  ok(g.stalkerPx(G.stalker)[0] === 40 * TILE + 16 && g.CFX.trail.every(t => t.t === 0), 'reduced motion: it snaps, no trail');
  g.setCaveCalm(null);

  // --- the lunge: one flare and a jolt, then the cut; a confirm is held, not lost ---
  caveGame(43, 30);
  G.lantern = 0; G.tension = 90;
  G.stalker = Object.assign(g.newStalker(42, 30), { mode: 'hunt' });
  g.beginHunt();
  const b = G.battle;
  ok(G.mode === 'battle' && b && b.hunt && b.scare === 'dark', 'the lunge hands off to the hunt battle (hard cut)');
  ok(g.CFX.lungeAge === 0 && g.WFX.trauma >= g.LUNGE_TRAUMA, 'the lunge starts the flare and jolts the world');
  g.updateBattle(1 / 60);
  const first = b.step && b.step.s;
  ok(first === 'Something was breathing right behind you...', 'the scare line waits under the flare: ' + first);
  g.press('z'); g.release('z');
  ok(g.CFX.pendingConfirm && b.step && b.step.s === first, 'a confirm during the flare is held, not spent on an unseen line');
  const flares = [];
  for (let i = 0; i < Math.ceil(g.LUNGE_TIME * 60) + 3; i++) { flares.push(g.lungeFlare(g.CFX.lungeAge)); g.updateCaveFx(1 / 60); }
  let rises = 0;
  [0].concat(flares).forEach((a, i, arr) => { if (i && a > arr[i - 1] + 1e-9) rises++; });
  ok(rises === 1 && flares[0] === 1 && flares[flares.length - 1] === 0 && flares.every((a, i) => !i || a <= flares[i - 1]),
     'the lunge flashes exactly once and only fades (no strobe)');
  ok(g.CFX.lungeAge === null && !g.CFX.pendingConfirm && !(b.step && b.step.s === first), 'the held confirm is replayed once after the flare');
  g.setCaveCalm(true);
  g.resetCaveFx(); g.resetWorldFx();
  g.worldFx('lunge', 42, 30, null, {});
  ok(g.CFX.lungeAge === null && g.WFX.trauma === 0, 'reduced motion: no flare and no jolt');
  g.setCaveCalm(null);

  // --- the PULSE ring ---
  for (const hit of [true, false]) {
    caveGame(43, 30);
    G.stalker = hit ? Object.assign(g.newStalker(41, 30), { stun: 10 }) : null;
    g.worldFx('pulse', 43, 30, null, { hit, auto: false });
    const r = g.CFX.ring, tag = 'pulse ' + (hit ? 'hit' : 'miss');
    ok(r && r.tiles.length && r.tiles.every(([x, y, d]) => d <= g.PULSE.range && Math.abs(x - 43) + Math.abs(y - 30) <= d),
       tag + ': every ring tile is within ' + g.PULSE.range + ' steps by path');
    ok(r.tiles.every(([x, y]) => !g.tileBlocked(x, y, 'none', G.edits, G.picked, g.npcTiles())), tag + ': the ring never lights rock');
    ok((g.liveDebris() > 0 && g.WFX.trauma > 0) === hit, tag + ': sparks and a jolt only on a hit');
    let maxA = 0;
    for (let i = 0; i < 60; i++) { if (g.CFX.ring) for (const [, , d] of g.CFX.ring.tiles) maxA = Math.max(maxA, g.ringAlpha(d)); frames(1); }
    ok(maxA > 0 && maxA <= g.PULSE_RING_ALPHA && g.CFX.ring === null, tag + ': the wavefront peaks at ' + maxA + ' and is gone in 0.7 s');
  }
  const wallSide = (() => { for (let y = 27; y <= 36; y++) for (let x = 10; x < 80; x++)
    if (!g.tileBlocked(x, y, 'none', {}, new Set(), g.npcTiles()) && g.tileBlocked(x + 1, y, 'none', {}, new Set(), g.npcTiles())) return [x, y]; })();
  ok(g.pulseRing(g.caveDist(wallSide, {}, new Set(), g.npcTiles(), true)).length < 41, 'beside rock at ' + wallSide + ' the ring is cut short');

  // --- HUD bars ---
  const hitR = (a, c) => a[0] < c[0] + c[2] && c[0] < a[0] + a[2] && a[1] < c[1] + c[3] && c[1] < a[1] + a[3];
  const inR = (a, c) => a[0] >= c[0] && a[1] >= c[1] && a[0] + a[2] <= c[0] + c[2] && a[1] + a[3] <= c[1] + c[3];
  const others = [[8, 8, 150, 30], g.HUD_LEAD_RECT, g.HUD_MAT_RECT];
  const bad = [];
  for (const c of [0, 1, 19, 20, 50, 99, 100]) for (const t of [0, 24, 25, 74, 75, 100]) {
    const hb = g.caveHudBars(c, t);
    const rects = [hb.lamp].concat(hb.tension ? [hb.tension] : []);
    if (hb.lampFill !== Math.round(g.HUD_CAVE_BAR_W * c / 100) || hb.low !== (c < g.HUD_LAMP_LOW)) bad.push(['lamp', c]);
    if ((hb.tension === null) !== (t < g.HUD_TENSION_FROM) || hb.fear !== (t >= 75) || hb.label !== (t >= 75 ? 'FEAR!' : 'TENSION') ||
        (hb.tension && hb.tensionFill !== Math.round(g.HUD_CAVE_BAR_W * t / 100))) bad.push(['tension', t]);
    if (!rects.every(r => inR(r, g.HUD_CAVE_RECT)) || rects.some(r => others.some(o => hitR(r, o)))) bad.push(['layout', c, t]);
  }
  ok(!bad.length, 'caveHudBars: fills, FEAR! label, show-from-25 and layout hold for 42 states ' + JSON.stringify(bad.slice(0, 3)));

  // --- none of it draws from Math.random or moves the stalker's trace ---
  const realRandom = Math.random;
  let calls = 0;
  Math.random = () => { calls++; return realRandom(); };
  try {
    caveGame(43, 30);
    G.lantern = 5; G.tension = 95; G.pulses = 2;
    G.stalker = Object.assign(g.newStalker(41, 30), { mode: 'hunt' });
    for (let i = 0; i < 600; i++) g.updateCaveFx(1 / 60);
    g.worldFx('pulse', 43, 30, null, { hit: true }); g.worldFx('lunge', 41, 30, null, {});
    for (let i = 0; i < 60; i++) g.updateCaveFx(1 / 60);
    g.caveHudBars(5, 95); g.stalkerEyes(G.stalker, [43, 30], 5, 95); g.tensionFx(95, false);
  } finally { Math.random = realRandom; }
  ok(calls === 0, 'the cave feel never calls Math.random (' + calls + ' calls)');
  const bfsPath = (src, dst) => {
    const prev = new Map([[src + '', null]]);
    let frontier = [src];
    while (frontier.length) {
      const nxt = [];
      for (const [x, y] of frontier) {
        if (x === dst[0] && y === dst[1]) {
          const out = []; let cur = [x, y];
          while (cur) { out.unshift(cur); cur = prev.get(cur + ''); }
          return out;
        }
        for (const [dx, dy] of [[0, -1], [0, 1], [-1, 0], [1, 0]]) {
          const n = [x + dx, y + dy];
          if (prev.has(n + '') || !g.inCave(n[1]) || g.tileBlocked(n[0], n[1], 'none', {}, new Set(), g.npcTiles())) continue;
          prev.set(n + '', [x, y]); nxt.push(n);
        }
      }
      frontier = nxt;
    }
    return [];
  };
  const walk = extraFx => {
    caveGame(43, 30);
    G.lantern = 8; G.tension = 70; G.pulses = 3; G.stalker = g.newStalker(38, 30);
    G.caveRng = g.mulberry32(99);
    G.wanderT = 0.35;                               // townsfolk wander on Math.random; start both walks alike
    const rows = [];
    let rc = 0;
    Math.random = () => { rc++; return 0.99; };     // no wild encounters, and every engine draw is counted
    try {
      const there = bfsPath([43, 30], [7, 33]), back = bfsPath([7, 33], [43, 30]);
      const route = there.slice(1).concat(back.slice(1));
      for (const [x, y] of route) {
        if (G.mode !== 'overworld') break;
        const p = G.player, k = x < p.tx ? 'arrowleft' : x > p.tx ? 'arrowright' : y < p.ty ? 'arrowup' : 'arrowdown';
        g.press(k); g.release(k);
        g.update(1 / 60);
        for (let i = 0; i < 60 && p.moving; i++) {
          g.update(1 / 60);
          if (extraFx) { for (let j = 0; j < 3; j++) g.updateCaveFx(1 / 60); g.fxRand(); }
        }
        const st = G.stalker;
        rows.push([p.tx, p.ty, G.mode, G.lantern, G.tension, G.pulses, st && [st.x, st.y, st.mode, st.stun, st.tick]]);
      }
    } finally { Math.random = realRandom; }
    return [rows, rc, G.caveRng()];
  };
  const [plain, rcPlain, nextPlain] = walk(false);
  const [busy, rcBusy, nextBusy] = walk(true);
  ok(plain.length > 10 && eq(plain, busy), 'a ' + plain.length + '-step cave walk leaves the same trace with extra feel frames running');
  ok(rcPlain === rcBusy && nextPlain === nextBusy, 'Math.random draws (' + rcPlain + ' vs ' + rcBusy + ', next ' + nextPlain + ' vs ' + nextBusy + ') and the stalker mulberry32 are untouched by the feel layer');
  ok(plain.some(r => r[5] < 3) || plain.some(r => r[2] !== 'overworld') || plain.some(r => r[6] && r[6][2] === 'hunt'),
     'the walk exercised the hunt or the PULSE');

  g.setCaveCalm(null);
  g.resetCaveFx(); g.resetWorldFx();
  caveGame(43, 107);
  G.mode = 'overworld';
  console.log('  cave feel: ' + (L.buckets + 1) + ' lantern buckets (hole ' + holes[0] + '-' + holes[L.buckets] +
              ' px), vignette ' + g.VIGNETTE_MIN + '-' + g.VIGNETTE_MAX + ', heartbeat ' + g.HEART_HZ_MIN + '-' + g.HEART_HZ_MAX +
              ' Hz, ' + plain.length + '-step walk unchanged by the feel layer');
}

/* -------------------------------------------------------- GAME WINDOW */
// The page-hardening layer: no context menu, zoom, reload or find keys, a
// fullscreen toggle and the idle cursor. Driven through a fake window and
// document, so no browser is needed and no real listener leaks into the run.
section('GAME WINDOW — page hardening, fullscreen toggle, idle cursor (headless)');
{
  ok(typeof g.installHardening === 'function' && typeof g.browserKeyBlocked === 'function',
     'the hardening installer and the key filter are exported');
  ok(g.installHardening(null, null) === false && g.installHardening({}, {}) === false,
     'the installer refuses a missing window/document instead of throwing');

  // The fullscreen key must be one press() does not already dispatch.
  const used = ['arrowup', 'arrowdown', 'arrowleft', 'arrowright', 'w', 'a', 's', 'd', 'z', 'x', 'enter', ' ', 'escape', 'backspace', 'shift', 'o'];
  ok(g.FULLSCREEN_KEY === 'f' && !used.includes(g.FULLSCREEN_KEY), 'the fullscreen key (' + g.FULLSCREEN_KEY + ') is free in press()');
  const modeBefore = G.mode;
  let threw = false;
  try { g.press(g.FULLSCREEN_KEY); g.release(g.FULLSCREEN_KEY); } catch (err) { threw = true; }
  ok(!threw && G.mode === modeBefore, 'press(fullscreen key) is inert headlessly (no document yet)');

  const listeners = [];
  const fakeTarget = name => ({
    addEventListener: (type, fn, opt) => listeners.push({ on: name, type, fn, opt }),
  });
  const timers = [];
  const classes = new Set();
  const calls = { req: 0, exit: 0, lock: 0 };
  const doc = Object.assign(fakeTarget('doc'), {
    fullscreenElement: null,
    body: { classList: {
      toggle: (c, on) => { if (on) classes.add(c); else classes.delete(c); },
      add: c => classes.add(c), remove: c => classes.delete(c), contains: c => classes.has(c) } },
    exitFullscreen() { calls.exit++; this.fullscreenElement = null; return Promise.resolve(); },
  });
  doc.documentElement = { requestFullscreen() { calls.req++; doc.fullscreenElement = this; return Promise.resolve(); } };
  const win = Object.assign(fakeTarget('win'), {
    innerWidth: 1280, innerHeight: 720, screen: { width: 1920, height: 1080 },
    locationbar: { visible: true },
    navigator: { keyboard: { lock: () => { calls.lock++; return Promise.resolve(); }, unlock: () => {} } },
    setTimeout: (fn, ms) => { timers.push({ fn, ms }); return timers.length; },
    clearTimeout: () => {},
  });
  ok(g.installHardening(win, doc) === true, 'the installer accepts a window/document pair');
  const find = (on, type) => listeners.filter(l => l.on === on && l.type === type);
  const fire = (on, type, ev) => { for (const l of find(on, type)) l.fn(ev); };
  const evt = props => {
    const e = Object.assign({ prevented: false, stopped: false, target: { tagName: 'BODY' } }, props);
    e.preventDefault = () => { e.prevented = true; };
    e.stopPropagation = () => { e.stopped = true; };
    return e;
  };

  const kd = find('win', 'keydown');
  ok(kd.length === 1 && kd[0].opt === true, 'the key filter listens on window keydown in the capture phase');
  for (const [type, on] of [['contextmenu', 'doc'], ['selectstart', 'doc'], ['dragstart', 'doc'], ['gesturestart', 'doc'],
                            ['fullscreenchange', 'doc'], ['wheel', 'win'], ['touchmove', 'win'], ['mousemove', 'win']]) {
    ok(find(on, type).length >= 1, 'a ' + type + ' listener is installed');
  }
  ok(find('win', 'wheel').every(l => l.opt && l.opt.passive === false) && find('win', 'touchmove').every(l => l.opt && l.opt.passive === false),
     'wheel and touchmove are non-passive, so their preventDefault takes effect');

  const blocked = [
    { key: 'F5' }, { key: 'r', ctrlKey: true }, { key: 'R', ctrlKey: true, shiftKey: true }, { key: 'r', metaKey: true },
    { key: 'p', ctrlKey: true }, { key: 's', ctrlKey: true }, { key: 'f', ctrlKey: true }, { key: 'Backspace' },
    { key: '+', ctrlKey: true }, { key: '=', ctrlKey: true }, { key: '-', ctrlKey: true }, { key: '0', ctrlKey: true },
    { key: 'ArrowLeft', altKey: true },
  ];
  for (const b of blocked) {
    const e = evt(b);
    fire('win', 'keydown', e);
    ok(e.prevented && !e.stopped, 'browser key ' + JSON.stringify(b) + ' is prevented but still propagates to press()');
  }
  const free = ['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'w', 'a', 's', 'd', 'z', 'x', 'Enter', ' ', 'Escape', 'Shift', 'o', 'f', 'F11', 'F12'];
  for (const k of free) {
    const e = evt({ key: k });
    fire('win', 'keydown', e);
    ok(!e.prevented, 'game/browser key ' + JSON.stringify(k) + ' is left alone by the filter');
  }
  const devtools = evt({ key: 'I', ctrlKey: true, shiftKey: true });
  fire('win', 'keydown', devtools);
  ok(!devtools.prevented, 'Ctrl+Shift+I (dev tools) is left alone');
  ok(!g.browserKeyBlocked({ key: 'Backspace', target: { tagName: 'INPUT', type: 'text' } }),
     'Backspace still edits a text field');
  ok(g.browserKeyBlocked({ key: 'Backspace', target: { tagName: 'BUTTON' } }), 'Backspace on a button is blocked');

  const cm = evt({}); fire('doc', 'contextmenu', cm); ok(cm.prevented, 'the context menu is suppressed');
  const ds = evt({}); fire('doc', 'dragstart', ds); ok(ds.prevented, 'canvas/image drag is suppressed');
  const ss = evt({}); fire('doc', 'selectstart', ss); ok(ss.prevented, 'text selection is suppressed');
  const ssIn = evt({ target: { tagName: 'INPUT' } }); fire('doc', 'selectstart', ssIn); ok(!ssIn.prevented, 'selection inside a form field still works');
  const zw = evt({ ctrlKey: true }); fire('win', 'wheel', zw); ok(zw.prevented, 'Ctrl+wheel (and trackpad pinch) zoom is suppressed');
  const pw = evt({}); fire('win', 'wheel', pw); ok(!pw.prevented, 'a plain wheel is left alone');
  const pinch = evt({ touches: [{}, {}] }); fire('win', 'touchmove', pinch); ok(pinch.prevented, 'a two-finger pinch is suppressed');
  const one = evt({ touches: [{}] }); fire('win', 'touchmove', one); ok(!one.prevented, 'a one-finger drag is left to the touch controls');

  // Fullscreen toggle: request on the root element, exit when already in it.
  ok(!g.isFullscreen() && !classes.has('fs'), 'a 1280x720 window on a 1920x1080 screen is not fullscreen');
  ok(g.toggleFullscreen() === true && calls.req === 1, 'the toggle requests fullscreen on the document element');
  fire('doc', 'fullscreenchange', {});
  ok(g.isFullscreen() && classes.has('fs'), 'fullscreenchange marks body.fs (canvas letterboxed on black, no border)');
  ok(g.toggleFullscreen() === true && calls.exit === 1 && !doc.fullscreenElement, 'the toggle exits element fullscreen');
  fire('doc', 'fullscreenchange', {});
  ok(!classes.has('fs'), 'leaving fullscreen clears body.fs');

  // Browser fullscreen (F11 / the launcher) fills the screen; JS cannot leave it, so it says how.
  win.innerWidth = 1920; win.innerHeight = 1080;
  const toastBefore = G.toast;
  ok(g.isFullscreen() && g.toggleFullscreen() === false && calls.req === 1 && G.toast && /F11/.test(G.toast.s),
     'in browser fullscreen the toggle requests nothing and points at F11');
  G.toast = toastBefore;

  // Idle cursor: hidden after CURSOR_IDLE_MS in fullscreen, back on movement.
  timers.length = 0;
  fire('win', 'mousemove', {});
  ok(timers.length === 1 && timers[0].ms === g.CURSOR_IDLE_MS && g.CURSOR_IDLE_MS >= 1500 && g.CURSOR_IDLE_MS <= 3000,
     'a mouse move in fullscreen arms a ' + g.CURSOR_IDLE_MS + ' ms idle timer');
  timers[0].fn();
  ok(classes.has('nocursor'), 'the cursor hides after the idle time');
  fire('win', 'mousemove', {});
  ok(!classes.has('nocursor'), 'moving the mouse shows the cursor again');
  win.innerWidth = 1280; win.innerHeight = 720;
  timers.length = 0;
  fire('win', 'mousemove', {});
  ok(timers.length === 0 && !classes.has('nocursor'), 'outside fullscreen the cursor is never hidden');

  // A browser tab never auto-enters fullscreen.
  const reqTab = calls.req;
  fire('win', 'keydown', evt({ key: 'z' }));
  fire('win', 'pointerdown', evt({}));
  ok(calls.req === reqTab, 'in a normal tab the first key/click does not grab fullscreen');
}
{
  // An app window (the launcher's --app, no location bar) enters fullscreen on
  // its first key, once, and locks Escape so the cancel key still reaches the game.
  const listeners = [];
  const calls = { req: 0, lock: 0 };
  const add = name => (type, fn, opt) => listeners.push({ on: name, type, fn, opt });
  const doc = { addEventListener: add('doc'), fullscreenElement: null, body: { classList: { toggle() {}, add() {}, remove() {} } } };
  // A synchronous thenable, so the Escape lock lands inside this run.
  doc.documentElement = { requestFullscreen() { calls.req++; doc.fullscreenElement = this; return { then: f => { f(); return { catch() {} }; } }; } };
  const win = { addEventListener: add('win'), innerWidth: 1280, innerHeight: 720, screen: { width: 1920, height: 1080 },
                locationbar: { visible: false }, navigator: { keyboard: { lock: () => { calls.lock++; } } },
                setTimeout: () => 1, clearTimeout: () => {} };
  g.installHardening(win, doc);
  const kd = listeners.filter(l => l.on === 'win' && l.type === 'keydown');
  for (const l of kd) l.fn({ key: 'Escape', target: {}, preventDefault() {} });
  ok(calls.req === 0, 'Escape alone never triggers the auto fullscreen');
  for (const l of kd) l.fn({ key: 'z', target: {}, preventDefault() {} });
  ok(calls.req === (g.FULLSCREEN_AUTO_APP ? 1 : 0), 'an app window enters fullscreen on its first key');
  ok(calls.lock === calls.req, 'entering fullscreen locks Escape so it stays the cancel key');
  doc.fullscreenElement = null;
  for (const l of kd) l.fn({ key: 'z', target: {}, preventDefault() {} });
  ok(calls.req <= 1, 'the auto fullscreen happens at most once per load');
  console.log('  game window: ' + g.BLOCKED_KEYS.length + ' bare + ' + g.BLOCKED_CTRL_KEYS.length + ' Ctrl keys blocked, toggle on ' +
              g.FULLSCREEN_KEY.toUpperCase() + ', cursor hides after ' + g.CURSOR_IDLE_MS + ' ms');
}

/* --------------------------------------------------------------- RESULT */
console.log('\n' + (fail === 0
  ? pass + ' checks passed.'
  : fail + ' FAILED, ' + pass + ' passed.'));
process.exit(fail === 0 ? 0 : 1);
