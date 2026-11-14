# Visual Crafting and Item Icons: Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking. In this repo the PM runs it through the `game-pm` skill: one worker per chunk, then `verify.js`, then game-reviewer.

**Goal:** Every item gets a 16x16 pixel-art icon. CRAFT becomes a recipe-book grid with a detail pane and a fly-in-and-pop craft animation. Recipes stay silhouettes until you find their ingredients. The BAG, battle BAG and shop rows show the same icons. Both builds behave the same, as PARITY proves.

**Spec:** `docs/superpowers/specs/2026-10-23-visual-crafting-design.md` is the contract; section numbers below (§1.3 and so on) refer to it. If the plan and spec disagree, the spec wins: stop and ask the PM. The plan changes the spec only in **order of work**, and only where the code forces it (see "Deviations").

**Architecture:**
- **Data:** the icons are a pure, emitted table (`ICON_PALETTE`, `ICONS`, `ICON_SHADOW`).
- **Discovery:** a `Game.found` set. The pure `note_found` fills it from what the player holds, and the pure `clean_found` checks it on load.
- **Rules:** the pure `craft_cells` replaces the list's `craft_rows`, and the pure `grid_move` moves the cursor.
- **The STATE → SHELL boundary:** a no-op `fx_craft` / `juiceCraft` hook, the same pattern as `fx_hit`.
- **Shell:** a cached icon blitter, a `CraftFx` / `CRFX` animation object with its own sparkle list, and the new `draw_craft` / `drawCraft`.
- **Engine:** no change to rng, the step queue or recipe costs.

**Tech stack:** Python 3.13 + pygame 2.6.1 (`.venv/Scripts/python.exe`), plain JS in one HTML file, and node test suites.

**Every chunk ends GREEN.** game-reviewer's Step 0 runs `verify.js`, and red means `PRECONDITION_FAILED`. Inside a chunk, workers run **in sequence**. Chunks never overlap.

**No git.** "Commit" means two things:
- **before a chunk:** copy every file it touches into `.superpowers/sdd/2026-10-23-visual-crafting/chunk-N/`;
- **after it:** `node .claude/scripts/verify.js` is green.

**The HTML lock:** `claude's monsters.html` is in use by session game-c9 (the webcam seam).
- Chunks 1-2 touch Python only and can start now.
- Chunks 3-5 start only after game-c9 says it is done. The PM checks this before dispatching Chunk 3.
- HTML line numbers below were taken while game-c9 was editing, so they will have drifted. **Find each anchor with the given `grep`, never by line number.**

**Traps (every chunk):**
- `claude's monsters.py` is **CRLF** and **pure ASCII**.
  - Use the Edit tool only. Never use `sed -i` or any scripted rewrite: a worker did this in Part B and flipped the file to LF.
  - After each chunk, run `.venv/Scripts/python.exe -c "d=open(\"claude's monsters.py\",'rb').read(); print(d.count(b'\r\n'), d.count(b'\n'), max(d)<128)"`. The two counts must match and it must print True. In Git Bash, `grep -c $'\r$'` wrongly prints 0.
- Tests and the HTML are LF.
- Filenames contain a space and an apostrophe, so quote them.
- Never pipe a suite through `tail`/`head`. Use `node .claude/scripts/verify.js [--only ...]`.
- No `random` / `Math.random` in new code:
  - engine code uses no randomness at all;
  - shell sparkles use `FX_RNG` / `fxRand` only.
- **Python test placement:** SANDBOX additions go just before the SANDBOX section's closing `os.remove(mt.SAVE_PATH)`. Find it with `grep -n "MAP is byte-identical after the whole SANDBOX section"`; it is the line just above that one (today :1832). RENDER additions go inside the RENDER section, next to the CRAFT tests they replace.

## Deviations from spec §5 (order only; no behaviour changes)
| Spec says | Plan does | Why |
|---|---|---|
| Step 1 adds the `emit_tables.py` coverage and the HTML anchor blocks | Chunk 3 does both | `emit_tables.splice` calls `sys.exit` when an anchor is missing (emit_tables.py:229), so the `tables` check would go red while the HTML is locked |
| Step 2 changes the CRAFT input | Chunk 4 changes it, together with the screen | a grid cursor over the old list screen is unplayable between chunks. `craft_rows` must also survive until both builds drop it, because PARITY compares it (test.py ~:6922) |
| §4 says to compare `wrap`/`wrapText` `max_lines` in PARITY | PARITY compares a new pure `wrap_lines(s, max_w, measure, max_lines)` with a fixed fake `measure` | pygame and canvas measure text differently, so the drawn wraps can never match; the line-breaking rule can |

## File map
| File | Chunks |
|---|---|
| `claude's monsters.py` | 1 (icons), 2 (rules), 4 (screen, input, FX), 5 (list icons) |
| `claude's monsters.test.py` | 1, 2, 3 (PARITY), 4, 5 |
| `.claude/skills/add-monster/emit_tables.py` | 3 |
| `claude's monsters.html` | 3, 4, 5 |
| `claude's monsters.test.js` | 3, 4, 5 |
| `docs/handoffs/PROGRESS.md` | 0, 6 |

---

## Chunk 0: Housekeeping (PM, FAST)

- [ ] **Step 1:** Create `.superpowers/sdd/2026-10-23-visual-crafting/`.
- [ ] **Step 2:** In `docs/handoffs/PROGRESS.md` `## Next`, replace the visual-crafting bullet with: `- Visual crafting + item icons: spec approved by user; plan docs/superpowers/plans/2026-10-23-visual-crafting.md. Chunks 1-2 (py) first; Chunks 3-5 wait for game-c9 to release the html.`

---

## Chunk 1: The icon set, Python (game-feel-engineer)

**Files:** `claude's monsters.py` (DATA layer, directly after the `GOODS` / `LOOT_*` / `BALL_PRICE` block, ~:699) and `claude's monsters.test.py` (SANDBOX).

### Task 1.1: Failing table tests
- [ ] **Step 1:** Add to SANDBOX:
```python
# -- icons: pure 16x16 pixel art, emitted to the HTML build --
ICON_WANT = set(mt.GOODS) | {"stone", "ore", "wall", "balls", "pick", "iron_pick", "axe",
                             "lantern", "pulse", "coins"}
ok(set(mt.ICONS) == ICON_WANT, "ICONS has exactly one icon per drawable id (%d)" % len(ICON_WANT))
ok("." not in mt.ICON_PALETTE, "'.' is transparent and never a palette key")
ok(all(len(k) == 1 and len(v) == 3 and all(isinstance(c, int) and 0 <= c <= 255 for c in v)
       for k, v in mt.ICON_PALETTE.items()), "palette keys are single chars, values RGB triples")
ok(len(mt.ICON_SHADOW) == 3 and max(mt.ICON_SHADOW) - min(mt.ICON_SHADOW) < 24,
   "ICON_SHADOW is one dark, unsaturated RGB triple")
for k, rows in mt.ICONS.items():
    ok(len(rows) == 16 and all(len(r) == 16 for r in rows), "icon %s is 16x16" % k)
    ok(all(c == "." or c in mt.ICON_PALETTE for r in rows for c in r), "icon %s uses only palette chars" % k)
    ok(sum(c != "." for r in rows for c in r) >= 24, "icon %s is not (nearly) empty" % k)
ok(len({tuple(v) for v in mt.ICONS.values()}) == len(mt.ICONS), "no two icons are identical")
ids = [r["out"] for r in mt.RECIPES] + [k for r in mt.RECIPES for k in r["needs"]] + list(mt.GOODS) \
    + [row[1] for b in (0, 5) for row in mt.bag_rows(b, {k: 1 for k in mt.GOODS}, {"stone": 1, "ore": 1, "wall": 1})
       if row[0] in ("item", "mat", "loot")] + list(mt.SHOP_STOCK) + ["coins"]
ok(all(mt.icon_id(i) in mt.ICONS for i in ids), "icon_id resolves every recipe, BAG, shop and coins id")
ok(mt.icon_id("ball") == "balls" and mt.icon_id("twig") == "twig", "icon_id maps only ball -> balls")
```
- [ ] **Step 2:** Run `node .claude/scripts/verify.js --only py`. Expected: FAIL (`AttributeError: ICONS`).

### Task 1.2: The tables
- [ ] **Step 3:** Add to the DATA layer:
```python
# Item icons: 16x16 pixel art, one char per pixel.  "." is transparent;
# every other char is an ICON_PALETTE key.  Emitted to the HTML build.
ICON_PALETTE = {...}             # ~16-24 colours: outline, wood, stone greys, metal, leaf greens, ...
ICON_SHADOW = (38, 44, 52)      # every opaque pixel of a not-yet-found recipe's result
ICONS = {...}                    # id -> [16 strings of 16 chars]


def icon_id(item):
    """The ICONS key for a recipe out/need, BAG row id or shop id."""
    return "balls" if item == "ball" else item
```
- **Art direction (Minecraft-like):**
  - a 1 px dark outline (palette `k`);
  - two or three shades per material, with light from the top-left;
  - the object fills about 12x12 of the 16x16;
  - each icon is recognisable at 1x (16 px) and readable as a silhouette.
- **Reference:** the mockup's SVG icons in `.superpowers/brainstorm/3717-1792747527/craft-screen.html` set the look of the AXE, TWIG, FLINT, POTION, GREAT BALL, SMOKE, WALL, BALL, PICK, OIL and PULSE.
- **Ids that need distinct art:**
  - `balls` vs `greatball`: a blue top band on the GREAT BALL;
  - `potion` vs `superpotion`: purple vs red liquid;
  - `pick` vs `iron_pick`: a wooden head vs a grey iron head;
  - `dust` vs `emberdust`: grey vs orange;
  - `glowmoss` vs `leaf`.
- **Formatting:** one string per line, 16 lines per icon, so a reviewer can see the picture. Keep the file ASCII.
- [ ] **Step 4:** Run `node .claude/scripts/verify.js --only py`. Expected: PASS.

### Task 1.3: An eyeball check
- [ ] **Step 5:** Write a scratch script in the session scratchpad (never in the repo):
  - it imports the game the way the suite does, with the repo root on `sys.path` (lesson `tool-import-path`);
  - it paints every icon at 4x into a contact sheet under `.superpowers/sdd/2026-10-23-visual-crafting/chunk-1/icons.png`, using the SDL dummy video driver.
- [ ] **Step 6:** Return the PNG path in your report, so the PM can show it to the user.
- [ ] **Step 7:** Run `node .claude/scripts/verify.js`. Expected: 8/8 PASS. Check the CR count of the `.py`.

---

## Chunk 2: Discovery, cells, grid move and the hook, Python (sandbox-designer)

**Files:** `claude's monsters.py` and `claude's monsters.test.py` (SANDBOX).
**Not in this chunk:**
- the CRAFT input handler (`confirm` ~:3587, `move_cursor` ~:3878);
- `draw_craft`;
- `craft_rows`, which stays until Chunk 4.

### Task 2.1: Failing tests
- [ ] **Step 1:** Add to SANDBOX:
```python
# -- discovery: Game.found --
fg = mt.Game(); fg.new_game()
ok(fg.found == {"balls", "lantern"}, "a new game has found only what it starts with (BALLs, lamp)")
fg.bag["twig"] = 1; mt.note_found(fg)
ok("twig" in fg.found, "holding a TWIG once records it")
fg.bag.pop("twig"); mt.note_found(fg)
ok("twig" in fg.found, "spending it never un-finds it")
fg.flags["pick"] = 2; fg.flags["axe"] = 1; fg.pulses = 1; fg.materials["ore"] = 1; mt.note_found(fg)
ok({"pick", "iron_pick", "axe", "pulse", "ore"} <= fg.found, "tool tiers, PULSE counter and materials are found")
ok("stone" not in fg.found, "a zero count is not found")
ok(mt.clean_found(["twig", "axe", "twig"]) == {"twig", "axe"}, "clean_found keeps known ids")
ok(mt.clean_found(["twig", 3, None, "nosuch", ["axe"]]) == {"twig"}, "clean_found drops junk entries")
ok(all(mt.clean_found(v) == set() for v in (None, "twig", {"twig": 1}, 7)), "a non-list loads as empty")
# save / load / new game
fg.save_game(); lg = mt.Game(); lg.load_game()
ok(lg.found >= {"twig", "pick", "iron_pick", "axe"}, "found survives a save and load")
with open(mt.SAVE_PATH, encoding="utf-8") as fh:
    raw = json.load(fh)
ok(raw["found"] == sorted(raw["found"]), "found is saved as a sorted list")
raw.pop("found"); raw["bag"] = {"flint": 2}
with open(mt.SAVE_PATH, "w", encoding="utf-8") as fh:
    json.dump(raw, fh)
lg = mt.Game(); lg.load_game()
ok("flint" in lg.found and "twig" not in lg.found, "an old save without found is seeded from holdings")
raw["found"] = ["twig", 9, "zzz"]
with open(mt.SAVE_PATH, "w", encoding="utf-8") as fh:
    json.dump(raw, fh)
lg = mt.Game(); lg.load_game()
ok("twig" in lg.found and "zzz" not in lg.found, "junk in a saved found list is dropped")
lg.new_game()
ok(lg.found == {"balls", "lantern"}, "new_game after a load keeps no old discoveries")

# -- craft_cells: the state matrix (spec 1.3) --
def cell(g, rid):
    return next(c for c in mt.craft_cells(g) if c["kind"] == "recipe" and mt.RECIPES[c["recipe"]]["id"] == rid)
cg = mt.Game(); cg.new_game()
cells = mt.craft_cells(cg)
ok(len(cells) == len(mt.RECIPES) + 1 and cells[-1]["kind"] == "build", "one cell per recipe, then BUILD")
ok([c["state"] for c in cells if c["kind"] == "recipe" and mt.RECIPES[c["recipe"]]["id"] in
    ("axe", "potion", "greatball", "smoke")] == ["hidden"] * 4, "a fresh game hides the four loot recipes")
ok(all(cell(cg, r)["state"] != "hidden" for r in ("wall", "ball", "iron_pick", "oil", "pulse")),
   "sandbox recipes are never hidden")
ok(cell(cg, "wall")["state"] == "locked" and cell(cg, "oil")["state"] == "locked", "fresh WALL and OIL are locked")
h = cell(cg, "axe")
ok(h["name"] == "???" and h["blurb"] == mt.CRAFT_MSG["hidden"], "a hidden cell names nothing")
ok(h["needs"] == [("twig", 0, 2), ("flint", 0, 1)], "a hidden cell keeps the real needs (the screen hides them)")
cg.bag["twig"] = 1; mt.note_found(cg)
ok(cell(cg, "axe")["state"] == "locked", "after holding a TWIG once the AXE is locked, not hidden")
cg.bag.update(twig=2, flint=1)
ok(cell(cg, "axe")["state"] == "ready", "2 TWIG + 1 FLINT: the AXE is ready")
ok(cell(cg, "axe")["name"] == "AXE" and cell(cg, "axe")["blurb"] == "Cuts thin trees.", "a revealed cell's name and blurb")
calls = []
cg.fx_craft = lambda i, before: calls.append((i, dict(before)))
axe_i = next(i for i, r in enumerate(mt.RECIPES) if r["id"] == "axe")
ok(cg.craft_recipe(axe_i) is True, "a successful craft returns True")
ok(calls == [(axe_i, {"twig": 2, "flint": 1})], "fx_craft fires once with the counts from before spending")
ok(cell(cg, "axe")["state"] == "owned", "after crafting, the AXE is owned")
ok(cg.craft_recipe(axe_i) is False and len(calls) == 1, "a refused craft returns False and fires no hook")
pot_i = next(i for i, r in enumerate(mt.RECIPES) if r["id"] == "potion")
ok(cg.craft_recipe(pot_i) is False and len(calls) == 1, "a short craft fires no hook")
ok(cells[-1]["state"] == "locked" and cells[-1]["needs"] == [("wall", 0, 1)], "BUILD is locked with no WALLs")
cg.materials["wall"] = 2
ok(mt.craft_cells(cg)[-1]["state"] == "ready", "BUILD is ready once a WALL is held")
cg.lantern = 40
ok(cell(cg, "oil")["blurb"] == "Fills the lamp (now 40%).", "the OIL blurb shows the lamp")
ok(cell(cg, "pulse")["blurb"] == "Stuns the stalker. Have %d/3." % cg.pulses, "the PULSE blurb shows have/cap")
ok(set(mt.CRAFT_BLURB) == {r["id"] for r in mt.RECIPES} | {"build"}, "one blurb per recipe plus BUILD")
ok(all(len(b % ((100,) if "%d%%" in b else (3, 3) if "%d" in b else ())) <= 48
       for b in mt.CRAFT_BLURB.values()), "every blurb fits 48 chars")

# -- grid_move: exhaustive, n = 1..15 (spec 1.4) --
gm_ok = True
for n in range(1, 16):
    for i in range(n):
        for d in ("up", "down", "left", "right"):
            j = mt.grid_move(i, d, n, mt.CRAFT_COLS)
            if not 0 <= j < n:
                gm_ok = False
            if d in ("left", "right") and j // mt.CRAFT_COLS != i // mt.CRAFT_COLS:
                gm_ok = False
            if d == "down" and i // mt.CRAFT_COLS < (n - 1) // mt.CRAFT_COLS and j // mt.CRAFT_COLS != i // mt.CRAFT_COLS + 1:
                gm_ok = False
ok(gm_ok, "grid_move never leaves the grid, keeps left/right in-row, and down always reaches the next row")
ok(mt.grid_move(0, "left", 10, 5) == 0 and mt.grid_move(4, "right", 10, 5) == 4, "no wrapping at row ends")
ok(mt.grid_move(7, "down", 9, 5) == 7 and mt.grid_move(3, "down", 7, 5) == 6, "down clamps to the last cell")
ok(mt.CRAFT_COLS == 5, "CRAFT_COLS")
```
- [ ] **Step 2:** Run `node .claude/scripts/verify.js --only py`. Expected: FAIL (`AttributeError`).

### Task 2.2: Pure rules (STATE layer, next to `craft_have` / `bag_room`, ~:1733)
- [ ] **Step 3:** Add:
```python
CRAFT_COLS = 5                   # the CRAFT grid's width (cells per row)
CRAFT_BLURB = {"wall": "A block to build with.", "ball": "Catches wild monsters.",
               "iron_pick": "Cracks seams.", "oil": "Fills the lamp (now %d%%).",
               "pulse": "Stuns the stalker. Have %d/%d.", "axe": "Cuts thin trees.",
               "potion": "Restores 20 HP.", "greatball": "A sturdier BALL.",
               "smoke": "Escape any wild battle.", "build": "Place WALLs in ROCKY PASS."}
CRAFT_MSG = {"hidden": "Find its ingredients first.", "nowall": "No WALLs yet. Craft some first."}


def note_found(g):
    """Record every item id g holds now in g.found (never removes one)."""
    f = g.found
    f.update(k for k, v in g.materials.items() if v > 0)
    f.update(k for k, v in g.bag.items() if v > 0)
    tier = pick_tier(g.flags.get("pick"))
    for cond, k in ((g.balls > 0, "balls"), (tier >= 1, "pick"), (tier >= 2, "iron_pick"),
                    (axe_tier(g.flags.get("axe")) >= 1, "axe"), (g.lantern > 0, "lantern"),
                    (g.pulses > 0, "pulse")):
        if cond:
            f.add(k)


def clean_found(raw):
    """A saved found list: known ICONS ids only; anything else is empty."""
    if not isinstance(raw, list):
        return set()
    return {v for v in raw if isinstance(v, str) and v in ICONS}


def recipe_owned(g, r):
    """A tool recipe whose tool is already that good."""
    if r.get("sets_tier"):
        return pick_tier(g.flags.get("pick")) >= r["sets_tier"]
    if r.get("sets_tool"):
        return axe_tier(g.flags.get(r["sets_tool"][0])) >= r["sets_tool"][1]
    return False


def craft_cells(g):
    """One dict per CRAFT grid cell: each recipe in order, then BUILD (spec 1.3)."""
    tier = pick_tier(g.flags.get("pick"))
    axe = axe_tier(g.flags.get("axe"))
    have = craft_have(g)
    cells = []
    for i, r in enumerate(RECIPES):
        owned = recipe_owned(g, r)
        loot = all(k in GOODS for k in r["needs"])
        hidden = (loot and not owned and r["out"] not in g.found
                  and not any(k in g.found for k in r["needs"]))
        if hidden:
            state = "hidden"
        elif owned:
            state = "owned"
        elif craft(have, r, tier, axe) is not None and bag_room(g, r):
            state = "ready"
        else:
            state = "locked"
        blurb = CRAFT_BLURB[r["id"]]
        if r["id"] == "oil":
            blurb %= g.lantern
        elif r["id"] == "pulse":
            blurb %= (g.pulses, r["cap"])
        cells.append(dict(kind="recipe", recipe=i, icon=icon_id(r["out"]),
                          name="???" if hidden else craft_label(r["out"]),
                          blurb=CRAFT_MSG["hidden"] if hidden else blurb, state=state,
                          needs=[(k, have.get(k, 0), n) for k, n in r["needs"].items()],
                          out=r["out"], count=r["count"]))
    w = g.materials.get("wall", 0)
    cells.append(dict(kind="build", recipe=None, icon="wall", name="BUILD WALLS",
                      blurb=CRAFT_BLURB["build"], state="ready" if w > 0 else "locked",
                      needs=[("wall", w, 1)], out="wall", count=0))
    return cells


def grid_move(i, d, n, cols):
    """The CRAFT cursor after one move on an n-cell grid: clamped, no wrap.
    A down move past the last cell lands on the last cell when a lower row exists."""
    if n <= 0:
        return 0
    i = clamp(i, 0, n - 1)
    if d == "left":
        return i - 1 if i % cols else i
    if d == "right":
        return i + 1 if i % cols < cols - 1 and i + 1 < n else i
    if d == "up":
        return i - cols if i >= cols else i
    if d == "down":
        if i + cols < n:
            return i + cols
        return n - 1 if i // cols < (n - 1) // cols else i
    return i
```
`craft_rows` may reuse `recipe_owned`, but leave its output byte-identical, because PARITY compares it.

### Task 2.3: Wiring in `Game`
- [ ] **Step 4:** In `Game.__init__`:
  - add `self.found = set()  # item ids held at least once (CRAFT reveals recipes)` next to `self.bag`;
  - add the hook next to `fx_scare`:
    ```python
    # A successful craft: (recipe index, {need: have before spending}).  Cosmetic only.
    self.fx_craft = lambda i, before: None
    ```
- [ ] **Step 5:** In `Game.craft_recipe` (~:3096):
  - immediately after `after = craft(...)` succeeds, capture `before = {k: have[k] for k in r["needs"]}`;
  - just before `return True`, call `self.fx_craft(i, before)`.
  - Every failure path keeps `return False` and does not call the hook.
- [ ] **Step 6:** `Game.update` has many early returns, so wrap it rather than editing each one:
  - rename the existing `def update(self, dt, held):` to `def _update(self, dt, held):`;
  - add above it:
    ```python
    def update(self, dt, held):
        try:
            self._update(dt, held)
        finally:
            note_found(self)       # nothing gained this frame is missed by CRAFT
    ```
  - Check that `grep -n "\._update\b\|def update" "claude's monsters.py"` shows no other caller that the rename breaks.
- [ ] **Step 7:** Save and load:
  - `save_game`: call `note_found(self)` first, then add `found=sorted(self.found)` to `data`;
  - `load_game`: just before the final `return True`, add `self.found = clean_found(d.get("found"))` then `note_found(self)`.
- [ ] **Step 8:** `new_game`: put `self.found = set()` first and `note_found(self)` last (after `self.mode = "overworld"`).
- [ ] **Step 9 (spec §1.6):** make `glade_masked`'s `edits` required: `def glade_masked(x, y, edits):`.
  - Fix every Python caller that omitted it. Find them with `grep -n "glade_masked(" "claude's monsters.py" "claude's monsters.test.py"`.
  - test.py ~:1812 asserts `mt.glade_masked(*p)` with no edits. Pass `{}` explicitly there.
- [ ] **Step 10:** Run `node .claude/scripts/verify.js --only py`. Expected: PASS.
  - If the SAVE tests leave a save file behind, the SANDBOX closing `os.remove` handles it. Don't add another one.
- [ ] **Step 11:** Run `node .claude/scripts/verify.js`. Expected: 8/8 PASS.
  - PARITY must still pass. `craft_rows` is unchanged, and JS has no `found` yet, which PARITY doesn't compare until Chunk 3.
  - Check the CR count.

---

## Chunk 3: Emit, the JS port and PARITY (game-chore). **Gate: game-c9 has released the HTML.**

**Files:** `.claude/skills/add-monster/emit_tables.py`, `claude's monsters.html`, `claude's monsters.test.js`, `claude's monsters.test.py` (PARITY only).
**Style:** the port is line-for-line in camelCase: `noteFound`, `cleanFound`, `recipeOwned`, `craftCells`, `gridMove`, `iconId`, `CRAFT_COLS`, `CRAFT_BLURB`, `CRAFT_MSG`. JS state is the global `G`, so `noteFound()`, `craftCells()` and `recipeOwned(r)` read `G`, matching `craftHave()` / `craftRows()`.

### Task 3.1: Emit the icon tables
- [ ] **Step 1:** In the HTML, directly after the `const LOOT_TYPE = {` ... `};` block, add three anchors:
  ```js
  const ICON_PALETTE = {
  };
  const ICON_SHADOW = [0, 0, 0];
  const ICONS = {
  };
  ```
- [ ] **Step 2:** In `emit_tables.py`:
  - **`emit_icon_palette()`:** `const ICON_PALETTE = {` + one `  k: [r, g, b],` line per entry + `};`. Quote the keys with `js()`, because the chars may not be identifiers.
  - **`emit_icon_shadow()`:** `["const ICON_SHADOW = %s;" % js(list(mt.ICON_SHADOW))]`.
  - **`emit_icons()`:** `const ICONS = {`, then for each id `  id: [` + 16 lines `    '................',` + `  ],`, then `};`.
  - Append to `BLOCKS`:
    ```python
    ("const ICON_PALETTE = {", "};", emit_icon_palette),
    ("const ICON_SHADOW = ", None, emit_icon_shadow),
    ("const ICONS = {", "};", emit_icons)
    ```
  - Add the three names to the docstring list (line 6).
- [ ] **Step 3:** Run `.venv/Scripts/python.exe .claude/skills/add-monster/emit_tables.py --write`, then the same without `--write`. Expected: `HTML tables already match the Python build.`

### Task 3.2: Port the rules
- [ ] **Step 4:** Port into the HTML next to `craftHave` (`grep -n "function craftHave"`):
  - `iconId`, `noteFound`, `cleanFound`, `recipeOwned`, `craftCells` and `gridMove`;
  - `CRAFT_COLS`, `CRAFT_BLURB` and `CRAFT_MSG`.
  - `cleanFound` returns a `Set`. `craftCells` needs are `[id, have, n]` arrays.
  - The `%d` blurbs use the existing `fmtMsg` helper (`grep -n "function fmtMsg"`).
    - `fmtMsg` only replaces `%s` and `%d`; it never turns `%%` into `%`. Follow it with `.replace('%%', '%')` in `craftCells`, so the OIL blurb reads `now 40%.` as in Python.
    - Add a JS test for exactly that string.
- [ ] **Step 5:** State:
  - add `found: new Set()` to the initial `G` (next to `craftCursor: 0`);
  - in the reset (`grep -n "G.coins = START_COINS"`), set `G.found = new Set()` first and call `noteFound()` last.
    - This reset is inline in `confirmKey`'s title branch, not a function, so the JS "new game after a load" test must drive the title confirm to reach it.
  - `saveGame`: call `noteFound()`, then add `found: [...G.found].sort()`;
  - `loadGame`: at the end of the success path, `G.found = cleanFound(d.found); noteFound();`.
- [ ] **Step 6:** `update(dt)` returns early in several places (the first is `if (campaignBusy || combatModal) return;`), so wrap it the same way as Python:
  - rename it to `updateBody(dt)`;
  - add `function update(dt) { try { updateBody(dt); } finally { noteFound(); } }`;
  - check `grep -n "update(" "claude's monsters.html"` for callers.
- [ ] **Step 7:** `craftRecipe(i)`:
  - capture `before` as in Python, and call `juiceCraft(i, before)` before `return true`;
  - every failure path returns `false`;
  - test.js has no seam for stubbing a function declaration, so add one beside `juiceScare` (`grep -n "function juiceScare"`):
    ```js
    let craftHook = (i, before) => {};
    function juiceCraft(i, before) { craftHook(i, before); }
    ```
  - export `setCraftHook: f => { craftHook = f; }` so tests can record calls. Chunk 4 points the default at `CRFX.start`.
- [ ] **Step 8:** `gladeMasked` already has no parameter default; it falls back to `G.edits` inside its body (html ~:1220).
  - Delete that fallback line, so `edits` is truly required.
  - Fix `test.js` ~:2248 and ~:2253, which call it with two arguments: pass `opened`.
- [ ] **Step 9:** Export through `__GAME__`:
  - `ICONS`, `ICON_PALETTE`, `ICON_SHADOW`;
  - `iconId`, `noteFound`, `cleanFound`, `craftCells`, `gridMove`;
  - `CRAFT_COLS`, `CRAFT_BLURB`, `CRAFT_MSG`.

### Task 3.3: JS tests (SANDBOX, before the CONDITIONS section)
- [ ] **Step 10:** Port every Chunk 1 and Chunk 2 check:
  - the icon tables, `iconId`;
  - found and its save/load/reset;
  - the `craftCells` matrix, the hook (by temporarily replacing `juiceCraft` through whatever seam the suite uses for `juiceHit`; read how the existing tests stub it);
  - `gridMove`, the blurbs.
  - Same names, same expected values.

### Task 3.4: PARITY
- [ ] **Step 11:** In `test.py`'s JS_DUMP and the matching Python dict:
  - **Tables:** add `icons` (the full `ICONS`), `iconPalette`, `iconShadow`, `iconIds` (`icon_id` over `["ball", "nosuch"] + sorted(ICONS)`), `craftCols`, `craftBlurb` and `craftMsg`.
  - **`gridMove`:** the full matrix for n in 1..15, every i and every direction.
  - **`cleanFound`:** sorted lists for `[["twig","axe"], ["twig",3,null,"nosuch"], null, "twig", {}]`.
  - **`craftCells`:** for 5 states, mirroring the existing `craftRows` parity loop (test.py ~:6922 / JS ~:6322):
    - the 3 existing states, plus a fresh state (`found` = {balls, lantern}) and a state with `found = {"twig"}`;
    - set the **same explicit** `found` on the game object in each state, in both builds. `mt.Game()` never calls `note_found`.
    - add `found` to the JS dump's `keep` restore list (test.py ~:6310), so it doesn't leak into later dumps;
    - the JS `craftCells` must emit `recipe: null` for BUILD, never `undefined`.
  - **Round-trip:** pass every new Python value through `json.loads(json.dumps(...))`, as `python_shell` does (test.py ~:6833). The PARITY `diff` treats a tuple and a list as different: palette values, `ICON_SHADOW` and the `needs` entries are tuples.
  - Keep `craftRows` in PARITY until Chunk 4.
- [ ] **Step 12:** Run `node .claude/scripts/verify.js`. Expected: 8/8 PASS.

---

## Chunk 4: The CRAFT screen, input and animation, both builds (game-feel-engineer; the game-ui and juice-pass skills)

**Files:** all four game and test files. Do the Python first (Tasks 4.1-4.5), then the JS (4.6), then PARITY (4.7).
**Layout source:** spec §2.1 and `.superpowers/brainstorm/3717-1792747527/craft-screen.html`.

### Task 4.1: Pure helpers and constants (Python)
- [ ] **Step 1:** Constants:
  - Replace `CRAFT_ROW_H` and `CRAFT_ROWS` (~:4149) with:
    ```python
    CRAFT_GRID_X, CRAFT_GRID_Y = 18, 56   # grid origin, panel-relative
    CRAFT_SLOT, CRAFT_GAP = 48, 6         # cell size and spacing
    CRAFT_GRID_ROWS = 4                   # visible grid rows; more scroll
    CRAFT_FLY_T, CRAFT_POP_T, CRAFT_POP_SCALE = 0.30, 0.25, 1.35
    CRAFT_SPARKS, CRAFT_GLOW_T = 8, 0.2
    ```
    `CRAFT_COLS` already exists from Chunk 2.
  - Grep every use of `CRAFT_ROW_H` / `CRAFT_ROWS` in `.py` and `test.py`. Each use is either deleted or rewritten in Task 4.5.
- [ ] **Step 2:** Add a pure line breaker to the SHELL helpers, and make `Shell.wrap` use it:
  ```python
  def wrap_lines(s, max_w, measure, max_lines=None):
      """Greedy word wrap; past max_lines the last kept line ends in "..."."""
      lines, line = [], ""
      for word in str(s).split(" "):
          test = (line + " " + word).strip()
          if measure(test) > max_w and line:
              lines.append(line)
              line = word
          else:
              line = test
      if line:
          lines.append(line)
      if max_lines and len(lines) > max_lines:
          last = lines[max_lines - 1] + "..."
          while measure(last) > max_w and len(last) > 3:
              last = last[:-4] + "..."
          lines = lines[:max_lines - 1] + [last]
      return lines
  ```
  - `Shell.wrap(self, s, x, y, max_w, lh, font, color=INK, max_lines=None)` draws `wrap_lines(s, max_w, lambda t: font.size(t)[0], max_lines)` line by line.
  - Existing callers don't change.

### Task 4.2: Icon blitting (Python)
- [ ] **Step 3:** Add `Shell.icon_surf(self, iid, scale=1, mode="normal")`:
  - it caches in `self._icons[(iid, scale, mode)]`;
  - it builds a `pygame.Surface((16 * scale,) * 2, pygame.SRCALPHA)`, with one `fill(rect)` per opaque pixel;
  - **colour:** palette RGB in `normal`; `ICON_SHADOW` in `shadow`; in `grey`, luminance `l = (r*30 + g*59 + b*11) // 100`, then `(l + 2*200) // 3` for every channel, which is a faded grey with zero saturation.
  - Add `self._icons = {}` in `Shell.__init__`.

### Task 4.3: `CraftFx` (Python, next to `CaveFx`)
- [ ] **Step 4:** Write the class:
  ```python
  class CraftFx:
      """The craft animation: shell-only, never reads or writes engine state."""
      def __init__(self, sfx):
          self.sfx, self.t, self.recipe, self.before, self.sparks = sfx, None, None, {}, []

      def start(self, i, before):
          self.t, self.recipe, self.before = 0.0, i, dict(before)
          self.sparks = [] if REDUCED_MOTION else [
              (FX_RNG.uniform(0, 6.2832), FX_RNG.uniform(28, 36)) for _ in range(CRAFT_SPARKS)]
          # no sound here: craft_recipe plays "craft" itself (Step 7)

      def total(self):
          return CRAFT_GLOW_T if REDUCED_MOTION else CRAFT_FLY_T + CRAFT_POP_T

      def active(self):
          return self.t is not None

      def update(self, dt):
          if self.t is not None:
              self.t += dt
              if self.t >= self.total():
                  self.clear()

      def skip(self):
          self.clear()

      def clear(self):
          self.t, self.recipe, self.before, self.sparks = None, None, {}, []
  ```
- [ ] **Step 5:** Bind it in `Shell.__init__`:
  - `self.crfx = CraftFx(self.sfx.play)`;
  - `self.game.fx_craft = self.crfx.start`.
- [ ] **Step 6:** Put the per-frame part **inside `Shell.update_cave_fx(dt)`**:
  ```python
  if self.game.mode == "craft":
      self.crfx.update(dt)
  else:
      self.crfx.clear()
  ```
  - `run()` already calls that method, and tests drive it directly (test.py ~:3544). Code written inline in `run()` would be untestable.
- [ ] **Step 7:** Add a `craft` sound to the `Sfx` table: two rising notes, about 0.18 s in total, built through `_build` like `level`.
  - In `Game.craft_recipe`'s success path, replace `self.sfx("level")` with `self.sfx("craft")`, so one sound plays per craft, not two overlapping.
  - Add `"craft"` to the RENDER sound-buffer-length check (`grep -n "buffer" "claude's monsters.test.py"` in RENDER).

### Task 4.4: Input and `draw_craft` (Python)
- [ ] **Step 8:** Key handling and `move_cursor`.
  - **The skip:** KEYDOWN handling is written inline in `Shell.run()` (py ~:6889-6943), where tests can't reach it.
    - Move the per-key dispatch into a new `Shell.key(self, k)` that first calls `self.crfx.skip()` whenever `self.game.mode == "craft"`, then dispatches exactly as `run()` did.
    - `run()` calls `self.key(...)`, and so do the tests.
    - A key ends the animation and is then handled normally, so no key is ever dropped.
  - **`move_cursor`, CRAFT branch (~:3878):**
  ```python
  elif self.mode == "craft":
      d = ("left" if dx < 0 else "right") if dx else ("up" if dy < 0 else "down") if dy else None
      if d:
          j = grid_move(self.craft_cursor, d, len(craft_cells(self)), CRAFT_COLS)
          if j != self.craft_cursor:
              self.craft_cursor = j
              self.craft_msg = ""
              self.sfx("cursor")
  ```
- [ ] **Step 9:** `confirm`, CRAFT branch (~:3587):
  ```python
  if self.mode == "craft":
      c = craft_cells(self)[self.craft_cursor]
      if c["state"] == "hidden":
          self.sfx("cancel")
          self.craft_msg = CRAFT_MSG["hidden"]
      elif c["kind"] == "recipe":
          self.craft_recipe(c["recipe"])
      elif c["state"] == "ready":
          self.sfx("select")
          self.building = True
          self.mode = "overworld"
          self.show_toast("BUILDING: face bare ground and confirm.", 3.0)
      else:
          self.sfx("cancel")
          self.craft_msg = CRAFT_MSG["nowall"]
      return
  ```
  The X/cancel path already closes CRAFT; check that it does.
- [ ] **Step 10:** Rewrite `draw_craft` to spec §2.1. All offsets are from `CRAFT_RECT`'s `(x, y)`.
  - **Header:**
    - `CRAFT` in f22 at (x+20, y+14);
    - the tool chips: `icon_surf("pick"|"iron_pick", 1, "normal"|"grey")` plus a label (`PICK`, `IRON PICK` or `no PICK`), then the AXE chip (`AXE` or `no AXE`), starting at x+120 and baseline y+22 in f11;
    - `X back` right-aligned;
    - the rule at y+42.
    - The `STONE/ORE/WALL/BALLS` totals line goes.
  - **Grid:**
    - `cells = craft_cells(g)`, `n = len(cells)`;
    - `top = list_top(ceil(n / CRAFT_COLS), g.craft_cursor // CRAFT_COLS, CRAFT_GRID_ROWS)`;
    - cell k at `(x + CRAFT_GRID_X + col*(CRAFT_SLOT+CRAFT_GAP), y + CRAFT_GRID_Y + (row-top)*(CRAFT_SLOT+CRAFT_GAP))`;
    - a bevelled slot (fill (201,195,176), dark edge top-left (125,118,99), light edge bottom-right (255,251,233)), with the 2x icon centred.
    - **By state:**
      - `ready`: normal;
      - `locked`: grey;
      - `hidden`: shadow plus a white `?` in f15 with a 1 px black shadow;
      - `owned`: normal plus a green check (2 lines, (46,125,50)) in the top-right;
      - BUILD: the caption `BUILD` in f11 at the slot bottom;
      - selected: fill (233,223,184) and a 3 px yellow (255,204,51) outline.
    - Scroll cues at `x + CRAFT_GRID_X + CRAFT_COLS*(CRAFT_SLOT+CRAFT_GAP) - 2`, as in the BAG.
  - **Detail pane** (x+298..x+482), for `c = cells[g.craft_cursor]`:
    - a dashed divider at x+298, y+52..y+292;
    - the 60 px slot, centred at x+390, from y+52, holding the 3x result icon (`shadow` when hidden);
    - **pop:** while `crfx.active()` and `crfx.t >= CRAFT_FLY_T`, scale the icon by `1 + (CRAFT_POP_SCALE-1) * sin(pi * (t-CRAFT_FLY_T)/CRAFT_POP_T)`, centre fixed, then draw the sparks at `centre + (cos a, sin a) * r * p`, where p is the pop progress, as 3x3 (255,216,74) squares;
    - **reduced motion:** a (255,243,176) glow fill behind the slot instead;
    - the name in f15, centred at y+118;
    - the blurb through `self.wrap(..., max_w=168, lh=13, font=self.f11, max_lines=2)` at y+136;
    - **need rows** at y+170 + k*28 (k < 3): a 24 px slot with the 1x icon (`shadow` if hidden), the name in f13 at x+332 (`craft_label`; blank if hidden), and `have/n` right-aligned at x+478 (`?` if hidden), green (46,125,50) if have ≥ n, else red (192,57,43);
    - **while flying:** `have` comes from `crfx.before`, and a ghost 1x icon per need is drawn at `lerp(need_slot_centre, result_centre, ease_out(t/CRAFT_FLY_T))`, where `ease_out(u) = 1-(1-u)**2`;
    - **the button:** 124x22, centred at y+258. Its label is `Z: CRAFT`, `OWNED` or `Z: BUILD`. Its fill is green (76,175,80) when `ready`, else grey (176,176,176).
  - **Message:** `craft_msg` centred at y+h-34, as today.
- [ ] **Step 11:** Delete `craft_rows` and `CRAFT_TIER_NAME` if nothing reads them any more. Grep both files first. If `CRAFT_TIER_NAME` is still used, keep it.

### Task 4.5: RENDER and SANDBOX tests (Python)
- [ ] **Step 12:** Rewrite the CRAFT tests that used rows:
  - test.py ~:1369-1390, 1519 and 1705-1715: set `craft_cursor` to a cell index (the same recipe index; BUILD is `len(RECIPES)`), and turn the `craft_rows` asserts into `craft_cells` state asserts;
  - ~:3465-3475;
  - ~:4706-4721: "the CRAFT cursor wraps" becomes "the CRAFT cursor clamps", walking with `move_cursor`;
  - ~:5613-5670.
    - Those lines extend `RECIPES` with fake ids `x1`..`x4`, which would make `craft_cells` raise a KeyError on `CRAFT_BLURB`.
    - Monkeypatch `craft_cells` instead.
- [ ] **Step 13:** Add these RENDER checks:
  - **Z on cells** (spec §4 "Crafting through cells"):
    - Z on a hidden cell crafts nothing, sets `craft_msg == CRAFT_MSG["hidden"]`, and leaves the counts unchanged;
    - Z on BUILD with no WALLs stays in mode `craft` with `CRAFT_MSG["nowall"]`;
    - Z on BUILD with a WALL enters build mode.
  - **Icons:** for every id, `icon_surf(id, 1)` pixel (x, y) equals the palette colour, or is alpha 0 for `.`.
  - **A hidden cell:** in a fresh game with the cursor away from AXE, every pixel inside the AXE cell's 32 px icon box is `ICON_SHADOW`, the slot fill, or part of the white `?`.
  - **A locked cell:** fresh WALL; no pixel in its icon box has `max - min >= 24`.
  - **The outline:** the cursor cell's outline pixel is (255,204,51).
  - **Scrolling:** with `craft_cells` monkeypatched to 23 cells, the cues appear and `top` tracks the cursor.
    - Set `craft_cursor` directly to each index.
    - Restore the patch in `finally`.
  - **The animation:**
    - start a real AXE craft;
    - draw frames at t = 0, 0.15, 0.3, 0.5 (advance with `shell.crfx.update`);
    - every non-background change stays inside `CRAFT_RECT`;
    - `random.getstate()` is equal before and after;
    - `FX_RNG.getstate()` changes on a normal craft and stays the same under REDUCED_MOTION;
    - at t = 0.5 `crfx.active()` is False;
    - with `mt.REDUCED_MOTION = True` (restored in `finally`), `crfx.sparks == []` and the result icon is drawn at exactly 3x.
  - **Skipping:** `shell.key(<Z>)` during the fly. The animation ends, and the Z is handled (e.g. `craft_msg` becomes "You already have the AXE.").
  - **Leaving:** with mode set to overworld, one `shell.update_cave_fx(dt)` clears `crfx`.
- [ ] **Step 14:** Run `node .claude/scripts/verify.js --only py`. Expected: PASS. Dump frames with `MT_FRAME_DIR` set on the py suite alone (never on verify.js), and add a CRAFT frame plus a mid-pop frame to the frame dump list.

### Task 4.6: The JS port
- [ ] **Step 15:** Port Tasks 4.1-4.4 into the HTML:
  - the constants;
  - `wrapLines(s, maxW, measure, maxLines)`, ported from the **Python** `wrap_lines`, `.strip()` behaviour included (today's JS wrap differs on double spaces);
  - `wrapText(..., maxLines)` uses it with `t => ctx.measureText(t).width` and still returns `ly`;
  - reduced motion in JS is `G.settings.reducedMotion || REDUCED_MOTION`, never the `const` alone, so the in-game toggle works;
  - `craftHook` defaults to `CRFX.start`;
  - `craftRecipe` plays `craft` instead of `level` on success;
  - `iconCanvas(id, scale, mode)`, cached, drawn with `imageSmoothingEnabled = false`;
  - `CRFX` with `start`/`update`/`skip`/`clear`, its sparks from `fxRand` only;
  - `juiceCraft(i, before)` calls `CRFX.start`;
  - the `craft` sound;
  - the shell-frame update/clear;
  - the CRAFT input (`grep -n "G.craftCursor" "claude's monsters.html"`): `gridMove`, a skip on any key, and the confirm branch;
  - `drawCraft`.
  - Delete `craftRows`, `CRAFT_ROW_H` and `CRAFT_ROWS`, and their `__GAME__` exports.
  - Touch needs no new code: the D-pad sends the arrow keys, and A/B send Z/X.
- [ ] **Step 16:** Add a pure `craftView()` that returns:
  - `{top, cells: [{k, x, y, state, sel}], detail: {name, blurb, needs: [{id, name, have, n, ok}], button, enabled}}`.
  - `drawCraft` draws only from `craftView()`. Export it.
  - JS tests (SHELL JUICE section):
    - cell rects are inside `CRAFT_RECT` and don't overlap;
    - `sel` matches the cursor;
    - a hidden cell's detail has `name === '???'`, empty need names and `'?'` counts;
    - `fxRand` is used and `Math.random` never is: spy on it during a full `CRFX` run;
    - `CRFX` clears when the mode leaves craft;
    - a key during the fly skips it and is still handled;
    - with `G.settings.reducedMotion` on, a craft makes no sparks and plays only the glow;
    - Z on a hidden cell, and Z on BUILD with and without WALLs, as in Step 13;
    - a synthetic 23-cell `craftView` scrolls by rows.
  - Rewrite test.js ~:1111-1129, 1238, 1436-1445 and 2925-2933 as in Step 12.

### Task 4.7: PARITY
- [ ] **Step 17:**
  - Remove `CRAFT_ROW_H` and `CRAFT_ROWS` from both `SHELL_KEYS` lists.
  - Add `CRAFT_GRID_X`, `CRAFT_GRID_Y`, `CRAFT_SLOT`, `CRAFT_GAP`, `CRAFT_COLS`, `CRAFT_GRID_ROWS`, `CRAFT_FLY_T`, `CRAFT_POP_T`, `CRAFT_POP_SCALE`, `CRAFT_SPARKS` and `CRAFT_GLOW_T`.
  - Remove `craftRows` from PARITY.
  - Add `wrapLines` over 4 fixed strings, with `measure = len*7`, `max_w` 70 and `max_lines` None/1/2. Include one string that triggers the "..." cut.
  - Export every new `CRAFT_*` constant, `wrapLines` and `craftView` through `__GAME__`. The JS side of PARITY reads `g[k]`.
- [ ] **Step 18:** Run `node .claude/scripts/verify.js`. Expected: 8/8 PASS. Check the CR count.

---

## Chunk 5: Icons in the BAG, battle BAG and shop, both builds (game-feel-engineer)

**Files:** all four game and test files.
- [ ] **Step 1 (Python):**
  - In `draw_bag`, `draw_shop` and the battle BAG list (`grep -n "BBAG_ROW_H" "claude's monsters.py"`), each `item`/`mat`/`loot` row and each shop BUY/SELL row blits `icon_surf(icon_id(id), 1)`, vertically centred, at the old name x. The name moves right by 22 px.
  - Don't touch `head`/`none` rows or the SHOP/LEAVE and BUY/SELL/BACK menus.
  - Each of the three `COINS %d` lines gets the `coins` icon at 1x to its left, and the text moves right by 20 px.
  - Row heights, row counts and rects stay the same.
  - In the battle BAG, check that the name plus count still ends left of `BBAG_SPLIT_X`. If not, shorten the gap to 18 and say so.
- [ ] **Step 2 (Python RENDER):**
  - for one row of each kind in each of the three lists, the icon's bounding box lies inside the row rect;
  - the name text starts at or after the icon's right edge plus 4 px;
  - the BAG COINS icon lies inside `BAG_RECT`.
- [ ] **Step 3 (JS):** port the same with `iconCanvas`. Extend the existing headless BAG/shop view tests (`grep -n "section('SHELL BAG/SHOP"`) with icon x positions if those views are pure helpers; otherwise add the x offsets to the helper they use.
- [ ] **Step 4:** Run `node .claude/scripts/verify.js`. Expected: 8/8 PASS.

---

## Chunk 6: Gates (PM)
- [ ] **Step 1:** Run `node .claude/scripts/verify.js`. Expected: 8/8 PASS, with real counts recorded.
- [ ] **Step 2:** Run game-reviewer on the whole change (brief: the spec, this plan, the changed files). Max 2 rounds.
- [ ] **Step 3:** Run the playtester, `game: monster-trail`, `mode: duty`. Never grant the camera. Duties:
  - **MT-07:** the CRAFT grid; reveal by picking up a TWIG; the craft animation; BUILD.
  - **MT-10:** phone portrait and landscape; the D-pad moves the grid; A crafts; B closes.
  - **MT-11:** reduced motion: the glow, with no fly and no pop.
  - **BAG and shop:** icons on desktop and phone.
- [ ] **Step 4:** Show the user the Chunk 1 contact sheet and two CRAFT screenshots.
- [ ] **Step 5:** Close the learning loop:
  - reflect-and-learn, if anything went red→green or a review wasn't a first-round PASS;
  - capture-knowledge (the "pixel-icon table emitted across builds" pattern).
- [ ] **Step 6:** Update PROGRESS. Then run Part B Chunk 5 (`docs/superpowers/plans/2026-10-23-axe-glades-loot-crafting.md`), whose docs now describe the grid screen. Also update:
  - **`CLAUDE.md`:**
    - `ICON_PALETTE`/`ICON_SHADOW`/`ICONS` in the emitted-tables list (:96);
    - `Game.found`;
    - the `fx_craft` hook.
  - **The `emit_tables.py` docstring** (lines 3-6).
  - **`.claude/skills/add-monster/SKILL.md`.**
  - **`docs/playtests/monster-trail.md`:** the MT-07 row describes the old CRAFT list.
  - **`docs/wiki/monster-trail.md`:** already stale ("Part B not designed yet").
  - Then run wiki-sync.

## Risks
| Risk | Guard |
|---|---|
| Save format (`found`) | old-save, junk and new-game cases in both suites; PARITY on `clean_found` |
| `update` wrapper changes control flow | `try/finally` only adds a call; the full suites drive `update` thousands of times |
| Icons drift | emitted tables plus PARITY on the full table |
| The animation touches engine rng | RENDER `random.getstate()` check; the JS `Math.random` spy |
| Keys dropped during the animation | skip-then-handle, tested in both builds |
| 640x480 overlap | RENDER rect checks; the playtest at phone sizes |
| CRLF lost | Edit tool only; CR count after every chunk |
| HTML clobbered by game-c9 | Chunks 3-5 gated on its release |

## Plan review log (plan-with-review, 2026-10-24)
| # | Persona | Severity | Finding | Resolution |
|---|---|---|---|---|
| 1 | Risk | RISK | JS `fmtMsg` leaves `%%` in the OIL blurb | Fixed: Task 3.2 Step 4 |
| 2 | Risk | RISK | PARITY tuple-vs-list, and `recipe: null` | Fixed: Task 3.4 |
| 3 | Risk + Gap | RISK/GAP | skip and clear inline in `Shell.run()` are untestable | Fixed: `Shell.key`, clear in `update_cave_fx` (4.3 Step 6, 4.4 Step 8) |
| 4 | Risk | RISK | `found` leaks across the JS dump states | Fixed: Task 3.4 |
| 5 | Risk | MINOR | add an FX_RNG state assertion | Fixed: Step 13 |
| 6 | Risk | MINOR | sparks cross the header rule | Fixed: radius 28-36 |
| 7 | Risk | MINOR | emit anchors | No change needed (verified safe) |
| 8 | Risk | MINOR | the update wrapper, campaign.js | No change needed (verified safe) |
| 9 | Risk + Gap | MINOR | the JS `gladeMasked` fallback is in the body; test.py:1812 | Fixed: Chunk 2 Step 9, Chunk 3 Step 8 |
| 10 | Risk | MINOR | `level` + `craft` sounds overlap | Fixed: `craft` replaces `level` (4.3 Step 7, 4.6) |
| 11 | Risk | MINOR | the scroll test can't walk past 9 | Fixed: `len(craft_cells)`, set cursor directly |
| 12 | Gap | GAP | no JS seam to stub `juiceCraft` | Fixed: `craftHook` + `setCraftHook` (3.2 Step 7) |
| 13 | Gap | GAP | JS reduced motion ignores the in-game toggle | Fixed: Task 4.6 |
| 14 | Gap | GAP | tests for Z on hidden / locked BUILD, and the JS 23-cell scroll, missing | Fixed: Steps 13 and 16 |
| 15 | Gap | MINOR | `__GAME__` exports for the new constants | Fixed: Step 17 |
| 16 | Gap | MINOR | test.py:5641 fake RECIPES would KeyError | Fixed: Step 12 |
| 17 | Gap | MINOR | wrap port differences; keep the `ly` return | Fixed: Task 4.6 |
| 18 | Gap | MINOR | the JS reset is inline in the title confirm | Fixed: Chunk 3 Step 5 |
| 19 | Gap | MINOR | stale docs list | Fixed: Chunk 6 Step 6 |
| 20 | Gap | MINOR | fresh OIL is locked by the lamp cap, not by missing ORE | No change: the state matches the spec, only the reason differs |
