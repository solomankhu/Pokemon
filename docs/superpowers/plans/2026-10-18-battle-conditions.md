# Battle Conditions and Varied Scenes: Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** each MONSTER TRAIL battle rolls one announced condition (rain, sun, fog, night, tremor or static) that nudges damage or accuracy identically in both builds, and draws a freshly varied scene: prop layout, time of day, weather particles and camera angle.

**Architecture:**
- **Rules:** pure tables plus pure functions in layers 1-2 of `claude's monsters.py`. They are emitted or hand-ported into `claude's monsters.html` and proven by PARITY.
- **Randomness:** a dedicated `mulberry32` seed taken from (steps, tx, ty), so the engine's `random` / `Math.random` stream is never touched.
- **Looks:** shell only. A pure `battle_scene` descriptor feeds the 3D presenter (`combat/arenas.js` and `combat/presenter.js`) and the 2D arenas of both builds.

**Tech stack:** Python 3.13 + pygame (`.venv`), vanilla JS, three.js r128 (combat/), node test suites, `.claude/scripts/verify.js`.

**Spec:** `docs/superpowers/specs/2026-10-18-battle-conditions-design.md` (approved).

**Repo notes:**
- **Not git:** there are no commits. A "checkpoint" step means: copy every file you will change into `.superpowers/sdd/2026-10-18-battle-conditions/` (once, before the first edit to that file), then run the named verify.
- **Quoting:** filenames contain a space and an apostrophe, so always quote them.
- **Python interpreter:** `.venv/Scripts/python.exe`.

**Owners:** they work in sequence, never two on the same file.
- Chunks 1-2: **creature-designer** (engine, tables, PARITY).
- Chunks 3-4: **game-feel-engineer** (scene, 3D, 2D, HUD, audio).
- Chunk 5: the PM (docs and playtest).

---

## Chunk 1: Rules in the Python build

**Files:**
- Modify: `claude's monsters.py`. The DATA area is near `REGIONS` (line ~487). The ENGINE changes are `damage_calc` (~727), `mulberry32` (~1068, reuse), `Battle.__init__` (~1591), `Game.start_battle` (~1859), the battle `resolve` call (~1957) and the fishing `begin` (~2575).
- Test: `claude's monsters.test.py`.

### Task 1.1: Force clear in the existing suite (keep every old expectation)

- [ ] **Step 1:** Checkpoint `claude's monsters.py` and `claude's monsters.test.py`.
- [ ] **Step 2:** In `claude's monsters.test.py`, right after `_spec.loader.exec_module(mt)` and the `SAVE_PATH` lines, add:

```python
# Battle conditions roll from the player's position. Every pre-existing test
# expects today's clear-weather behaviour, so force CLEAR for the whole suite;
# the CONDITIONS tests opt out locally and restore it (try/finally).
mt.FORCE_CONDITION = "clear"
# Likewise force today's look (day, no weather, layout 0, camera 0): RENDER pixel
# tests (e.g. the white-flash count ~3476) and MT_FRAME_DIR dumps assume it.
mt.FORCE_SCENE = dict(mt.DEFAULT_SCENE)
```

These two lines go in only after Task 1.4 has defined `DEFAULT_SCENE` and `FORCE_SCENE`. Until then, add only the `FORCE_CONDITION` line.

- [ ] **Step 3:** Run `.venv/Scripts/python.exe "claude's monsters.test.py"`. Expected: PASS, with today's counts. The attribute is simply unused for now.

### Task 1.2: Tables and pure functions (TDD)

- [ ] **Step 1: Write the failing tests.** Add a new section **before** `section("RENDER ...")` (line ~2059):

```python
section("CONDITIONS - battle weather rolls, damage boosts, fog, the seed")

C = mt.CONDITIONS
ok(list(C) == ["clear", "rain", "sun", "fog", "night", "tremor", "static"], "seven conditions in table order")
ok(C["rain"]["boost"] == {"Water": 1.25, "Fire": 0.8} and C["fog"]["acc"] == -10 and C["clear"]["msg"] == "",
   "rain boosts, fog accuracy, clear has no message")
for cid, c in C.items():
    ok(set(c) == {"name", "msg", "boost", "acc"}, "%s has exactly name/msg/boost/acc" % cid)
    ok(all(t in mt.TYPE_CHART for t in c["boost"]), "%s boosts only real types" % cid)
regions = [n for _, _, n in mt.REGIONS] + ["THE TRAIL", "FISHING"]
ok(set(mt.REGION_CONDITIONS) == set(regions), "every region, THE TRAIL and FISHING have a weight row")
for reg, pool in mt.REGION_CONDITIONS.items():
    ok(all(cid in C and w > 0 for cid, w in pool), "%s weights name real conditions" % reg)

# seed: fixed values pin the formula (PARITY re-checks them in the .html build)
ok(mt.condition_seed(0, 0, 0) == 0xC0DE7, "seed(0,0,0) is the salt")
ok(mt.condition_seed(1, 2, 3) == ((31 + 1954 + 393) ^ 0xC0DE7), "seed formula")
ok(mt.condition_seed(10**7, 87, 109) == ((10**7 * 31 + 87 * 977 + 109 * 131) ^ 0xC0DE7) & 0xFFFFFFFF, "seed wraps to uint32")

# battle_condition: pure, deterministic, fixed cases
bc = mt.battle_condition
ok(bc("DARK CAVE", None, True, 5) == "static", "a hunt is always static")
ok(all(bc("DEEPWOOD", {"id": "gym"}, False, s) == "clear" for s in range(200)), "the gym is always clear")
ok(all(bc(r, None, False, s) == "clear" for r in ("CEDAR TOWN", "ROUTE ONE") for s in range(200)),
   "the starting regions are always clear")
ok([bc("DEEPWOOD", None, False, s) for s in range(50)] == [bc("DEEPWOOD", None, False, s) for s in range(50)],
   "deterministic per seed")
ok(bc("NOWHERE", None, False, 7) == bc("THE TRAIL", None, False, 7), "an unknown region uses THE TRAIL row")
for reg, pool in mt.REGION_CONDITIONS.items():
    allowed = {cid for cid, _ in pool}
    seen = [bc(reg, None, False, s) for s in range(2000)]
    ok(set(seen) <= allowed, "%s only rolls its own conditions" % reg)
    total = sum(w for _, w in pool)
    for cid, w in pool:
        share = seen.count(cid) / 2000.0
        ok(abs(share - w / total) < 0.05, "%s rolls %s near %.2f (saw %.3f)" % (reg, cid, w / total, share))
```

- [ ] **Step 2:** Run the suite. Expected: FAIL with `AttributeError: ... 'CONDITIONS'`.
- [ ] **Step 3: Implement.** In the DATA layer, after `REGIONS` / `ROCK_BAND`:

```python
# Battle conditions: one per battle, announced, never saved. Boosts multiply
# damage right after the type chart; acc shifts every move that can miss.
CONDITIONS = {
    "clear":  dict(name="CLEAR",  msg="",                                boost={},                               acc=0),
    "rain":   dict(name="RAIN",   msg="Rain is pouring down!",          boost={"Water": 1.25, "Fire": 0.8},     acc=0),
    "sun":    dict(name="SUN",    msg="The sunlight is harsh!",         boost={"Fire": 1.25, "Water": 0.8},     acc=0),
    "fog":    dict(name="FOG",    msg="A thick fog rolled in...",       boost={},                               acc=-10),
    "night":  dict(name="NIGHT",  msg="Night has fallen.",              boost={"Dark": 1.25, "Psychic": 0.8},   acc=0),
    "tremor": dict(name="TREMOR", msg="The ground is trembling!",       boost={"Rock": 1.25},                   acc=0),
    "static": dict(name="STATIC", msg="The air crackles with static...", boost={"Electric": 1.25},              acc=0),
}
# Weighted rolls per region (region_name values), plus THE TRAIL fallback and FISHING.
REGION_CONDITIONS = {
    "CEDAR TOWN":   [("clear", 1)],
    "ROUTE ONE":    [("clear", 1)],
    "DEEPWOOD":     [("clear", 5), ("rain", 2), ("fog", 2), ("night", 1)],
    "SEASIDE":      [("clear", 4), ("rain", 3), ("sun", 2), ("fog", 1)],
    "FISHING":      [("clear", 4), ("rain", 3), ("sun", 2), ("fog", 1)],
    "RIDGE TOWN":   [("clear", 5), ("sun", 2), ("rain", 2), ("night", 1)],
    "ROCKY PASS":   [("clear", 4), ("tremor", 3), ("sun", 2), ("fog", 1)],
    "DARK CAVE":    [("static", 3), ("clear", 2), ("tremor", 1)],
    "SPIRE RUINS":  [("clear", 3), ("fog", 3), ("night", 2), ("static", 1)],
    "TRAIL SUMMIT": [("clear", 4), ("sun", 2), ("rain", 1), ("night", 1)],
    "THE TRAIL":    [("clear", 4), ("sun", 2), ("rain", 1), ("night", 1)],
}
FORCE_CONDITION = None     # test/playtest seam: an id in CONDITIONS beats every rule; never saved
```

In the ENGINE layer, right after `mulberry32`:

```python
def condition_seed(steps, tx, ty):
    """The battle's condition/scene seed. Own salt, so it never tracks cave_rng."""
    return ((steps * 31 + tx * 977 + ty * 131) ^ 0xC0DE7) & 0xFFFFFFFF


def battle_condition(region, trainer, hunt, seed):
    """Pure: the condition id for a battle. Never touches the random module."""
    if hunt:
        return "static"
    if trainer and trainer.get("id") == "gym":
        return "clear"
    pool = REGION_CONDITIONS.get(region) or REGION_CONDITIONS["THE TRAIL"]
    pick = mulberry32(seed)() * sum(w for _, w in pool)
    for cid, w in pool:
        pick -= w
        if pick < 0:
            return cid
    return pool[-1][0]
```

- [ ] **Step 4:** Run the suite. Expected: PASS.

### Task 1.3: `damage_calc(..., condition=None)` (TDD)

- [ ] **Step 1: Write the failing tests.** Append to the CONDITIONS section:

```python
def roll_seq(vals):
    it = iter(vals)
    calls = [0]
    def r():
        calls[0] += 1
        return next(it)
    return r, calls

atk, dfn = mt.make_mon("pyrelash" if "pyrelash" in mt.SPECIES else mt.STARTERS[0], 20), mt.make_mon(mt.STARTERS[1], 20)
water = next(m for m, v in mt.MOVES.items() if v["type"] == "Water" and v["pow"] > 0 and v["acc"] == 100)
fire = next(m for m, v in mt.MOVES.items() if v["type"] == "Fire" and v["pow"] > 0 and v["acc"] == 100)
never = next((m for m, v in mt.MOVES.items() if v["acc"] >= 999), None)
seq = [0.5, 0.9, 0.5]                       # hit, no crit, mid roll
base = mt.damage_calc(atk, dfn, water, {}, {}, roll_seq(seq)[0])
for cid in (None, "clear"):
    ok(mt.damage_calc(atk, dfn, water, {}, {}, roll_seq(seq)[0], 1.0, 0.0, cid) == base, "%r = today's result" % cid)
rain = mt.damage_calc(atk, dfn, water, {}, {}, roll_seq(seq)[0], 1.0, 0.0, "rain")
ok(rain["dmg"] > base["dmg"], "rain boosts Water (%d -> %d)" % (base["dmg"], rain["dmg"]))
fb = mt.damage_calc(atk, dfn, fire, {}, {}, roll_seq(seq)[0])
ok(mt.damage_calc(atk, dfn, fire, {}, {}, roll_seq(seq)[0], 1.0, 0.0, "rain")["dmg"] <= fb["dmg"], "rain weakens Fire")
ok(mt.damage_calc(atk, dfn, fire, {}, {}, roll_seq(seq)[0], 1.0, 0.0, "night") == fb, "night leaves Fire alone")
ok(not mt.damage_calc(atk, dfn, water, {}, {}, roll_seq([0.95, 0.9, 0.5])[0])["missed"], "0.95 hits an acc-100 move")
ok(mt.damage_calc(atk, dfn, water, {}, {}, roll_seq([0.95, 0.9, 0.5])[0], 1.0, 0.0, "fog")["missed"], "fog turns 0.95 into a miss")
if never:
    ok(not mt.damage_calc(atk, dfn, never, {}, {}, roll_seq([0.999, 0.9, 0.5])[0], 1.0, 0.0, "fog")["missed"],
       "fog never touches a move that can't miss")
for cid in mt.CONDITIONS:
    r1, c1 = roll_seq([0.5, 0.9, 0.5, 0.5]); mt.damage_calc(atk, dfn, water, {}, {}, r1)
    r2, c2 = roll_seq([0.5, 0.9, 0.5, 0.5]); mt.damage_calc(atk, dfn, water, {}, {}, r2, 1.0, 0.0, cid)
    ok(c1[0] == c2[0], "%s draws the same number of rolls" % cid)
# an immune matchup stays 0 under a boost
psy = next((m for m, v in mt.MOVES.items() if v["type"] == "Psychic" and v["pow"] > 0), None)
dark = next((s for s, v in mt.SPECIES.items() if "Dark" in v["types"]), None)
if psy and dark:
    ok(mt.damage_calc(atk, mt.make_mon(dark, 20), psy, {}, {}, roll_seq([0.1, 0.9, 0.5])[0], 1.0, 0.0, "night")["dmg"] == 0,
       "PSYCHIC on DARK stays 0 under any condition")
# fuzz: None == today for 500 random calls
fz = random.Random(4)
same = True
for _ in range(500):
    m = fz.choice([k for k, v in mt.MOVES.items() if v["pow"] > 0])
    vals = [fz.random() for _ in range(3)]
    same &= mt.damage_calc(atk, dfn, m, {}, {}, roll_seq(vals)[0]) == mt.damage_calc(atk, dfn, m, {}, {}, roll_seq(vals)[0], 1.0, 0.0, None)
ok(same, "condition=None matches the default over 500 calls")
```

The worker must check that `make_mon` arguments and the species ids exist. Replace the guesses (`pyrelash`, `STARTERS[n]`) with real ids where needed; `STARTERS` holds species ids.

- [ ] **Step 2:** Run. Expected: FAIL (a TypeError on the 9th positional argument).
- [ ] **Step 3: Implement** in `damage_calc`:

```python
def damage_calc(atk_mon, def_mon, move_id, atk_stages, def_stages, rng=None, timing=1.0, crit_bonus=0.0,
                condition=None):
    ...
    cond = CONDITIONS.get(condition) or CONDITIONS["clear"]
    if mv["acc"] < 999 and rnd() * 100 >= mv["acc"] + cond["acc"]:
    ...
    dmg = int(dmg * eff)
    dmg = int(dmg * cond["boost"].get(mv["type"], 1))
    dmg = int(dmg * (0.85 + rnd() * 0.15))
```

Also update the docstring to mention `condition`.

- [ ] **Step 4:** Run. Expected: PASS.

### Task 1.4: `arena_kind` and `battle_scene` (pure, used by the shell and PARITY)

- [ ] **Step 1: Failing tests** (CONDITIONS section):

```python
ak = mt.arena_kind
ok(ak("DARK CAVE", ".", False, True, False) == "cave" and ak("DEEPWOOD", ".", True, False, False) == "shore",
   "hunt -> cave, fishing -> shore")
ok(ak("SPIRE RUINS", ".", False, False, False) == "ruins" and ak("ROCKY PASS", ".", False, False, False) == "pass",
   "ruins and pass by region")
ok(ak("DEEPWOOD", ".", False, False, True) == "pass", "the sandbox is pass")
ok(ak("SEASIDE", ".", False, False, False) == "shore", "SEASIDE is shore (the deliberate fix)")
ok(ak("DEEPWOOD", ",", False, False, False) == "meadow", "default meadow")
sc = mt.battle_scene
s1 = sc("rain", "meadow", 1234)
ok(set(s1) == {"layout", "time", "weather", "camera"} and s1 == sc("rain", "meadow", 1234), "scene is deterministic")
ok(s1["weather"] == "rain" and 0 <= s1["camera"] < mt.CAMERA_PRESETS and 0 <= s1["layout"] < 2 ** 32, "scene fields")
ok(all(sc("night", "meadow", s)["time"] == "night" for s in range(50)), "night condition forces night")
ok(all(sc("clear", "cave", s)["time"] == "night" for s in range(50)), "the cave is always night")
ok(sc("clear", "pass", 3)["weather"] == "snow" and sc("clear", "shore", 3)["weather"] == "none", "regional extras")
times = {sc("clear", "meadow", s)["time"] for s in range(400)}
ok(times == {"day", "dusk", "dawn", "night"}, "meadow sees all four times")
ok(len({sc("clear", "meadow", s)["layout"] for s in range(100)}) > 90, "layouts vary")
```

- [ ] **Step 2:** Run. Expected: FAIL.
- [ ] **Step 3: Implement** (ENGINE layer, after `battle_condition`; pure, no pygame):

```python
SCENE_TIMES = [("day", 5), ("dusk", 2), ("dawn", 2), ("night", 1)]
SCENE_WEATHER = {"rain": "rain", "sun": "sun", "fog": "fog", "tremor": "dust", "static": "sparks", "night": "none"}
SCENE_EXTRA = {"meadow": "leaves", "pass": "snow", "ruins": "motes", "cave": "motes", "shore": "none"}
CAMERA_PRESETS = 4
DEFAULT_SCENE = dict(layout=0, time="day", weather="none", camera=0)   # today's look exactly
FORCE_SCENE = None         # test/playtest seam: a scene dict beats battle_scene; never saved


def arena_kind(region, tile, fishing, hunt, sandbox):
    """Which battle arena to draw. Pure; the .html battleArenaKind() calls its twin."""
    if hunt:
        return "cave"
    if fishing:
        return "shore"
    r = region.upper()
    if "CAVE" in r:
        return "cave"
    if "RUIN" in r:
        return "ruins"
    if "ROCK" in r or sandbox:
        return "pass"
    if tile == "~" or "SEASIDE" in r:
        return "shore"
    return "meadow"


def battle_scene(condition, kind, seed):
    """Cosmetic scene descriptor. Its own mulberry32: never random, never FX_RNG.
    Always draws exactly three values (layout, time, camera) so both builds agree."""
    rng = mulberry32((seed ^ 0x5CE7E) & 0xFFFFFFFF)
    layout = int(rng() * 4294967296)
    pick = rng() * sum(w for _, w in SCENE_TIMES)
    time = SCENE_TIMES[-1][0]
    for t, w in SCENE_TIMES:
        pick -= w
        if pick < 0:
            time = t
            break
    if condition == "night" or kind == "cave":
        time = "night"
    weather = SCENE_WEATHER.get(condition) or SCENE_EXTRA.get(kind, "none")
    return dict(layout=layout, time=time, weather=weather, camera=int(rng() * CAMERA_PRESETS))
```

- [ ] **Step 4:** Run. Expected: PASS.

### Task 1.5: Wire it into the battle (TDD)

- [ ] **Step 0 (moved from 1.5):** before Task 1.3 edits `damage_calc`, save `balance_report.py`'s output to `.superpowers/sdd/2026-10-18-battle-conditions/balance-before.txt`.
- [ ] **Step 1: Failing tests** (CONDITIONS section). Follow the scare-intro pattern at test.py ~620. `q_msg` stores `dict(t="msg", s=text)` (py:1741), and the JS `qMsg` stores `{t:'msg', s}` (html:1619). The existing `fresh_battle` / `fresh_hunt` helpers share a module-level `g` and take no `fishing` argument, so this section defines its own helper:

```python
def new_game():
    ng = mt.Game()
    ng.party = [mt.make_mon("pyrelash", 20)]
    ng.balls, ng.fade_dir, ng.fade_cb, ng.mode = 20, 0, None, "overworld"
    return ng

def queued_msgs(g):
    return [s.get("s") for s in g.battle.queue if s.get("t") == "msg"]

prev, prev_scene = mt.FORCE_CONDITION, mt.FORCE_SCENE
try:
    mt.FORCE_CONDITION = None
    mt.FORCE_SCENE = None
    g = new_game()                      # the suite's existing helper: a Game with a party
    g.player.tx, g.player.ty = 50, 82   # DEEPWOOD
    want = mt.battle_condition("DEEPWOOD", None, False, mt.condition_seed(g.steps, 50, 82))
    random.seed(9); before = random.getstate()
    g.start_battle(mt.make_mon(mt.STARTERS[0], 5))
    ok(random.getstate() == before, "start_battle never touches the global random stream")
    ok(g.battle.condition == want, "the battle rolls battle_condition from condition_seed")
    ok(g.battle.arena == "meadow" and g.battle.scene == mt.battle_scene(want, "meadow", mt.condition_seed(g.steps, 50, 82)),
       "arena and scene stored on the battle")
    msgs = queued_msgs(g)
    gi = next(i for i, m in enumerate(msgs) if m.startswith("Go, "))
    if want == "clear":
        ok(all(m != c["msg"] or not c["msg"] for m in msgs for c in mt.CONDITIONS.values()), "clear adds no message")
    else:
        ok(msgs[gi - 1] == mt.CONDITIONS[want]["msg"], "the condition line sits right before Go")
    # a forced condition, a hunt, the gym
    for force in ("rain", "fog"):
        mt.FORCE_CONDITION = force
        g2 = new_game(); g2.start_battle(mt.make_mon(mt.STARTERS[0], 5), hunt=True)
        ok(g2.battle.condition == force, "FORCE_CONDITION beats the hunt rule")
    mt.FORCE_CONDITION = "bogus"
    g3 = new_game(); g3.player.tx, g3.player.ty = 50, 30
    g3.start_battle(mt.make_mon(mt.STARTERS[0], 5), hunt=True)
    ok(g3.battle.condition == "static", "an unknown forced id is ignored; the hunt is static")
    m3 = queued_msgs(g3); gi3 = next(i for i, m in enumerate(m3) if m.startswith("Go, "))
    ok(m3[gi3 - 1] == mt.CONDITIONS["static"]["msg"], "the hunt's static line comes after the scare, right before Go")
    mt.FORCE_CONDITION = None
    g4 = new_game(); g4.start_battle(mt.make_mon(mt.STARTERS[0], 5), fishing=True)
    ok(g4.battle.arena == "shore" and g4.battle.condition in {c for c, _ in mt.REGION_CONDITIONS["FISHING"]},
       "fishing rolls the FISHING row on the shore")
    mt.FORCE_SCENE = dict(mt.DEFAULT_SCENE)
    g5 = new_game(); g5.start_battle(mt.make_mon(mt.STARTERS[0], 5))
    ok(g5.battle.scene == mt.DEFAULT_SCENE, "FORCE_SCENE beats battle_scene")
finally:
    mt.FORCE_CONDITION, mt.FORCE_SCENE = prev, prev_scene
```

In the snippet, use a real grass (`,`) tile in DEEPWOOD instead of (50,82), which is a `#` tile; find one with `tile_at`. Delete the duplicate `random.seed(9)` line if it isn't needed.

Also add a test that a battle's damage uses the condition. With `FORCE_CONDITION = "rain"` and the existing monkeypatch pattern (test.py ~658, `random.random = lambda: roll`), run one turn of a Water move. Compare the foe's HP loss with the same turn under `"clear"`: the rain loss must be greater.

- [ ] **Step 2:** Run. Expected: FAIL.
- [ ] **Step 3: Implement.**
  - **`Battle.__init__`:** add `self.condition = "clear"`, `self.arena = "meadow"` and `self.scene = None`, each with a one-line comment: "rolled in start_battle; never saved".
  - **`start_battle(self, foe, trainer=None, hunt=False, fishing=False)`:** right after `b = self.battle`:

```python
        p = self.player
        seed = condition_seed(self.steps, p.tx, p.ty)
        region = region_name(p.ty)
        b.condition = (FORCE_CONDITION if FORCE_CONDITION in CONDITIONS
                       else battle_condition("FISHING" if fishing else region, trainer, b.hunt, seed))
        b.arena = arena_kind(region, tile_at(p.tx, p.ty, self.edits), fishing, b.hunt, in_sandbox(p.tx, p.ty))
        b.scene = dict(FORCE_SCENE) if FORCE_SCENE else battle_scene(b.condition, b.arena, seed)
```

  and replace the final `self.q_msg("Go, %s!" % mine.name)` with:

```python
        if CONDITIONS[b.condition]["msg"]:
            self.q_msg(CONDITIONS[b.condition]["msg"])
        self.q_msg("Go, %s!" % mine.name)
```

  - **`resolve` (~1957):** add `, b.condition` as the last argument to `damage_calc(...)`.
  - **Fishing `begin` (~2575):** `self.start_battle(foe, fishing=True)`.
  - **Check `self.edits`:** confirm the `Game` attribute is called `edits`, and adapt if it isn't.

- [ ] **Step 4:** Run the whole suite. Expected: PASS, and every pre-existing check is unchanged, because the suite forces clear.
- [ ] **Step 5:** Run `.venv/Scripts/python.exe .claude/skills/balance-report/balance_report.py` and confirm the output is **byte-identical** to `balance-before.txt`.
- [ ] **Step 6:** Checkpoint: `node .claude/scripts/verify.js --only py,combatpy`. It must be GREEN. PARITY compares only the keys it lists, and `conditions` is added in Task 2.3, so it stays green here.

---

## Chunk 2: Emit, JS port, PARITY

**Files:** `.claude/skills/add-monster/emit_tables.py`, `claude's monsters.html` (DATA near `ZONES`, `damageCalc` ~903, `startBattle` ~1524, `battleSnapshot` / `battleArenaKind` ~1657, the battle `resolve` ~1754, the `__GAME__` export ~5930), `claude's monsters.test.js`, the PARITY section of `claude's monsters.test.py` (~4521; `python_tables()` and `JS_DUMP`).

### Task 2.1: The emitter

- [ ] **Step 1:** Checkpoint `emit_tables.py`, the html and test.js.
- [ ] **Step 2:** In `emit_tables.py`, add:

```python
def emit_conditions():
    out = ["const CONDITIONS = {"]
    for k, c in mt.CONDITIONS.items():
        out.append("  %s: { name: %s, msg: %s, boost: %s, acc: %d }," % (
            k, js(c["name"]), js(c["msg"]), obj(c["boost"]) if c["boost"] else "{}", c["acc"]))
    out.append("};")
    return out


def emit_region_conditions():
    out = ["const REGION_CONDITIONS = {"]
    for k, pool in mt.REGION_CONDITIONS.items():
        out.append("  %s: [%s]," % (js(k), ", ".join("[%s, %d]" % (js(c), w) for c, w in pool)))
    out.append("};")
    return out
```

  - **`BLOCKS`:** append `("const CONDITIONS = {", "};", emit_conditions)` and `("const REGION_CONDITIONS = {", "};", emit_region_conditions)`.
  - **Docstring:** add "CONDITIONS and REGION_CONDITIONS (battle weather)", plus the rule `REGION_CONDITIONS tuples -> [id, weight] arrays`.
  - **Floats:** `js(1.25)` gives `1.25` and `js(0.8)` gives `0.8`, through `repr`.
- [ ] **Step 3:** Add placeholder lines to the HTML right after the `ZONES` block's closing `];`. They must be exact lines, with the `};` on its own line:

```js
const CONDITIONS = {
};
const REGION_CONDITIONS = {
};
```

- [ ] **Step 4:** Run `.venv/Scripts/python.exe .claude/skills/add-monster/emit_tables.py` (a dry run). Expected: a diff that fills in only the two tables. Then run it with `--write`, then run it again and expect "HTML tables already match the Python build."

### Task 2.2: JS port (TDD in test.js)

- [ ] **Step 1: Failing tests.**
  - **Force clear:** at the top of `claude's monsters.test.js`, right after `const G = g.G;`, add `g.setForceCondition('clear'); g.setForceScene({...g.DEFAULT_SCENE});` with the same comment as the Python suite. JS gets `DEFAULT_SCENE`, `let forceScene = null`, `setForceScene`, and `b.scene = forceScene ? {...forceScene} : battleScene(...)`.
  - **Recorded deviations from the spec:** both are fine, and Task 5.1 records them in CLAUDE.md.
    - JS uses a module variable plus setters, not `G.forceCondition`. It survives `G` resets and is never in the save.
    - `arena_kind` takes a 5th argument, `sandbox`.
  - **The no-`fxRand` proof:** the scene picker never calls `fxRand`. `fxRand` advances a private `fxSeed` (html:2516), so wrapping the export won't catch calls. Export `get fxSeed(){return fxSeed;}` on `__GAME__` and assert it is unchanged across `battleScene` and `startBattle`.
  - **New section:** add `section('CONDITIONS — battle weather')` before the SHELL JUICE section, mirroring Tasks 1.2-1.5 one for one:
    - the table shape;
    - `conditionSeed` fixed values (the same three as Python);
    - `battleCondition` fixed cases, determinism and the 2000-seed shares;
    - `damageCalc` with `rng` sequences (`seq=[.5,.9,.5]`) for None/clear identity, rain up and down, fog 0.95 → miss, acc 999 immune, the same call count, PSYCHIC→DARK 0 and the 500-call fuzz with a seeded `mulberry32(4)` value source;
    - `arenaKind` / `battleScene` cases;
    - `startBattle` wiring: wrap `Math.random` with a counting spy and assert it is unchanged across `startBattle`; check the condition line right before `Go, `, `setForceCondition('rain')` beating the hunt, `setForceCondition('bogus')` being ignored, and fishing `{fishing:true}` giving shore plus a FISHING-row condition.

  Restore with `g.setForceCondition('clear')` in `finally`. Queued messages are `b.queue` entries with `t==='msg'`; the worker checks the real step shape in `qMsg`.

- [ ] **Step 2:** `node "claude's monsters.test.js"` must FAIL.
- [ ] **Step 3: Implement** in the html:

```js
let forceCondition = null;   // test/playtest seam: an id in CONDITIONS beats every rule; never saved
function conditionSeed(steps, tx, ty) { return ((steps * 31 + tx * 977 + ty * 131) ^ 0xC0DE7) >>> 0; }
function battleCondition(region, trainer, hunt, seed) {
  if (hunt) return 'static';
  if (trainer && trainer.id === 'gym') return 'clear';
  const pool = REGION_CONDITIONS[region] || REGION_CONDITIONS['THE TRAIL'];
  let pick = mulberry32(seed)() * pool.reduce((s, [, w]) => s + w, 0);
  for (const [cid, w] of pool) { pick -= w; if (pick < 0) return cid; }
  return pool[pool.length - 1][0];
}
const SCENE_TIMES = [['day', 5], ['dusk', 2], ['dawn', 2], ['night', 1]];
const SCENE_WEATHER = { rain: 'rain', sun: 'sun', fog: 'fog', tremor: 'dust', static: 'sparks', night: 'none' };
const SCENE_EXTRA = { meadow: 'leaves', pass: 'snow', ruins: 'motes', cave: 'motes', shore: 'none' };
const CAMERA_PRESETS = 4;
function arenaKind(region, tile, fishing, hunt, sandbox) {
  if (hunt) return 'cave';
  if (fishing) return 'shore';
  const r = String(region).toUpperCase();
  if (r.includes('CAVE')) return 'cave';
  if (r.includes('RUIN')) return 'ruins';
  if (r.includes('ROCK') || sandbox) return 'pass';
  if (tile === '~' || r.includes('SEASIDE')) return 'shore';
  return 'meadow';
}
function battleScene(condition, kind, seed) {
  const rng = mulberry32((seed ^ 0x5CE7E) >>> 0);
  const layout = Math.floor(rng() * 4294967296);
  let pick = rng() * 10, time = 'night';
  for (const [t, w] of SCENE_TIMES) { pick -= w; if (pick < 0) { time = t; break; } }
  if (condition === 'night' || kind === 'cave') time = 'night';
  const weather = SCENE_WEATHER[condition] || SCENE_EXTRA[kind] || 'none';
  return { layout, time, weather, camera: Math.floor(rng() * CAMERA_PRESETS) };
}
```

  Note that in Python `SCENE_WEATHER.get("night")` is `"none"`, which is truthy, so Python and JS agree.

  - **`damageCalc`:** add the trailing `condition` parameter, then `const cond = CONDITIONS[condition] || CONDITIONS.clear;`. The miss test becomes `rng() * 100 >= (mv.acc + cond.acc) * accStage`, and after `dmg = Math.floor(dmg * eff);` add `dmg = Math.floor(dmg * (cond.boost[mv.type] || 1));`.
  - **`battleArenaKind()`:** reduce it to `return arenaKind(regionName(G.player.ty), tileHere(G.player.tx,G.player.ty), false, false, inSandbox(G.player.tx,G.player.ty));`.
  - **`startBattle`:** compute `seed = conditionSeed(G.steps, G.player.tx, G.player.ty)`. Set `arena: arenaKind(regionName(G.player.ty), tileHere(...), !!(opts&&opts.fishing), !!(opts&&opts.hunt), inSandbox(...))`, then `condition` and `scene` on `b` the same way as Python, with the region `'FISHING'` when fishing. Before `qMsg(b,'Go, '...)` add `if (CONDITIONS[b.condition].msg) qMsg(b, CONDITIONS[b.condition].msg);`.
  - **`battleSnapshot`:** `arena:b.arena` (the hunt is already `cave` through `arenaKind`), plus `scene:b.scene, condition:b.condition`.
  - **The battle `resolve` (~1754):** add `, b.condition` as the last argument to `damageCalc`.
  - **`__GAME__`:** add `CONDITIONS, REGION_CONDITIONS, conditionSeed, battleCondition, arenaKind, battleScene, SCENE_TIMES, SCENE_WEATHER, SCENE_EXTRA, CAMERA_PRESETS, setForceCondition: id => { forceCondition = id; }`.
  - **Do not** add `condition` or `scene` to the save field lists (~2388, ~2419).
- [ ] **Step 4:** Run `node "claude's monsters.test.js"` and expect PASS. Then run `node combat/verify.cjs`, because the combat integration tests call `damageCalc` positionally, and expect PASS.

### Task 2.3: PARITY

- [ ] **Step 1:** In the test.py PARITY section:
  - **`python_tables()`:** add a `"conditions"` key. It holds `CONDITIONS`, `REGION_CONDITIONS` (as lists of lists), `SCENE_TIMES`, `SCENE_WEATHER`, `SCENE_EXTRA` and `CAMERA_PRESETS`.
  - **Seeds:** `[condition_seed(s, x, y)` for 20 fixed triples, including one with `s = 10**7`].
  - **Rolls:** `[battle_condition(r, None, False, s)` for every region key and `s in range(45)]`, which comes to about 500.
  - **Scenes:** `[battle_scene(c, k, s)` for c in CONDITIONS, k in the 5 kinds, `s in range(4)]`.
  - **Arena kinds:** `[arena_kind(...)` for a small case list].
  - **Tuple-safe:** `diff` treats a tuple and a list as different (test.py ~4953), so build the whole `conditions` value through `json.loads(json.dumps(...))` to turn every nested tuple into a list.
  - **JS side:** add the mirror in `JS_DUMP` (`conditions: {...}` built from `g.*`).
  - **Compare:** add `"conditions"` to the compared-keys tuple and a summary print line.
- [ ] **Step 2:** Run `node .claude/scripts/verify.js --only py,js,combat,tables`. Expected: all PASS, including the PARITY `conditions` check.

---

**The combat suites stay unchanged, and this is checked rather than assumed:**
- The combat suites and `combat/commands_py_test.py` start battles at `START_TILE` (43,107), which is CEDAR TOWN, so they always roll clear.
- Only `battleSnapshot` reads `b.arena`.
- `combat/arenas.js`'s own `arenaKindFor` already maps SEASIDE to shore.

If a combat test does change, stop and report it; don't edit the expectation.

## Chunk 3: 3D scene (browser)

**Files:**
- Modify: `combat/arenas.js`, `combat/presenter.js`, `combat/host.js` (the condition tag).
- Test: `combat/arenas.test.js`, `combat/presenter.test.js`, `combat/host.test.js` (or a new `combat/scene.test.js`, which `verify.cjs` picks up automatically).
- Lesson to follow: `docs/lessons/overlay-fixed-css-px.md`, for the tag.

### Task 3.1: `buildArena(T, kind, quality, scene)` layout and lighting (TDD)

- [ ] **Step 1: Failing tests** in `combat/arenas.test.js`, using the existing THREE stub:
  - With no scene, or `{layout:0}`, prop positions are identical to today's. Snapshot every mesh position for each kind before the change and compare.
  - Two different layouts move at least 50% of the props.
  - Over 200 layouts, no **jittered** prop centre lands in the clearance box. The jittered props are the 8-prop row and the shore water. The 30-rock decor ring is not jittered and is left out by name, because today's ring already has rocks at (5.20,0), (4.39,-2.79) and (-4.95,-1.58). The box is `x∈[-5.2,5.2], z∈[-3.4,2.4]`. That is the band between the camera and the platforms. With an unclamped jitter of `x±0.8, z-1.2` the shore water and the row at `z≥-4.2` could reach it, so the test exercises the clamp. Also, the clamped x stays in `[-9,9]`.
  - Time `night` gives a key light intensity below `day`; `dusk` gives a key colour warmer than `day` (more red than blue).
  - `weather:'rain'` adds a `Points` child named `weather`, and its vertex count is within `WEATHER_MAX[quality]`.
  - `dispose()` disposes every geometry and material, including the weather ones. Count `dispose` calls on stub objects across 20 build/dispose cycles: none is left alive.
- [ ] **Step 2:** Run `node combat/verify.cjs` and expect FAIL.
- [ ] **Step 3: Implement.**
  - **Layout:** a local `const rnd = mulberry(scene.layout)` (a copy of mulberry32 inside arenas.js, since combat modules don't import the html). When `layout === 0`, use a jitter of 0, so today's positions are reproduced.
  - **Jitter:** `x += (rnd()-.5)*1.6`, `z -= rnd()*1.2`, and scale `*= .8+rnd()*.45`. Clamp to stay out of the platform clearance.
  - **Lighting:** a `TIME_LIGHT` table, `{day:{hemi:1.1,key:1.2,keyColor:0xffe9c6,sky:0x8fc4e8,fog:0x253c46}, dusk:{...orange}, dawn:{...pink}, night:{...blue, key:.55}}`. The cave keeps its own hemi colour.
  - **Weather:** `buildWeather(T, kind, quality)` returns `T.Points` with `WEATHER_MAX = {HIGH:600, STANDARD:300, LOW:120}` points in a box `[-9,9]x[0,7]x[-6,6]`. Material colours: rain light blue streaks (size .06), snow white, leaves green-orange, dust tan, sparks cyan, motes pale. `fog` and `sun` have no points.
  - **Return value:** add `scene` and `weather` (or null), plus `time`.
- [ ] **Step 4:** Run `node combat/verify.cjs` and expect PASS.

### Task 3.2: Presenter, scene-wide state, cache key, weather animation and camera presets (TDD)

- [ ] **Step 1: Failing tests** in `combat/presenter.test.js`:
  - **Default scene:** `sync` with no `scene` twice builds the arena once. The key comes from `DEFAULT_SCENE`.
  - **Rebuilds:** `sync` with scene A, then scene B (same kind) rebuilds: the arena object changes and the old one is disposed.
  - **Fog and background:** `scene.fog.color` and `scene.background` follow `TIME_LIGHT[time]`, and fog near shrinks for `weather:'fog'`. `clearBattle()` restores the defaults `0x253c46 / 14 / 32` and a null background.
  - **Camera:** for each preset `0..3`, with the camera base set and the foe rig at its standard spot, call `p.render()`. Then check `diagnostics.projected.foe.y < 248` and that both rigs' projected x stay in `[0, 640]`. `diagnostics.projected` is set only inside `render()` (presenter.js:193), and the camera isn't in the scene, so the implementation must call `camera.updateMatrixWorld()` before projecting inside `render()`. Add that fix as part of this task.
  - **Scene getter:** add `get scene(){return scene;}` to the presenter `view` (presenter.js:197), so the tests can read fog and background. `camBase` is already a mutable `Vector3` (presenter.js:97). Reset it from `JUICE.CAM_POS` in `clearBattle`.
  - **Weather animation:** `update(dt)` moves weather points down for rain and snow and wraps them at y=0. With `reducedMotion`, `update` doesn't move them, and the tremor sway offset is 0.
  - **Shell only:** spy `Math.random` during `sync` and `update` across 50 frames and expect no calls.
- [ ] **Step 2:** FAIL.
- [ ] **Step 3: Implement.**
  - **Cache key:** in `sync`, `const sc = snapshot.scene || DEFAULT_SCENE, keyStr = kind+'|'+sc.layout+'|'+sc.time+'|'+sc.weather+'|'+sc.camera;`. Rebuild when `!arena || arena.key !== keyStr`. On build, apply fog, background and the camera preset: `CAMERA_PRESETS_3D = [[0,0,0],[1.4,.3,-.6],[-1.2,.5,.4],[.6,-.4,.8]]`, offsets added to `JUICE.CAM_POS` into `camBase` (`camBase` must become a mutable copy and stay frozen in `JUICE`).
  - **`clearBattle`:** reset fog, background and `camBase`.
  - **`update`:** advance the weather points with their own phase clock. Rain falls 9 u/s, snow 1.2, leaves 0.8 with a sine drift, dust and motes drift 0.3, and sparks flicker by toggling the material opacity on a sine of the clock (no randomness). Tremor adds a tiny `camBase` sway, `sin(clock*13)*.02`, skipped under reduced motion. Falling stops under reduced motion.
  - **Keep everything shell only:** no `Math.random` and no writes back to the snapshot.
- [ ] **Step 4:** PASS.

### Task 3.3: Condition tag in the 3D HUD (host.js)

- [ ] **Step 1: Failing tests** in `combat/host.test.js` (or `webcam-host.test.js` style):
  - `host.updateConditionTag({condition:'rain'})` shows a DOM element with text `RAIN`, `aria-label="Battle condition: rain"`;
  - `clear` hides it;
  - with a stubbed `getBoundingClientRect` at 640x480 and at 348x261, the tag rect sits at canvas (30,108), size 66x16, scaled by `s=r.width/640`. That is the same spot as 2D: under the type chips, which end at y=104. It must not intersect the foe box (24,28,260,52) or the player box at y=248.
- [ ] **Step 2:** FAIL.
- [ ] **Step 3: Implement.**
  - **Placement:** follow `updateCamBadge` (canvas-scaled `s = r.width/640`).
  - **Call sites:** call it inside `host.sync` (host.js:49) next to `updateCamBadge`, and hide it in `suspend` (host.js:52). The html needs no new call.
  - **Hiding:** the tag is hidden outside battle, in 2D mode (2D draws its own tag) and in `suspend()`.
- [ ] **Step 4:** PASS. Then run the checkpoint `node .claude/scripts/verify.js --only combat,js`.

---

## Chunk 4: 2D scene in both builds, audio, RENDER

**Files:** `claude's monsters.py` (Shell `draw_battle` ~5412, `Sfx`), `claude's monsters.html` (`drawBattle` ~4854, its Sfx), `claude's monsters.test.py` (RENDER), `claude's monsters.test.js` (SHELL JUICE).

### Task 4.1: The pure 2D look tables (shared, PARITY-compared)

- [ ] **Step 1: Tests and implementation.**
  - **Tables:** add `SCENE_SKY = {"day": ((159,210,240),(216,238,201)), "dusk": ((240,170,120),(250,214,170)), "dawn": ((236,186,206),(244,226,200)), "night": ((26,36,72),(58,72,104))}` (top and bottom RGB) and `WEATHER_2D = {"rain": dict(n=70, vy=420, vx=-60, len=10, color=(170,200,235)), "snow": dict(n=50, vy=40, vx=10, len=2, color=(245,245,250)), "leaves": dict(n=18, vy=30, vx=24, len=3, color=(206,150,70)), "dust": dict(n=30, vy=6, vx=30, len=2, color=(196,170,130)), "sparks": dict(n=16, vy=0, vx=0, len=2, color=(140,220,255)), "motes": dict(n=20, vy=-8, vx=4, len=2, color=(220,230,210)), "fog": dict(n=0, vy=0, vx=0, len=0, color=(220,226,232)), "sun": dict(n=0, vy=0, vx=0, len=0, color=(255,236,180))}` to the Python shell constants.
  - **Port:** the same in the html.
  - **Day colours:** `SCENE_SKY["day"]` is today's gradient (Python 159,210,240 → 216,238,201; JS `#9fd2f0` → `#d8eec9`), so a clear day looks exactly as it does now.
  - **PARITY:** add both tables to `SHELL_KEYS` / the shell comparison.
    - **Python:** `python_shell()` converts only top-level tuples (test.py ~4805), so deep-convert with `json.loads(json.dumps(...))`.
    - **JS:** holds RGB **arrays** (not hex), with the hex built at draw time.
    - **Export:** add `SCENE_SKY` and `WEATHER_2D` to `__GAME__`, because `shellData` reads `g[k]`.
- [ ] **Step 2:** Run `verify --only py,js`.

### Task 4.2: Draw them (Python `draw_battle`, JS `drawBattle` 2D branch)

- [ ] **Step 1: Failing RENDER tests** (Python), in the RENDER section's battle-phase loop style:
  - **Every combination draws:** for each condition × time, with `b.scene` forced, the frame draws.
  - **Night is darker:** at night, the top-row sky pixel is darker than at day.
  - **Rain shows:** rain gives at least 20 rain-coloured pixels above y=240.
  - **HUD unchanged:** the HP box pixels (sample at (30,34) and (W-280,254)) are identical between `clear`/day and `rain`/night.
  - **Reduced motion:** with `REDUCED_MOTION=True`, rain particles don't advance between two frames 0.1 s apart (no falling), but the tint is still drawn.
  - **Shell only:** drawing never changes `random.getstate()`.

  JS gets the pixel-free equivalent in SHELL JUICE: `weather2DStep` is pure, the pool size stays at most `WEATHER_2D[w].n`, and it never calls `Math.random`.
- [ ] **Step 2:** FAIL.
- [ ] **Step 3: Implement.**
  - **Sky:** the gradient comes from `SCENE_SKY[scene.time]`, with `day` when there is no scene. It uses today's exact per-row int formula (py:5418-5420, `int(a + (b - a) * u)`), so day produces identical bytes.
  - **The day tint is a no-op:** for time `day` with weather `none`, nothing extra is blitted. The `snap()==no_flash` and white-count RENDER checks (test.py:3476-3496) must pass unchanged.
  - **Draw order:** sky, then platforms, then the time tint, fog band and sun wash, then particles, then sprites, then the HP boxes, chips and tag. Everything new comes before the HUD.
  - **Pool reset:** rebuild the weather pool when the `b` identity or `b.scene` changes, the way `Juice.bind(b)` works (py:3157), so a battle-to-battle transition never keeps the old pool.
  - **Weather pool:** a fixed pool of size `n`, seeded on battle start from `mulberry32(scene.layout)`. The positions are cosmetic but deterministic, never `FX_RNG`/`fxRand`. The pool is stored on the Shell or Juice object, not on `Battle`.
  - **Drawing:** particles are drawn **after the platforms and before the HP boxes**. Rain is short slanted lines; the others are small rects. Particles stay above y=360 so the text panel is clear. Fog is a translucent white band over the arena (y 120-240), and sun is a warm translucent wash.
  - **Advancing:** particles move in `update` by dt and wrap. Under `REDUCED_MOTION` they don't move.
  - **Condition tag:** for a non-clear condition, a small tag sits at (30,108) under the type chips, with text `CONDITIONS[c]["name"]` in `f11`, inside a 66x16 chip. It is drawn in 2D only (3D uses the DOM tag).
  - **Fixed:** platforms, sprites and HP boxes don't move.
- [ ] **Step 4:** PASS. Run `MT_FRAME_DIR=<scratch>` once and look at a rain/night frame and a snow/dusk frame with Read.

### Task 4.3: Audio loops

- [ ] **Step 1:** In both builds, add synthesized `rain` (filtered noise) and `static` (crackle bursts) loop sounds.
  - **Python `Sfx`:** **not** through `_build`. It applies an `exp(-4t/dur)` decay, which would make a loop pulse, and uses its own `random.Random(7)`. Build the loops the way the existing drone loop is built (py ~3940), with a local seeded `random.Random(...)`, and never take values from `FX_RNG`. Play with `loops=-1` at volume 0.25 on battle start when the condition is rain or static, and stop them in `end_battle` and on leaving battle mode.
  - **JS:** a WebAudio noise buffer through a lowpass (rain) or bandpass bursts (static), gain 0.08, started and stopped the same way. Respect the existing mute setting.
  - **RENDER test:** check the buffer length (the existing pattern).
- [ ] **Step 2:** Run `node .claude/scripts/verify.js` (full) and expect GREEN.

---

## Chunk 5: Docs, playtest duty, gates (PM)

### Task 5.1: Docs
- [ ] **CLAUDE.md:** in the MONSTER TRAIL architecture section, add a **Battle conditions** bullet: the tables, `battle_condition` with its own seed, the `damage_calc(condition)` parameter, the `FORCE_CONDITION` seam (both suites force clear), `battle_scene` (cosmetic) and `arena_kind` (SEASIDE → shore). Add `CONDITIONS` and `REGION_CONDITIONS` to the emit_tables coverage list, and update the check counts.
- [ ] **`docs/wiki/testing.md`:** add the new CONDITIONS section in both suites and the PARITY `conditions` key.
- [ ] **`docs/wiki/monster-trail.md`:** add a conditions row and update the synced date.
- [ ] **`docs/playtests/monster-trail.md`:** add the MT-17 row:

| MT-17 | | Battle conditions and scenes | seam: `__GAME__.setForceCondition(id)` for each id, then `startBattle(...)`; 3D and SETTINGS → Basic presentation (2D); `browser_resize` 390x844 and 844x390 | the condition message is shown before "Go"; the tag shows (none for clear); rain, snow and dust particles are visible; night is darker; the foe stays above the HP box; the tag doesn't cover either HP box at phone sizes; Reduced motion stops falling particles; the console is empty |

- [ ] Run `node .claude/scripts/wiki-sync.js` and fix any drift.

### Task 5.2: Gates
- [ ] Run `node .claude/scripts/verify.js` (full). It must be GREEN.
- [ ] game-reviewer, round 1.
- [ ] playtester, `game: monster-trail, mode: full`, with emphasis on MT-04, MT-12, MT-14 and MT-17. This duty has no webcam, so the camera rules don't apply.
- [ ] Balance scratch script, run by the creature-designer and not committed: for each region's wild pool at its levels, three starters × each condition × 300 seeded fights, reporting the win-rate change from clear. If any change is more than 8 points, set the boosts to 1.2/0.83 in Python, re-emit, and run again.
- [ ] Learning loop: reflect-and-learn, capture-knowledge and wiki-sync.

## Continuation status (2026-10-18)

Chunks 1-3 were already reviewed; Chunks 4-5 (2D scenes, loops, docs and playtest evidence) are now implemented. See `docs/playtests/runs/2026-10-18-continuation.md` and `docs/handoffs/2026-10-18-resume.md` for final verification. Historical step checkboxes above are retained.
