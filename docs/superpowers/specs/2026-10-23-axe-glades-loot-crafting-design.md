# The AXE, secret glades and crafting from loot (Part B): design

Date: 2026-10-23. Lane: DEEP. It touches MAP geometry and reachability, shared tables, the save format and both builds.
Source: the user's sketch "crafting from loot, the AXE, trees hiding secret areas", which Part A (`2026-10-18-loot-shop-items-design.md`) deferred. Approved in brainstorming on 2026-10-23:
- Loot crafts **tools plus some consumables**.
- Secrets are **GEODE-style sealed pockets**, holding **existing species in exclusive spots**.
- Cut trees **stay cut forever**.
- Approach **A**: extend the sandbox (`BLOCKS`, the `Game.edits` overlay, `load_edits`, the gated-reachability rule). There is no separate Cut system.

## Goal
The player farms DEEPWOOD loot, crafts an AXE, and cuts one marked tree to enter each of two hidden glades. Each glade holds an item ball and a dark-grass zone with species no open zone offers at that point in the game. Loot also crafts POTION, GREAT BALL and SMOKE. All of it behaves identically in `claude's monsters.py` and `claude's monsters.html`, as proven by PARITY.

## 1. Rules and data (Python is the source; `emit_tables.py` emits to HTML)

### The THICK TREE tile and the AXE
- `BLOCKS["T"] = dict(name="THICK TREE", drops={}, ore_one_in=0, leaves=".", tier=1, tool="axe", authored_only=True)`.
- Every existing `BLOCKS` entry gains `tool="pick"`. A missing `tool` means `"pick"`, so a hand-built table still works.
- **`T` is added to `SOLID`** in both builds (today `SOLID = set("#B~CHDGSoWK")`, py:484; the JS equivalent too). Without it the tree is walkable and the glades are never sealed. The suite's flood fill already reads `mt.SOLID`.
- `flags["axe"]`: 0 means none, 1 means AXE. `axe_tier(v)` normalises it the same way `pick_tier` does: `True` means 1, and junk, bools other than True, or negatives mean 0. It is clamped to 0..1 (`AXE_MAX = 1`).
- `can_mine(tile, x, y, tier, axe=0)`:
  - The block's `tool` picks which tier is compared against `b["tier"]`: `tier` for `"pick"`, `axe` for `"axe"`.
  - `authored_only` still means the tile breaks only where `MAP` itself holds that glyph.
  - The PICK can never cut a `T`, and the AXE can never break `#`, `W` or `K`.
  - The default `axe=0` keeps every existing call site and test unchanged.
- **`Game.interact`** (py:2963-2973, and the JS `interact`) branches on the block's `tool`. The PICK messages ("A loose ... A PICK would break it.") apply only to `tool == "pick"`. For `T` with no AXE it uses `say` (dialogue, like the PICK hints): "This tree is thinner than the rest. An AXE could cut it." With the AXE, it calls `mine`.
- **`Game.mine`** (py:2995-3007, and the JS `mine`) passes `axe_tier(self.flags.get("axe"))` to `can_mine`. When the drops are empty, which is always the case for `T`, it shows the toast "You cut down the THICK TREE." instead of "Got ...!". `fx_world("mine", ...)` is reused, giving the light chip spray because `T` is tier 1; wood chips are YAGNI.

### Recipes
New `RECIPES` rows. The existing five keep their order and ids.

| id | out | count | needs | extra |
|---|---|---|---|---|
| axe | axe | 1 | twig 2, flint 1 | `sets_tool=("axe", 1)` |
| potion | potion | 1 | leaf 2, dewdrop 1 | |
| greatball | greatball | 1 | flint 2, copperwire 1 | |
| smoke | smoke | 1 | emberdust 1, shadowsilk 1 | |

- `craft(materials, recipe, tier=0, axe=0)`:
  - A `sets_tool=(name, level)` recipe is refused when the current tool level is already at or above `level`. Like `sets_tier`, it puts nothing into the result; the caller sets `flags["axe"]`.
  - Otherwise `craft` is unchanged: exactly the needs come out and exactly `count` goes in.
- **The have dict now includes the bag.** `craft_rows` and `Game.craft_recipe` build `have = dict(materials, balls=..., lantern=..., pulse=..., **bag)`. After crafting, every key is routed back to where it lives:
  - `GOODS` ids go to `Game.bag`, capped at `BAG_MAX`, with zero entries removed the way the bag already removes them;
  - `balls`, `lantern` and `pulse` go to their counters;
  - the rest goes to `materials`.

  A crafted bag item that would exceed `BAG_MAX` is refused, with "Your BAG is full of <NAME>." and nothing spent.
- `MATERIAL_LABEL` gains `"axe": "AXE"`. Loot and good names in craft rows come from `GOODS[id]["name"]`, through a `craft_label(id)` helper used by both `craft_rows` and the "Need ..." message.
- **`craft_recipe`** (and the JS `craftRecipe`) refuses a `sets_tool` recipe that is already owned with "You already have the AXE." and, on success, sets `flags["axe"] = 1` with "Crafted the AXE. Thin trees give way now." The IRON PICK's "Cracked seams give way now." stays specific to `sets_tier`.
- The craft row for the AXE reads "owned - it cuts thin trees" or "from 2 TWIG, 1 FLINT - cuts thin trees".
- **No backstop.** The glades are optional, and TWIG and FLINT drop from endlessly repeatable wild battles. The QUARRY backstop stays ORE-only.

### Economy invariant (tested in both builds)
For every recipe whose `out` is a `GOODS` id with a buy price: the sum of `GOODS[k]["price"] * n` over the loot needs is less than `GOODS[out]["price"]`, and the shop never buys non-loot goods. Part A had no loot recipes, so this is a **new** invariant, tested from now on. The values are 28 < 30, 46 < 60 and 28 < 40. `shop_sell` already refuses non-loot goods.

### Saves
- `flags["axe"]` is saved with `flags` and normalised on load through `axe_tier`. A save from before Part B has no key and loads as 0.
- `load_edits` already accepts an `authored_only` tile turned into its `leaves` value. `T`→`.` therefore loads only at the two authored trees with no code change, and a test pins it in both builds. Any other `.` written over a non-sandbox tile is still dropped.

## 2. Map: two DEEPWOOD glades
Both sit in DEEPWOOD's existing solid tree mass. They are authored by coordinate, and the rows are re-emitted. The sandbox-designer finalises exact tiles under the rules in section 3; the rectangles below are the contract.

| Constant | Rect (x1, y1, x2, y2) | Entrance `T` | Faced from | Zone (dark grass `;`) | Levels | Pool | Item |
|---|---|---|---|---|---|---|---|
| `MOSS_HOLLOW` | (4, 81, 19, 87) | (19, 84) | (20, 84) | x6..16, y84..86 | 12-16 | sprigling 40, emberling 35, dripling 25 | (5, 82): 6 balls |
| `OLD_GROVE` | (71, 81, 84, 87) | (71, 84) | (70, 84) | x74..82, y83..85 | 16-18 (creature-designer sign-off 2026-10-23; was 16-20) | thornmane 35, pyrelash 30, voltbloom 35 | (83, 82): 8 balls |

- The `rect` includes the entrance tile, matching how `GEODE` (65,30,75,34) includes its seam at (70,34). A region's open tiles are its non-`SOLID` tiles once its `T` is cut, which is how `GEODE_OPEN` is built (test.py:230).
- Zone rects and item tiles are **pinned**: the creature-designer may change pool weights and levels after balance-report, but not geometry.
- DRIPLING replaces FLUTTERFLY, which is common in the open DEEPWOOD zones. Today DRIPLING is fishing-only, so no open land zone offers any glade species at that level.
- Each interior is ringed by `#`: row 80 above, row 88 below (row 89 is open in the west), and columns 3 and 85 at the sides. The map's two-column border stays intact. Every other tile of column 19 (west) and column 71 (east) stays `#`.
- No NPC, sign, door or trainer is inside or adjacent. Trainers t3 (34,85) and t4 (40,81) are untouched, and their sight lines don't cross the entrances.
- The `region_name` is still DEEPWOOD, so area loot is TWIG and TREE SAP.
- **Docs and tests no longer claim that the GEODE is the only wild source of EMBERLING and SPRIGLING.** Its pool and level band are unchanged.

### Looks
- `T` draws as the DEEPWOOD tree with a pale, notched trunk, readable as "different" at a glance in the same way the seam reads against cave rock. It needs a new branch in both builds' tile drawing and borrows its ground through `ground_tone`. The cut tile draws as normal ground.
- RENDER checks that the `T` sprite differs from `#` at its location.
- **Sealed glades draw as forest** until their `T` is cut. `glade_masked` / `gladeMasked` mirrors the GEODE's `geode_masked`, which draws as rock. Without it the 20-tile view would show the hollow's grass and ball from the path (found in plan review). The result is PARITY-compared and checked by RENDER.
- The CRAFT header shows `AXE: YES|NO` next to the PICK tier, so owning the AXE is visible.

### Hints (narrative-designer, both builds)
- The DEEPWOOD sign at (24,91) gains one line: "Some trees in here are thinner than the rest. An AXE would make short work of them."
- No NPC gains a new line; the sign and the CRAFT row are enough. YAGNI.

## 3. Gated reachability (generalised test rule)
- `GATED_REGIONS = (GEODE, MOSS_HOLLOW, OLD_GROVE)` lives in the Python engine. `GEODE` keeps its name and value.
- In the MAP section, `seen` is the plain flood fill, and `seen_mined` now breaks every `K` **and** every `T`. Then:
  - `seen_mined - seen` must equal the union, over gated regions, of each region's open tiles plus its gate tiles;
  - every region is disjoint from `seen`, so each is sealed;
  - there are exactly 2 `K` and exactly 2 `T` tiles, and each lies in exactly one gated region;
  - every NPC, door, sign and trainer is in `seen`;
  - each gated region holds exactly one `ITEMS` entry and exactly one encounter zone, and nothing gated lies outside a gated region.
- This replaces the GEODE-only assertions (test.py around lines 184-362). The GEODE's own pool and level checks stay.
- The JS MAP section mirrors the structural parts it already covers.

## 4. Parity and emission
- `emit_tables.py` learns the `tool` key on `BLOCKS` and the `sets_tool` tuple on `RECIPES`, which is emitted as a two-element array. `MAP`, `ZONES`, `BLOCKS` and `RECIPES` are re-emitted. `ITEMS` is hand-ported (it is not emitted today), and PARITY compares it.
- PARITY additions (PARITY now compares `ITEMS` amounts too, not only keys and the GEODE amount, test.py:6492-6496):
  - the `GATED_REGIONS` rects;
  - `axe_tier` on a junk-value matrix;
  - the `can_mine` matrix over every `BLOCKS` glyph × pick 0..2 × axe 0..1 at authored and non-authored tiles;
  - `craft_rows` for fixed bag states;
  - the `load_edits` cases for `T`.

### JS counterparts to port (Chunk 3 checklist)
`SOLID`, `BLOCKS`, `RECIPES`, `canMine`, `craft`, `craftRows`, `craftRecipe`, `interact`, `mine`, `axeTier` (new), the save loader's flag normaliser, `ITEMS`, `GATED_REGIONS`, `groundTone`, and the tile-draw branch for `T`.

### Docs
CLAUDE.md line ~135 ("the only wild emberling and sprigling") and the sandbox bullets are updated in Chunk 5.

## 5. Shell
- **CRAFT screen.** The list grows from 7 rows (5 recipes plus BUILD and BACK) to 11. Both builds get a scrolling window inside `BAG_RECT` (the same footprint, below the HUD at y=66 and above the toast at y=420), with scroll arrows. The cursor always stays visible.
  - The materials header also shows the bag counts of the loot the current row needs.
  - RENDER checks every cursor position at 640x480; the browser playtest checks touch.
- No new sounds. The cut reuses the mine sound and particles.

## 6. Tests summary
- **ENGINE**, both suites:
  - `axe_tier`;
  - the `can_mine` tool matrix;
  - `craft` with `sets_tool`, which happens only once and puts nothing into the result;
  - loot recipes conserve items exactly;
  - the `BAG_MAX` refusal;
  - material, counter and bag ids are disjoint;
  - the economy invariant;
  - `load_edits` with `T`.
- **MAP:** section 3.
- **SANDBOX** (Python), a scripted playthrough with `FORCE_CONDITION`, a fixed seed and no `FORCE_NO_LOOT`:
  1. farm DEEPWOOD until 2 TWIG and 1 FLINT are in the bag. FLINT comes only from Rock-type foes there: PEBBLIT, weight 18, in zone (6,89)-(18,90). The script fights in that zone with a pinned seed and asserts a bound on the number of battles it takes, so it can't be flaky or slow. The plan derives the exact bound from the pinned seed and writes it into the test as a number;
  2. craft the AXE;
  3. cut (19,84) and walk into MOSS HOLLOW;
  4. pick up the ball, trigger the zone, save, reload, and confirm the edit and the axe persist;
  5. cut (71,84) and walk into OLD_GROVE, which covers the east gate.

  Also: crafting the AXE twice is refused, and nothing is spent.
- **RENDER:** the `T` sprite, and the scrolling CRAFT list.
- **Balance:** run `balance_report.py` before and after. The only expected change is the two new zones in the zone-band section. Because the L16-20 OLD GROVE sits right after the L8-15 DEEPWOOD zones, the creature-designer explicitly signs off on its difficulty, not just the diff.
- **Playtest:** add MT-19 to `docs/playtests/monster-trail.md`. It covers the HTML build: craft the AXE (using debug seams to grant loot), cut, enter both glades, check the CRAFT scroll on desktop and in a phone portrait layout, and reload the save.

## Out of scope
More tools (a SHOVEL, a ROD tier), regrowing trees, tree drops, glades outside DEEPWOOD, new species, held items, selling crafted goods, and recipes that need ORE beyond the existing ones.
