# Visual crafting and item icons: design

Date: 2026-10-23. Status: approved in brainstorming (layout A "recipe book", icon approach 1 "pixel-art table").
Builds: MONSTER TRAIL, both `claude's monsters.py` (primary) and `claude's monsters.html`.
Mockups: `.superpowers/brainstorm/3717-1792747527/craft-layout.html` (layout choice) and `craft-screen.html` (the screen at 640x480, plus the craft animation).
Follows: Part B (`2026-10-23-axe-glades-loot-crafting-design.md`). This spec replaces Part B's text-list CRAFT screen (Chunk 1's scrolling list) with an icon grid.

## Goal
CRAFT stops looking like a menu. Every item gets a pixel-art icon. Crafting is a grid of recipe icons; the selected recipe shows as ingredient icons with have/need counts and a big result. One button crafts, with a short fly-in-and-pop. The same icons appear in the BAG, the battle BAG and the CENTRE shop.

Non-goals:
- free placement in a 3x3 grid (rejected option B);
- tabs (rejected option C);
- tap targets on the canvas (touch stays D-pad + A/B);
- icons on pickup or loot messages;
- any change to what recipes cost or make.

## 1. Data (layers 1-3: pure, shared, emitted)

### 1.1 Icons
- `ICON_PALETTE = {char: (r, g, b)}`. `.` is reserved for transparent and is not in the palette.
- `ICONS = {id: [16 strings of 16 chars]}`: hand-authored pixel art, every char either `.` or a palette key.
- Ids, one per drawable thing:
  - every `GOODS` key (24);
  - `stone`, `ore`, `wall`;
  - `balls` (the plain BALL);
  - `pick`, `iron_pick`, `axe`;
  - `lantern` (LAMP OIL);
  - `pulse`;
  - `coins`.
- `icon_id(item)` maps a recipe `out`, a recipe need, a BAG item/mat/loot row id or a shop id to its `ICONS` key.
  - The only mapping is `ball` (the BAG and shop id) → `balls`.
  - Every other id is its own key.
- `emit_tables.py` emits `ICON_PALETTE`, `ICONS` and `ICON_SHADOW` to the HTML build.
  - The emitter rewrites existing `const X = ...;` blocks, so step 1 adds empty anchor blocks for all three to the HTML.
- **Silhouette:** a hidden recipe draws its result icon with every opaque pixel in one dark colour, `ICON_SHADOW` (an RGB triple). No extra icon is needed.

### 1.2 Discovery (`found`)
- `Game.found`: a set of item ids the player has held at least once.
- **`note_found(g)`** reads `g`'s counters and adds to `g.found` (it mutates only `g.found`, and uses no randomness):
  - every `materials` key with count > 0;
  - every `bag` key with count > 0;
  - `balls` when `g.balls` > 0;
  - `pick` when `pick_tier(flags["pick"])` ≥ 1, and `iron_pick` when it is ≥ 2;
  - `axe` when `axe_tier(flags["axe"])` ≥ 1;
  - `lantern` when `g.lantern` > 0;
  - `pulse` when `g.pulses` > 0 (the counter is `pulses`, the id is `pulse`).
- **When it runs:**
  - at the end of every `Game.update` (py) / `update(dt)` (js);
  - at the start of `save_game` / `saveGame`;
  - at the end of `load_game` / `loadGame`, after every counter, flag and the bag is restored.

  So nothing gained and then spent before the CRAFT screen opens is missed.
- **`new_game()` and the JS reset:** set `found` to empty, then run `note_found`. Starting a new game after loading a save keeps no old discoveries.
- **Save format:** `found` is saved as a sorted list.
  - **Load:** the pure `clean_found(raw)` / `cleanFound(raw)` returns the set of string ids in `ICONS`. Anything else, including a non-list, gives an empty set. It follows the pattern of `clean_bag`, and `__GAME__` exports it.
  - **Old saves:** with no `found` key, `clean_found` gives an empty set and `note_found` seeds it from current holdings. Nothing the player already owns turns into a silhouette.
  - The JS build keeps it in its localStorage save.
  - PARITY compares `clean_found` across builds.

### 1.3 Cells (replaces `craft_rows` for the screen)
`craft_cells(g)` returns one dict per `RECIPES` entry, in order, then one BUILD cell:

```
{"kind": "recipe"|"build", "recipe": i or None, "icon": id, "name": str, "blurb": str,
 "state": "hidden"|"locked"|"ready"|"owned",
 "needs": [(item_id, have, n), ...], "out": id, "count": n}
```

- **`hidden`:** applies only to a **loot recipe**, meaning every one of its needs is a `GOODS` id: today the AXE, POTION, GREAT BALL and SMOKE.
  - It is hidden when no need id and not the out id is in `found`, and the tool is not owned.
  - The sandbox recipes (WALL, BALL, IRON PICK, OIL, PULSE) are never hidden. On a fresh game they show as `locked` or `ready`.
  - A hidden cell's `name` is `"???"` and its `blurb` is `"Find its ingredients first."`.
  - Its `needs` keep the real data, but the screen shows each need as a silhouette with `?` in place of the counts. So a hidden cell reveals neither its ingredients nor their amounts.
- **`owned`:** a `sets_tier`/`sets_tool` recipe whose tier is already reached.
- **`ready`:** `craft(craft_have(g), r, tier, axe)` is not None, and `bag_room(g, r)` holds.
- **`locked`:** otherwise.
- **The BUILD cell:**
  - its icon is `wall`;
  - its name is `BUILD WALLS`;
  - its blurb is "Place WALLs in ROCKY PASS.";
  - `needs = [("wall", materials["wall"], 1)]`, `out = "wall"`, `count = 0`;
  - it is `ready` iff `materials["wall"] > 0`, otherwise `locked`;
  - it is never hidden.
- **Blurbs:** one line each, ≤ 48 chars, from a new table `CRAFT_BLURB` keyed by recipe id. It is hand-ported and compared by PARITY:
  - wall: "A block to build with.";
  - ball: "Catches wild monsters.";
  - iron_pick: "Cracks seams.";
  - oil: "Fills the lamp (now %d%%).";
  - pulse: "Stuns the stalker. Have %d/%d.";
  - axe: "Cuts thin trees.";
  - potion: "Restores 20 HP.";
  - greatball: "A sturdier BALL.";
  - smoke: "Escape any wild battle.";
  - build (the BUILD cell): "Place WALLs in ROCKY PASS."
- **Messages:** the new strings go in a `CRAFT_MSG` table that PARITY compares, like `BAG_MSG`:
  - `hidden`: "Find its ingredients first.";
  - `nowall`: "No WALLs yet. Craft some first.".
- **`craft_rows` is removed** once nothing reads it. Its tests move to `craft_cells`.

### 1.4 Grid cursor
- `CRAFT_COLS = 5`. It is a hand-ported constant, compared by PARITY.
- **`grid_move(i, d, n, cols)`** (pure), with `d` in up/down/left/right:
  - left/right move within the row, clamped and without wrapping;
  - up/down move by `cols`, clamped and without wrapping;
  - a down move that would land past the last cell goes to the last cell;
  - it never leaves `0..n-1`.
  - This replaces today's wrapping list cursor (py:3880, html:6372) on purpose: wrapping is confusing on a grid.
- `Game.craft_cursor` stays an index. Opening CRAFT still resets it to 0, as today (py:3571, html:6239).
- **Z on a recipe cell:** calls the existing `Game.craft_recipe(cell["recipe"])`. Messages stay as today ("Crafted the AXE. ...", "Need 2 LEAF, 1 DEW DROP.", "You already have the AXE.", "Your BAG is full of POTION.").
- **Z on a hidden cell:** says "Find its ingredients first." and crafts nothing.
- **Z on BUILD:**
  - `ready`: enters build mode, as BUILD WALLS does today;
  - `locked`: says "No WALLs yet. Craft some first." and stays in CRAFT.
- **X:** closes CRAFT. The BACK row is gone.

### 1.5 The craft hook (the STATE → SHELL boundary)
- `Game.craft_recipe(i)` returns `True` on success; it already returns `False` on every failure path.
- On success it calls a new no-op hook, the same pattern as `fx_hit`:
  - Python: `Game.fx_craft(i, before)`;
  - JS: `juiceCraft(i, before)`.
- `before` is `{need_id: have}`, captured by `craft_recipe` itself just before spending.
- The shell overrides the hook to start `CRAFT_FX`. The engine never reads the shell's state.

### 1.6 Glade-mask default (carried over from the Chunk 4 review)
- `glade_masked` (py) and `gladeMasked` (js) must give the same answer when the edits argument is omitted.
- Make `edits` required in both builds, and update the JS tests that call it without edits.

## 2. Screen (shell only)

### 2.1 CRAFT, inside `CRAFT_RECT = (70, 74, 500, 340)`, as in `craft-screen.html`
- **Header (y+10):**
  - `CRAFT`;
  - tool chips, which replace the `PICK:`/`AXE:` text:
    - the PICK icon at 1x with `PICK` or `IRON PICK`, or greyed with `no PICK` at tier 0;
    - then the AXE icon with `AXE`, or greyed with `no AXE`;
  - `X back` on the right;
  - a rule at y+42.
- **The totals line is dropped on purpose.** The `STONE/ORE/WALL/BALLS` totals at py:5898 go away, because the detail pane shows have/need for the selected recipe.
  - The HUD's materials banner shows STONE/ORE/WALL only once a PICK is owned (py:5826), and never shows BALLS.
  - So with no PICK, totals appear only in the detail pane. That is accepted: the BAG lists every count.
- **Grid:**
  - every number below is a named constant in PARITY's shell-constants list: `CRAFT_GRID_X = 18`, `CRAFT_GRID_Y = 56`, `CRAFT_SLOT = 48`, `CRAFT_GAP = 6`, `CRAFT_COLS = 5`, `CRAFT_GRID_ROWS = 4`;
  - the grid scrolls by rows: `top_row = list_top(ceil(n / CRAFT_COLS), cursor // CRAFT_COLS, CRAFT_GRID_ROWS)`, with `scroll_cue` at the grid's right edge. Today's 10 cells never scroll, so it is tested with a synthetic n;
  - icons at 2x (32 px), centred;
  - `CRAFT_ROWS` and `CRAFT_ROW_H` are removed, together with their PARITY entries (test.py ~:6347, ~:6757) and the RENDER scroll tests that use them (test.py ~:3467, ~:5618-5639). Those tests are rewritten for the grid.
- **Cell states:**
  - `ready`: full colour;
  - `locked`: drawn at reduced alpha over a grey wash. The exact method is per build, but the pixel test in §4 fixes the rule: no saturated pixel;
  - `hidden`: the silhouette, plus a white `?` with a 1 px shadow;
  - `owned`: full colour plus a green check in the top-right;
  - BUILD: a small `BUILD` caption;
  - the selected cell: a yellow 3 px outline on a light fill.
- **Detail pane:** x+298 to x+482 (184 wide), with a dashed divider at x+298. The y values are panel-relative and stop above the message line at y+306.
  - **y+52..+112:** the result, in a 60 px slot at 3x, centred at x+390.
  - **y+118:** the name, in f15, centred.
  - **y+136..+162:** the blurb, in f11, wrapped to 168 px, at most 2 lines.
    - The existing helpers, `Shell.wrap(...)` (py:5315) and `wrapText(...)` (html:5303), gain an optional last argument, `max_lines` / `maxLines`. It defaults to no limit, so every existing caller is unchanged. When the limit is hit, the last line is cut with "...".
    - Blurbs come from a short shared table, so nothing is cut in practice. A test asserts every blurb is ≤ 48 chars.
  - **Need rows from y+170, pitch 28, up to 3 rows (the last ends at y+250):**
    - a 24 px slot with the icon at 1x;
    - the item name at x+332, in f13 (as are the counts);
    - `have/n` right-aligned at x+478, green if have ≥ n, red otherwise.
    - A hidden cell draws silhouette icons, no names, and `?` in place of the counts.
  - **y+258..+280:** a button 124 px wide, centred:
    - `Z: CRAFT`, `OWNED` or `Z: BUILD`;
    - greyed unless the cell is `ready`.
- **Message line:** `craft_msg`, centred at y+h-34, as today.
- The panel ends above the toast strip (y=420), as today.

### 2.2 Craft animation (juice; shell only, never touches engine state or `random`)
- **When it starts:** on a successful craft. The engine updates immediately, and its `fx_craft` / `juiceCraft` hook (§1.5) starts `CRAFT_FX`.
- **Where its state lives:** in a new shell object, `CraftFx` (Python) / `CRFX` (JS), in the style of `CaveFx`/`CFX`. It holds:
  - the timer;
  - the `before` counts;
  - its own fixed-size sparkle list.
- **Why not the battle particle pool:** that pool is bound to the battle. It resets on `bind` and does nothing when `battle is None` (py:4080-4084), so it can't be reused, and it is left untouched.
- **Clearing:** the shell clears `CraftFx` on any frame where `mode != "craft"`. That covers leaving CRAFT and a new game, so the STATE layer never touches it.
- **Its update:** advanced from the shell's frame update while `mode == "craft"`, in both builds.
- **What it plays:**
  - **fly** (`CRAFT_FLY_T = 0.30` s): one ghost icon per need flies from its detail-pane slot to the result slot, eased out;
  - **pop** (`CRAFT_POP_T = 0.25` s): the result scales 1.0 → `CRAFT_POP_SCALE = 1.35` → 1.0;
  - **sparkles:** `CRAFT_SPARKS = 8` in `CraftFx`'s own list, positions from `FX_RNG`/`fxRand` only;
  - a synthesized `craft` ding (two notes, through `Sfx._build`), which is added to the RENDER sound-buffer-length check.
- **The have counts:** while flying, the need rows show `before`; from the pop on, they show the live counts.
- **Reduced motion:** no fly, pop or sparkles. The result slot glows for `CRAFT_GLOW_T = 0.2` s, and the ding still plays.
- **Input:** Z, X or a move during the animation skips it to the end and is then handled normally. Input is never dropped.
- **Constants:** every `CRAFT_*` constant joins PARITY's shell-constants list.

### 2.3 BAG, battle BAG, shop
- Each list row draws its icon at 1x (16 px), vertically centred, left of the name. The name shifts right by 22 px.
- **No row height, row count or rect changes:**
  - BAG rows stay 26 px;
  - shop rows stay 30 px;
  - battle BAG rows stay 22 px.
- **What gets an icon:**
  - only item, material and loot rows;
  - not the section titles (`head`), the `none` rows, or the SHOP/LEAVE and BUY/SELL/BACK menu rows.
- **COINS:** every COINS line gets the `coins` icon at 1x. There are three, in each build:
  - BAG (py:5940 / html:5393);
  - the shop offer (py:6011 / html:5450);
  - the shop list (py:6022 / html:5461).
- The shop's description area is unchanged: no large icon, because there is no room above its quantity hint.

### 2.4 Drawing icons
- **Python:** `Shell.icon_surf(id, scale, mode)` builds a cached `pygame.Surface` per (id, scale, mode), with mode in normal/shadow/grey.
- **JS:** `iconCanvas(id, scale, mode)` caches an offscreen canvas.
- Both paint one `fillRect` per opaque pixel, so there is no smoothing. In JS, set `imageSmoothingEnabled = false` when blitting.

## 3. Old saves and compatibility
- **Old save formats:**
  - a save without `found` loads, with `found` seeded from holdings;
  - a save with junk in `found` loads cleanly, and the junk is dropped.
- Python and HTML saves stay separate, as today.

## 4. Tests

### SANDBOX, both suites
- **Icons:** every `ICONS` entry is 16 rows of 16, and every char is `.` or a palette key. `icon_id` resolves for:
  - every recipe need and out;
  - every `GOODS` key;
  - every `bag_rows` row of kind item, mat or loot;
  - every `SHOP_STOCK` id;
  - `coins`.
- **`note_found`:**
  - gains;
  - tool tiers;
  - `balls`, `lantern` and `pulses` → `pulse`.
- **`clean_found`:**
  - a list of valid ids;
  - junk entries;
  - a non-list.
- **Save and new game:**
  - `found` survives a save and load;
  - an old save without `found` seeds it;
  - junk is dropped;
  - `new_game` after a load clears old discoveries.
- **`craft_cells` state matrix:**
  - a fresh game: AXE, POTION, GREAT BALL and SMOKE are `hidden`. WALL, BALL, IRON PICK, OIL and PULSE are not hidden: WALL `locked`, OIL `locked` (no ORE);
  - after holding a TWIG once: AXE `locked`, not `hidden`;
  - with 2 TWIG and 1 FLINT: AXE `ready`;
  - after crafting: AXE `owned`;
  - BUILD `ready` iff wall > 0.
- **Crafting through cells:**
  - Z on a hidden cell crafts nothing and gives the message;
  - Z on a locked BUILD stays in CRAFT and gives its message;
  - a successful `craft_recipe` returns `True` and calls `fx_craft` once, with the right `before`. Failures don't call it.
- **Scrolling:** a synthetic 23-cell grid scrolls by rows.
- **`grid_move`:** an exhaustive check for n in 1..15. It never leaves the grid, left and right never change row, and down from the second-to-last row lands on a valid cell.

### RENDER, Python
- Every icon at 1x matches its table pixel for pixel.
- A hidden cell's icon area has only `ICON_SHADOW` or background pixels.
- A locked cell has no saturated pixel inside its icon area. Saturated means max(r,g,b) - min(r,g,b) ≥ 24.
- The selected outline is present.
- **The animation:**
  - frames at t = 0, 0.15, 0.3 and 0.5 stay inside `CRAFT_RECT`;
  - the engine `random` state is unchanged across the animation;
  - under `REDUCED_MOTION` there is no fly or pop offset.
- BAG, shop and battle BAG rows draw their icons inside the row rect.

### PARITY
- the full `ICON_PALETTE` and `ICONS`, plus `ICON_SHADOW`;
- `icon_id` over every id;
- `craft_cells` for 5 scripted game states;
- the `grid_move` matrix;
- `clean_found` cases;
- `CRAFT_BLURB` and `CRAFT_MSG`;
- `wrap`/`wrapText` with `max_lines` on a few fixed strings;
- every `CRAFT_*` shell constant, including the grid geometry.

`CRAFT_ROWS`/`CRAFT_ROW_H` are removed from the list.

### JS
- The JS suite covers the same pure checks.
- The screen goes through a pure `craftCellAt`/`craftView` helper that `drawCraft` itself uses, so the port is tested through the real draw decision (lesson `port-skips-integration-test`).

### Playtest
- MT-07: CRAFT grid, craft animation, discovery reveal.
- MT-10: phone portrait and landscape, D-pad grid moves.
- MT-11: reduced motion.
- BAG and shop icons on desktop and phone.

## 5. Order of work and owners
The steps run one after another. Steps 3-5 wait for `claude's monsters.html`, which session game-c9 is using; it will say when it's free.

1. **game-feel-engineer: the icon set.** `ICON_PALETTE`, `ICONS`, `icon_id` and `ICON_SHADOW` in py, plus the `emit_tables.py` coverage, with table tests.
2. **sandbox-designer: rules in py.** `found`/`note_found`/`clean_found`, save, load and new game, `craft_cells`, `grid_move`, CRAFT input, the `fx_craft` hook (§1.5) and §1.6 (py side), with SANDBOX tests.
3. **game-chore: port to HTML.** Emit, port 1-2 to the HTML, the JS tests and PARITY.
4. **game-feel-engineer: the screen.** The CRAFT screen and `CRAFT_FX` in both builds, with RENDER and PARITY constants.
5. **game-feel-engineer: list icons.** BAG, battle BAG and shop icons in both builds, with RENDER.
6. **Gates.** verify 8/8, then game-reviewer, then playtester (MT-07/10/11 plus BAG/shop).

Part B Chunk 5 (docs, MT-19, the final gates) runs after step 6, so the docs describe the new screen.

## 6. Risks
| Risk | Guard |
|---|---|
| Save format (`found`) | old-save and junk cases in both suites; PARITY on load cleaning |
| Icons drift between builds | emitted tables, plus PARITY on the full table |
| The animation touches engine state or random | the RENDER random-state check; juice through `FX_RNG` only |
| Input dropped during the animation | the skip-to-end rule, tested by pressing Z during the fly |
| Layout overlap at 640x480 | the RENDER rect checks, plus the playtest at phone sizes |
| `.py` CRLF lost to an editing tool | worker briefs forbid `sed -i` on the .py; check the CR count |
