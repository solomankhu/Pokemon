const { chromium } = require('C:/Users/ADMIN/AppData/Local/npm-cache/_npx/e41f203b7505f1fb/node_modules/playwright');
const fs = require('fs');
const BUDGET_MS = 1700000;
(async () => {
  const browser = await chromium.launch({ args: ['--autoplay-policy=no-user-gesture-required'] });
  const ctx = await browser.newContext({ viewport: { width: 1000, height: 760 }, reducedMotion: process.env.RM ? 'reduce' : 'no-preference', hasTouch: !!process.env.TOUCH });
  let page = await ctx.newPage();
  await page.goto("http://127.0.0.1:8765/claude's%20monsters.html");
  await page.waitForTimeout(500);
  // ---- QA driver library (Node side, real keyboard via page.keyboard) ----
  const PHASE_T0 = Date.now();
  const PROG = 'E:/game/.playwright-mcp/qa/progress.log';
  const prog = (m) => fs.appendFileSync(PROG, new Date().toISOString().slice(11, 19) + ' ' + m + String.fromCharCode(10));
  let stepN = 0;
  const SHOT = 'E:/game/.playwright-mcp/qa/';
  const DEADLINE = Date.now() + (typeof BUDGET_MS !== 'undefined' ? BUDGET_MS : 420000);
  const late = () => Date.now() > DEADLINE;
  const LOG = [];
  const log = (s) => { LOG.push(s); try { prog('LOG ' + s); } catch (e) {} };
  const wait = (ms) => page.waitForTimeout(ms);
  const st = () => page.evaluate(() => {
    const G = __GAME__.G, b = G.battle;
    return { mode: G.mode, x: G.player.tx, y: G.player.ty, moving: G.player.moving, fade: G.fadeDir,
      lungeAge: __GAME__.CFX.lungeAge, building: G.building,
      lantern: G.lantern, tension: G.tension, pulses: G.pulses, stalker: G.stalker ? [G.stalker.x, G.stalker.y, G.stalker.mode, G.stalker.stun] : null,
      party: G.party.map(m => [m.name, m.level, m.hp, m.maxhp]), balls: G.balls, steps: G.steps,
      dlg: G.dialogue ? G.dialogue.lines[G.dialogue.i] : null, toast: G.toast && G.toast.t > 0 ? G.toast.s : null,
      battle: b ? { phase: b.phase, msg: b.step && b.step.t === 'msg' ? b.step.s : null, cursor: b.cursor,
        foe: [b.foe.name, b.foe.level, b.foe.hp, b.foe.maxhp], mine: [b.mine.name, b.mine.level, b.mine.hp], trainer: b.trainer ? b.trainer.name : null, hunt: b.hunt } : null };
  });
  const key = async (k, hold = 35) => { await page.keyboard.down(k); await wait(hold); await page.keyboard.up(k); await wait(25); };
  const shot = (name) => page.screenshot({ path: SHOT + name + '.png' });
  const errs = [];
  page.on('console', m => { if (m.type() === 'error' || m.type() === 'warning') errs.push(m.type() + ': ' + m.text()); });
  page.on('pageerror', e => errs.push('pageerror: ' + e.message));

  // BFS in page. Returns list of dirs to reach any tile in goals (array of [x,y]).
  const pathTo = (goals, avoidGrass) => page.evaluate(([goals, avoidGrass]) => {
    const g = __GAME__, G = g.G;
    const npc = g.npcTiles();
    const blk = (x, y, d) => g.tileBlocked(x, y, d, G.edits, G.picked, npc);
    const key = (x, y) => x + ',' + y;
    const goal = new Set(goals.map(([x, y]) => key(x, y)));
    const D = { up: [0, -1], down: [0, 1], left: [-1, 0], right: [1, 0] };
    const sx = G.player.tx, sy = G.player.ty;
    // 0-1 BFS-ish: Dijkstra with small costs (grass costs more when avoiding)
    const dist = new Map([[key(sx, sy), 0]]), prev = new Map();
    let frontier = [[0, sx, sy]];
    while (frontier.length) {
      frontier.sort((a, b) => a[0] - b[0]);
      const [c, x, y] = frontier.shift();
      if (c > dist.get(key(x, y))) continue;
      if (goal.has(key(x, y))) {
        const out = []; let k = key(x, y);
        while (prev.has(k)) { const [pk, d] = prev.get(k); out.push(d); k = pk; }
        return out.reverse();
      }
      for (const d in D) {
        let nx = x + D[d][0], ny = y + D[d][1];
        if (nx < 0 || ny < 0 || nx >= g.MAP_W || ny >= g.MAP_H) continue;
        if (blk(nx, ny, d)) continue;
        if (g.tileHere(nx, ny) === 'v') { if (blk(nx, ny + 1, 'down')) continue; ny += 1; }
        const t = g.tileHere(nx, ny);
        const nc = c + 1 + (avoidGrass && (t === ',' || t === ';') ? 6 : 0);
        const nk = key(nx, ny);
        if (!dist.has(nk) || nc < dist.get(nk)) { dist.set(nk, nc); prev.set(nk, [key(x, y), d]); frontier.push([nc, nx, ny]); }
      }
    }
    return null;
  }, [goals, avoidGrass]);

  const KEYOF = { up: 'ArrowUp', down: 'ArrowDown', left: 'ArrowLeft', right: 'ArrowRight' };
  const STATS = (await page.evaluate(() => window.__QA_STATS)) || { battles: 0, wild: 0, trainer: 0, hunts: 0, caught: 0, whiteouts: 0, pulses: 0, heals: 0, boosts: [], regions: [], t0: Date.now(), events: [] };
  let lastRegion = await page.evaluate(() => window.__QA_REGION || null);
  const trackRegion = async () => {
    const r = await page.evaluate(() => { const g = __GAME__; return { name: g.regionName(g.G.player.ty), party: g.G.party.map(m => m.name + ' ' + m.level), steps: g.G.steps }; });
    if (r.name && r.name !== lastRegion) { STATS.regions.push({ region: r.name, from: lastRegion, party: r.party, steps: r.steps, min: (((STATS.activeMs || 0) + Date.now() - PHASE_T0) / 60000).toFixed(1), battles: STATS.battles }); lastRegion = r.name; await page.evaluate((n) => { window.__QA_REGION = n; }, r.name); }
  };
  const heal = async (why) => { STATS.heals++; STATS.events.push('SHORTCUT healParty: ' + why); await page.evaluate(() => __GAME__.healParty()); };

  // One step: tap the direction, wait for the move to finish.
  const step = async (d) => {
    const before = await st();
    if (++stepN % 25 === 0) prog('step ' + before.x + ',' + before.y + ' mode=' + before.mode + ' party=' + before.party.map(p => p[0][0] + p[1] + ':' + p[2]).join(' ') + ' toast=' + before.toast);
    await key(KEYOF[d], 30);
    for (let i = 0; i < 60; i++) {
      const s = await st();
      if (s.mode !== 'overworld' || s.fade !== 0) return s;
      if (!s.moving && (s.x !== before.x || s.y !== before.y)) return s;
      if (!s.moving && i > 3) return s;   // blocked / turned only
      await wait(30);
    }
    return st();
  };

  // Battle auto-pilot using real keys. policy(s) -> 'fight' | 'ball' | 'run'
  const bestMove = () => page.evaluate(() => {
    const g = __GAME__, b = g.G.battle;
    let best = 0, bv = -1;
    b.mine.moves.forEach((id, i) => {
      const mv = g.MOVES[id];
      let v = 0;
      if (mv.cat !== 'status') {
        const eff = g.typeEffectiveness(mv.type, g.SPECIES[b.foe.id].types);
        const stab = g.SPECIES[b.mine.id].types.includes(mv.type) ? 1.5 : 1;
        const atk = mv.cat === 'spec' ? b.mine.spa : b.mine.atk;
        v = (mv.pow || 0) * eff * stab * atk * ((mv.acc || 100) / 100);
      } else v = 0.1;
      if (v > bv) { bv = v; best = i; }
    });
    return best;
  });
  const moveCursorTo = async (target) => {
    for (let i = 0; i < 8; i++) {
      const s = await st();
      const c = s.battle.cursor;
      if (c === target) return;
      const dc = target % 2 - c % 2, dr = Math.floor(target / 2) - Math.floor(c / 2);
      if (dr) await key(dr > 0 ? 'ArrowDown' : 'ArrowUp'); else if (dc) await key(dc > 0 ? 'ArrowRight' : 'ArrowLeft');
    }
  };
  const msgs = [];
  const fightBattle = async (policy) => {
    let s = await st();
    const first = s.battle;
    STATS.battles++;
    if (first && first.hunt) STATS.hunts++; else if (first && first.trainer) STATS.trainer++; else STATS.wild++;
    let lastMsg = null, guard = 0;
    const tag = (first && first.hunt ? 'H ' : first && first.trainer ? 'T ' + first.trainer + ' ' : 'W ') + (first ? first.foe[0] + first.foe[1] : '?') + ' vs ' + (first ? first.mine[0] + first.mine[1] : '?');
    while (guard++ < 3000) {
      s = await st();
      if (s.mode === 'dialogue' && s.dlg) { msgs.push('D:' + s.dlg); await key('z'); continue; }
      if (s.mode !== 'battle') break;
      const b = s.battle;
      if (s.fade !== 0 || s.lungeAge !== null) { await wait(40); continue; }
      if (b.msg) { if (b.msg !== lastMsg) msgs.push(b.msg); lastMsg = b.msg; if (/was caught/.test(b.msg)) STATS.caught++; await key('z'); continue; }
      if (b.phase === 'menu') {
        const act = policy ? policy(s) : 'fight';
        if (act === 'ball') { await moveCursorTo(1); await key('z'); }
        else if (act === 'run') { await moveCursorTo(3); await key('z'); }
        else { await moveCursorTo(0); await key('z'); }
        continue;
      }
      if (b.phase === 'fight') { const m = await bestMove(); await moveCursorTo(m); await key('z'); continue; }
      if (b.phase === 'swap') {
        const idx = await page.evaluate(() => { const G = __GAME__.G; let bi = -1, bl = -1; G.party.forEach((m, i) => { if (m.hp > 0 && m !== G.battle.mine && m.level > bl) { bl = m.level; bi = i; } }); return bi; });
        await moveCursorTo(idx); await key('z'); continue;
      }
      await wait(30);
    }
    // settle the fade / any post-battle dialogue
    for (let i = 0; i < 200; i++) {
      s = await st();
      if (s.mode === 'dialogue') { msgs.push('D:' + s.dlg); if (/scrambled back/.test(s.dlg || '')) STATS.whiteouts++; await key('z'); continue; }
      if (s.fade === 0 && s.mode !== 'battle') break;
      await wait(40);
    }
    const end = await page.evaluate(() => __GAME__.G.party.map(m => m.name[0] + m.level + ':' + m.hp));
    prog('BATTLE ' + tag + ' -> ' + end.join(' '));
    STATS.events.push(tag + ' -> ' + end.join(' ') + (msgs.slice(-12).some(m => /scrambled back/.test(m)) ? ' WHITEOUT' : ''));
    return s;
  };

  // Clear dialogue (pressing z until mode leaves dialogue).
  const talkThrough = async () => {
    for (let i = 0; i < 60; i++) {
      const s = await st();
      if (s.mode === 'dialogue') { msgs.push('D:' + s.dlg); await key('z'); continue; }
      if (s.fade !== 0) { await wait(40); continue; }
      return s;
    }
  };

  let battlePolicy = null;
  // Walk to goal tiles, handling battles/dialogue that interrupt. Returns final state.
  const walkTo = async (goals, opts = {}) => {
    if (!Array.isArray(goals[0])) goals = [goals];
    for (let tries = 0; tries < 400; tries++) {
      if (late()) { log('DEADLINE in walkTo'); return st(); }
      let s = await st();
      if (goals.some(([x, y]) => x === s.x && y === s.y)) return s;
      if (s.mode === 'battle') { await fightBattle(battlePolicy); if (opts.afterBattle) await opts.afterBattle(); continue; }
      if (s.mode === 'dialogue') { await talkThrough(); continue; }
      if (s.mode !== 'overworld') { log('walkTo: odd mode ' + s.mode); return s; }
      const path = await pathTo(goals, !!opts.avoidGrass);
      if (!path) { log('walkTo: no path to ' + JSON.stringify(goals) + ' from ' + s.x + ',' + s.y); return s; }
      if (path.length === 0) return s;
      for (const d of path.slice(0, 12)) {
        const r = await step(d);
        await trackRegion();
        if (opts.onStep) await opts.onStep(r);
        if (r.mode !== 'overworld' || r.fade !== 0) break;
      }
    }
    return st();
  };
  // Stand next to (tx,ty), face it, press z.
  const interactWith = async (tx, ty) => {
    const nb = [[tx, ty + 1, 'up'], [tx, ty - 1, 'down'], [tx - 1, ty, 'right'], [tx + 1, ty, 'left']];
    await walkTo(nb.map(n => [n[0], n[1]]));
    const s = await st();
    const n = nb.find(n => n[0] === s.x && n[1] === s.y);
    if (!n) return false;
    await key(KEYOF[n[2]], 30); await wait(60);
    await key('z');
    return true;
  };
  const boost = (lv) => page.evaluate((lv) => { const g = __GAME__; for (const m of g.G.party) if (m.level < lv) { g.gainXp(m, g.xpForLevel(lv) - m.xp); m.hp = m.maxhp; } }, lv);
  const done = async (extra) => { STATS.activeMs = (STATS.activeMs || 0) + Date.now() - PHASE_T0; await page.evaluate((s) => { window.__QA_STATS = s; }, STATS); return { log: LOG, errs, stats: STATS, msgs: msgs.slice(-60), state: await st(), extra }; };
  // Grind in a grass rect until lead level >= lv (or maxB battles). Heals (shortcut) when low.
  const grind = async (rect, lv, maxB = 40, policy = null) => {
    const [x1, y1, x2, y2] = rect;
    const tiles = await page.evaluate(([x1, y1, x2, y2]) => { const g = __GAME__, out = []; for (let y = y1; y <= y2; y++) for (let x = x1; x <= x2; x++) if (g.GRASS.includes(g.tileHere(x, y)) && !g.blockedFor(x, y, 'none')) out.push([x, y]); return out; }, rect);
    const startB = STATS.battles; let flip = 0;
    battlePolicy = policy;
    while (STATS.battles - startB < maxB && !late()) {
      const s = await st();
      const lead = s.party.find(p => p[2] > 0);
      if (lead && Math.min(...s.party.slice(0, 1).map(p => p[1])) >= lv) break;
      if (!lead || s.party.reduce((a, p) => a + p[2], 0) < 0.4 * s.party.reduce((a, p) => a + p[3], 0)) await heal('grind low hp');
      const tgt = tiles[(flip++ * 7) % tiles.length];
      await walkTo(tgt);
    }
    battlePolicy = null;
  };

  // Fight a trainer by id: talk to them; on whiteout, record + boost + retry.
  const fightTrainer = async (id, opts = {}) => {
    for (let attempt = 1; attempt <= 4 && !late(); attempt++) {
      const beaten = await page.evaluate((id) => !!__GAME__.G.beaten[id], id);
      if (beaten) return attempt - 1;
      const n = await page.evaluate((id) => { const n = __GAME__.npcById(id); return [n.x, n.y, n.team.map(t => t[1])]; }, id);
      const s0 = await st();
      if (opts.heal !== false && s0.party.reduce((a, p) => a + p[2], 0) < 0.7 * s0.party.reduce((a, p) => a + p[3], 0)) await heal('before ' + id);
      const wb = STATS.whiteouts;
      await interactWith(n[0], n[1]);
      await wait(150);
      for (let i = 0; i < 40; i++) { const s = await st(); if (s.mode === 'battle') break; if (s.mode === 'dialogue') { await key('z'); continue; } await wait(50); }
      if ((await st()).mode === 'battle') { if (opts.shot) { await wait(900); await shot(opts.shot); } await fightBattle(battlePolicy); }
      if (STATS.whiteouts > wb) {
        const lv = Math.max(...n[2]) + 1;
        STATS.boosts.push(id + ' attempt ' + attempt + ' lost -> boost party to ' + lv);
        await boost(lv);
      }
    }
    return -1;
  };
  // ---- end lib ----

  const SAVEF = 'E:/game/.playwright-mcp/qa/run_save.json', STATF = 'E:/game/.playwright-mcp/qa/run_stats.json';
  const menuSave = async () => {
    await key('x'); await wait(120);
    for (let i = 0; i < 8; i++) { const c = await page.evaluate(() => __GAME__.G.menu && __GAME__.G.menu.cursor); if (c === 1) break; await key('ArrowDown'); }
    await key('z'); await wait(150);
    const s = await st();
    const raw = await page.evaluate(() => localStorage.getItem('monster-trail-save-v1'));
    fs.writeFileSync(SAVEF, raw);
    fs.writeFileSync(STATF, JSON.stringify({ STATS, lastRegion }));
    return s.toast;
  };
  const resume = async () => {
    const raw = fs.readFileSync(SAVEF, 'utf8');
    await page.evaluate((raw) => localStorage.setItem('monster-trail-save-v1', raw), raw);
    await page.reload(); await wait(700);
    await key('ArrowDown'); await wait(80); await key('z'); await wait(300);
    const j = JSON.parse(fs.readFileSync(STATF, 'utf8'));
    Object.assign(STATS, j.STATS); lastRegion = j.lastRegion;
    return st();
  };

  const r = {};
  await resume();
  r.resumed = await st();
  // Ridge CENTRE attempt
  await interactWith(12, 58);
  r.ridgeCentre = LOG.slice(-1)[0];
  await heal('ridge town (centre door unreachable)');
  battlePolicy = (s) => (s.party.length < 3 && !s.battle.trainer && !s.party.some(p => p[0] === s.battle.foe[0]) && s.balls > 0) ? 'ball' : 'fight';
  // QUARRY HAND
  await interactWith(35, 46); await wait(150);
  await shot('p2_20_quarry_hand');
  await talkThrough();
  r.pick = await page.evaluate(() => __GAME__.G.flags.pick);
  // facing a boulder w/o tier issue: try mining a seam-less boulder; mine ORE deposits
  const deps = await page.evaluate(() => __GAME__.ORE_DEPOSITS);
  let mined = 0, shotMine = false;
  const mineAt = async (x, y) => {
    const ok = await interactWith(x, y);
    await wait(60);
    if (!shotMine) { shotMine = true; await wait(20); await shot('p2_21_mine_fx'); }
    await talkThrough();
    const t = await page.evaluate(([x, y]) => __GAME__.tileHere(x, y), [x, y]);
    if (t !== '#') mined++;
  };
  for (const [x, y] of deps) { if (late()) break; await mineAt(x, y); }
  r.afterOre = await page.evaluate(() => Object.assign({}, __GAME__.G.materials));
  // more stone from other boulders, nearest first
  for (let i = 0; i < 25 && !late(); i++) {
    const m = await page.evaluate(() => __GAME__.G.materials);
    if (m.stone >= 18) break;
    const tgt = await page.evaluate(() => { const g = __GAME__, G = g.G; let best = null, bd = 1e9; for (let y = g.ROCK_BAND[0]; y <= g.ROCK_BAND[1]; y++) for (let x = 2; x < g.MAP_W - 2; x++) { if (g.tileHere(x, y) !== '#' || !g.canMine('#', x, y, 1)) continue; const open = [[0,1],[0,-1],[1,0],[-1,0]].some(([dx,dy]) => !g.blockedFor(x+dx, y+dy, 'none')); if (!open) continue; const d = Math.abs(x - G.player.tx) + Math.abs(y - G.player.ty); if (d < bd) { bd = d; best = [x, y]; } } return best; });
    if (!tgt) break;
    await mineAt(tgt[0], tgt[1]);
  }
  r.mats = await page.evaluate(() => Object.assign({}, __GAME__.G.materials));
  r.mined = mined;
  // CRAFT via the real menu
  const openCraft = async () => { await key('x'); await wait(100); for (let i = 0; i < 8; i++) { const c = await page.evaluate(() => __GAME__.G.menu && __GAME__.G.menu.cursor); if (c === 3) break; await key('ArrowDown'); } await key('z'); await wait(100); };
  const craftRow = async (row) => { for (let i = 0; i < 10; i++) { const c = await page.evaluate(() => __GAME__.G.craftCursor); if (c === row) break; await key('ArrowDown'); } await key('z'); await wait(80); return page.evaluate(() => __GAME__.G.craftMsg); };
  await openCraft();
  await shot('p2_22_craft_open');
  r.craft = [];
  r.craft.push(await craftRow(2));          // IRON PICK
  r.craft.push(await craftRow(4)); r.craft.push(await craftRow(4)); r.craft.push(await craftRow(4)); r.craft.push(await craftRow(4)); // 3 PULSE then cap
  r.craft.push(await craftRow(3));          // oil at full lamp
  r.craft.push(await craftRow(0)); r.craft.push(await craftRow(0));  // 2 walls
  r.craft.push(await craftRow(2));          // iron pick again (owned)
  await shot('p2_23_craft_after');
  r.craftMode = (await st()).mode;
  await craftRow(5);                        // BUILD WALLS
  r.buildToast = (await st()).toast;
  await shot('p2_24_build_mode');
  // place a wall: face a bare ground tile in the pass and press z
  const spot = await page.evaluate(() => { const g = __GAME__, G = g.G; for (let d = 1; d < 12; d++) for (const [dx, dy] of [[1,0],[-1,0],[0,1],[0,-1]]) { const x = G.player.tx + dx * d, y = G.player.ty + dy * d; } const out = []; for (let y = 41; y <= 50; y++) for (let x = 46; x < 80; x++) { if (g.placementOk(x, y, G.edits, G.picked, g.npcTiles(), [G.player.tx, G.player.ty])[0]) out.push([x, y]); } return out.slice(0, 1); });
  if (spot[0]) { await interactWith(spot[0][0], spot[0][1]); await wait(150); r.placeToast = (await st()).toast; await shot('p2_25_wall_placed'); }
  // try placing on the path (refusal toast)
  await walkTo([44, 45]); await key('ArrowLeft'); await wait(60); await key('z'); await wait(120);
  r.refuseToast = (await st()).toast; await shot('p2_26_refusal_toast');
  // keep build mode ON, fight ROCKHOUND MAYA, walk to the cave mouth
  r.t6 = await fightTrainer('t6', { shot: 'p2_27_maya_battle' });
  r.buildingAfterBattle = (await st()).building;
  await walkTo([43, 37]);
  await wait(300);
  await shot('p2_28_cave_with_build_mode');
  r.caveState = await st();
  // press z facing cave wall while building (what happens?)
  await key('ArrowRight'); await wait(60); await key('z'); await wait(120);
  r.caveBuildZ = (await st()).toast;
  await shot('p2_29_cave_build_z');
  // X: does it open the menu or stop building?
  await key('x'); await wait(120);
  r.caveX = [(await st()).mode, (await st()).toast];
  if ((await st()).mode === 'menu') await key('x');
  r.save = await menuSave();
  const EXTRA = r;
  const out = await done(typeof EXTRA !== 'undefined' ? EXTRA : null);
  fs.writeFileSync('E:/game/.playwright-mcp/qa/out_p2.json', JSON.stringify(out, null, 1));
  console.log(JSON.stringify({ log: out.log, errs: out.errs, state: out.state, extra: out.extra, events: out.stats.events.slice(-25) }));
  await browser.close();
})().catch(e => { console.error('RUNNER ERROR', e); process.exit(1); });
