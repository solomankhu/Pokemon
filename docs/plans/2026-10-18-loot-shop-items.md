# Loot, bag, coins, shop and battle items, Part A (DEEP)
Spec: `docs/superpowers/specs/2026-10-18-loot-shop-items-design.md`. Plan: `docs/superpowers/plans/2026-10-18-loot-shop-items.md`. Source: the user's sketch; Part B (crafting, the AXE, secret areas) comes later.

**Acceptance:**
1. **Loot:** a wild win has a 40% chance of a loot drop and a catch always drops one. Drops come 70% from the area table and 30% from the type table, with their own seeded roll. Trainers and the hunt never drop loot.
2. **Coins:** a wild win pays 3 x the foe's level, a trainer pays 20 x their highest level, and the gym adds a one-time 300 bonus. A blackout costs a quarter of your coins, the hunt included. You start with 100.
3. **Shop:** every CENTRE has a shop that sells BALL, GREAT BALL, POTION, SUPER POTION and SMOKE and buys loot. The free ball refill is gone, replaced by a safety net of 5 balls.
4. **BAG:** BAG replaces BALL in battle and BALLS in the overworld menu. In battle, items work as described in the spec, and refused items cost no turn and aren't used up.
5. **Unchanged:** saves gain bag, coins and battles, and old saves load with defaults. The engine random stream is untouched, and balance_report is byte-identical.

**Owners:** creature-designer for Chunks 1-3 (Python data and engine, then state, battle and saves, then the emitter, JS port and PARITY); game-feel-engineer for Chunk 4 (screens and 3D cues); the PM for Chunk 5.

## Review log
| # | Stage | Severity | Finding | Resolution |
|---|---|---|---|---|
| 1 | spec r1 | CRITICAL | `ITEMS` name clash with the item-ball table | Renamed to `GOODS` |
| 2 | spec r1 | CRITICAL | Messages queued in end_battle were lost at the fade | `reward_paid` re-entry, following the `hunt_paid` pattern |
| 3-8 | spec r1 | RISK | heal_party has no queue; undeclared test changes; text PARITY gaps; JSON number cleaning; no no-loot seam; fishing flag and PEARL farming | Fixed (count returned; declared list; FORCE_NO_LOOT; saved `battles` in the seed) |
| 9-10 | spec r1 | MINOR | Emitter needs; ambiguities | Fixed, PM decisions recorded in the spec |
| 11 | spec r2 | RISK | Hunt-lose coin loss unreachable | Moved into hunt_over |
| 12-14 | spec r2 | MINOR | Dead no-balls text; missing ball `item`; FORCE_NO_LOOT vs blackout | Fixed |
| 15 | plan r1 | CRITICAL | PARITY compares MENU_ITEMS, so a Python-only rename goes red | Rename done in both builds in Chunk 3 |
| 16-19 | plan r1 | IMPORTANT | Bag-mode soft-lock; grid cursor; empty-bag must be queued; CombatCommands layout | Fixed |
| 20-23 | plan r1 | MINOR | SHELL_KEYS; seed inputs; GREAT BALL decrement; heal_party callers | Fixed |
| 24-25 | plan r2 | MINOR | Plain JS battle opts; JS moveCursor | Fixed |
