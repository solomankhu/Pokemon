# Part B: AXE, glades, crafting from loot (DEEP)
Spec: `docs/superpowers/specs/2026-10-23-axe-glades-loot-crafting-design.md`. Full step plan: `docs/superpowers/plans/2026-10-23-axe-glades-loot-crafting.md`. Source: the user's sketch, as approved in brainstorming on 2026-10-23.

**Goal and acceptance criteria**
- `T` THICK TREE: solid, `tool="axe"`, authored-only, two of them at (19,84) and (71,84). `can_mine(..., axe)` lets the AXE cut only `T`, and no PICK cuts it.
- The AXE (2 TWIG + 1 FLINT, `sets_tool`) can be crafted once and sets `flags["axe"]=1`. Old saves load as 0, and `axe_tier` normalises junk.
- POTION, GREAT BALL and SMOKE craft from bag loot into the bag, refuse at `BAG_MAX`, and every loot recipe's inputs sell for less than its output costs.
- MOSS HOLLOW (4,81,19,87) and OLD GROVE (71,81,84,87) are sealed. Each holds 1 ball and 1 dark-grass zone; `GATED_REGIONS` lists them, and breaking every gate opens exactly those regions.
- PARITY is green with ITEMS amounts, `GATED_REGIONS`, the `can_mine` matrix, `craft_rows` and the `load_edits` T cases. The CRAFT list scrolls (11 rows), and the `T` sprite is distinct.

**Order and owners.** Everything runs in sequence, and **every chunk ends 8/8 green**, because reviewer Step 0 blocks on red. Each chunk ships Python + emit + JS + PARITY together.
| Chunk | Owner | Files |
|---|---|---|
| 0 | PM | PROGRESS.md, wiki harness.md/story.md |
| 1 | game-feel-engineer | py + html: scrolling CRAFT (CRAFT_ROWS, list_top, scroll_cue); count-independent RENDER/JS tests |
| 2 | sandbox-designer, then game-chore | py: SOLID, BLOCKS, axe_tier, can_mine, craft, craft_label/have, bag_room, craft_rows, Game.interact/mine/craft_recipe, flags/load, CRAFT header; emit (tool, setsTool); html port; test.js; PARITY |
| 3 | sandbox-designer, creature-designer, then game-chore | py: generalised gated rule, MAP rows 81-87, ZONES, ITEMS, SIGNS, GATED_REGIONS, playthrough, balance; emit; html; test.js; PARITY |
| 4 | game-feel-engineer, plus narrative-designer | py + html: draw_tile T, glade_masked; RENDER; sign wording; playtest MT-07/10/11 |
| 5 | PM | CLAUDE.md, skills, wiki, MT-19; full gates |

The full review log is at the end of the step plan.

**Risks**
- MAP reachability: the gated rule is generalised first, so it's green on today's map before the map changes.
- Save format: only one flag is added, and `load_edits` is unchanged. Old-save and junk tests cover it.
- Shared tables: PARITY is red between chunks 1 and 3. That is expected and listed per chunk, and the reviewer checks that list.
- RNG: no new randomness. The farm test uses the deterministic loot seed.
- 640x480: the CRAFT list stays inside `CRAFT_RECT` (RENDER checks every cursor position).
- Trunk road: no edits near x42/43.

**Verification:** `verify.js --only py,tables` (chunks 1-2, with the expected PARITY failures listed), `--only py,js,tables` (chunk 3), then the full `verify.js` (chunks 4-5). Playtest MT-19 plus MT-04/05/06/09/13/14/18 `full`.
