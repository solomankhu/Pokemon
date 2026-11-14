async (page) => {
const BUDGET_MS = 900000;
  { const br = page.context().browser(); let ctx = br.contexts().find(c => c.pages().some(p => p.url().includes('qa=1')));
    if (!ctx) { ctx = await br.newContext({ viewport: { width: 1000, height: 760 } }); const np = await ctx.newPage(); await np.goto("http://127.0.0.1:8765/claude's%20monsters.html?qa=1"); }
    page = ctx.pages().find(p => p.url().includes('qa=1')); }
  // ---- QA driver library (Node side, real keyboard via page.keyboard) ----
  const SHOT = 'E:/game/.playwright-mcp/qa/';
  const DEADLINE = Date.now() + (typeof BUDGET_MS !== 'undefined' ? BUDGET_MS : 420000);
  const late = () => Date.now() > DEADLINE;
  const LOG = [];
  const log = (s) => LOG.push(s);
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
    if (r.name && r.name !== lastRegion) { STATS.regions.push({ region: r.name, from: lastRegion, party: r.party, steps: r.steps, min: ((Date.now() - STATS.t0) / 60000).toFixed(1), battles: STATS.battles }); lastRegion = r.name; await page.evaluate((n) => { window.__QA_REGION = n; }, r.name); }
  };
  const heal = async (why) => { STATS.heals++; STATS.events.push('SHORTCUT healParty: ' + why); await page.evaluate(() => __GAME__.healParty()); };

  // One step: tap the direction, wait for the move to finish.
  const step = async (d) => {
    const before = await st();
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
  const done = async (extra) => { await page.evaluate((s) => { window.__QA_STATS = s; }, STATS); return { log: LOG, errs, stats: STATS, msgs: msgs.slice(-60), state: await st(), extra }; };
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
  const t0 = Date.now();
  const r = {};
  battlePolicy = (s) => (s.party.length < 3 && !s.battle.trainer && !s.party.some(p => p[0] === s.battle.foe[0]) && s.balls > 0) ? 'ball' : 'fight';
  await heal('after route one (no reachable centre)');
  r.t2 = await fightTrainer('t2', { shot: '12_trainer_dell' });
  r.t3 = await fightTrainer('t3');
  r.t4 = await fightTrainer('t4');
  await walkTo([43, 78]);
  await shot('13_seaside_entry');
  r.t5 = await fightTrainer('t5');
  await walkTo([43, 64]);
  await shot('14_ridge_entry');
  return done({ r, ms: Date.now() - t0 });
}
