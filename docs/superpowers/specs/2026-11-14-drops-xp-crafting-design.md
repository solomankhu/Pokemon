# More XP, generous drops, and a use for every drop: design

**Status:** draft for the user's approval (2026-11-14). **Lane:** DEEP. It touches engine XP, the loot rng
draw order, shared tables, save fields, the `edits` overlay and reachability.
**User choices (2026-11-14):** 1.5x XP; every wild win drops 1-2 items plus a ~1 in 10 rare;
new recipes in all four kinds (healing/buff, capture/utility, building blocks, gear upgrades).
**Goal, Minecraft-style:** every fight pays out something, and every drop is an ingredient for
something. No drop exists only to be sold.

## Baseline (measured)
- `xp_from_faint = base_exp * level / 7` (median base_exp 92). Wild wins per level: 2.5 at L10,
  4.8 at L20, 7.1 at L30.
- `loot_roll`: 40% of wild wins drop (catches always do), 1 item, 70% from the region pool, 30% from the type.
- 13 of 18 loot ids feed no recipe: softfur, treesap, shell, seasalt, grit, glowmoss,
  glowcrystal, dust, relicshard, scale, pearl, venomsac, feather.

## Phase A: XP and drops (engine; both builds; PARITY)
- **XP:** `XP_MULT = 1.5` and `xp_from_faint = max(1, int(base_exp * level * XP_MULT / 7))`.
  Integer maths, so it is identical in both builds. Trainer battles use the same function.
  Expected wins per level: 1.7 at L10, 3.2 at L20, 4.7 at L30.
  - `balance-report` runs before and after.
  - The gym and the GLOOMSTALK hunt must still not be trivially over-levelled on the normal
    route. Check the level the player arrives at against the leader's level.
- **Drops**, in `loot_roll`, which stays pure with its own mulberry32 and a fixed draw order:
  1. every wild win drops (`LOOT_WIN_CHANCE` goes away; trainers and the hunt still drop nothing);
  2. the item is chosen exactly as today (area share 0.7, weighted pool, else type);
  3. the count is 1, or 2 with `LOOT_DOUBLE = 0.35`;
  4. a rare roll: with `LOOT_RARE = 0.10`, add 1 of the region's rare item (the weight-1 pool entry).
     FISHING's rare is pearl.
  - It returns a list of `(id, n)`, and the message names each item.
  - `BAG_MAX` caps each stack as now.
- **Risks:**
  - Every existing loot trace and pinned test changes, so PARITY needs a new trace (lesson
    `state-seed-cross-game-compare`).
  - Coin balance is unchanged.

## Phase B: consumables and utility (recipes into the bag; both builds)
| Recipe | Needs | Effect |
|---|---|---|
| SUPER POTION | 1 treesap + 2 leaf | existing item (heals 50) |
| SEA TONIC | 1 seasalt + 1 dewdrop | battle BAG: user's ATTACK +1 stage (existing stat stages) |
| SHELL GUARD | 2 shell + 1 scale | battle BAG: user's DEFENSE +1 stage |
| GLOW TEA | 2 glowmoss | +40 lantern (cap 100), an ore-free alternative to OIL |
| FEATHER LURE | 2 feather + 1 softfur | the next 40 grass steps roll encounters at 2x `ENC_BASE` (the same single random call) |
| REPEL | 1 venomsac + 2 grit | no wild encounters for 60 steps. The cave stalker and hunts are **not** affected (horror kit intact) |
| PEARL BALL | 1 pearl + 1 relicshard + 1 ore | catch modifier 2.5x (GREAT BALL is the existing step below) |

- Lure and repel counters are new save fields; old saves default to 0.
- Lure and repel never stack; using one ends the other.
- Status conditions stay out of scope (CLAUDE.md), so there are no "cure" items.

## Phase C: building blocks (BUILD; sandbox rules unchanged)
| Block | Needs | Glyph | Notes |
|---|---|---|---|
| SHELL BLOCK | 2 shell + 1 grit | new `edits` glyph | solid, like `W` |
| DUST BRICK | 3 dust | new glyph | solid |
| GLOW LAMP | 1 glowcrystal + 1 glowmoss | new glyph | solid; a decorative glow sprite. **Not** placeable in `CAVE_BAND`, so the lantern/darkness/stalker rules are untouched |

- They place through the existing `placement_ok`: the same ground rule and the same
  no-cut-off BFS. They are mineable back with the PICK and refund 1 block.
- `load_edits` accepts only these glyphs on buildable tiles. Gated-reachability equality is unchanged.
- The BUILD flow gains a block picker. Today BUILD places WALLs only; the CRAFT BUILD cell
  opens a small choice of the blocks you hold.

## Phase D: gear upgrades (after crafted weapons ship; see 2026-11-14-crafted-weapons-design.md)
- VENOM SPEAR: IRON SPEAR + 1 venomsac + 1 relicshard. +5% foe max HP damage, same durability.
- FEATHER CLUB: WOOD CLUB + 2 feather. Durability +3.
- This phase is specified in that feature's plan, not here.

## Icons, discovery and the CRAFT grid
- Every new item and block gets a 16x16 icon in `ICONS` (emitted).
- Discovery stays as is: a recipe is hidden until one ingredient is found.
- The grid grows from 10 to about 19 cells, so the existing scroll (4 rows of 5) carries it.

## Order and gates
1. Visual crafting Chunk 6 (gates) and Part B Chunk 5 (docs) finish first, so the docs describe the final screen.
2. Phase A, then B, then C, each a plan-with-review DEEP chunk set: verify, then review, then playtest.
3. Phase D folds into the crafted-weapons plan.

## Out of scope
Status cures, night/day, new regions, changes to coin rewards, trainer or hunt drops.
