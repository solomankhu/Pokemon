# The AXE, Secret Glades and Crafting from Loot (Part B): Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking. In this repo the PM runs it through the `game-pm` skill: workers per chunk, then `verify.js`, then game-reviewer.

**Goal:** Farm DEEPWOOD loot, craft an AXE, and cut one marked THICK TREE into each of two sealed glades (MOSS HOLLOW, OLD GROVE). Craft POTION, GREAT BALL and SMOKE from loot. Both builds behave identically, as PARITY proves.

**Spec:** `docs/superpowers/specs/2026-10-23-axe-glades-loot-crafting-design.md`. It is the contract; this plan says how and in what order. If they disagree, the spec wins. Stop and ask the PM.

**Architecture:**
- This extends the sandbox and adds no new system.
- The authored `T` block carries `tool="axe"`, and `can_mine` compares a block's tool against `flags["pick"]` or `flags["axe"]`.
- Cuts live in the existing `Game.edits` overlay. `load_edits` already accepts them, because `T` is `authored_only`.
- Recipes gain loot needs and `sets_tool`, and the craft "have" dict merges `Game.bag`.
- `GEODE` joins `GATED_REGIONS`, and the gated-reachability rule is generalised over that list.
- The glades are drawn sealed (as trees) until their tree is cut, the same way the GEODE is drawn as rock.

**Tech stack:** Python 3.13 + pygame 2.6.1 (`.venv/Scripts/python.exe`), plain JS in one HTML file, and node test suites.

**Every chunk ends GREEN.** game-reviewer's Step 0 runs `verify.js`, and red means `PRECONDITION_FAILED`. So each chunk ships its Python change, the emit, the JS port and the PARITY additions together. Inside a chunk the workers run **in sequence**: Python owner → game-chore (emit + JS + PARITY) → full `verify.js` → reviewer. Chunks never overlap.

**No git.** "Commit" means: before each chunk, copy the files it touches into `.superpowers/sdd/2026-10-23-axe-glades/chunk-N/`. After it, the full `verify.js` is green.

**Traps (every chunk):**
- `claude's monsters.py` is **CRLF**. Tests and HTML are LF. Use the Edit tool; never use a scripted rewrite that flips line endings.
- Filenames contain a space and an apostrophe, so quote them.
- Never pipe a suite through `tail`/`head`. Use `node .claude/scripts/verify.js [--only ...]`.
- Keep `claude's monsters.py` **pure ASCII**. Today it has 0 non-ASCII bytes, and the checklist flags any.
- No `random`/`Math.random` in new engine code. Loot has its own `mulberry32` seed.
- **Test block placement:** all new SANDBOX tests go **before** `test.py:1587` (`os.remove(mt.SAVE_PATH)`). The existing save cleanup and the `mt.MAP == MAP_BEFORE` guard at :1588 then cover them. Never place them after :1588, which starts the CAVE section at :1591.

## File map
| File | Chunks |
|---|---|
| `docs/handoffs/PROGRESS.md`, `docs/wiki/harness.md`, `docs/wiki/story.md` | 0 |
| `claude's monsters.py` | 1 (shell CRAFT), 2 (engine), 3 (map), 4 (shell T + mask) |
| `claude's monsters.test.py` | 1, 2, 3, 4 |
| `.claude/skills/add-monster/emit_tables.py` | 2 (`tool`, `setsTool`), 3 (re-emit MAP/ZONES) |
| `claude's monsters.html` | 1, 2, 3, 4 |
| `claude's monsters.test.js` | 1, 2, 3, 4 |
| `docs/playtests/monster-trail.md`, `CLAUDE.md`, `docs/wiki/*.md`, `.claude/skills/game-review-checklist/SKILL.md`, `.claude/skills/add-monster/SKILL.md` | 5 |

---

## Chunk 0: Housekeeping (PM, FAST lane)

### Task 0.1: PROGRESS
**Files:** `docs/handoffs/PROGRESS.md`.
- [ ] **Step 1:** Replace the `## Next` bullets with: `- Part B (AXE, glades, crafting from loot): spec docs/superpowers/specs/2026-10-23-axe-glades-loot-crafting-design.md, plan docs/superpowers/plans/2026-10-23-axe-glades-loot-crafting.md. Next: Chunk 1.`
- [ ] **Step 2:** Add to `## Recently done`: `- 2026-10-18: battle conditions (Chunks 1-5) and loot/shop Part A (Chunks 1-5) shipped; release-readiness pass. See docs/handoffs/2026-10-18-resume.md.`

### Task 0.2: The two STALE wiki pages
**Files:** `docs/wiki/harness.md`, `docs/wiki/story.md`.
- [ ] **Step 1:** Run `node .claude/scripts/wiki-sync.js`.
- [ ] **Step 2:** Run the `wiki-sync` skill: fix `harness.md` against `.claude/skills/`, and `story.md` against Part A's CENTRE/shop text in `claude's monsters.py`. Change only facts that drifted.
- [ ] **Step 3:** Run `node .claude/scripts/wiki-sync.js` again. Expected: no STALE.
- [ ] **Step 4:** Run `node .claude/scripts/verify.js --auto`. Expected: PASS.

---

## Chunk 1: Scrolling CRAFT list, both builds (game-feel-engineer; the game-ui skill)

This comes first so the list can grow from 7 rows to 11 in Chunk 2 without any RENDER test going red.

### Task 1.1: The pure window, and the RENDER tests rewritten to be count-independent
**Files:**
- `claude's monsters.py`: `CRAFT_RECT`/`CRAFT_ROW_H` at :4042-4043, plus a new `CRAFT_ROWS`; `draw_craft` at :5752-5781.
- `claude's monsters.test.py`: :3218-3224 and :5366-5370.
- `claude's monsters.html`: the CRAFT constants and its craft drawing; find them with `grep -n "CRAFT_ROW_H" "claude's monsters.html"`.
- `claude's monsters.test.js`: :2694-2697.

- [ ] **Step 1: Failing tests (Python).** Replace test.py:3221-3224, keeping the `fits` line after it:
  ```python
      x, y, w, h = mt.CRAFT_RECT
      vis_bottom = y + 92 + (mt.CRAFT_ROWS - 1) * mt.CRAFT_ROW_H - 6 + mt.CRAFT_ROW_H - 2
      ok(vis_bottom <= y + h - 34, "the %d visible CRAFT rows end above the message line (%d <= %d)"
         % (mt.CRAFT_ROWS, vis_bottom, y + h - 34))
      for n in range(1, 16):
          for cur in range(n):
              top = mt.list_top(n, cur, mt.CRAFT_ROWS)
              ok(top <= cur < top + mt.CRAFT_ROWS and 0 <= top <= max(0, n - mt.CRAFT_ROWS),
                 "CRAFT window keeps cursor %d of %d visible" % (cur, n))
  ```
  Replace test.py:5366-5370 the same way: assert only the visible window, using `mt.CRAFT_ROWS`. Then add a RENDER check:
  - draw CRAFT at **every** cursor position `range(len(mt.RECIPES) + 2)`, and assert that the HUD and the toast strip snapshot (`hud_bytes()`/`snap(toast_r)`, the existing helpers at :3226) are unchanged after each one;
  - temporarily extend `mt.RECIPES` with 4 copies of the `wall` recipe (with ids `x1`..`x4`) inside `try/finally`, and draw at every cursor again. That proves the list scrolls and still never touches the HUD or the toast. Restore `mt.RECIPES` in `finally`.
- [ ] **Step 2:** Run `.venv/Scripts/python.exe "claude's monsters.test.py"`. Expected: FAIL (`CRAFT_ROWS` missing).
- [ ] **Step 3: Implement (Python).**
  - Add `CRAFT_ROWS = 7     # visible CRAFT rows; the list scrolls past them (list_top)` next to `CRAFT_ROW_H`, and update the `CRAFT_ROW_H` comment.
  - In `draw_craft`: `top = list_top(len(rows), g.craft_cursor, CRAFT_ROWS)`, and draw `rows[top:top + CRAFT_ROWS]` at `ry = y + 92 + (i - top) * CRAFT_ROW_H`.
  - Scroll cues go in exactly as `draw_bag` does them (py:5825-5827): `self.scroll_cue(x + w - 24, y + 92 + 4, True)` when `top > 0`, and the matching down cue at the last visible row when `top + CRAFT_ROWS < len(rows)`. Check that the cue's x position clears the right-aligned detail text, and move the detail left by 14 px if it doesn't.
  - Remove the old comment "so 5 recipes + BUILD + BACK fit".
- [ ] **Step 4:** Run the suite. Expected: PASS.
- [ ] **Step 5: JS.** Mirror it: `CRAFT_ROWS = 7`, the windowed draw with `listTop`, and scroll cues. Find the JS list helper with `grep -n "function listTop\|scrollCue" "claude's monsters.html"`. Replace test.js:2697 with the count-independent window check plus the cursor-visibility loop, using `g.listTop`; export whatever is missing through `__GAME__`.
  - Add `CRAFT_ROWS` to PARITY's shell-constants list. grep test.py for `CRAFT_ROW_H` in the PARITY section and add `CRAFT_ROWS` beside it.
  - Touch: HTML input is D-pad only (no tap-to-row), so no input mapping changes. Confirm this with `grep -n "craftCursor" "claude's monsters.html"`.
- [ ] **Step 6:** Run `node .claude/scripts/verify.js`. Expected: all 8 checks PASS.
- [ ] **Step 7: Gate.** game-reviewer. The playtester can wait until Chunk 4, because the list doesn't scroll until Chunk 2 adds recipes.

---

## Chunk 2: Engine: the AXE, the `T` block and loot recipes, in both builds (sandbox-designer writes the Python, then game-chore does emit + JS + PARITY)

Back up first. Save a "before" balance report: `.venv/Scripts/python.exe .claude/skills/balance-report/balance_report.py > .superpowers/sdd/2026-10-23-axe-glades/balance-before.txt`.

New Python tests go into the SANDBOX section under `# --- Part B: the AXE and loot recipes ---`, **before test.py:1587**. Helpers: `ok`, `mt`, `ORE_TILES` (SANDBOX), `SEAMS` (MAP section), `ALL_TRAINERS`.

### Task 2.1: Block table, `SOLID`, `axe_tier`
**Files:** py `:484` (`SOLID`), `:587-600` (`SEAM`/`BLOCKS`/`MATERIAL_LABEL`), `:611` (after `PICK_MAX`), `:1014` (after `pick_tier`). Test: py test `:139` (legend), `:1034-1037` (block assertions).

- [ ] **Step 1: Tests.**
  - At test.py:139, add `T` to the legend set: `set("#.,;_~=sfBCcHDGSovKT")`. Nothing in MAP uses it yet, which is fine.
  - Replace test.py:1034-1037 with:
  ```python
  ok(mt.WALL in mt.SOLID and "#" in mt.SOLID and mt.SEAM in mt.SOLID and mt.TREE in mt.SOLID,
     "walls, boulders, seams and thick trees are solid")
  ok(set(mt.BLOCKS) == {"#", mt.WALL, mt.SEAM, mt.TREE}, "only boulders, walls, the seam and thick trees can be broken")
  ok(mt.BLOCKS["#"]["tier"] == 1 and mt.BLOCKS[mt.WALL]["tier"] == 1 and mt.BLOCKS[mt.SEAM]["tier"] == 2
     and mt.BLOCKS[mt.TREE]["tier"] == 1, "boulders and walls need PICK 1, the seam PICK 2, a thick tree AXE 1")
  ok(all(mt.BLOCKS[k].get("tool") == "pick" for k in ("#", mt.WALL, mt.SEAM))
     and mt.BLOCKS[mt.TREE]["tool"] == "axe", "every block names its tool")
  ok({k for k, b in mt.BLOCKS.items() if b.get("authored_only")} == {mt.SEAM, mt.TREE},
     "only the seam and the thick tree are authored_only")
  ok(mt.BLOCKS[mt.TREE]["drops"] == {} and mt.BLOCKS[mt.TREE]["leaves"] == ".", "a thick tree drops nothing and leaves ground")
  ```
  Delete the old "only the seam is authored_only" line. In the Part B block:
  ```python
  ok(mt.AXE_MAX == 1, "the AXE has one tier")
  for v, want in ((None, 0), (0, 0), (1, 1), (True, 1), (False, 0), (2, 1), (-3, 0), ("1", 0), (1.0, 0), ([], 0)):
      ok(mt.axe_tier(v) == want, "axe_tier(%r) == %d" % (v, want))
  ok(mt.MATERIAL_LABEL["axe"] == "AXE", "the AXE has a label")
  ```
- [ ] **Step 2:** Run the suite. Expected: FAIL (`TREE`).
- [ ] **Step 3: Implement.**
  - `SOLID = set("#B~CHDGSoWKT")`.
  - `TREE = "T"  # a thick tree; authored in MAP, AXE only`, beside `SEAM`.
  - Every existing `BLOCKS` entry gets `tool="pick"`, and add:
  ```python
      "T": dict(name="THICK TREE", drops={}, ore_one_in=0, leaves=".", tier=1, tool="axe",
                authored_only=True),
  ```
  - `MATERIAL_LABEL["axe"] = "AXE"`, and `AXE_MAX = 1  # flags["axe"]: 0 none, 1 AXE`.
  - Add:
  ```python
  def axe_tier(v):
      """flags["axe"] as 0..AXE_MAX.  Missing or junk means no AXE."""
      if v is True:
          return 1
      if isinstance(v, bool) or not isinstance(v, int):
          return 0
      return clamp(v, 0, AXE_MAX)
  ```
- [ ] **Step 4:** Run the suite. Expected: PASS, except PARITY on `BLOCKS`/`SOLID`, which is fixed in Task 2.6. Don't run the reviewer until then.

### Task 2.2: `can_mine` by tool
**Files:** py `:1024-1033`.
- [ ] **Step 1: Tests (Part B block).** `MAP` is a mutable list read uncached by `tile_at` (py:369, :989), so a temporary row swap is safe. Always restore it in `finally`.
  ```python
  bx, by = ORE_TILES[0]
  sx, sy = SEAMS[0]
  for tier in range(3):
      for axe in range(2):
          ok(mt.can_mine("#", bx, by, tier, axe) == (tier >= 1), "boulder: pick %d axe %d" % (tier, axe))
          ok(mt.can_mine(mt.SEAM, sx, sy, tier, axe) == (tier >= 2), "seam: pick %d axe %d" % (tier, axe))
  _row = mt.MAP[85]
  mt.MAP[85] = _row[:20] + "T" + _row[21:]          # (20, 85): a fake authored tree, outside ROCKY PASS
  try:
      for tier in range(3):
          ok(not mt.can_mine("T", 20, 85, tier, 0), "no PICK tier cuts a thick tree (%d)" % tier)
      ok(mt.can_mine("T", 20, 85, 0, 1), "the AXE cuts an authored thick tree")
      ok(not mt.can_mine("T", 21, 85, 2, 1), "the AXE cannot cut a T that MAP does not hold there")
      ok(not mt.can_mine("#", bx, by, 0, 1), "the AXE cannot break a boulder")
  finally:
      mt.MAP[85] = _row
  ok(mt.can_mine("#", bx, by, 1) and not mt.can_mine("T", 20, 85, 2), "old 4-argument calls still work")
  ```
- [ ] **Step 2:** FAIL.
- [ ] **Step 3: Implement.**
  ```python
  def can_mine(tile, x, y, tier, axe=0):
      """The player's tools can break tile at (x, y).  A block's tool picks
      which level counts: the PICK tier, or the AXE.  Ordinary blocks break
      only inside ROCKY PASS; an authored_only block (seam, thick tree) breaks
      only where MAP itself carries that glyph, so it can never spread."""
      b = BLOCKS.get(tile)
      if not b:
          return False
      have = axe_tier(axe) if b.get("tool", "pick") == "axe" else pick_tier(tier)
      if have < b["tier"]:
          return False
      if b.get("authored_only"):
          return tile_at(x, y) == tile
      return in_sandbox(x, y)
  ```
  The 4-argument callers (`ore_deposits` py:1041, `ore_spots` py:5168) stay valid.
- [ ] **Step 4:** PASS, apart from PARITY.

### Task 2.3: `craft` with `sets_tool`, loot needs, `craft_label`
**Files:** py `:600-610` (`RECIPES`), `:1070-1088` (`craft`). Test: test.py `:1041-1047` (the recipe sanity loop).
- [ ] **Step 1: Tests.** Replace the loop at test.py:1041-1047:
  ```python
  for r in mt.RECIPES:
      ok(r["out"] in mt.MATERIALS or r["out"] == "balls" or r.get("sets_tier") or r.get("sets_tool")
         or r["out"] in mt.GOODS or (r["out"] in ("lantern", "pulse") and "cap" in r),
         "recipe %s makes a known thing" % r["id"])
      ok(mt.craft_label(r["out"]), "recipe %s has a label" % r["id"])
      ok(r["count"] > 0 and all((k in mt.MATERIALS or mt.GOODS.get(k, {}).get("kind") == "loot") and n > 0
                                for k, n in r["needs"].items()), "recipe %s needs known materials or loot" % r["id"])
  ```
  Part B block:
  ```python
  AXE_R = next(r for r in mt.RECIPES if r.get("sets_tool"))
  ok(AXE_R["id"] == "axe" and AXE_R["needs"] == {"twig": 2, "flint": 1} and tuple(AXE_R["sets_tool"]) == ("axe", 1),
     "the AXE is 2 TWIG + 1 FLINT and sets the axe to 1")
  ok([r["id"] for r in mt.RECIPES] == ["wall", "ball", "iron_pick", "oil", "pulse", "axe", "potion", "greatball", "smoke"],
     "recipe order: the first five unchanged, then Part B's four")
  have = {"twig": 2, "flint": 1, "stone": 0}
  ok(mt.craft(have, AXE_R, 0, 0) == {"twig": 0, "flint": 0, "stone": 0}, "the AXE spends exactly its needs and stores nothing")
  ok(mt.craft(have, AXE_R, 0, 1) is None, "the AXE is refused once owned")
  ok(mt.craft({"twig": 1, "flint": 1}, AXE_R, 0, 0) is None, "the AXE is refused when short")
  for rid, needs in (("potion", {"leaf": 2, "dewdrop": 1}), ("greatball", {"flint": 2, "copperwire": 1}),
                     ("smoke", {"emberdust": 1, "shadowsilk": 1})):
      r = next(x for x in mt.RECIPES if x["id"] == rid)
      ok(r["needs"] == needs and r["out"] == rid and r["count"] == 1, "recipe %s is %r" % (rid, needs))
      h = dict(needs, potion=3)
      after = mt.craft(h, r)
      ok(after is not None and all(after[k] == 0 for k in needs) and after.get(rid, 0) == h.get(rid, 0) + 1,
         "crafting %s conserves items exactly" % rid)
      ok(sum(mt.GOODS[k]["price"] * n for k, n in needs.items()) < mt.GOODS[rid]["price"],
         "economy: %s's loot sells for less than the shop charges" % rid)
  ```
- [ ] **Step 2:** FAIL.
- [ ] **Step 3: Implement.** Append to `RECIPES`:
  ```python
      # sets_tool: like sets_tier, a tool the caller records in flags (here flags["axe"]).
      dict(id="axe", out="axe", count=1, needs={"twig": 2, "flint": 1}, sets_tool=("axe", 1)),
      # Loot recipes: needs are Game.bag ids, and the output lands in the bag.
      dict(id="potion", out="potion", count=1, needs={"leaf": 2, "dewdrop": 1}),
      dict(id="greatball", out="greatball", count=1, needs={"flint": 2, "copperwire": 1}),
      dict(id="smoke", out="smoke", count=1, needs={"emberdust": 1, "shadowsilk": 1}),
  ```
  `craft`:
  ```python
  def craft(materials, recipe, tier=0, axe=0):
      """A new have-dict with the recipe applied, or None if short.
      Exactly the needs come out and exactly count goes in; nothing else moves.
      A tool recipe (sets_tier: the PICK, sets_tool: the AXE) puts nothing in -
      the caller records the tool - and is refused once the tool is that good."""
      if recipe.get("sets_tier") and pick_tier(tier) >= recipe["sets_tier"]:
          return None
      if recipe.get("sets_tool") and axe_tier(axe) >= recipe["sets_tool"][1]:
          return None
      if "cap" in recipe and materials.get(recipe["out"], 0) >= recipe["cap"]:
          return None                  # already full: never spend for nothing
      if any(materials.get(k, 0) < n for k, n in recipe["needs"].items()):
          return None
      out = dict(materials)
      for k, n in recipe["needs"].items():
          out[k] -= n
      if not (recipe.get("sets_tier") or recipe.get("sets_tool")):
          out[recipe["out"]] = out.get(recipe["out"], 0) + recipe["count"]
          if "cap" in recipe:
              out[recipe["out"]] = min(recipe["cap"], out[recipe["out"]])
      return out


  def craft_label(k):
      """The display name of a recipe need or output: a material/tool label or a GOODS name."""
      return MATERIAL_LABEL.get(k) or GOODS[k]["name"]
  ```
  `GOODS` is defined at module level after `RECIPES`. That's fine, because the call happens at runtime.
- [ ] **Step 4:** PASS, apart from PARITY.

### Task 2.4: The bag-merged have-dict (`craft_have`, `craft_rows`, `Game.craft_recipe`)
**Files:** py `:1670-1692` (`craft_rows`), `:3010-3042` (`craft_recipe`).
- [ ] **Step 1: Tests (Part B block).** `bag_add`/`clean_bag` drop zero counts (py:1301, :1371), so the expected dicts have no zero keys.
  ```python
  ok(not (set(mt.MATERIALS) | {"balls", "lantern", "pulse"}) & set(mt.GOODS),
     "material and counter ids never collide with BAG ids")
  g = mt.Game(); g.new_game()
  g.bag = {"twig": 2, "flint": 3, "leaf": 2, "dewdrop": 1}
  axe_i = [r["id"] for r in mt.RECIPES].index("axe")
  pot_i = [r["id"] for r in mt.RECIPES].index("potion")
  ok(g.craft_recipe(axe_i) and g.flags["axe"] == 1 and g.bag == {"flint": 2, "leaf": 2, "dewdrop": 1},
     "crafting the AXE spends TWIG/FLINT from the BAG and sets flags['axe']: %r" % g.bag)
  ok(g.craft_msg == "Crafted the AXE. Thin trees give way now.", "AXE message: %r" % g.craft_msg)
  before = dict(g.bag)
  ok(not g.craft_recipe(axe_i) and g.craft_msg == "You already have the AXE." and g.bag == before,
     "a second AXE is refused and spends nothing")
  ok(g.craft_recipe(pot_i) and g.bag == {"flint": 2, "potion": 1} and g.craft_msg == "Crafted 1 POTION.",
     "a POTION crafts into the BAG: %r %r" % (g.bag, g.craft_msg))
  g.bag = {"leaf": 2, "dewdrop": 1, "potion": mt.BAG_MAX}
  ok(not mt.craft_rows(g)[pot_i][2], "a full POTION stack shows the row as not craftable")
  ok(not g.craft_recipe(pot_i) and g.craft_msg == "Your BAG is full of POTION."
     and g.bag == {"leaf": 2, "dewdrop": 1, "potion": mt.BAG_MAX}, "a full BAG refuses and spends nothing")
  g.bag = {}
  ok(not g.craft_recipe(pot_i) and g.craft_msg == "Need 2 LEAF, 1 DEW DROP.", "short: %r" % g.craft_msg)
  rows = mt.craft_rows(g)
  ok(len(rows) == len(mt.RECIPES) + 2, "one CRAFT row per recipe plus BUILD and BACK")
  ok(rows[axe_i] == ("AXE", "owned - it cuts thin trees", False), "owned AXE row: %r" % (rows[axe_i],))
  g.flags["axe"] = 0; g.bag = {"twig": 2, "flint": 1}
  ok(mt.craft_rows(g)[axe_i] == ("AXE", "from 2 TWIG, 1 FLINT - cuts thin trees", True), "craftable AXE row")
  ok(mt.craft_rows(g)[pot_i] == ("1 POTION", "from 2 LEAF, 1 DEW DROP", False), "loot row uses GOODS names")
  ```
- [ ] **Step 2:** FAIL.
- [ ] **Step 3: Implement.**
  ```python
  def craft_have(g):
      """Everything a recipe can spend or fill, as one dict: materials, the
      BALL/lamp/PULSE counters and the BAG (ids never collide; tested)."""
      return dict(g.materials, balls=g.balls, lantern=g.lantern, pulse=g.pulses, **g.bag)


  def bag_room(g, r):
      """False when a recipe's GOODS output would overflow its BAG stack."""
      return r["out"] not in GOODS or g.bag.get(r["out"], 0) + r["count"] <= BAG_MAX
  ```
  - **`craft_rows`:** set `have = craft_have(g)` and `axe = axe_tier(g.flags.get("axe"))`, and compute `can = craft(have, r, tier, axe) is not None and bag_room(g, r)`. `need` uses `craft_label(k)`. Add a `sets_tool` branch before the generic one:
  ```python
          elif r.get("sets_tool"):
              owned = axe >= r["sets_tool"][1]
              rows.append((craft_label(r["out"]),
                           "owned - it cuts thin trees" if owned else "from " + need + " - cuts thin trees",
                           not owned and can))
  ```
    The generic label becomes `"%d %s" % (r["count"], craft_label(r["out"]))`.
  - **`Game.craft_recipe`:**
    - after the `sets_tier` refusal, refuse with `"You already have the %s." % craft_label(r["out"])` when `r.get("sets_tool")` and the axe is already owned;
    - refuse with `"Your BAG is full of %s." % craft_label(r["out"])` when `not bag_room(self, r)`;
    - build `have = craft_have(self)` and call `craft(have, r, tier, axe_tier(self.flags.get("axe")))`;
    - "Need ..." uses `craft_label`;
    - routing after a successful craft:
  ```python
          self.balls = after.pop("balls")
          self.lantern = after.pop("lantern")
          self.pulses = after.pop("pulse")
          self.materials = {k: after.pop(k) for k in list(self.materials)}
          self.bag = {k: v for k, v in after.items() if v > 0}
  ```
    - messages: `sets_tool` sets `self.flags[r["sets_tool"][0]] = r["sets_tool"][1]` and says `"Crafted the %s. Thin trees give way now." % craft_label(r["out"])`. `sets_tier` keeps its seam text, and the generic message uses `craft_label`.
  - **CRAFT header** (`draw_craft`, py:5759-5761): after the PICK tier text, add `"AXE: %s" % ("YES" if axe_tier(g.flags.get("axe")) else "NO")`, placed right after it with the same font and colour rule. RENDER's existing "row fits" check must still pass. Mirror the header in JS in Task 2.6.
- [ ] **Step 4:** PASS, apart from PARITY.

### Task 2.5: Interact, mine and the save normaliser
**Files:** py `:2963-2973` (`interact`), `:2995-3007` (`mine`), `:2032` and `:3260` (new-game flags), `:3194` (load).
- [ ] **Step 1: Tests (Part B block).** The game stores the toast as `g.toast`; grep test.py for `\.toast` and copy that read.
  ```python
  g = mt.Game(); g.new_game(); g.flags["starter"] = True
  _row = mt.MAP[85]; mt.MAP[85] = _row[:20] + "T" + _row[21:]
  try:
      g.player.tx, g.player.ty, g.player.dir = 20, 84, "down"
      g.interact()
      ok(g.mode == "dialogue" and g.dialogue["lines"] == ["This tree is thinner than the rest. An AXE could cut it."]
         and g.edits == {}, "no AXE: the tree says what it needs, and nothing is cut")
      g.dialogue, g.mode = None, "overworld"
      g.flags["pick"] = 2
      g.interact(); g.dialogue, g.mode = None, "overworld"
      ok(g.edits == {}, "an IRON PICK does not cut a tree")
      g.flags["axe"] = 1
      g.interact()
      ok(g.edits == {(20, 85): "."} and g.toast == "You cut down the THICK TREE." and g.materials["stone"] == 0,
         "with the AXE the tree is cut, drops nothing, and says so")
  finally:
      mt.MAP[85] = _row
  ok(mt.Game().flags.get("axe") == 0, "a new game starts without the AXE")
  for junk, want in ((None, 0), ("yes", 0), (5, 1), (True, 1), (-1, 0)):
      g = mt.Game(); g.new_game(); g.flags["axe"] = junk; g.save_game()
      ok(g.load_game() and g.flags["axe"] == want, "a saved axe of %r loads as %d" % (junk, want))
  ```
  In the existing "old save without sandbox fields" test (test.py:1415-1424), add `and g.flags["axe"] == 0`.
- [ ] **Step 2:** FAIL.
- [ ] **Step 3: Implement.**
  - Both new-game flag dicts (py:2032, :3260) gain `axe=0`.
  - Load (py:3194) gains `self.flags["axe"] = axe_tier(self.flags.get("axe"))`.
  - `interact`'s block branch:
  ```python
              tier = pick_tier(self.flags.get("pick"))
              axe = axe_tier(self.flags.get("axe"))
              if can_mine(t, fx, fy, tier, axe):
                  self.mine(fx, fy)
              elif b.get("tool") == "axe":
                  self.say(["This tree is thinner than the rest. An AXE could cut it."])
              elif b["tier"] > 1:
                  ...unchanged...
  ```
  - `mine`: `can_mine(t, x, y, self.flags.get("pick"), self.flags.get("axe"))`. The final toast becomes:
  ```python
          self.show_toast("You cut down the %s." % BLOCKS[t]["name"] if not drops else "Got " + " and ".join(
              MATERIAL_LABEL[k] + ("" if n == 1 else " x%d" % n) for k, n in drops.items()) + "!")
  ```
- [ ] **Step 4:** PASS, apart from PARITY.

### Task 2.6: Emit, the JS port and PARITY (game-chore)
**Files:** `emit_tables.py` `:20-25` (docstring), `:137-157`; the HTML (`SOLID` :590, `MATERIAL_LABEL` :751, `BLOCKS`/`RECIPES` emitted blocks, `pickTier`/`canMine` :1133-1150, `craft` :1186, `craftRows` :2450, `interact` :2559, `mine` :2625, `craftRecipe` :2640, new-game flags at **both** html:1669 and html:6028, the loader at about html:2802, the CRAFT header draw, and the `__GAME__` export at :6685); `claude's monsters.test.js` (:825/:828 BLOCKS set and the authoredOnly checks, plus new mirrors); `claude's monsters.test.py` PARITY.

- [ ] **Step 1: The emitter.** `emit_blocks` emits `tool: 'pick'|'axe'` after `tier`. `emit_recipes` emits `setsTool: ['axe', 1]` when it is set. Add both keys to the docstring's key map. Run `.venv/Scripts/python.exe .claude/skills/add-monster/emit_tables.py` (expected: a diff for `BLOCKS`/`RECIPES` only), then run it with `--write`, then the dry run again (expected: no diff).
- [ ] **Step 2: JS tests.** Mirror every Task 2.1-2.5 test that can run under node:
  - update test.js:825 (the BLOCKS set gains `T`) and :828 (authoredOnly is `{K, T}`);
  - add `axeTier`, the `canMine` matrix, `craft` `setsTool`, the loot recipes and the economy check, `craftRows` and `craftRecipe` messages (including the full-bag row), tree interact/mine with a temporary `g.MAP[85]` swap restored in `finally`, and save normalisation of `G.flags.axe`.

  Run `node "claude's monsters.test.js"`. Expected: FAIL.
- [ ] **Step 3: The JS port.** Port function by function, in camelCase: `TREE`, `AXE_MAX`, `axeTier`, `canMine(tile, x, y, tier, axe = 0)`, `craft(materials, recipe, tier = 0, axe = 0)`, `craftLabel`, `craftHave`, `bagRoom`, the `craftRows` branch, `craftRecipe` routing and messages, `interact`/`mine`, `axe: 0` in both new-game sites, `axeTier` in the loader, and the CRAFT header `AXE: YES|NO`. Export the new names. Run `node "claude's monsters.test.js"`. Expected: PASS.
- [ ] **Step 4: PARITY.**
  - Append `tool` to the PARITY "blocks" field list and `sets_tool`/`setsTool` to the "recipes" field list (test.py:6450-6454), and to the matching JS dump.
  - Add compares for:
    - `axe_tier` over the JSON-representable junk list;
    - the `can_mine` matrix over each `BLOCKS` glyph at one authored and one non-authored tile × pick 0..2 × axe 0..1;
    - `craft_rows` for three fixed states (empty; AXE craftable; AXE owned, with POTION loot and a full POTION stack).
- [ ] **Step 5: Mutation check.** Copy the HTML to the scratchpad, change `setsTool: ['axe', 1]` to `['axe', 2]`, set `mt_test.HTML_PATH` (test.py:5898) to the copy in a one-off scratch runner, and confirm PARITY fails. Delete the copy. Don't commit the runner.
- [ ] **Step 6:** Run `node .claude/scripts/verify.js`. Expected: all 8 PASS.
- [ ] **Step 7: Gate.** game-reviewer (the save normaliser and shared tables are risky surfaces).

---

## Chunk 3: Map: the glades, zones, items, sign and generalised gated reachability, in both builds (sandbox-designer for geometry, creature-designer for pools, game-chore for JS)

Back up first.

### Task 3.1: Generalise the gated rule (still green on today's map)
**Files:** test.py `:180-250`, `:280-290`, `:310-322`; py `:612` (add `GATED_REGIONS`).
- [ ] **Step 1: Rewrite the block.** Keep `flood_fill` unchanged.
  ```python
  GATES = sorted((x, y) for y, r in enumerate(mt.MAP) for x, c in enumerate(r)
                 if mt.BLOCKS.get(c, {}).get("authored_only"))
  SEAMS = [p for p in GATES if mt.tile_at(*p) == mt.SEAM]
  TREES = [p for p in GATES if mt.tile_at(*p) == mt.TREE]
  ALL_MINED = {p: mt.BLOCKS[mt.tile_at(*p)]["leaves"] for p in GATES}
  seen_mined = flood_fill(ALL_MINED)

  def region_of(x, y):
      return next((r for r in mt.GATED_REGIONS if r[0] <= x <= r[2] and r[1] <= y <= r[3]), None)

  def in_gated(x, y):
      return region_of(x, y) is not None

  def gated(x, y):
      """Reachable only once a gate is broken, and inside a gated region."""
      return not adjacent_to_open(x, y) and adjacent_to_mined(x, y) and in_gated(x, y)

  def open_tiles(r):
      return {(x, y) for y in range(r[1], r[3] + 1) for x in range(r[0], r[2] + 1)
              if mt.tile_at(x, y) not in mt.SOLID or (x, y) in ALL_MINED}

  GATED_OPEN = set().union(*(open_tiles(r) for r in mt.GATED_REGIONS))
  ok(mt.GATED_REGIONS[0] == mt.GEODE, "the GEODE is the first gated region")
  ok(len(SEAMS) == 2 and all(region_of(*p) == mt.GEODE for p in SEAMS), "exactly 2 seams, both on the GEODE: %s" % SEAMS)
  ok(len(TREES) == len(mt.GATED_REGIONS) - 1 and all(region_of(*p) not in (None, mt.GEODE) for p in TREES),
     "one thick tree per glade, each inside its glade: %s" % TREES)
  ok(seen_mined - seen == GATED_OPEN, "breaking every gate opens exactly the gated regions (extra %s, missing %s)"
     % (sorted((seen_mined - seen) - GATED_OPEN)[:4], sorted(GATED_OPEN - (seen_mined - seen))[:4]))
  for r in mt.GATED_REGIONS:
      ok(not open_tiles(r) & seen, "gated region %s is sealed until its gate breaks" % (r,))
  ok(all(any(adjacent_to_open(*p) for p in GATES if region_of(*p) == r) for r in mt.GATED_REGIONS),
     "every gated region has a gate that can be faced from the open world")
  ok(all(mt.region_name(y) == "DEEPWOOD" and not mt.in_sandbox(x, y) for x, y in TREES), "thick trees stand in DEEPWOOD")
  ```
  - Keep the seam-only checks (cave, not the trunk), using `SEAMS`, and keep `in_geode` for the GEODE-specific pool test at :357-362.
  - Zones (around :280): swap `in_geode` for `in_gated`, collect `region_of(*rect[0])` per gated zone, and assert `sorted(...) == sorted(mt.GATED_REGIONS)`.
  - Items (around :320): `ok(sorted(region_of(*p) for p in gated_items) == sorted(mt.GATED_REGIONS), ...)`.
  - Reword the GEODE-only messages.
- [ ] **Step 2:** Add `GATED_REGIONS = (GEODE,)` to py, with a comment. Run the suite. Expected: PASS (TREES is empty, and `len - 1 == 0`).
- [ ] **Step 3:** game-chore mirrors this in test.js (:121-170), and `GATED_REGIONS` in the HTML. Run `node .claude/scripts/verify.js`. Expected: 8/8 PASS.

### Task 3.2: Author the glades
**Files:** py `MAP` rows 81-87, `ZONES` (append), `ITEMS` (:1838), `SIGNS[(24, 91)]`, `GATED_REGIONS`; test.py `:2511` (`len(ITEMS)` 12 → 14).
- [ ] **Step 1: Tests (MAP section, after the generalised block):**
  ```python
  ok(mt.MOSS_HOLLOW == (4, 81, 19, 87) and mt.OLD_GROVE == (71, 81, 84, 87), "the glade rects are pinned")
  ok(mt.GATED_REGIONS == (mt.GEODE, mt.MOSS_HOLLOW, mt.OLD_GROVE), "three gated regions")
  ok(TREES == [(19, 84), (71, 84)], "the thick trees stand at (19,84) and (71,84): %s" % TREES)
  ok((20, 84) in seen and (70, 84) in seen, "both trees are faced from open ground")
  for z, rect, lv in (("MOSS", (6, 84, 16, 86), (12, 16)), ("GROVE", (74, 83, 82, 85), (16, 18))):
      zz = next((q for q in mt.ZONES if (q["x1"], q["y1"], q["x2"], q["y2"]) == rect), None)
      ok(zz is not None and (zz["min"], zz["max"]) == lv, "%s zone %s at L%d-%d" % (z, rect, lv[0], lv[1]))
      ok(zz and all(mt.tile_at(x, y) == ";" for y in range(rect[1], rect[3] + 1) for x in range(rect[0], rect[2] + 1)),
         "%s zone is all dark grass" % z)
  ok(mt.ZONES[-2]["x1"] == 6 and mt.ZONES[-1]["x1"] == 74, "the glade zones are appended last, MOSS then GROVE")
  ok(mt.ITEMS.get((5, 82)) == 6 and mt.ITEMS.get((83, 82)) == 8, "glade item balls: 6 and 8")
  ok(any("AXE" in l for l in mt.SIGNS[(24, 91)]), "the DEEPWOOD sign hints at the AXE")
  ```
  Change test.py:2511 to `len(mt.ITEMS) == 14`.
- [ ] **Step 2:** FAIL.
- [ ] **Step 3: Author.**
  - Add `MOSS_HOLLOW = (4, 81, 19, 87)`, `OLD_GROVE = (71, 81, 84, 87)` and `GATED_REGIONS = (GEODE, MOSS_HOLLOW, OLD_GROVE)`.
  - Edit `MAP` rows 81-87 by coordinate, keeping every row 88 characters wide:
    - **MOSS HOLLOW:** x4..18, y81..87 → `.`; x6..16, y84..86 → `;`; (5,82) → `o`; (19,84) → `T`.
    - **OLD GROVE:** x72..84, y81..87 → `.`; x74..82, y83..85 → `;`; (83,82) → `o`; (71,84) → `T`.
    - Everything else in columns 3, 19, 71 and 85, and in rows 80 and 88, stays `#`.
  - Print rows 79-91 with a column ruler before and after, from a scratchpad script. Don't add it to the repo.
  - Append the two `ZONES` (MOSS, then GROVE) in the existing dict form:
    - `x1=6, y1=84, x2=16, y2=86, min=12, max=16, pool=[("sprigling", 40), ("emberling", 35), ("dripling", 25)]`;
    - `x1=74, y1=83, x2=82, y2=85, min=16, max=18, pool=[("thornmane", 35), ("pyrelash", 30), ("voltbloom", 35)]`.
  - Add `ITEMS[(5, 82)] = 6` and `ITEMS[(83, 82)] = 8`, each with a `# inside MOSS HOLLOW / OLD GROVE: needs the AXE` comment.
  - Append to `SIGNS[(24, 91)]`: `"Some trees in here are thinner than the rest. An AXE would make short work of them."`
- [ ] **Step 4:** PASS for the whole MAP section (width, orphan grass, the 2-column trunk, ITEMS↔`o`, NPC reachability). Fix the geometry, never the rule.

### Task 3.3: The SANDBOX playthrough
**Files:** test.py, the Part B block (before :1587).
- [ ] **Step 1: Local helpers.** `finish` (test.py:2040) and `idle` (:1971) are defined after SANDBOX, so define a local `win_now(g)` with `finish`'s body and a local `idle`, copying both exactly. To keep the global `random` stream unchanged (`update` runs NPC wander, py:3340-3363), wrap the farm loop in `_rs = random.getstate()` … `random.setstate(_rs)`, the pattern at test.py:1492/1522. Also snapshot and restore every `NPCS` entry's x/y.
- [ ] **Step 2: The playthrough.**
  ```python
  g = mt.Game(); g.new_game(); g.flags["starter"] = True
  g.party = [mt.make_mon("tidecoil", 40)]
  g.beaten = {n["id"]: True for n in ALL_TRAINERS}
  g.player.tx, g.player.ty = 10, 89          # inside the PEBBLIT zone (6,89)-(18,90)
  battles = 0
  while (g.bag.get("twig", 0) < 2 or g.bag.get("flint", 0) < 1) and battles < FARM_BOUND:
      g.start_battle(mt.make_mon("pebblit", 10))
      win_now(g)
      battles += 1
      g.steps += 7                             # vary the loot seed like real walking would
  ok(g.bag.get("twig", 0) >= 2 and g.bag.get("flint", 0) >= 1,
     "farming PEBBLIT in DEEPWOOD yields 2 TWIG + 1 FLINT within %d wins (took %d)" % (FARM_BOUND, battles))
  ```
  If a win also needs the foe fainted first, copy how the LOOT section's seeded wins do it (test.py around :2706).
- [ ] **Step 3: Derive `FARM_BOUND`.** Run once with `FARM_BOUND = 200` and print `battles`. Then set `FARM_BOUND = <that number>  # exact for today's loot seeds; re-derive if loot_seed/LOOT_* change`.
- [ ] **Step 4: Continue.** `walk_to` (WORLD helper, test.py:887) uses the module-level `g` and returns `engaged` whenever `g.mode != "overworld"`. So reset dialogue after every interaction:
  ```python
  axe_i = [r["id"] for r in mt.RECIPES].index("axe")
  ok(g.craft_recipe(axe_i) and g.flags["axe"] == 1, "the farmed loot crafts the AXE")
  r = walk_to(20, 84); ok(r.get("arrived"), "walk to MOSS HOLLOW's tree: %s" % r)
  g.player.dir = "left"; g.interact(); g.dialogue, g.mode = None, "overworld"
  ok(g.tile(19, 84) == ".", "the AXE cuts MOSS HOLLOW's tree")
  ok(walk_to(5, 83).get("arrived"), "MOSS HOLLOW is open")
  g.player.dir = "up"; g.interact(); g.dialogue, g.mode = None, "overworld"
  ok((5, 82) in g.picked, "the MOSS HOLLOW ball can be picked up")
  ok(mt.zone_at(10, 85) and mt.zone_at(10, 85)["min"] == 12, "the hollow's dark grass is its zone")
  ok(g.save_game() and g.load_game() and g.edits.get((19, 84)) == "." and g.flags["axe"] == 1,
     "the cut and the AXE survive a save round-trip")
  g.dialogue, g.mode = None, "overworld"
  r = walk_to(70, 84); ok(r.get("arrived"), "walk to OLD GROVE's tree: %s" % r)
  g.player.dir = "right"; g.interact(); g.dialogue, g.mode = None, "overworld"
  ok(g.tile(71, 84) == "." and walk_to(83, 83).get("arrived"), "the AXE opens OLD GROVE too")
  ```
  The existing `os.remove(mt.SAVE_PATH)` at :1587 cleans up the save, because this block sits above it.
- [ ] **Step 5:** PASS.

### Task 3.4: Balance sign-off (creature-designer)
- [ ] **Step 1:** Run `balance_report.py > .superpowers/sdd/2026-10-23-axe-glades/balance-after.txt` and diff it against the before copy. Expected: only the two new zones, printed last.
- [ ] **Step 2:** Judge OLD GROVE's L16-20 next to the L8-15 DEEPWOOD zones and trainers t3/t4. Change only pool weights and min/max levels, never geometry, and update the Task 3.2 zone test if you do.

### Task 3.5: Emit, the JS port and PARITY (game-chore)
- [x] **Step 1:** Run `emit_tables.py --write` (`MAP`, `ZONES`), then the dry run. Expected: no diff.
- [x] **Step 2:** Hand-port to the HTML: `MOSS_HOLLOW`, `OLD_GROVE`, `GATED_REGIONS`, the two `ITEMS` and the sign line. Mirror the Task 3.1-3.2 tests in test.js, adding `T` to the legend at test.js:81 and updating any `ITEMS` count. There is no JS playthrough; MT-19 covers it in the browser.
- [x] **Step 3: PARITY.**
  - Compare `ITEMS` as a full key→amount map. Today it compares keys plus the GEODE amount (test.py:6492-6496).
  - Add `GATED_REGIONS`.
  - Add `load_edits` cases `{"19,84": "."}`, `{"71,84": "."}`, `{"20,84": "."}` and `{"19,84": "W"}`.
- [x] **Step 4:** Run `node .claude/scripts/verify.js`. Expected: 8/8 PASS.
- [x] **Step 5: Gate.** game-reviewer (PASS r1, 2026-10-23; 3 MINOR: 2 stale comments fixed, JS per-region print deferred as optional). MAP reachability is a risky surface, so the reviewer re-checks the gated equality output line.

---

## Chunk 4: Shell, both builds: the `T` sprite and sealed-glade masking (game-feel-engineer); sign polish (narrative-designer)

### Task 4.1: Draw the THICK TREE
**Files:** py `Shell.draw_tile` (:5230; the `SEAM` branch at :5331 is the model); HTML tile drawing (find the `'K'` branch with `grep -n "=== 'K'\|SEAM)" "claude's monsters.html"`).
- [ ] **Step 1: Failing RENDER test.** Draw `T` at (19,84) and `#` at (18,84) to scratch surfaces. Assert that the pixel arrays differ, and that the `T` tile has at least N pixels in the pale-trunk colour range. Choose N from the art and state it.
- [ ] **Step 2:** FAIL.
- [ ] **Step 3:** Implement `elif t == TREE:` in both builds: the DEEPWOOD `#` tree, then a pale vertical trunk band with 2-3 dark notches. Use fixed colours, added as named constants to PARITY's shell-constants list. Any variation comes from `hash01`/`tileHash`, never from fx or engine random.
- [ ] **Step 4:** PASS in both suites. Dump frames with `MT_FRAME_DIR=<scratch>` and look at both entrances.

### Task 4.2: Sealed glades draw as forest
**Files:** py: next to `geode_masked` (:5462), and the overworld draw at :5639. HTML: next to `geodeMasked` (:3538), and the draw at :5020.
- [ ] **Step 1: Failing tests.**
  - Pure: `glade_masked(x, y, edits)` / `gladeMasked` returns True for a non-`#`, non-`T` MAP tile inside `MOSS_HOLLOW` or `OLD_GROVE` while that region's `T` is still uncut (`tile_at(gate, edits) == TREE`), and False otherwise. Assert it for (10,85) and (5,82) before and after `with_edit(..., 19, 84, ".")`, and for (19,84) itself (always False).
  - RENDER: with the tree uncut, the screen region over (10,85) matches the colours of a `#` tile. After the cut, it doesn't.
  - Add it to PARITY as a small matrix.
- [ ] **Step 2:** FAIL.
- [ ] **Step 3: Implement.** Each glade's gate is its unique `TREE` tile inside its rect. Precompute `GLADE_GATES = {rect: (x, y)}` from `MAP` at import, in both builds. In the overworld draw, a masked tile draws as `#`, mirroring `geode_masked`'s `'C'` substitution at py:5639 / html:5020. The item ball and the dark grass stay hidden until the cut.
- [ ] **Step 4:** PASS in both suites.

### Task 4.3: Sign wording (narrative-designer)
- [ ] **Step 1:** Polish the DEEPWOOD sign line in both builds. It must keep "AXE" and stay ASCII, and PARITY `SIGNS` must stay green.
- [ ] **Step 2:** Run `node .claude/scripts/verify.js`. Expected: 8/8 PASS.
- [ ] **Step 3: Gate.** game-reviewer, then playtester `game: monster-trail`, `mode: duty`: MT-07 (CRAFT), MT-10 (touch/phone layout) and MT-11 (reduced motion), with screenshots of both sealed entrances, the scrolled CRAFT list on desktop and phone portrait, and a cut in progress.

---

## Chunk 5: Docs, playtest and gates (PM)
- [ ] **Task 5.1: `docs/playtests/monster-trail.md`.** Add MT-19. In the HTML build, use the debug seams to grant `twig: 2, flint: 1` and teleport to (20,84). Then:
  1. confirm the glade looks like forest;
  2. face (19,84) without the AXE and read the hint;
  3. craft the AXE (the header shows `AXE: YES`);
  4. cut the tree, enter, take the ball and trigger one encounter;
  5. repeat at (71,84);
  6. scroll CRAFT to BACK on desktop and phone portrait;
  7. save and reload, and confirm both trees stay cut.

  Pass criteria: zero console errors and a screenshot for each step.
- [ ] **Task 5.2: CLAUDE.md.**
  - Update the sandbox, PICK-tier and GEODE bullets with `T` (THICK TREE, `tool="axe"`, authored-only, two of them), `flags["axe"]`/`axe_tier`, `sets_tool`, loot recipes via the bag-merged have-dict, `GATED_REGIONS`, the glade masking, and the generalised gated rule (each region holds exactly one item and one zone).
  - Remove "the only wild emberling and sprigling" (around line 135).
  - Add `T` to the terrain glyphs.
  - Update the check counts from the final verify output.
- [ ] **Task 5.3: Skills and wiki.**
  - `.claude/skills/game-review-checklist/SKILL.md:50`: change the gated-reachability line from GEODE-only to `GATED_REGIONS`.
  - `.claude/skills/add-monster/SKILL.md`: add the `tool`/`setsTool` emitter keys.
  - `docs/wiki/monster-trail.md`: remove "Part B not designed yet" at :28 and describe Part B.
  - `docs/wiki/testing.md`: new counts and the gated rule.
  - `docs/wiki/story.md`: the sign at (24,91).
  - Run `node .claude/scripts/wiki-sync.js`. Expected: no findings.
- [ ] **Task 5.4: PROGRESS.** Update `## Next` and `## Recently done`.
- [ ] **Task 5.5: Gates.**
  1. `node .claude/scripts/verify.js`: 8/8 PASS.
  2. game-reviewer on the whole of Part B.
  3. playtester `game: monster-trail`, `mode: full`, with MT-19 plus the MT-04/05/06/07/09/10/11/13/14/18 regressions.
  4. Learning loop: reflect-and-learn if anything needed a second round, capture-knowledge (the "authored_only gate + gated region" pattern is now used twice, so it's a skill-evolution candidate), and wiki-sync.
  5. End with a `LOOP:` line.

---

## Plan review log (plan-with-review, 2026-10-23)
| # | Persona | Severity | Finding | Resolution |
|---|---|---|---|---|
| 1 | Both | GAP/RISK | RENDER CRAFT row-count tests (test.py:3223, :5367-5370, test.js:2697) go red when RECIPES grows, and reviewer Step 0 then blocks | Fixed: the scrolling CRAFT list is now Chunk 1, with count-independent tests, before any recipe lands |
| 2 | PM | CRITICAL | PARITY would be red between the Python and JS chunks, so every reviewer gate would be PRECONDITION_FAILED | Fixed: each chunk ships Python + emit + JS + PARITY together and ends 8/8 green |
| 3 | Gap | GAP | `walk_to` aborts after pickup or load because mode is dialogue | Fixed: `g.dialogue, g.mode = None, "overworld"` after each interaction (Task 3.3) |
| 4 | Both | GAP/RISK | Unlisted tests: `len(ITEMS)==12` (test.py:2511), the py legend (:139), the JS legend (:81), the JS BLOCKS/authoredOnly checks (:825/:828) | Fixed: each is named in its task |
| 5 | Gap | GAP | Glades are visible from outside (GEODE is masked; glades weren't) | Fixed: Task 4.2 `glade_masked`, both builds, with PARITY and RENDER checks |
| 6 | Both | GAP/RISK | Part B tests placed after the SANDBOX save cleanup and MAP guard (:1587-1588) | Fixed: placed before :1587 |
| 7 | Gap | GAP | Wrong duty IDs (MT-13 is SETTINGS); MT-07/10/11 missing | Fixed: Chunk 4 uses MT-07/10/11; Chunk 5 runs full with those |
| 8 | Risk | MINOR | `finish()` → `update` draws global random and moves NPCs | Fixed: getstate/setstate plus an NPC x/y snapshot around the farm loop |
| 9 | Risk | MINOR | Non-ASCII `·` in the header string | Fixed: header redesigned as `AXE: YES/NO`; ASCII trap stated |
| 10 | Risk | MINOR | JS new-game flags live at html:1669 and :6028 | Fixed: both named |
| 11 | Risk | MINOR | New ZONES order | Fixed: appended MOSS then GROVE, pinned by test |
| 12 | Gap | MINOR | PARITY field lists lack `tool`/`sets_tool` | Fixed: Task 2.6 Step 4 |
| 13 | Gap | MINOR | No mutation-check pattern exists | Fixed: described as an `HTML_PATH` override in a scratch runner |
| 14 | Gap | MINOR | A full-bag recipe row shows as craftable | Fixed: `bag_room` in `craft_rows`, tested |
| 15 | Gap | MINOR | Stale docs: review checklist :50, add-monster SKILL, story.md, monster-trail.md:28 | Fixed: Task 5.3 |
| 16 | Gap | MINOR | Wrong citations (recipe loop, `ore_spots`, LOOT wins, `walk_to`, `idle`) | Fixed in place |
| 17 | Gap | MINOR | AXE not shown anywhere persistent | Fixed: CRAFT header `AXE: YES/NO` |
| 18 | Risk | MINOR | Cut uses stone chips, and `T` lingers during crack frames | Deferred: cosmetic, accepted by the spec (YAGNI) |
