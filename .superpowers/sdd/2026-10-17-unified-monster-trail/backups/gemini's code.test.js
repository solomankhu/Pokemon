/* Headless test suite for "gemini's code.html" (THE STATIC BELOW).
 *
 *     node "gemini's code.test.js"
 *
 * The page's SIM layer (stage data, collision, navigation, per-tick rates,
 * pulse cone, MONSTER TRAIL handoff parsing) has no DOM or three.js
 * dependency, and boot() only runs when `window`/`document` exist, so the
 * inline <script> can be eval'd here with no network. A minimal THREE stub
 * covers the stage-view build/dispose (leak) checks. Exits non-zero on failure.
 */
'use strict';
const fs = require('fs');
const path = require('path');

const HTML = path.join(__dirname, "gemini's code.html");
const src = fs.readFileSync(HTML, 'utf8');
const scripts = [...src.matchAll(/<script(\s[^>]*)?>([\s\S]*?)<\/script>/g)];
const inline = scripts.filter(m => !/\bsrc\s*=/.test(m[1] || ''));

let fail = 0, pass = 0;
const ok = (cond, msg) => { if (cond) pass++; else { console.log('  FAIL: ' + msg); fail++; } };
const near = (a, b, eps = 1e-9) => Math.abs(a - b) <= eps;
const section = s => console.log('\n== ' + s);

section('LOAD - inline script evaluates headless');
ok(inline.length === 1, 'exactly one inline <script>, saw ' + inline.length);
ok(!scripts.some(m => /\bsrc\s*=/.test(m[1] || '')), 'three.js is not a blocking <script src> (it is loaded by the boot loader)');
(0, eval)(inline[0][2]);
const S = globalThis.__STATIC__;
if (!S) { console.error('__STATIC__ export missing - did the boot guard or export get removed?'); process.exit(1); }
ok(typeof S.debug === 'undefined', 'no browser debug seams exported headless');

/* ------------------------------------------------------------ STAGES */
section('STAGES - config shape and placement');
const nav = S.getNav();
ok(nav.cols === 60 && nav.rows === 80, 'nav grid is 60x80 cells, saw ' + nav.cols + 'x' + nav.rows);
ok(Object.keys(S.stageConfigs).length === S.MAX_STAGES, 'one config per stage');
const spawnField = new Float64Array(nav.n);
S.computeField(nav, S.nearestFreeCell(nav, S.SPAWN.x, S.SPAWN.z), spawnField);
ok(!S.overlapsWall(S.SPAWN.x, S.SPAWN.z, S.PLAYER_RADIUS, S.walls), 'spawn is clear of walls');
for (let n = 1; n <= S.MAX_STAGES; n++) {
  const c = S.stageConfigs[n];
  ok(c.termCount === c.termPositions.length, `stage ${n}: termCount matches termPositions`);
  ok(c.oxyDepletion > 0 && c.sanityDrain > 0, `stage ${n}: positive drains`);
  const things = [
    ...c.termPositions.map(p => ['terminal', p]),
    ...c.sanityStations.map(p => ['sanity station', p]),
    ...c.oxygenStations.map(p => ['oxygen station', p])
  ];
  for (const [kind, p] of things) {
    ok(!S.overlapsWall(p.x, p.z, 0.5, S.walls), `stage ${n}: ${kind} at (${p.x},${p.z}) is not inside a wall`);
    const cell = S.nearestFreeCell(nav, p.x, p.z);
    ok(cell >= 0 && isFinite(spawnField[cell]), `stage ${n}: ${kind} at (${p.x},${p.z}) is reachable from spawn`);
  }
  for (const e of c.enemies) {
    ok(e.type === 'resonator' || e.type === 'stalker', `stage ${n}: known enemy type ${e.type}`);
    ok(!S.overlapsWall(e.x, e.z, S.ENEMY_RADIUS, S.walls), `stage ${n}: ${e.type} spawns clear of walls`);
    ok(Math.hypot(e.x - S.SPAWN.x, e.z - S.SPAWN.z) > S.AGGRO_RADIUS, `stage ${n}: ${e.type} spawns outside aggro range of the player`);
    ok(e.speed * 60 < S.SPRINT_SPEED * 60, `stage ${n}: ${e.type} is slower than a sprint`);
  }
}

/* ------------------------------------------------------------ RATES */
section('RATES - per-tick constants and resource drains');
ok(near(S.SIM_STEP, 1 / 60), 'SIM_STEP is 1/60');
ok(S.WALK_SPEED === 0.1 && S.SPRINT_SPEED === 0.18, 'walk 0.1 / sprint 0.18 per tick (original tuning)');
ok(S.STAMINA_DRAIN === 0.5 && S.STAMINA_REGEN === 0.25, 'stamina 0.5 drain / 0.25 regen per tick');
ok(S.JAMMER_DRAIN === 0.35 && S.BATTERY_REGEN === 0.15, 'jammer 0.35 drain / battery 0.15 regen per tick');
ok(S.PULSE_COST === 15 && S.PULSE_STUN_TICKS === 120, 'pulse costs 15 and stuns 120 ticks');
ok(S.SCARE_TICKS === 72, 'jumpscare lasts 72 ticks (1.2 s)');
const idle = { mx: 0, mz: 0, sprint: false, yaw: 0 };
const fwd = { mx: 0, mz: -1, sprint: false, yaw: 0 };
const sprintFwd = { mx: 0, mz: -1, sprint: true, yaw: 0 };
function quiet(stage) {             // a sim with no enemies, for rate checks
  const sim = S.createSim(stage || 1);
  sim.enemies.length = 0;
  return sim;
}
{
  const sim = quiet(1);
  for (let i = 0; i < 60; i++) S.stepSim(sim, idle);
  ok(near(sim.player.oxy, 100 - 60 * S.stageConfigs[1].oxyDepletion, 1e-9), 'stage 1 oxygen drains oxyDepletion per tick');
  ok(sim.player.stamina === 100 && sim.player.battery === 100, 'idle: stamina and battery stay full');
}
{
  const sim = quiet(1);
  sim.player.x = 25; sim.player.z = 35;   // long clear run north along the east corridor
  let ticks = 0;
  while (sim.player.stamina > 0 && ticks < 1000) { S.stepSim(sim, sprintFwd); ticks++; }
  ok(ticks === 200, 'sprint empties stamina in 200 ticks (3.33 s), saw ' + ticks);
  ok(near(sim.player.z, 35 - 200 * S.SPRINT_SPEED, 1e-6), 'sprint moves 0.18 per tick');
  S.stepSim(sim, sprintFwd);
  ok(near(sim.player.z, 35 - 200 * S.SPRINT_SPEED - S.WALK_SPEED, 1e-6), 'out of stamina: back to walking speed');
}
{
  const sim = quiet(1);
  S.toggleJammer(sim);
  let ticks = 0;
  while (sim.player.jammer && ticks < 1000) { S.stepSim(sim, idle); ticks++; }
  ok(ticks === Math.ceil(100 / S.JAMMER_DRAIN), 'jammer runs ' + Math.ceil(100 / S.JAMMER_DRAIN) + ' ticks from full, saw ' + ticks);
  ok(sim.events.some(e => e.type === 'jammer_dead'), 'jammer_dead event when the battery runs out');
  ok(!S.toggleJammer(sim) && !sim.player.jammer, 'jammer cannot be switched on with a dead battery');
  ok(sim.events.some(e => e.type === 'fizzle' && e.a === 'jammer'), 'dead-battery jammer press fizzles');
  for (let i = 0; i < 10; i++) S.stepSim(sim, idle);
  ok(near(sim.player.battery, 10 * S.BATTERY_REGEN, 1e-9), 'battery regenerates 0.15 per tick with the jammer off');
}
{
  const sim = S.createSim(1);
  sim.enemies.length = 0;
  sim.player.x = 0; sim.player.z = 30; sim.player.sanity = 50;   // on the stage-1 sanity station
  S.stepSim(sim, idle);
  ok(near(sim.player.sanity, 50 + S.SANITY_REFILL), 'sanity station refills 0.4 per tick');
  ok(sim.events.some(e => e.type === 'station' && e.a === 'sanity'), 'station event on entering');
  sim.events.length = 0;
  S.stepSim(sim, idle);
  ok(!sim.events.some(e => e.type === 'station'), 'no repeated station event while inside');
}
{
  const sim = S.createSim(1);
  sim.enemies.length = 0;
  sim.player.x = 0; sim.player.z = -35; sim.player.oxy = 50;
  S.stepSim(sim, idle);
  ok(near(sim.player.oxy, 50 + S.OXY_REFILL - S.stageConfigs[1].oxyDepletion), 'oxygen station refills 0.5 per tick (net of depletion)');
}
for (let n = 1; n <= 3; n++) {
  const sim = quiet(n);
  for (let i = 0; i < 600; i++) S.stepSim(sim, idle);
  ok(near(sim.player.oxy, 100 - 600 * S.stageConfigs[n].oxyDepletion, 1e-6), `stage ${n}: 10 s idle drains ${(600 * S.stageConfigs[n].oxyDepletion).toFixed(1)} oxygen`);
}

/* ------------------------------------------------------------ COLLISION */
section('COLLISION - slide, corners, no tunnelling');
{
  // wall 6: x -15..15, z 0..1. Walk north into its south face.
  const b = { x: 0, z: -2 };
  for (let i = 0; i < 40; i++) S.moveBox(b, 0, 0.1, 0.5, S.walls);
  ok(near(b.z, -0.5, 1e-5), 'player stops flush against a wall face, saw z=' + b.z.toFixed(6));
  // diagonal into the face slides along it at full tangential speed
  const x0 = b.x;
  S.moveBox(b, 0.1, 0.1, 0.5, S.walls);
  ok(near(b.x, x0 + 0.1, 1e-9) && near(b.z, -0.5, 1e-5), 'diagonal into a wall slides along it');
}
{
  // the original per-axis test let this corner move end INSIDE the wall end at x=15
  const b = { x: 15.6, z: -0.6 };
  S.moveBox(b, -0.18, 0.18, 0.5, S.walls);
  ok(!S.overlapsWall(b.x, b.z, 0.5, S.walls), 'diagonal into a wall corner does not end inside it');
  // and the player can keep moving freely afterwards (no snag)
  const before = { x: b.x, z: b.z };
  for (let i = 0; i < 20; i++) S.moveBox(b, -0.18, 0.18, 0.5, S.walls);
  ok(b.x !== before.x || b.z !== before.z, 'no corner snag: moving on past the corner still makes progress');
}
{
  // fuzz: random moves never end overlapping a wall, at walk/sprint/knockback speeds
  let bad = 0, rngS = 12345;
  const rnd = () => { rngS = (rngS * 1103515245 + 12345) & 0x7fffffff; return rngS / 0x7fffffff; };
  for (let trial = 0; trial < 400; trial++) {
    const r = trial % 2 ? 0.5 : 0.8;
    const b = { x: (rnd() - 0.5) * 56, z: (rnd() - 0.5) * 76 };
    if (S.overlapsWall(b.x, b.z, r, S.walls)) continue;
    for (let k = 0; k < 200; k++) {
      const sp = [0.1, 0.18, 1.2][k % 3];
      const a = rnd() * Math.PI * 2;
      S.moveBox(b, Math.cos(a) * sp, Math.sin(a) * sp, r, S.walls);
      if (S.overlapsWall(b.x, b.z, r, S.walls)) bad++;
    }
  }
  ok(bad === 0, 'fuzz: 80k random moves never end inside a wall (' + bad + ' bad)');
}
{
  const b = { x: 0, z: -3 };
  S.moveBox(b, 0, 6, 0.8, S.walls);   // a single huge step must not tunnel through the 1-thick wall
  ok(b.z < 0, 'a 6-unit step is sub-stepped and cannot tunnel through a wall');
}
ok(!S.segmentClear(0, -5, 0, 5, 0, S.walls), 'segmentClear: line through the middle wall is blocked');
ok(S.segmentClear(20, -5, 20, 5, 0, S.walls), 'segmentClear: east corridor is clear');
ok(!S.segmentClear(15.5, -5, 15.5, 5, 0.8, S.walls), 'segmentClear: a body of radius 0.8 cannot graze past the wall end at x=15');
ok(S.segmentClear(16.0, -5, 16.0, 5, 0.8, S.walls), 'segmentClear: radius 0.8 at x=16 clears the wall end');

/* ------------------------------------------------------------ NAV */
section('NAV - grid, flow field, enemies route around walls');
{
  let free = 0;
  for (let i = 0; i < nav.n; i++) if (!nav.blocked[i]) free++;
  let reach = 0;
  for (let i = 0; i < nav.n; i++) if (!nav.blocked[i] && isFinite(spawnField[i])) reach++;
  ok(reach === free, 'every free nav cell is reachable from spawn (' + reach + '/' + free + ')');
  for (let i = 0; i < nav.n; i++) {
    if (nav.blocked[i]) continue;
    if (S.overlapsWall(S.cellX(nav, i), S.cellZ(nav, i), S.ENEMY_RADIUS, S.walls)) { ok(false, 'free cell ' + i + ' overlaps a wall'); break; }
  }
  // the field goes around walls: (0,-5) to (0,5) is ~1 unit straight but must detour past x=+-15
  const f = new Float64Array(nav.n);
  S.computeField(nav, S.nearestFreeCell(nav, 0, 5), f);
  const d = f[S.nearestFreeCell(nav, 0, -5)];
  ok(d > 30 && d < 45, 'path (0,-5)->(0,5) detours around the wall: ' + d.toFixed(1) + ' units');
  // a field step never moves into a blocked cell and always decreases
  let c = S.nearestFreeCell(nav, 0, -5), steps = 0, mono = true;
  while (f[c] > 0 && steps < 200) { const nx = S.fieldNext(nav, f, c); if (nx < 0 || f[nx] >= f[c] || nav.blocked[nx]) { mono = false; break; } c = nx; steps++; }
  ok(mono && f[c] === 0, 'following the field reaches the target monotonically in ' + steps + ' steps');
}
function chaseTrial(stage, enemyType, ex, ez, px, pz, ticks) {
  const sim = S.createSim(stage);
  sim.enemies = sim.enemies.filter(e => e.type === enemyType).slice(0, 1);
  const e = sim.enemies[0];
  e.x = e.px = ex; e.z = e.pz = ez;
  sim.player.x = px; sim.player.z = pz; sim.player.oxy = 1e9; sim.player.sanity = 1e9;
  let inside = 0, crossedThrough = 0, minD = Infinity;
  for (let t = 0; t < ticks && sim.status === 'play'; t++) {
    const zBefore = e.z, xBefore = e.x;
    S.stepSim(sim, idle);
    if (S.overlapsWall(e.x, e.z, S.ENEMY_RADIUS, S.walls)) inside++;
    // crossing the z=0..1 wall's band while within its x-span = passing through it
    if (Math.abs(xBefore) < 15 && Math.abs(e.x) < 15 && ((zBefore < 0 && e.z > 1) || (zBefore > 1 && e.z < 0))) crossedThrough++;
    minD = Math.min(minD, Math.hypot(e.x - sim.player.x, e.z - sim.player.z));
  }
  return { sim, inside, crossedThrough, minD, e };
}
{
  const r = chaseTrial(1, 'stalker', 0, -5, 0, 8, 1200);
  ok(r.inside === 0, 'stalker chasing across the middle wall never overlaps a wall (' + r.inside + ' ticks inside)');
  ok(r.crossedThrough === 0, 'stalker never passes through the wall');
  ok(r.sim.status === 'scare', 'stalker routes around and reaches the player (status ' + r.sim.status + ', min dist ' + r.minD.toFixed(2) + ')');
}
{
  const r = chaseTrial(1, 'resonator', 0, -8, 0, 10, 1500);
  ok(r.inside === 0 && r.crossedThrough === 0, 'resonator chasing through two rooms stays out of walls');
  ok(r.sim.status === 'scare', 'resonator reaches the player via the side corridor');
}
{
  // in open ground with a clear line, chase is direct as before: closes at its speed per tick
  const sim = S.createSim(1);
  sim.enemies = sim.enemies.filter(e => e.type === 'stalker');
  const e = sim.enemies[0];
  e.x = 22; e.z = -10; sim.player.x = 22; sim.player.z = 5;
  S.stepSim(sim, idle);
  ok(near(e.z, -10 + e.speed, 1e-9) && near(e.x, 22, 1e-9), 'clear line of sight: direct chase at full speed');
}
{
  // a stalker on the other side of a wall cannot drain oxygen through it
  const sim = S.createSim(1);
  sim.enemies = sim.enemies.filter(e => e.type === 'stalker');
  const e = sim.enemies[0];
  sim.player.x = 0; sim.player.z = -0.5;     // flush to the wall's south face
  e.x = 0; e.z = 1.8; e.stunnedTimer = 10;   // just north of it, held still for the check
  e.stunnedTimer = 0; e.speed = 0;
  const o0 = sim.player.oxy;
  S.stepSim(sim, idle);
  ok(near(sim.player.oxy, o0 - S.stageConfigs[1].oxyDepletion, 1e-9), 'stalker drain needs a clear line: no oxygen loss through a wall');
}
{
  const sim = S.createSim(1);
  ok(sim.enemies.every(e => !e.chasing), 'enemies start dormant');
  for (let i = 0; i < 60; i++) S.stepSim(sim, idle);
  ok(sim.enemies.every((e, i) => e.x === S.stageConfigs[1].enemies[i].x && e.z === S.stageConfigs[1].enemies[i].z), 'dormant enemies (player beyond aggro range) do not move');
}

/* ------------------------------------------------------------ PULSE */
section('PULSE - cone, cost, stun, knockback');
{
  const aim = S.aimFromYawPitch(0, 0, {});
  ok(near(aim.x, 0) && near(aim.y, 0) && near(aim.z, -1), 'yaw 0 pitch 0 aims down -z');
  const a2 = S.aimFromYawPitch(Math.PI / 2, 0, {});
  ok(near(a2.x, -1, 1e-9) && near(a2.z, 0, 1e-9), 'yaw +90 degrees aims down -x (three.js YXZ convention)');
  const mv = S.rotateMove(0, -1, Math.PI / 2, {});
  ok(near(mv.x, -1, 1e-9) && near(mv.z, 0, 1e-9), 'forward input follows the aim');
  const en = [
    { x: 0, z: 25 },       // straight ahead, 10 away
    { x: 0, z: 45 },       // behind
    { x: 0, z: 21 },       // 14 away: out of range
    { x: 9, z: 30 },       // 61 degrees off-axis: outside the cone
    { x: 4, z: 31 }        // 45 degrees off-axis: inside
  ];
  const hits = S.pulseHits(en, 0, S.EYE_HEIGHT, 35, 0, 0, -1, S.walls, []);
  ok(JSON.stringify(hits) === '[0,4]', 'cone hits ahead-in-range and 45 degrees, misses behind/far/61 degrees: ' + JSON.stringify(hits));
  const pitched = S.aimFromYawPitch(0, Math.PI / 3 + 0.01, {});
  ok(S.pulseHits(en, 0, S.EYE_HEIGHT, 35, pitched.x, pitched.y, pitched.z, S.walls, []).length === 0, 'aiming just past 60 degrees up misses enemies at eye height (cone edge)');
  const walled = S.pulseHits([{ x: 0, z: -3 }], 0, S.EYE_HEIGHT, 4, 0, 0, -1, S.walls, []);
  ok(walled.length === 0, 'the pulse wave does not pass through walls');
}
{
  const sim = S.createSim(1);
  const st = sim.enemies.find(e => e.type === 'stalker');
  sim.enemies = [st];
  st.x = 22; st.z = 28; sim.player.x = 22; sim.player.z = 35;
  ok(S.firePulse(sim, 0, 0), 'pulse fires with a full battery');
  ok(sim.player.battery === 85, 'pulse costs 15 battery');
  ok(st.stunnedTimer === S.PULSE_STUN_TICKS, 'hit enemy is stunned 120 ticks');
  const ev = sim.events.find(e => e.type === 'pulse');
  ok(ev && ev.a === 1 && ev.b[0] === 0, 'pulse event reports the hit');
  const z0 = st.z;
  for (let i = 0; i < 120; i++) S.stepSim(sim, idle);
  ok(near(z0 - st.z, S.PULSE_KNOCKBACK, 0.05), 'knockback totals ~8 units: ' + (z0 - st.z).toFixed(3));
  ok(st.stunnedTimer === 0, 'stun wears off after 120 ticks');
  sim.player.battery = 14;
  ok(!S.firePulse(sim, 0, 0) && sim.player.battery === 14, 'no pulse below 15 battery');
  ok(sim.events.some(e => e.type === 'fizzle' && e.a === 'pulse'), 'low-battery pulse fizzles');
}
{
  // knockback into a wall stops at the wall instead of passing through it
  const sim = S.createSim(1);
  sim.enemies = sim.enemies.filter(e => e.type === 'stalker');
  const st = sim.enemies[0];
  sim.player.x = 0; sim.player.z = 8; st.x = 0; st.z = 3;
  S.firePulse(sim, Math.PI, 0);   // face +z... wrong way: enemy is at -z, so face it (yaw 0)
  sim.events.length = 0; st.stunnedTimer = 0;
  S.firePulse(sim, 0, 0);
  for (let i = 0; i < 60; i++) { S.stepSim(sim, idle); if (S.overlapsWall(st.x, st.z, S.ENEMY_RADIUS, S.walls)) { ok(false, 'knocked-back enemy overlapped a wall'); break; } }
  ok(st.z > 1, 'knockback stops at the wall (z=' + st.z.toFixed(3) + '), it used to push enemies through');
}

/* ------------------------------------------------------------ FLOW */
section('FLOW - terminals, stage clear, victory, jumpscare, deaths');
{
  const sim = quiet(1);
  sim.terminals.forEach((t, i) => {
    sim.player.x = t.x; sim.player.z = t.z + 0.5;
    S.stepSim(sim, idle);
  });
  ok(sim.activated === 3 && sim.status === 'cleared', 'activating every stage-1 terminal clears the stage');
  ok(sim.events.filter(e => e.type === 'terminal').length === 3, 'one terminal event per node');
  ok(sim.events.some(e => e.type === 'cleared' && e.a === 1), 'cleared event names the stage');
  const p = Object.assign({}, sim.player);
  S.stepSim(sim, fwd);
  ok(sim.player.x === p.x && sim.player.oxy === p.oxy, 'a cleared sim no longer steps');
}
{
  const sim = quiet(3);
  sim.terminals.forEach(t => { sim.player.x = t.x; sim.player.z = t.z + 0.5; S.stepSim(sim, idle); });
  ok(sim.status === 'won' && sim.endMsg === 'FACILITY FULLY RESTORED & SECURED!', 'the last stage ends in victory');
}
{
  const sim = S.createSim(1);
  const st = sim.enemies[1];
  sim.player.x = 22; sim.player.z = 0; st.x = 22; st.z = -1.0;
  S.stepSim(sim, idle);
  ok(sim.status === 'scare' && sim.scareEnemy === 1, 'contact starts the jumpscare with that enemy');
  ok(sim.endMsg === 'STALKER CORRODED YOUR SUIT!', 'stalker death message');
  const ox = sim.player.oxy;
  for (let i = 0; i < S.SCARE_TICKS - 1; i++) S.stepSim(sim, idle);
  ok(sim.status === 'scare', 'still scaring after 71 ticks');
  ok(sim.player.oxy === ox, 'the world is frozen during the scare');
  S.stepSim(sim, idle);
  ok(sim.status === 'dead', 'scare resolves to death at 72 ticks');
  ok(sim.events.filter(e => e.type === 'end').length === 1, 'exactly one end event');
}
{
  const sim = S.createSim(1);
  sim.player.oxy = 0.01;
  sim.enemies[1].x = 0.5; sim.enemies[1].z = 35;   // also touching a stalker this tick
  S.stepSim(sim, idle);
  ok(sim.status === 'dead' && sim.endMsg === 'OXYGEN DEPLETED IN THE DARK', 'oxygen death ends the run immediately');
  S.stepSim(sim, idle);
  ok(sim.status === 'dead', 'a dead run cannot be pulled into a jumpscare afterwards (old double-end bug)');
}
{
  const sim = S.createSim(1);
  sim.player.sanity = 0.1;
  sim.player.x = 0; sim.player.z = -26;  // near the stage-1 resonator at (0,-30)
  sim.enemies[0].speed = 0;
  S.stepSim(sim, idle);
  ok(sim.status === 'scare' && sim.enemies[sim.scareEnemy].type === 'resonator', 'sanity loss scares with the nearest resonator');
  ok(sim.endMsg === 'SANITY COMPLETELY LOST!', 'sanity death message');
}
{
  const sim = S.createSim(1);
  sim.player.x = 0; sim.player.z = -26; sim.enemies[0].speed = 0;
  S.toggleJammer(sim);
  const s0 = sim.player.sanity;
  S.stepSim(sim, idle);
  ok(sim.player.sanity === s0, 'the jammer blocks resonator sanity drain');
  S.toggleJammer(sim);
  S.stepSim(sim, idle);
  ok(near(sim.player.sanity, s0 - S.stageConfigs[1].sanityDrain), 'without the jammer the resonator drains sanityDrain per tick');
}
{
  const sim = quiet(1);
  sim.player.oxy = S.LOW_OXY + 0.005;
  S.stepSim(sim, idle);
  ok(sim.events.some(e => e.type === 'low' && e.a === 'OXYGEN'), 'low oxygen warning fires once crossing 25');
  sim.events.length = 0;
  for (let i = 0; i < 10; i++) S.stepSim(sim, idle);
  ok(!sim.events.some(e => e.type === 'low'), 'and does not repeat');
}
{
  const sim = S.createSim(1);
  ok(S.toggleFlashlight(sim) && sim.player.flashlightOn === false, 'flashlight toggles');
  const s2 = S.createSim(2, { flashlightOn: sim.player.flashlightOn });
  ok(s2.player.flashlightOn === false, 'flashlight state carries into the next stage');
  ok(s2.player.oxy === 100 && s2.player.battery === 100 && s2.activated === 0, 'a new stage fully resets resources and nodes');
  sim.status = 'scare';
  ok(!S.firePulse(sim, 0, 0) && !S.toggleJammer(sim) && !S.toggleFlashlight(sim), 'no actions during a scare');
}

/* ------------------------------------------------------------ DIFFICULTY */
section('DIFFICULTY - the 3-stage curve');
const reports = [1, 2, 3].map(S.stageRouteReport);
reports.forEach(r => {
  ok(r.reachable, `stage ${r.stage}: every terminal reachable`);
  console.log(`  stage ${r.stage}: route ${r.route.toFixed(0)}u = ${r.walkSecs.toFixed(1)}s walking, oxygen ${r.oxySecs.toFixed(1)}s, margin ${r.margin.toFixed(2)}x, ` +
    `sanity ${r.sanitySecsInRange.toFixed(1)}s in resonator range, resonator ${r.maxResonatorSpeed.toFixed(1)}u/s, stalker ${r.maxStalkerSpeed.toFixed(1)}u/s`);
});
ok(reports[0].margin > reports[1].margin && reports[1].margin > reports[2].margin, 'oxygen margin shrinks stage by stage');
ok(reports.every(r => r.margin >= 1.4), 'every stage leaves at least 1.4x the oxygen a perfect walking route needs (before any refills)');
ok(reports[0].margin >= 2.0, 'stage 1 is forgiving (>= 2x oxygen margin)');
ok(reports[1].margin / reports[2].margin < 1.6, 'no cliff between stage 2 and 3: margin ratio ' + (reports[1].margin / reports[2].margin).toFixed(2));
ok(reports.every(r => r.maxResonatorSpeed < S.WALK_SPEED * 60), 'resonators can always be out-walked (the jammer is a choice, not a tax)');
ok(reports.every(r => r.maxStalkerSpeed <= S.WALK_SPEED * 60), 'stalkers never out-walk you: the pulse buys distance, it is not mandatory every few seconds');
ok(reports[0].sanitySecsInRange < reports[0].oxySecs, 'resonator range is deadly enough to respect');
ok(reports.every((r, i) => i === 0 || r.enemies >= reports[i - 1].enemies), 'enemy count never decreases');

/* ------------------------------------------------------------ INPUT */
section('INPUT - one path for keyboard, touch and look');
ok(S.actionForKey('KeyW') === 'forward' && S.actionForKey('ArrowUp') === 'forward', 'W/Up -> forward');
ok(S.actionForKey('Space') === 'jammer' && S.actionForKey('KeyF') === 'flashlight', 'Space jammer, F flashlight (unchanged)');
ok(S.actionForKey('ShiftLeft') === 'sprint' && S.actionForKey('KeyR') === 'restart', 'Shift sprint, R restart (unchanged)');
ok(S.actionForKey('KeyQ') === null && S.actionForKey('toString') === null, 'unmapped keys are ignored (no prototype lookups)');
{
  const m = S.keyMove({ forward: true, right: true }, {});
  ok(near(Math.hypot(m.x, m.z), 1) && m.x > 0 && m.z < 0, 'diagonal keys normalise to unit length like the original');
  const z = S.keyMove({ forward: true, back: true }, {});
  ok(z.x === 0 && z.z === 0, 'opposite keys cancel');
}
{
  const o = {};
  S.stickVector(3, 0, 56, 0.12, o);
  ok(o.mag === 0, 'stick dead zone swallows small drags');
  S.stickVector(0, -200, 56, 0.12, o);
  ok(near(o.mag, 1) && near(o.y, -1) && near(o.x, 0), 'stick clamps to full deflection');
  S.stickVector(28, 0, 56, 0.12, o);
  ok(o.mag > 0.4 && o.mag < 0.5, 'half deflection rescales past the dead zone: ' + o.mag.toFixed(3));
  const sim = quiet(1);
  sim.player.x = 25;
  S.stepSim(sim, { mx: 0, mz: -0.5, sprint: false, yaw: 0 });
  ok(near(35 - sim.player.z, S.WALK_SPEED * 0.5, 1e-9), 'analog stick: half deflection walks at half speed');
}
{
  const v = { yaw: 0, pitch: 0 };
  S.lookStep(v, 100, 0, 0.002, false);
  ok(near(v.yaw, -0.2), 'mouse x moves yaw at 0.002 rad/px (original sensitivity)');
  for (let i = 0; i < 20; i++) S.lookStep(v, 0, -100000, 0.002, false);
  ok(near(v.pitch, S.PITCH_LIMIT), 'pitch clamps at +60 degrees');
  const v2 = { yaw: 0, pitch: 0 };
  S.lookStep(v2, 5000, 0, 0.002, false);
  ok(near(v2.yaw, -S.LOOK_MAX_DELTA * 0.002), 'a huge single mouse delta is clamped');
  const v3 = { yaw: 0, pitch: 0 };
  S.lookStep(v3, 0, 10, 0.002, true);
  ok(v3.pitch > 0, 'invert Y flips pitch');
  ok(S.smoothFactor(1 / 60, 0) === 1, 'smoothing 0 = raw look');
  const k1 = S.smoothFactor(1 / 60, 1), k2 = S.smoothFactor(1 / 144, 1);
  ok(k1 > 0 && k1 < 1 && k2 < k1, 'smoothing factor is frame-time aware');
  ok(near(1 - Math.pow(1 - k2, 144 / 60), k1, 1e-9), 'smoothing converges identically at 60 and 144 Hz');
}
{
  const s = S.normalizeSettings({ sens: 99, smooth: -1, invertY: 'yes', motion: 'wild', volume: NaN });
  ok(s.sens === 3 && s.smooth === 0 && s.invertY === false && s.motion === 'auto' && s.volume === S.DEFAULT_SETTINGS.volume, 'settings are clamped and garbage falls back to defaults');
  ok(JSON.stringify(S.normalizeSettings(null)) === JSON.stringify(S.DEFAULT_SETTINGS), 'missing settings -> defaults');
  ok(S.normalizeSettings({ motion: 'reduced' }).motion === 'reduced', 'reduced-motion setting is kept');
}

/* ------------------------------------------------------------ HANDOFF */
section('HANDOFF - MONSTER TRAIL arrival');
const NOW = 1760000000000 + 60 * 1000;
const good = JSON.stringify({ v: 1, lead: { name: 'PYRELASH', species: 'pyrelash', level: 31 }, party: 4, dex: 14, ts: 1760000000000, consumed: false });
{
  const h = S.parseHandoff(good);
  ok(h && h.lead.name === 'PYRELASH' && h.lead.level === 31 && h.party === 4 && h.dex === 14, 'spec example record parses');
  ok(S.introLine(h) === "The signal that pulled you off the trail... PYRELASH isn't here to help you now.", 'opening line names the lead monster');
  ok(S.dossierLine(h).indexOf('PYRELASH Lv 31') >= 0, 'dossier line carries level');
  ok(S.victoryLine(h).indexOf('PYRELASH') >= 0, 'victory line names the lead');
}
const bad = [
  [null, 'missing'], ['', 'empty'], ['{not json', 'garbage'], ['[]', 'array'], ['42', 'number'],
  ['"PYRELASH"', 'bare string'], [JSON.stringify({ v: 0, lead: { name: 'X' } }), 'old version'],
  [JSON.stringify({ v: 2, lead: { name: 'X' } }), 'unknown future version'],
  [JSON.stringify({ v: 1 }), 'no lead'], [JSON.stringify({ v: 1, lead: { name: 42 } }), 'non-string name'],
  [JSON.stringify({ v: 1, lead: { name: '   ' } }), 'blank name'], ['x'.repeat(5000), 'oversized'],
  [JSON.stringify({ v: '1', lead: { name: 'X' } }), 'string version']
];
bad.forEach(([raw, why]) => ok(S.parseHandoff(raw) === null, 'rejects ' + why + ' record'));
{
  const evil = JSON.stringify({ v: 1, lead: { name: '<img src=x onerror=alert(1)>' + String.fromCharCode(0, 0x202e) + '', level: 9999 }, party: 'six', dex: -3, ts: 1 });
  const h = S.parseHandoff(evil);
  ok(h && h.lead.name.length <= 16, 'hostile name is capped at 16 chars');
  ok(h && [...h.lead.name].every(ch => ch.charCodeAt(0) >= 32) && h.lead.name.indexOf(String.fromCharCode(0x202e)) < 0, 'control and bidi characters are stripped');
  ok(h && h.lead.level === null && h.party === null && h.dex === null, 'out-of-range numbers are dropped, not trusted');
  ok(S.introLine(h).indexOf('<IMG') >= 0, 'markup stays literal text (the shell renders it with textContent)');
}
{
  const r = S.resolveArrival(good, '?from=trail', NOW);
  ok(r.arrived && r.handoff && r.consume, '?from=trail + fresh record -> arrival with the lead');
  const r2 = S.resolveArrival(good, '', NOW);
  ok(r2.arrived && r2.handoff, 'fresh record without the param still counts as an arrival');
  const r3 = S.resolveArrival(good, '', NOW + S.HANDOFF_MAX_AGE_MS + 1);
  ok(!r3.arrived, 'a stale record without the param is a standalone start');
  const r4 = S.resolveArrival(good, '?from=trail', NOW + 30 * 24 * 3600 * 1000);
  ok(r4.arrived && r4.handoff, 'with the param, an unconsumed record is used whatever its age');
  const consumed = S.consumeHandoff(good, NOW);
  ok(JSON.parse(consumed).consumed === true && JSON.parse(consumed).lead.name === 'PYRELASH', 'consume marks the record and keeps its fields');
  const r5 = S.resolveArrival(consumed, '', NOW);
  ok(!r5.arrived, 'a consumed record is not replayed on the next visit');
  const r6 = S.resolveArrival(consumed, '?from=trail', NOW);
  ok(r6.arrived && r6.handoff === null && !r6.consume, 'param + consumed record -> generic arrival, nothing rewritten');
  ok(S.introLine(null).indexOf('whatever walked beside you') >= 0, 'generic intro line without a lead');
  const r7 = S.resolveArrival('{garbage', '?from=trail', NOW);
  ok(r7.arrived && r7.handoff === null, 'param + garbage record -> generic arrival');
  const r8 = S.resolveArrival(null, '', NOW);
  ok(!r8.arrived && !r8.consume, 'no param, no record -> standalone, exactly as before');
  ok(S.hasTrailParam('?x=1&from=trail') && !S.hasTrailParam('?from=trails') && !S.hasTrailParam(null), 'param detection is exact');
  ok(S.consumeHandoff('{bad', NOW) === '{bad', 'consume leaves garbage untouched');
  const future = JSON.stringify({ v: 1, lead: { name: 'A' }, ts: NOW + 3600 * 1000 });
  ok(!S.resolveArrival(future, '', NOW).arrived, 'a record from the future (clock skew > 5 min) is not trusted without the param');
}

/* ------------------------------------------------------------ VIEW (THREE stub) */
section('VIEW - stage build/dispose does not leak');
const counts = { created: 0, disposed: 0 };
class V3 { constructor() { this.x = 0; this.y = 0; this.z = 0; } set(x, y, z) { this.x = x; this.y = y; this.z = z; return this; } }
class Obj { constructor() { this.position = new V3(); this.rotation = new V3(); this.scale = new V3(); this.children = []; } add(o) { this.children.push(o); } remove(o) { const i = this.children.indexOf(o); if (i >= 0) this.children.splice(i, 1); } }
class Res { constructor() { counts.created++; this.disposed = false; this.color = { setHex() {}, setRGB() {} }; } dispose() { if (!this.disposed) { this.disposed = true; counts.disposed++; } } }
class Light extends Obj { constructor() { super(); counts.created++; this.color = { setHex() {} }; this.disposed = false; } dispose() { if (!this.disposed) { this.disposed = true; counts.disposed++; } } }
const T = {
  DoubleSide: 2, Mesh: class extends Obj { constructor(g, m) { super(); this.geometry = g; this.material = m; } },
  Group: Obj, PointLight: Light,
  SphereGeometry: Res, TetrahedronGeometry: Res, BoxGeometry: Res, CylinderGeometry: Res, RingGeometry: Res,
  MeshStandardMaterial: Res, MeshBasicMaterial: Res
};
{
  const scene = new Obj();
  const assets = S.makeAssets(T);
  const shared = counts.created;
  const baseline = scene.children.length;
  for (let round = 0; round < 3; round++) {
    for (let n = 1; n <= 3; n++) {
      const before = counts.created - counts.disposed;
      const sim = S.createSim(n);
      const v = S.buildStageView(sim, scene, T, assets);
      ok(v.enemies.length === sim.enemies.length && v.terminals.length === sim.terminals.length, `stage ${n}: one view per enemy and terminal`);
      ok(scene.children.length === baseline + sim.enemies.length + sim.terminals.length + sim.sanityStations.length + sim.oxygenStations.length, `stage ${n}: scene holds exactly the stage's objects`);
      ok(v.enemies.every(e => e.mesh.geometry === assets.resGeo || e.mesh.geometry === assets.stalkGeo), `stage ${n}: enemy geometry is shared, not rebuilt`);
      S.disposeStageView(v, scene);
      ok(scene.children.length === baseline, `stage ${n}: dispose removes every stage object from the scene`);
      ok(counts.created - counts.disposed === before, `stage ${n}: every per-stage material/light is disposed (${counts.created - counts.disposed - before} live)`);
    }
  }
  ok(counts.created - counts.disposed === shared, 'after 9 stage setups only the shared assets remain (' + shared + ')');
  ok(Object.values(assets).every(a => !a.disposed), 'shared assets are never disposed by a stage teardown');
}

/* ------------------------------------------------------------ SOURCE */
section('SOURCE - guard rails');
ok(!/innerHTML/.test(inline[0][2]), 'the script never uses innerHTML (handoff data is text-only)');
ok(!/setTimeout\(\s*\(\)\s*=>\s*\{?\s*triggerEnd/.test(inline[0][2]), 'the jumpscare end runs on the sim clock, not a wall-clock setTimeout');
ok(/prefers-reduced-motion/.test(src), 'reduced-motion preference is honoured');
ok(!/animation:\s*flash\s+0\.0\d+s/.test(src), 'no strobing flash animation');
ok(S.THREE_SOURCES[0].indexOf('cdnjs.cloudflare.com/ajax/libs/three.js/r128/') >= 0, 'three.js r128 from cdnjs stays the primary source');
ok(S.THREE_SOURCES.every(u => /^https:\/\//.test(u) && /(r128|0\.128\.0)/.test(u)), 'every source is https and the same r128 build');

console.log('\n' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
