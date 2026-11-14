# Battle conditions and varied scenes (DEEP)
Spec: `docs/superpowers/specs/2026-10-18-battle-conditions-design.md`. Detailed steps and code: `docs/superpowers/plans/2026-10-18-battle-conditions.md`.

**Goal and acceptance:**
1. Each battle rolls one condition from `REGION_CONDITIONS`, using its own `mulberry32` seed taken from (steps, tx, ty). A hunt is always static, the gym is always clear, and CEDAR TOWN and ROUTE ONE are always clear. A non-clear condition is announced right before "Go, X!".
2. `damage_calc` / `damageCalc(..., condition)` gives ×1.25 or ×0.8 type boosts and fog −10 accuracy. With no condition, the output is identical to today's, the number of rng calls is unchanged, and immunities stay 0.
3. The global `random` / `Math.random` stream is untouched: no change in `random.getstate()` and no extra `Math.random` calls.
4. Every battle draws a varied scene: the layout, time of day, weather particles and camera preset, in 3D and in both 2D arenas. A condition tag is shown, and the foe stays above y=248.
5. PARITY covers the tables, the seed, 500 rolls, the scenes and the 2D look tables. The balance report's output is byte-identical.

**Files and owners, in sequence:**
1. creature-designer, Chunks 1-2:
   - `claude's monsters.py`;
   - `claude's monsters.html` (DATA/ENGINE/STATE);
   - `.claude/skills/add-monster/emit_tables.py`;
   - both suites, including PARITY.
2. game-feel-engineer, Chunks 3-4:
   - `combat/arenas.js`, `combat/presenter.js` and `combat/host.js`, plus the combat tests;
   - the 2D and Sfx shells of both builds;
   - the RENDER and SHELL JUICE tests.
3. PM, Chunk 5: docs, MT-17 and the gates.

**Risks:** engine rng, the step queue (one `q_msg`), shared tables, and the RENDER pixel tests. These are handled by the `FORCE_CONDITION`/`FORCE_SCENE` seams set in both suites, the byte-identical day sky, and nothing new drawn after the HUD.

**Verification:**
- `verify.js --only py,combatpy`, then `--only py,js,combat,tables`, then the full gate;
- game-reviewer;
- playtester `full` (MT-17).

## Review log
| # | Stage | Severity | Finding | Resolution |
|---|---|---|---|---|
| 1 | spec r1 | CRITICAL | Hunt/wild exact-intro tests break | Both suites force clear (`FORCE_CONDITION`) |
| 2 | spec r1 | CRITICAL | emit_tables can't emit nested dicts | New emitters plus placeholders |
| 3-7 | spec r1 | RISK | Fishing flag, message placement, Python arena kind, scene-wide fog/camera, arena cache key | All specified |
| 8-10 | spec r1 | MINOR | JS accStage, balance pass, seed salt | Fixed |
| 11-15 | spec r2 | RISK/MINOR | Seam precedence/validation, old tests, default scene, SEASIDE→shore, seed PARITY | Fixed |
| 16 | plan r1 | CRITICAL | `q_msg` key is `s`; there is no `new_game` helper | Fixed in Task 1.5 |
| 17-22 | plan r1 | RISK | RENDER vs scene looks (FORCE_SCENE), headless projection, view.scene, tuple PARITY, audio loop decay | Fixed |
| 23-28 | plan r1 | MINOR | Tag spot and call site, deviations, fxRand proof, tile, balance step, combat note | Fixed |
| 29-32 | plan r2 | RISK/MINOR | Clearance test vs the decor ring, byte-identical day sky and draw order, fxSeed getter, pool reset | Fixed |
