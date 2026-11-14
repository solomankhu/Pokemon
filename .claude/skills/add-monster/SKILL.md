---
name: add-monster
description: Add or change a MONSTER TRAIL species, move, evolution, starter, encounter zone or map rows, in BOTH the pygame and HTML builds, keeping the parity test green. Use whenever a SPECIES/MOVES/ZONES/MAP/STARTERS table changes.
---

# Add a monster (or any table change) to MONSTER TRAIL

`claude's monsters.py` is the source of truth for the tables. The HTML build's copies are **re-emitted, never hand-typed**, by `emit_tables.py` in this folder.

## Steps

1. **Measure the gap.** Run `.venv/Scripts/python.exe .claude/skills/balance-report/balance_report.py`. Decide where the new species sits: target BST, stat shape, the zone(s) and levels it spawns at, catch rate, evolution level.

2. **Edit the Python tables only** (`claude's monsters.py`):
   - `MOVES` (new move): `dict(name=, type=, pow=, acc=, cat="phys"|"spec"|"status")`, plus optional `eff=(stat_key, stages, "foe"|"self")`, `prio=1` or `high_crit=True`. Stat keys are `atk`, `def_`, `spa`, `spd`, `spe`. Note the underscore in `def_`: `def` silently breaks the move.
   - `SPECIES`: `name` (CAPS), `types` (1-2 from `TYPE_COLOR`), `base` (all six `STAT_KEYS`), `catch_rate` (3-255), `base_exp`, `art=dict(kind=..., c1=(r,g,b), c2=(r,g,b), <flags>)`, `learn=[(level, move_id), ...]` sorted by level with at least one move at level 1, and `evo=(species_id, level)` or `None`.
   - `art.kind` must be an existing `draw_creature` branch (`quad serpent plant rodent bug bird bat gear crab spark rock ooze wisp`). A **new kind** means writing a draw branch in *both* builds' `draw_creature`; it can't be emitted.
   - Make it catchable: add `(species_id, weight)` to a `ZONES` (grass) or `WATER_ZONES` (fishing) pool. The species then needs to be reachable, and the suite checks that.
   - Map rows must stay exactly `MAP_W` (88) characters. Grass tiles must sit inside a zone.

3. **Re-emit the HTML tables:**
   ```bash
   .venv/Scripts/python.exe .claude/skills/add-monster/emit_tables.py          # dry run: shows the diff
   .venv/Scripts/python.exe .claude/skills/add-monster/emit_tables.py --write  # splices it in
   ```
   This rewrites `MOVES`, `SPECIES`, `STARTERS`, `MAP`, `ZONES`, `MATERIALS`, `BLOCKS` and `RECIPES` in the .html. It does **not** cover `TYPE_CHART`, `WATER_ZONES`, `NPCS`, `SIGNS`, `ITEMS` or `GYM_LEADER`. Port those by hand (Python `def_` becomes JS `def`, `catch_rate` becomes `catchRate`, RGB tuples become `'#rrggbb'`), or extend `BLOCKS` in the script.

4. **Verify both builds:**
   ```bash
   .venv/Scripts/python.exe "claude's monsters.test.py"
   node "claude's monsters.test.js"
   ```
   Both must end with `N checks passed.` and PARITY must say the tables are identical. Then re-run the balance report and confirm the newcomer lands where you aimed (duel wins track its BST and evolution stage).

5. **Look at it.** A new species or kind should be seen. Use the `browser-playtest` skill on the HTML build, or run the Python build.

## Gotchas
- The JS `art` dict follows Python's key order after emitting. That's harmless, because parity compares `kind` only.
- Gym access depends on `GYM_REQUIREMENT` trainers. New trainers placed on the 2-wide trunk road must leave a way around, since NPCs are solid.
- Don't add status conditions, items or shops. Those are out of scope by design (see CLAUDE.md).
