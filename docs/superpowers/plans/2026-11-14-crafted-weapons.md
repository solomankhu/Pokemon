# Crafted Weapons ("gear"): Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking. In this repo the PM runs it through the `game-pm` skill: one worker per chunk, then `verify.js`, then game-reviewer.

**Goal:** The player crafts a WOOD CLUB or IRON SPEAR and strikes wild monsters and GLOOMSTALK from the battle BAG. A strike takes a fixed share of the foe's max HP, never knocks it out, wears down and breaks. Trainer and gym battles refuse it. Both builds behave the same, and PARITY proves it.

**Spec:** `docs/superpowers/specs/2026-11-14-crafted-weapons-design.md` is the contract. If the plan and spec disagree, the spec wins: stop and ask the PM. Research: `docs/research/2026-11-14-lore-and-sound.md`.

**Architecture:**
- **DATA:** a `GEAR` table (id -> name, tier, pct, dur, verb, snap) and a `GEAR_TEXT` table, both PARITY-compared. Two recipes with a new `sets_gear` key. `GEAR` is emitted to JS; `GEAR_TEXT` is hand-ported (text tables are not emitted today).
- **ENGINE (pure, no rng):** `gear_hit`, `gear_wear`, `gear_blocks`, `gear_refusal`, `clean_gear`.
- **STATE:** `Game.gear = None | {"id", "dur"}`, saved top-level as `gear`. `craft()` / `craft_recipe` / `recipe_owned` / `craft_cells` / `note_found` learn `sets_gear`. The battle BAG gains a `"gear"` row; refusals happen in the BAG confirm before `take_turn`; the strike is a `take_turn` branch built only from `q_msg`/`q_do`/`q_wait`/`q_hp`.
- **SHELL:** a no-op `fx_gear(kind, gid)` hook (same pattern as `fx_hit`/`fx_craft`), a procedural glyph swing, juice, three synthesized sounds and a 3D `gear` event.
- **Untouched:** engine rng use (except the foe's normal move pick after a landed strike), `damage_calc`, `catch_roll`, XP, loot, MAP, campaign.js.

**Tech stack:** Python 3.13 + pygame 2.6.1 (`.venv/Scripts/python.exe`), plain JS in one HTML file, node test suites, three.js presenter in `combat/`.

**Name rule:** in code this is **gear** (`GEAR`, `Game.gear`, `G.gear`, `sets_gear`/`setsGear`, `fx_gear`/`juiceGear`). "weapon" already names the move-implement system (`MOVE_WEAPONS`, `draw_action_weapon`, `combat/recipes.js`). Players see WOOD CLUB / IRON SPEAR.

**Every chunk ends GREEN.** game-reviewer's Step 0 runs `verify.js`; red means `PRECONDITION_FAILED`. Inside a chunk, workers run **in sequence**. Chunks never overlap. **Chunk 1 has two parts (A: Python, B: emit + JS port + PARITY) and one gate at the end of Part B**: PARITY already compares `recipes`, `icons`, `labels`/`materialLabel` and `craftBlurb`, so no Python-only table change can be green on its own (plan review C1/C2). There is no separate Chunk 2.

**Commits:** this is a git repo, but commit only when the user asks. "Checkpoint" below means: before a chunk, copy every file it touches into `.superpowers/sdd/2026-11-14-crafted-weapons/chunk-N/`; after it, `node .claude/scripts/verify.js` is green.

**Traps (every chunk):**
- `claude's monsters.py` is **CRLF** and **pure ASCII**. Edit tool only, never `sed -i`. After each chunk run
  `.venv/Scripts/python.exe -c "d=open(\"claude's monsters.py\",'rb').read(); print(d.count(b'\r\n'), d.count(b'\n'), max(d)<128)"` - the two counts must match and it must print True.
- Tests and the HTML are LF. Filenames contain a space and an apostrophe: quote them.
- Never pipe a suite through `tail`/`head`. Use `node .claude/scripts/verify.js [--only ...]`.
- **No `random` / `Math.random` in new code.** Engine code is fully deterministic; shell jitter uses `FX_RNG` / `fxRand`.
- **Line numbers drift** (other sessions edit these files). Every anchor below gives a `grep`; use it, not the number. Numbers are as of 2026-11-14.
- New queue steps go through the helpers only, so steps queued inside a running `do` splice in at the current position (lesson `queue-append-not-splice`).

## Prerequisites (PM checks before Chunk 1)
- [ ] Visual crafting Chunk 6 gates are done and Part B Chunk 5 (docs, MT-19) is done (`docs/handoffs/PROGRESS.md`).
- [ ] Story phase 2's dialogue-parity test exists (`grep -n '"story"' "claude's monsters.test.py"`). If it does not, Chunk 5 waits for it; Chunks 1-4 may proceed, because `GEAR_TEXT` gets its own PARITY key here.
- [ ] `node .claude/scripts/verify.js` is green on the starting tree.

## File map
| File | Chunks |
|---|---|
| `claude's monsters.py` | 1A (data, engine, craft, save), 3 (battle), 4 (shell), 5 (NPC text) |
| `claude's monsters.test.py` | 1A, 1B (PARITY), 3, 4, 5 |
| `.claude/skills/add-monster/emit_tables.py` | 1B |
| `claude's monsters.html` | 1B (port), 3, 4, 5 |
| `claude's monsters.test.js` | 1B, 3, 4 |
| `combat/presenter.js`, `combat/effects.js`, `combat/presenter.test.js` | 4 |
| `campaign.test.js` | 1B |
| `.claude/skills/add-monster/SKILL.md` | 6 |
| `gemini's code.html`, `gemini's code.test.js` | 5 (log W-11 only, if phase 2c landed) |
| `docs/playtests/monster-trail.md`, `docs/playtests/campaign.md` | 6 |
| `CLAUDE.md`, `docs/wiki/*`, `docs/handoffs/PROGRESS.md` | 6 |

---

## Chunk 1: Data, engine, crafting and save - both builds (Part A sandbox-designer, then Part B game-chore; one gate)

Checkpoint first (every file of both parts). **Part A is Python only; between Part A and Part B the suite is red by design**: the PARITY keys `recipes`, `icons`, `labels`, `materialLabel`, `craftBlurb` and the `tables` dry run differ until Part B ports them. Nobody runs the full gate, dispatches the reviewer or reports green until Part B ends. **Do not** add `GEAR` to `python_tables()` in Part A.

### Task 1.1: Failing tests

**Files:** Test: `claude's monsters.test.py`, in the SANDBOX section just before its closing `os.remove(mt.SAVE_PATH)` (find with `grep -n "MAP is byte-identical after the whole SANDBOX section"`; insert above the `os.remove` line above it).

- [ ] **Step 1: Write the tests**

```python
# --- GEAR (crafted weapons; spec docs/superpowers/specs/2026-11-14-crafted-weapons-design.md)
ok(set(mt.GEAR) == {"club", "spear"}, "GEAR has exactly the club and the spear")
ok(mt.GEAR["club"]["tier"] < mt.GEAR["spear"]["tier"], "the spear outranks the club")
for gid, gd in mt.GEAR.items():
    ok(isinstance(gd["pct"], int) and 1 <= gd["pct"] <= 50, "%s pct is a small int" % gid)
    ok(isinstance(gd["dur"], int) and gd["dur"] >= 1, "%s has durability" % gid)
    ok(gid in mt.ICONS and gid in mt.CRAFT_BLURB and gid in mt.MATERIAL_LABEL,
       "%s has an icon, a blurb and a label" % gid)
    r = next((r for r in mt.RECIPES if r.get("sets_gear") == gid), None)
    ok(r is not None and r["out"] == gid and r["id"] == gid, "%s has one sets_gear recipe" % gid)
ok(next(r for r in mt.RECIPES if r["id"] == "club")["needs"] == {"twig": 3}, "club = 3 TWIG")
ok(next(r for r in mt.RECIPES if r["id"] == "spear")["needs"]
   == {"ore": 1, "flint": 1, "stone": 2, "twig": 1}, "spear = 1 ORE + 1 FLINT + 2 STONE + 1 TWIG")
ok([r["id"] for r in mt.RECIPES][-2:] == ["club", "spear"], "gear recipes are appended last")

# gear_hit: integer, never KOs, at least 1 while the foe is above 1 HP
for gid in mt.GEAR:
    for maxhp in range(1, 201):
        for hp in (maxhp, max(1, maxhp // 2), 2, 1):
            if hp > maxhp:
                continue
            d = mt.gear_hit(maxhp, hp, gid)
            ok(isinstance(d, int) and 0 <= d <= max(0, hp - 1),
               "gear_hit(%d,%d,%s) never KOs" % (maxhp, hp, gid))
            if hp > 1:
                ok(d >= 1, "gear_hit(%d,%d,%s) lands" % (maxhp, hp, gid))
ok(mt.gear_hit(80, 80, "club") == 12 and mt.gear_hit(80, 80, "spear") == 20, "15%/25% of 80")
ok(mt.gear_hit(21, 21, "club") == 4, "rounds up: ceil(21*15/100) = 4")
ok(mt.gear_hit(50, 1, "spear") == 0, "a foe at 1 HP takes nothing")

# gear_wear / clean_gear
ok(mt.gear_wear({"id": "club", "dur": 2}) == {"id": "club", "dur": 1}, "wear drops 1")
ok(mt.gear_wear({"id": "club", "dur": 1}) is None, "the last swing breaks it")
ok(mt.clean_gear({"id": "spear", "dur": 3}) == {"id": "spear", "dur": 3}, "clean keeps a good record")
ok(mt.clean_gear({"id": "spear", "dur": 99}) == {"id": "spear", "dur": mt.GEAR["spear"]["dur"]},
   "clean clamps dur to the max")
for junk in (None, 3, "club", [], {"id": "axe", "dur": 2}, {"id": "club"}, {"id": "club", "dur": 0},
             {"id": "club", "dur": -2}, {"id": "club", "dur": True}, {"id": "club", "dur": 2.5},
             {"id": "club", "dur": "2"}, {"id": ["club"], "dur": 2},
             {"id": "club", "dur": float("nan")}, {"id": "club", "dur": float("inf")}):
    ok(mt.clean_gear(junk) is None, "clean_gear(%r) is None" % (junk,))
# A whole float is a whole number in JS (Number.isInteger(2.0)), so Python agrees (plan review R8).
ok(mt.clean_gear({"id": "club", "dur": 2.0}) == {"id": "club", "dur": 2}, "dur 2.0 loads as 2")

# gear_blocks: what the craft refuses
full_club = {"id": "club", "dur": mt.GEAR["club"]["dur"]}
ok(not mt.gear_blocks(None, "club") and not mt.gear_blocks(None, "spear"), "nothing held: both open")
ok(mt.gear_blocks(full_club, "club"), "same id at full: refused")
ok(not mt.gear_blocks({"id": "club", "dur": 2}, "club"), "same id worn: repair allowed")
ok(not mt.gear_blocks(full_club, "spear"), "upgrade allowed")
ok(mt.gear_blocks({"id": "spear", "dur": 1}, "club"), "downgrade refused")

# gear_refusal: pure, in priority order
ok(mt.gear_refusal(None, None, False, 30) == "none", "no gear")
ok(mt.gear_refusal(full_club, {"name": "X"}, False, 30) == "trainer", "trainer battle")
ok(mt.gear_refusal(full_club, {"name": "X"}, True, 30) == "gym", "gym battle")
ok(mt.gear_refusal(full_club, None, False, 1) == "floor", "foe already at 1 HP")
ok(mt.gear_refusal(full_club, None, False, 2) is None, "wild, foe above 1 HP: allowed")
for k in ("trainer", "gym", "floor", "swing", "soften", "hunt_hit", "hunt_break",
          "craft_new", "craft_repair", "craft_replace", "craft_full", "craft_weaker"):
    ok(k in mt.GEAR_TEXT and mt.GEAR_TEXT[k].isascii(), "GEAR_TEXT[%s]" % k)

# craft(): sets_gear stores nothing and conserves everything else
club_r = next(r for r in mt.RECIPES if r["id"] == "club")
spear_r = next(r for r in mt.RECIPES if r["id"] == "spear")
have = {"twig": 5, "stone": 4, "ore": 2, "flint": 1}
after = mt.craft(have, club_r, 0, 0, None)
ok(after == {"twig": 2, "stone": 4, "ore": 2, "flint": 1}, "club spends exactly 3 TWIG, adds nothing")
ok(mt.craft(have, club_r, 0, 0, full_club) is None, "club refused at full")
ok(mt.craft(have, club_r, 0, 0, {"id": "spear", "dur": 3}) is None, "club refused under a spear")
ok(mt.craft(have, spear_r, 0, 0, full_club) == {"twig": 4, "stone": 2, "ore": 1, "flint": 0},
   "spear over a club spends exactly its needs")
ok(mt.craft({"twig": 2}, club_r, 0, 0, None) is None, "short of TWIG: refused")

# Game wiring: craft_recipe, recipe_owned, craft_cells, note_found, save/load
gg = mt.Game()
gg.new_game()
ok(gg.gear is None, "a new game holds no gear")
si = [r["id"] for r in mt.RECIPES].index("spear")
ok(mt.craft_cells(gg)[si]["state"] == "hidden", "the spear is hidden before any of its needs is found")
gg.bag = {"twig": 4}
mt.note_found(gg)                 # found only grows through note_found (craft_recipe never calls it)
ok(mt.craft_cells(gg)[si]["state"] != "hidden", "the spear reveals once any of its needs is found (twig)")
ci = [r["id"] for r in mt.RECIPES].index("club")
ok(gg.craft_recipe(ci) and gg.gear == full_club and gg.bag == {"twig": 1}, "craft a club")
ok(mt.recipe_owned(gg, club_r), "a full club shows as owned")
ok(not gg.craft_recipe(ci) and gg.bag == {"twig": 1}, "crafting it again at full spends nothing")
gg.gear = {"id": "club", "dur": 2}
gg.bag = {"twig": 3}
ok(gg.craft_recipe(ci) and gg.gear == full_club and gg.bag == {}, "re-crafting repairs to full")
mt.note_found(gg)
ok("club" in gg.found, "a held club is found")
gg.save_game()
g2 = mt.Game()
g2.load_game()
ok(g2.gear == full_club, "gear survives save/load")
import json
with open(mt.SAVE_PATH) as fh:
    raw = json.load(fh)
raw.pop("gear", None)
with open(mt.SAVE_PATH, "w") as fh:
    json.dump(raw, fh)
g2.gear = {"id": "spear", "dur": 1}
g2.load_game()
ok(g2.gear is None, "an old save (no gear key) loads with no gear, resetting in-memory gear")

# The AXE stays craftable with weapons in the game (TWIG is shared but renewable)
ga = mt.Game()
ga.new_game()
ga.bag = {"twig": 5, "flint": 1}
ok(ga.craft_recipe(ci) and ga.craft_recipe([r["id"] for r in mt.RECIPES].index("axe")),
   "a club then the AXE from 5 TWIG + 1 FLINT")
```

- [ ] **Step 2: Run and confirm they fail**

Run: `node .claude/scripts/verify.js --only py`
Expected: FAIL with `AttributeError: module ... has no attribute 'GEAR'`.

### Task 1.2: Data

**Files:** Modify `claude's monsters.py`.

- [ ] **Step 1: `GEAR` and `GEAR_TEXT`**, directly after `AXE_MAX = 1` (`grep -n "^AXE_MAX"`):

```python
# The player's own gear (crafted weapons): struck from the battle BAG in wild
# battles and hunts, refused by trainers.  pct is a share of the foe's max HP,
# rounded up; a strike never takes the foe below 1 HP (spec 2026-11-14).
GEAR = {
    "club":  dict(name="WOOD CLUB", tier=1, pct=15, dur=6, verb="swing",
                  snap="The WOOD CLUB splinters apart!"),
    "spear": dict(name="IRON SPEAR", tier=2, pct=25, dur=8, verb="thrust",
                  snap="The IRON SPEAR's shaft snaps!"),
}
GEAR_TEXT = {
    "trainer": "The trail code: no hands on a trainer's monster!",
    "gym": "LEADER VOLT: Put that down. Up here we fight through our team.",
    "floor": "It can barely stand. Your team has to finish it.",
    "swing": "You %s the %s!",
    "soften": "%s staggers, but you can't finish it alone.",
    "hunt_hit": "It flinches from the SPEAR. It knows that shape.",
    "hunt_break": "The spear snaps. It is still watching you.",
    "craft_new": "Crafted the %s.",
    "craft_repair": "Your %s is good as new.",
    "craft_replace": "Crafted the %s. Your old %s is left behind.",
    "craft_full": "Your %s doesn't need mending.",
    "craft_weaker": "You'd rather keep your %s.",
}
```

- [ ] **Step 2: Recipes, labels, blurbs.** Append to the end of `RECIPES` (after `smoke`):

```python
    # sets_gear: the player's weapon; the caller stores it in Game.gear (never in materials).
    dict(id="club", out="club", count=1, needs={"twig": 3}, sets_gear="club"),
    dict(id="spear", out="spear", count=1, needs={"ore": 1, "flint": 1, "stone": 2, "twig": 1},
         sets_gear="spear"),
```

Add `"club": "WOOD CLUB", "spear": "IRON SPEAR"` to `MATERIAL_LABEL`, and to `CRAFT_BLURB`: `"club": "Softens a wild foe.", "spear": "Hits harder. Lasts longer."`.

- [ ] **Step 3: Icons.** Add `ICONS["club"]` and `ICONS["spear"]` (16 rows x 16 chars, palette keys from `ICON_PALETTE` only, `.` transparent), matching the existing icon style (see `ICONS["axe"]`): club = a knotted brown club on a diagonal; spear = an ash shaft with a grey iron tip and a band of dark tape near the grip. The existing ICONS shape tests check their size and palette, but `ICON_WANT` is an exact key set: add both ids to it in the Python suite here (`grep -n "ICON_WANT" "claude's monsters.test.py"`); Part B does the JS one.

### Task 1.3: Pure engine functions

**Files:** Modify `claude's monsters.py`, next to `pick_tier`/`axe_tier` (`grep -n "^def axe_tier"`).

- [ ] **Step 1: Write them**

```python
def gear_hit(maxhp, hp, gid):
    """HP a GEAR strike takes: pct of max HP rounded up, at least 1, but never
    below 1 HP left (a strike can't KO).  Integer only, no rng (PARITY)."""
    if hp <= 1:
        return 0
    return min(hp - 1, max(1, (maxhp * GEAR[gid]["pct"] + 99) // 100))


def gear_wear(gear):
    """The gear after one landed strike: dur - 1, or None once it breaks."""
    dur = gear["dur"] - 1
    return dict(id=gear["id"], dur=dur) if dur > 0 else None


def gear_blocks(gear, gid):
    """True when crafting GEAR[gid] would waste materials: the same gear at full
    durability, or a higher tier already held (no downgrades)."""
    if not gear:
        return False
    if gear["id"] == gid:
        return gear["dur"] >= GEAR[gid]["dur"]
    return GEAR[gear["id"]]["tier"] > GEAR[gid]["tier"]


def gear_refusal(gear, trainer, gym, foe_hp):
    """Why a strike is refused before the turn starts, or None: 'none' (no
    gear), 'gym', 'trainer' (the trail code), 'floor' (foe already at 1 HP)."""
    if not gear:
        return "none"
    if trainer:
        return "gym" if gym else "trainer"
    if foe_hp <= 1:
        return "floor"
    return None


def clean_gear(raw):
    """A saved gear record, or None: a known id and an int (not bool) dur,
    clamped to 1..max.  Missing, junk or broken records load as no gear."""
    if not isinstance(raw, dict):
        return None
    gid, dur = raw.get("id"), raw.get("dur")
    if not isinstance(gid, str) or gid not in GEAR:
        return None
    if isinstance(dur, float) and dur.is_integer():
        dur = int(dur)                 # JS can't tell 2.0 from 2; agree with it
    if isinstance(dur, bool) or not isinstance(dur, int) or dur <= 0:
        return None
    return dict(id=gid, dur=min(dur, GEAR[gid]["dur"]))
```

- [ ] **Step 2: `craft()`** gains a `gear=None` parameter. Add after the `sets_tool` refusal:

```python
    if recipe.get("sets_gear") and gear_blocks(gear, recipe["sets_gear"]):
        return None
```

and widen the "puts nothing in" condition to `if not (recipe.get("sets_tier") or recipe.get("sets_tool") or recipe.get("sets_gear")):`. Update the docstring ("sets_gear: the player's weapon").

### Task 1.4: Game wiring

**Files:** Modify `claude's monsters.py`.

- [ ] **Step 1:** `Game.__init__` and `new_game`: `self.gear = None`.
- [ ] **Step 2:** `recipe_owned(g, r)`: add `if r.get("sets_gear"): return gear_blocks(g.gear, r["sets_gear"])`.
- [ ] **Step 3:** `craft_cells`: pass `gear=g.gear` to `craft(...)`, and change `loot = all(k in GOODS ...)` to `loot = any(k in GOODS ...)`. Every existing recipe is all-GOODS or no-GOODS, so only the spear changes; the tests above pin it.
- [ ] **Step 4:** `note_found`: add `if g.gear: f.add(g.gear["id"])`.
- [ ] **Step 5:** `craft_recipe(i)`: before `if not bag_room(...)`, add the refusal:

```python
        if r.get("sets_gear") and gear_blocks(self.gear, r["sets_gear"]):
            self.sfx("cancel")
            held = GEAR[self.gear["id"]]["name"]
            self.craft_msg = GEAR_TEXT["craft_full" if self.gear["id"] == r["sets_gear"]
                                       else "craft_weaker"] % held
            return False
```

pass `gear=self.gear` to `craft(have, r, tier, axe, self.gear)`, and in the message branch add (before the generic message):

```python
        elif r.get("sets_gear"):
            gid, old = r["sets_gear"], self.gear
            self.gear = dict(id=gid, dur=GEAR[gid]["dur"])
            if old and old["id"] == gid:
                self.craft_msg = GEAR_TEXT["craft_repair"] % GEAR[gid]["name"]
            elif old:
                self.craft_msg = GEAR_TEXT["craft_replace"] % (GEAR[gid]["name"], GEAR[old["id"]]["name"])
            else:
                self.craft_msg = GEAR_TEXT["craft_new"] % GEAR[gid]["name"]
```

Check the `fx_craft` call after it still fires for gear recipes (the CRAFT fly/pop animation uses the recipe's icon).

- [ ] **Step 6:** `save_game`: add `gear=self.gear` to the saved dict. `load_game`: `self.gear = clean_gear(d.get("gear"))`, assigned unconditionally, placed before `note_found(self)`.
- [ ] **Step 7: Run** `node .claude/scripts/verify.js --only py`. Expected: every new GEAR check passes, and the **only** failures are the PARITY lines for `recipes`, `icons`, `labels`, `materialLabel` and `craftBlurb` (they clear in Part B). Any other failure is a real bug: fix it before handing over. Report the exact failing lines to the PM.

> Note: if the existing generic tests at `grep -n 'r.get("sets_tier") or r.get("sets_tool")' "claude's monsters.test.py"` go red (recipe `out` must be a material/balls/tier/tool; the counter carve-out), add an explicit `or r.get("sets_gear")` clause to each. Never delete or loosen them otherwise. Extend the all-recipes conservation loop's inventory so the new needs are covered.

- [ ] **Step 8:** CRLF/ASCII check. Hand over to Part B (no reviewer yet).

---

## Chunk 1, Part B: Emit, JS port and PARITY (game-chore)

Mechanical: the Python from Part A is the reference. This part ends the Chunk 1 gate.

### Task 2.1: Emit

**Files:** `.claude/skills/add-monster/emit_tables.py`, `claude's monsters.html`.

- [ ] **Step 1:** In `emit_recipes`, add `if r.get("sets_gear"): extra += ", setsGear: %s" % js(r["sets_gear"])`.
- [ ] **Step 2:** Add `emit_gear()`:

```python
def emit_gear():
    out = ["const GEAR = {"]
    for k, g in mt.GEAR.items():
        out.append("  %s: { name: %s, tier: %d, pct: %d, dur: %d, verb: %s, snap: %s }," % (
            k, js(g["name"]), g["tier"], g["pct"], g["dur"], js(g["verb"]), js(g["snap"])))
    out.append("};")
    return out
```

register `("const GEAR = {", "};", emit_gear)` in `BLOCKS`, and update the header docstring's covered-tables list.
- [ ] **Step 3:** In the HTML, add an empty anchor `const GEAR = {\n};` directly after `const RECIPES = [...]` **in the same edit** (`splice` exits when an anchor is missing). Then run `.venv/Scripts/python.exe .claude/skills/add-monster/emit_tables.py --write`, then the dry run, which must say every table already matches. `ICONS` picks up `club`/`spear` automatically.

### Task 2.2: Port

**Files:** `claude's monsters.html` (find each with `grep -n "function craft(\|function recipeOwned\|function craftCells\|function noteFound\|function craftRecipe\|function saveGame\|function loadGame\|function newGame\|const CRAFT_BLURB\|const MATERIAL_LABEL"`).

- [ ] **Step 1:** Hand-port `GEAR_TEXT` (same keys and strings) next to `CRAFT_MSG`, plus the two `MATERIAL_LABEL` and `CRAFT_BLURB` entries.
- [ ] **Step 2:** Port the five pure functions, line for line:

```js
function gearHit(maxhp, hp, gid) {
  if (hp <= 1) return 0;
  return Math.min(hp - 1, Math.max(1, Math.floor((maxhp * GEAR[gid].pct + 99) / 100)));
}
function gearWear(gear) {
  const dur = gear.dur - 1;
  return dur > 0 ? { id: gear.id, dur } : null;
}
function gearBlocks(gear, gid) {
  if (!gear) return false;
  if (gear.id === gid) return gear.dur >= GEAR[gid].dur;
  return GEAR[gear.id].tier > GEAR[gid].tier;
}
function gearRefusal(gear, trainer, gym, foeHp) {
  if (!gear) return 'none';
  if (trainer) return gym ? 'gym' : 'trainer';
  if (foeHp <= 1) return 'floor';
  return null;
}
function cleanGear(raw) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const { id, dur } = raw;
  if (typeof id !== 'string' || !Object.prototype.hasOwnProperty.call(GEAR, id)) return null;
  if (typeof dur !== 'number' || !Number.isInteger(dur) || dur <= 0) return null;
  return { id, dur: Math.min(dur, GEAR[id].dur) };
}
```

- [ ] **Step 3:** Port the wiring exactly as Task 1.4: `craft(..., gear = null)`, `recipeOwned`, `craftCells` (`all` -> `some`... i.e. the JS spelling of `any`), `noteFound`, `craftRecipe` (refusal + messages), `G.gear = null` in the initial state and `newGame`, `saveGame` writes `gear: G.gear`, `loadGame` assigns `G.gear = cleanGear(d.gear)` **unconditionally** (so a stale in-memory gear never survives loading an older save in the same window).
- [ ] **Step 4:** Export on `__GAME__` (`grep -n "globalThis.__GAME__ = {"`): `GEAR, GEAR_TEXT, gearHit, gearWear, gearBlocks, gearRefusal, cleanGear`, and a test seam `giveGear(id, dur)` that sets `G.gear = cleanGear({id, dur})`.

### Task 2.3: Tests

- [ ] **Step 1: JS SANDBOX** (`claude's monsters.test.js`, before the CONDITIONS section): mirror Task 1.1's pure-function, craft and save cases through `g.*`, including `cleanGear` junk (`NaN`, `Infinity`, `'2'`, `true`, arrays) and the stale-reset load.
- [ ] **Step 2: PARITY** (`claude's monsters.test.py`): add `r.get("sets_gear")` to the `recipes` tuple (`grep -n '"recipes": \[\[r\["id"\]'`) and the JS dump's matching field; add a `gear` key comparing:
  - `GEAR` and `GEAR_TEXT` (full tables);
  - `gear_hit(maxhp, hp, gid)` over `maxhp` 1..200, `hp` in `{maxhp, maxhp//2, 2, 1}`, both ids;
  - `clean_gear` over a fixed list of 12 junk/valid records (JSON-representable ones only);
  - `gear_blocks` over `{None, club@6, club@2, spear@8, spear@1} x {club, spear}`;
  - `gear_refusal` over `{None, club@6} x {None, trainer} x {gym False/True} x {foe_hp 1, 2}`.
- [ ] **Step 3: campaign** (`campaign.test.js`): extend the existing save round trip (`grep -n "balls" campaign.test.js`) so a saved `gear: {id: 'spear', dur: 3}` survives the chapter round trip.
- [ ] **Step 4: Existing exact-set and generic recipe tests** (plan review G3/G4): add `club` and `spear` to `ICON_WANT` in both suites (`grep -n "ICON_WANT" "claude's monsters.test.py" "claude's monsters.test.js"`), and add an explicit `|| r.setsGear` clause to the JS generic recipe assertions (`grep -n "setsTool" "claude's monsters.test.js"`: the "out is a material/GOODS" check and the "moves exactly the recipe" check). Never loosen them otherwise.
- [ ] **Step 5: Run** `node .claude/scripts/verify.js`. Expected: all PASS, `tables` "already match". **This is the Chunk 1 gate:** game-reviewer runs now, on Parts A and B together. **Checkpoint.**

---

## Chunk 3: Battle use - both builds (creature-designer)

Checkpoint first. No animation yet: the strike is message -> damage -> HP drain. Chunk 4 adds the swing presentation in front of the damage step.

### Task 3.1: Failing tests (Python BATTLE section, after `fresh_hunt` tests; `grep -n "^def fresh_hunt"`)

- [ ] **Step 1: Write the tests**

```python
# --- GEAR in battle
def gear_battle(foe_lv=20, trainer=None, gear=("club", 6)):
    fresh_battle(mt.make_mon("emberling", 40), mt.make_mon("sprigling", foe_lv), trainer)
    g.gear = {"id": gear[0], "dur": gear[1]} if gear else None
    to_menu_log()
    return g.battle

b = gear_battle()
ok("gear" in g.battle_bag_items(), "the battle BAG offers held gear")
before_hp = b.foe.hp
b.phase, b.cursor = "bag", g.battle_bag_items().index("gear")
g.confirm()                                   # the real input path (lesson port-skips-integration-test)
log = to_menu_log()
ok(b.foe.hp == before_hp - mt.gear_hit(b.foe.maxhp, before_hp, "club"), "the strike takes gear_hit HP")
ok(g.gear == {"id": "club", "dur": 5}, "one strike wears 1")
ok(index_of_in(log, "You swing the WOOD CLUB!") < index_of_in(log, "used"),
   "the swing is narrated before the foe's move")

# never KOs: strike until the foe is at 1, then the next is refused with no turn and no rng
b = gear_battle(foe_lv=3, gear=("spear", 8))
for _ in range(10):
    if b.foe.hp <= 1 or g.gear is None:
        break
    b.phase, b.cursor = "bag", g.battle_bag_items().index("gear")
    g.confirm()
    to_menu_log()
    b.mine.hp = b.mine.maxhp                  # keep our side alive for the loop
ok(b.foe.hp == 1, "strikes floor the foe at exactly 1 HP")
dur, rng = g.gear["dur"], random.getstate()
b.phase, b.cursor = "bag", g.battle_bag_items().index("gear")
g.confirm()
to_menu_log()
ok(g.gear["dur"] == dur and random.getstate() == rng and b.foe.hp == 1,
   "a strike at 1 HP is refused: no durability, no rng, no turn")

# trainer and gym refusals
TRAINER = next(n for n in mt.NPCS if n.get("kind") == "trainer")
for trainer, key in ((TRAINER, "trainer"), (mt.GYM_LEADER, "gym")):
    b = gear_battle(trainer=trainer)
    hp, rng = b.foe.hp, random.getstate()
    b.phase, b.cursor = "bag", g.battle_bag_items().index("gear")
    g.confirm()
    log = to_menu_log()
    ok(any(mt.GEAR_TEXT[key] in s for s in log), "%s refusal line" % key)
    ok(b.foe.hp == hp and g.gear["dur"] == 6 and random.getstate() == rng,
       "%s refusal spends no turn, durability or rng" % key)

# break
b = gear_battle(foe_lv=40, gear=("club", 1))
b.phase, b.cursor = "bag", g.battle_bag_items().index("gear")
g.confirm()
log = to_menu_log()
ok(g.gear is None and "gear" not in g.battle_bag_items(), "the last swing breaks the club")
ok(any(mt.GEAR["club"]["snap"] in s for s in log), "the break is narrated")

# hunt: allowed, floored, and hunt_over fires exactly once on a loss
calls = []
orig = g.hunt_over
g.hunt_over = lambda result: (calls.append(result), orig(result))[1]
b = fresh_hunt(mt.make_mon("sprigling", 5), lv=25)
g.gear = {"id": "spear", "dur": 8}
to_menu_log()
b.phase, b.cursor = "bag", g.battle_bag_items().index("gear")
g.confirm()
log = to_menu_log()
ok(b.foe.hp >= 1, "a hunt strike never KOs GLOOMSTALK")
ok(any(mt.GEAR_TEXT["hunt_hit"] in s for s in log), "GLOOMSTALK flinches from the spear")
# The L5 sprigling normally faints to the foe's reply in this same turn, so the
# real lose path runs; never call end_battle by hand (it would start a second fade).
ok(calls == (["lose"] if b.mine.hp <= 0 else []),
   "hunt_over fires exactly once, through the natural faint after a gear turn")
g.hunt_over = orig
g.gear = None                     # the global g is shared with later sections
```

`index_of_in(log, sub)` is a tiny helper (first index whose line contains `sub`, else `len(log)`); add it next to `index_of` if no equivalent exists. `g.confirm()` routes to `confirm_battle` in Python; the JS entry point is `g.confirmKey()`.

- [ ] **Step 2: Run** `node .claude/scripts/verify.js --only py` -> FAIL ("gear" not in the BAG list).

### Task 3.2: Python implementation

**Files:** `claude's monsters.py`.

- [ ] **Step 1: `battle_bag_items`** (`grep -n "def battle_bag_items"`): gear goes right after BALL:

```python
        out = ["ball"] if self.balls > 0 else []
        if self.gear:
            out.append("gear")
        return out + [k for k in BATTLE_BAG if self.bag.get(k, 0) > 0]
```

- [ ] **Step 2: BAG confirm** (`grep -n 'if b.phase == "bag":'`, the confirm one that calls `take_turn`): before the `GOODS[item]` lookup:

```python
            if item == "gear":
                why = gear_refusal(self.gear, b.trainer,
                                   bool(b.trainer) and b.trainer.get("id") == "gym", b.foe.hp)
                if why:
                    # Refused before take_turn: no turn, no durability, no rng.
                    self.sfx("cancel")
                    b.phase = "anim"
                    self.q_msg(GEAR_TEXT[why] if why in GEAR_TEXT else "You have nothing to swing.")

                    def to_menu():
                        b.phase = "menu"
                        b.cursor = 0
                    self.q_do(to_menu)
                    return
                self.sfx("select")
                self.take_turn(dict(t="gear"))
                return
```

This block **must** sit above the existing `self.sfx("select")` line, so a refusal plays only `cancel`; the existing items keep their `select`. Use the codebase idiom `trainer["id"] == "gym"` (check `GYM_LEADER` has `id="gym"`; in JS `b.trainer && b.trainer.id === 'gym'`).

- [ ] **Step 3: `take_turn` branch** after the `"item"` branch and before `"swap"`:

```python
        if action["t"] == "gear":
            gid = self.gear["id"]
            gd = GEAR[gid]
            self.q_msg(GEAR_TEXT["swing"] % (gd["verb"], gd["name"]))

            def strike():
                # Damage and wear apply here, at contact, never at queue-build time.
                b.foe.hp -= gear_hit(b.foe.maxhp, b.foe.hp, gid)
                self.gear = gear_wear(self.gear)
                self.fx_hit("foe", 1, False, None)
                self.q_hp()
                if b.hunt and gid == "spear":
                    self.q_msg(GEAR_TEXT["hunt_hit"])
                elif b.foe.hp == 1:
                    self.q_msg(GEAR_TEXT["soften"] % b.foe.name)
                if self.gear is None:
                    self.q_do(lambda: self.fx_gear("break", gid))
                    self.q_msg(GEAR_TEXT["hunt_break"] if b.hunt and gid == "spear" else gd["snap"])
            self.q_do(strike)
            self.apply_move(False, foe_move)
            self.q_hp()
            self.faint_check()
            return
```

Add the no-op hook in `Game.__init__` next to `self.fx_hit = ...`: `self.fx_gear = lambda kind, gid: None`.

- [ ] **Step 4: BAG row drawing (minimal, so RENDER never crashes).** Add a pure `battle_row(g, k)` -> `(name, count_text, icon, desc)`: for `"gear"` it is `(GEAR[id]["name"], "%d/%d" % (dur, max), id, CRAFT_BLURB[id])`; for everything else it returns today's values (`bag_name(k)`, `"x%d"` of `g.balls`/`g.bag`, `icon_id(k)`, `bag_desc(k)`). Use it in the battle BAG draw (`grep -n "count = g.balls if k == \"ball\""`) instead of the hardcoded lookups, so `bag_name("gear")`/`icon_id("gear")` are never called. In a trainer battle the row is greyed **and** the description pane (right of `BBAG_SPLIT_X`) says "The trail code forbids it here." - the reason never goes in the row, which has no room (names start at x=72, counts right-align at `BBAG_SPLIT_X - 30`). Extend the existing RENDER width/name test (`grep -n "BATTLE_BAG" "claude's monsters.test.py"` in RENDER) to draw a gear row and check "IRON SPEAR" and "8/8" fit and appear. Chunk 4 adds the pips.
- [ ] **Step 5: Run** `node .claude/scripts/verify.js --only py`. PASS.

### Task 3.3: JS port and tests

- [ ] **Step 1:** Port Steps 1-4 to `claude's monsters.html`: `battleBagItems`, the BAG confirm (`grep -n "if (b.phase === 'bag') {"`, the one calling `takeTurn`; gym test is `b.trainer && b.trainer.id === 'gym'`; the gear block goes above its `sfx('select')`), a pure `battleRow(k)`, a `takeTurn` `gear` branch with `qMsg`/`qDo`/`qHp` mirroring the Python (place it after the `item` branch; note JS also has a `defend` branch Python lacks - match by branch name, not position), `juiceGear` no-op hook, and the BAG row draw.
- [ ] **Step 2: JS tests** (`claude's monsters.test.js` BATTLE section): the same cases as Task 3.1, through the real confirm path, with a `Math.random` spy asserting zero calls on every refusal.
- [ ] **Step 3: PARITY queue transcript:** for a fixed setup (emberling L40 vs sprigling L20, club@6, `FORCE_NO_LOOT`, `FORCE_CONDITION` clear), record the messages of one strike turn in both builds and compare them **up to and including the last gear line, before the foe's "used" message**. The foe's reply rolls `damage_calc` on different generators per build (`random` vs `Math.random`), so anything after it can't be compared (plan review R5). Also compare the trainer, gym and floor refusal messages exactly.
- [ ] **Step 4: Balance.** Run `.venv/Scripts/python.exe .claude/skills/balance-report/balance_report.py` and paste the before/after lines into the chunk report (no table changed numbers, so they should match; the new fact to record is catch odds at 1 HP: `catch_roll` ratio 3x full-HP, e.g. 5.9% -> 17.5% for catch rate 45). **Re-check TWIG supply:** the drops/XP Phase A work (session game-50, `docs/superpowers/plans/2026-11-14-drops-xp-phase-a.md`) replaces the flat 40% wild-win drop with `loot_roll` lists, `LOOT_DOUBLE` and `LOOT_RARE`. The creature-designer's "club arrives around L8-15" estimate assumed the old 40%; recompute it from the new `loot_roll` and adjust the club recipe only if it now arrives later than ROCKY PASS.
- [ ] **Step 5: Run** `node .claude/scripts/verify.js`. All PASS. **Checkpoint.**

---

## Chunk 4: Presentation, both builds and 3D (game-feel-engineer; `juice-pass`, `game-ui` skills)

Checkpoint first.

### Task 4.1: The swing step (Python)

- [ ] **Step 1:** Add a `q_event(kind, gid)` helper beside `q_action` that queues a fixed presentation step **without** `move_timeline` (which raises for non-move ids):

```python
    def q_event(self, kind, gid):
        """A non-move presentation beat (the gear swing): shell hook, then a fixed wait."""
        self.q_do(lambda: self.fx_gear(kind, gid))
        self.q_wait(GEAR_SWING_TIME)
```

with `GEAR_SWING_TIME = 0.28` beside the juice constants. In the `gear` branch, call `self.q_event("swing", gid)` between the swing message and `self.q_do(strike)`, and call `self.fx_gear("thud", gid)` inside `strike` after `fx_hit`. The wait is the same length under `REDUCED_MOTION`.
- [ ] **Step 2:** Guard `draw_action_weapon` and `action_pose` (`grep -n "def draw_action_weapon\|def action_pose"`): return early when the action's `moveId` is not in `MOVES`. This is defence only: Python's `q_event` never sets `b.action` (only `q_action` does), so the guard is not test coverage of the swing.

### Task 4.2: Look and sound (Python shell)

- [ ] **Step 1: Glyph.** A `GearFx` state on `Shell` (like `CraftFx`), fed by `game.fx_gear`. `swing` animates a procedural glyph (club: tapered brown rect with two knot pixels; spear: grey shaft with a steel triangle tip and a dark tape band) from the bottom-left of the arena to `Juice.target("foe")` on an ease-out-back arc over `GEAR_SWING_TIME`, with one squash frame at contact. Its bounding box stays above y=240 (the player HP box starts at y=248). Under `REDUCED_MOTION` the glyph shows statically at the foe for the window.
- [ ] **Step 2: Juice.** The impact juice (trauma, burst, flash) comes **only** from the `fx_hit("foe", 1, False, None)` call already in `strike`; `Juice.hit` colours a `None` type through `TYPE_COLOR.get`, so give that fallback the neutral `GEAR_SPARK = (235, 225, 200)`. `thud` adds only the sound and the glyph's squash frame - never a second `Juice.hit` (plan review R10). `break` bursts `GEAR_SHARD = 6` pooled particles and adds `TRAUMA_GEAR_BREAK = 0.15`; shake stays within `SHAKE_MAX`. Jitter uses `FX_RNG` only.
- [ ] **Step 3: Sounds** in the `Sfx` note-list table, rendered at the mixer's actual rate:
  - `gear_swing`: a short noise whoosh with a falling band (~0.12 s);
  - `gear_thud`: a click plus a ~90 Hz body;
  - `gear_break`: three short noise cracks and a descending tone (for the spear, end on a broken fragment of WREN's tune once that motif exists; until then the descending tone alone).
- [ ] **Step 4: BAG row pips:** `WOOD CLUB  3/6` plus a 6- or 8-pip bar, right-aligned, text >= 12 px, clear of `BBAG_SPLIT_X`.
- [ ] **Step 5:** Add every new constant (`GEAR_SWING_TIME`, `GEAR_SPARK`, `GEAR_SHARD`, `TRAUMA_GEAR_BREAK`) to the PARITY shell-constants list.

### Task 4.3: JS and 3D

- [ ] **Step 1:** Port 4.1-4.2 to the HTML (`juiceGear`, WebAudio sounds, glyph, pips). For the swing beat use `eventAction(b, 'gear', 'mine', { target: 'foe', gearId: gid })` (its `...extra` overrides the default self-target) followed by `qDo(strike)`. `actionRecipe`/`recipeFor` must never see a gear id.
- [ ] **Step 2: `combat/presenter.js`** (`grep -n "landed\|targetOf\|recipe" combat/presenter.js`): today contact is detected only for actions with a recipe (`landed()` is false without one) and `effects.start` draws a generic status ring for unknown kinds, so a plain `gear` branch would never reach `impact()` (plan review R4). Add:
  - a non-recipe contact path in `update()`: when `action.kind === 'gear'`, fire contact once at `action.contactAt`;
  - `gear` in the foe-targeted kinds of `targetOf`;
  - a `gear` case in `combat/effects.js` that builds a cylinder (+ cone for the spear) from shared geometry and swings it from the camera side;
  - `impact()` with a `'blunt'` profile on the **foe** at contact.
- [ ] **Step 3: Tests.**
  - Python RENDER: a gear battle frame by frame (swing, thud, break): no exception, glyph box y <= 240, shake <= `SHAKE_MAX`, pool bounded, engine `random` state unchanged by drawing, `REDUCED_MOTION` gives zero offset, sound buffer lengths match the mixer rate, the BAG row with pips, and the CRAFT grid with both gear cells. Dump frames with `MT_FRAME_DIR` for the reviewer.
  - JS SHELL JUICE: same order through `__GAME__`; `Math.random` never called by juice; break particles bounded.
  - `combat/presenter.test.js`: a `gear` action with `moveId: null` never calls `recipeFor`, raises `juice.impacts` by exactly 1, and the impact lands on `'foe'`.
- [ ] **Step 4: Run** `node .claude/scripts/verify.js`. All PASS. **Checkpoint.**

---

## Chunk 5: Story text (narrative-designer)

Gate: the Story phase 2 dialogue-parity test exists. Checkpoint first.

- [ ] **Step 1:** NPC lines, both builds (hand-ported tables), within the 108-char/2-page budget:
  - `t3` FORESTER KIT `after`: "FORESTER KIT: Three TWIGs bound tight make a club. Good for wild things. Trainers won't stand for it."
  - `quarry` `lines[0]`: "QUARRY HAND: WREN had me forge her a spear before she went up. Said a lamp wasn't enough. Take my spare PICK." (keeps the existing page count)
  - `t7` CAVER NOX `defeat`: "CAVER NOX: Fine. Take the shaft south. Last lamp I saw was WREN's. She had a spear, too."
- [ ] **Step 2:** Mark B14 and B17 in `docs/wiki/story.md` as replaced by these lines (approved 2026-11-14), and add the gear beats to the clue/payoff map.
- [ ] **Step 3:** If Story phase 2c (terminal `logs`) has landed in `gemini's code.html`, set W-11 to "The lamp is low. I left her my spear. I keep hearing her up in the cave." (ASCII; `gemini's code.test.js` ASCII check). If it has not, record W-11 in the phase 2c brief instead.
- [ ] **Step 4:** Run `node .claude/scripts/verify.js` (the box-fit RENDER check and dialogue parity must pass). **Checkpoint.**

---

## Chunk 6: Gates and docs (PM)

- [ ] **Step 1:** Add the playtest rows from the consultation to `docs/playtests/monster-trail.md` as **MT-20** (craft and wild strike) and **MT-21** (refusals, hunt, touch, reduced motion, save), and **CP-06** (gear survives the descent) to `docs/playtests/campaign.md`. MT-19 stays Part B's. Seams they use: `__GAME__.giveGear`, `GEAR`, `setForceNoLoot`, `setForceCondition`, `startHunt`, `startBattle(foe, {trainer})`.
- [ ] **Step 2:** `node .claude/scripts/verify.js` green; game-reviewer on the whole feature; playtester `game: monster-trail, mode: full` plus `game: campaign` CP-06.
- [ ] **Step 3:** Docs: CLAUDE.md (gear paragraph in the MONSTER TRAIL architecture list; emitted tables now include `GEAR`; BAG line "Potions, GREAT BALL, SMOKE and gear work through battle BAG"; test counts), `.claude/skills/add-monster/SKILL.md` (its emitted-tables list), the `emit_tables.py` header docstring, `docs/wiki/monster-trail.md` (BAG, crafting, the `gear` save key), the rest of `docs/wiki/` via `node .claude/scripts/wiki-sync.js`, and `docs/handoffs/PROGRESS.md`. Note in CLAUDE.md that `gear` is also a species art kind (`art["kind"]`); the battle action kind `gear` is a separate namespace. Several of these files belong to other sessions' doc passes (game-50 visual crafting Chunk 6): confirm none is being edited before starting.
- [ ] **Step 4:** Learn loop: reflect-and-learn if any round failed; capture-knowledge (the "refuse before take_turn to keep rng and the turn" pattern is a candidate); LOOP line.

## Risks
| Risk | Guard |
|---|---|
| A refusal routed through `take_turn` burns `random.choice(foe.moves)` and shifts the engine stream | refusals live in the BAG confirm; tests assert `random.getstate()` / `Math.random` spy unchanged |
| Damage applied at queue-build time shows in 3D/HP bars before the swing | damage and wear only inside `strike` (`q_do`) |
| `q_action`/`move_timeline`/`recipeFor` throw for non-move ids | `q_event` / `eventAction`; draw guards; presenter test |
| `emit_recipes` silently drops `sets_gear` | explicit emit + PARITY recipe tuple field |
| Gear lands in the BAG and is deleted by `clean_bag` on load | `craft()` stores nothing for `sets_gear`; save/load test |
| Stale JS gear survives loading an older save | unconditional `G.gear = cleanGear(...)`; test |
| Rounding drift between builds | integer `(maxhp*pct+99)//100` vs `Math.floor(...)`; PARITY grid 1..200 |
| Catching gets easier | accepted by design (1 HP = 3x full-HP odds; costs turns and durability); recorded in the balance report |
| ORE wasted by a downgrade or a full re-craft | `gear_blocks` refusal |
| TWIG contention with the AXE | TWIG is renewable loot; test crafts a club then the AXE |
| Name collision with move "weapons" | the `gear` name rule |

## Plan review log (plan-with-review, 2026-11-14)
Drafted from the spec and the six-agent consultation, then reviewed by Gap Hunter (G) and Risk (R). Duplicates are merged.

| # | Persona | Severity | Finding | Resolution |
|---|---|---|---|---|
| C1 | R1, G1 | CRITICAL | Python-only RECIPES/ICONS/MATERIAL_LABEL/CRAFT_BLURB rows make PARITY (in the `py` suite) red after Chunk 1 | Fixed: Chunks 1 and 2 merged into Chunk 1 Part A + Part B with one gate; Part A's expected failures are listed exactly |
| C2 | R2 | CRITICAL | `tables` dry run is certainly red after Part A; the "back to back" fallback broke "every chunk ends green" | Fixed: written in as the plan (one gate at the end of Part B), not a fallback |
| C3 | G2, R3 | CRITICAL / RISK | Spear-reveal test fails: `found` grows only via `note_found`, which nothing called while TWIG was held | Fixed: assert hidden first, then `note_found` while holding TWIG, then assert revealed |
| 4 | G3 | GAP | `ICON_WANT` is an exact key set in both suites | Fixed: Task 1.2 Step 3 (Python) and Part B Step 4 (JS) |
| 5 | G4 | GAP | JS generic recipe assertions go red on `club` | Fixed: explicit `\|\| r.setsGear` clauses, Part B Step 4 |
| 6 | G5, R7 | GAP | Tests leave the shared global `g` holding gear | Fixed: `g.gear = None` at the end of the block |
| 7 | G6, R7 | GAP / MINOR | Hunt test called `end_battle` by hand after the natural faint already did (second fade; passes by accident) | Fixed: assert `calls == ["lose"]` from the natural path; no manual call |
| 8 | R4, G10 | RISK | 3D presenter detects contact only for recipe actions; unknown kinds draw a status ring | Fixed: non-recipe contact path, `targetOf`, an `effects.js` gear case; test `juice.impacts` +1 on `'foe'` |
| 9 | R5 | RISK | Cross-build transcript after the foe's reply uses different rng generators | Fixed: compare only up to the last gear line, plus refusal lines |
| 10 | R6, G9 | RISK / MINOR | BAG row doesn't fit at 640x480; `bag_name`/`icon_id("gear")` wrong; width test misses it | Fixed: pure `battle_row`/`battleRow`, reason in the description pane, width test extended |
| 11 | R8 | MINOR | `dur: 2.0` accepted by JS, rejected by Python | Fixed: Python accepts whole floats; NaN/inf rejected in both; test added |
| 12 | R9 | MINOR | Refusal would play `select` then `cancel` | Fixed: gear block required above `sfx("select")` |
| 13 | R10 | MINOR | `thud` reusing `Juice.hit` doubles burst and trauma | Fixed: impact juice only from `fx_hit`; thud is sound + squash |
| 14 | G7 | MINOR | Gym detected by identity rather than the codebase idiom | Fixed: `trainer["id"] == "gym"` / `b.trainer.id === 'gym'` |
| 15 | G8 | MINOR | JS confirm entry point is `confirmKey` | Fixed: named in Task 3.1 |
| 16 | G11 | MINOR | Python draw guards are dead code (`q_event` never sets `b.action`) | Fixed: kept as defence, labelled not-coverage |
| 17 | G12 | MINOR | add-monster SKILL.md, emit header and `docs/wiki/monster-trail.md` would go stale; `gear` is also an art kind | Fixed: Chunk 6 Step 3 lists them, plus the namespace note |
| 18 | PM | RISK | game-50's drops/XP Phase A changes `loot_roll`, invalidating the TWIG-supply estimate behind the club recipe | Fixed: Task 3.3 Step 4 recomputes it; recipe changes only if the club arrives after ROCKY PASS |

Confirmed fine by the reviewers: the refusal path consumes no rng (`take_turn` is the only consumer); the `anim` refusal is pumped by `update_battle`; steps queued inside `strike` splice ahead of the foe's reply; HP changes only inside `strike`, so `battleSnapshot` never shows it early; the hunt scare ends before the menu; `loot_seed` and the stalker mulberry32 are untouched; old saves and the campaign save are covered; `craft_have`/`bag_room` handle a non-GOODS out; BAG items already skip `q_command`; the CRAFT grid (12 cells) fits `CRAFT_GRID_ROWS`; JS `craft()`'s 5th parameter breaks no caller; webcam and `combat/commands.py` need no change; the overworld BAG, shop and sell never see `gear`.

**Gate:** no CRITICAL finding is open. Chunk 1 may be dispatched once the prerequisites at the top are met.
