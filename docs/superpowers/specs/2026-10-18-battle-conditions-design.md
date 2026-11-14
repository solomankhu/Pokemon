# Battle conditions and varied battle scenes: design

Date: 2026-10-18. Lane: DEEP. It touches the engine (`damage_calc`), shared tables and both builds.
Approved approach: **1, one condition per battle plus a fresh-looking scene each fight.** Weather does not change mid-battle.

## Goal
No two battles should look alike, and the weather sometimes changes the fight in a way the game announces. The rules are identical in `claude's monsters.py` and `claude's monsters.html` and are proven by PARITY. The looks are cosmetic and can never change an outcome.

## 1. Rules (DATA + ENGINE, both builds)

### Tables (Python is the source; `emit_tables.py` emits them to HTML)
`emit_tables.py` can't emit these tables yet: `js()` has no case for dicts, `obj()` handles only flat dicts, and `splice()` exits when the `const X =` head is missing. The work therefore includes:
- adding a nested-dict emitter, `emit_conditions`, and `emit_region_conditions` to `BLOCKS`;
- seeding placeholder `const CONDITIONS = {};` and `const REGION_CONDITIONS = {};` lines in the HTML before the first `--write`;
- updating the emitter docstring and CLAUDE.md's coverage list.

`CONDITIONS`: id → `name`, `msg`, `boost` (type → multiplier), `acc` (accuracy delta).

| id | name | msg | boost | acc |
|---|---|---|---|---|
| clear | CLEAR | (none) | {} | 0 |
| rain | RAIN | "Rain is pouring down!" | Water 1.2 | 0 |
| sun | SUN | "The sunlight is harsh!" | Fire 1.2 | 0 |
| fog | FOG | "A thick fog rolled in..." | {} | -10 |
| night | NIGHT | "Night has fallen." | Dark 1.2 | 0 |
| tremor | TREMOR | "The ground is trembling!" | Rock 1.2 | 0 |
| static | STATIC | "The air crackles with static..." | Electric 1.15 | 0 |

Final values (2026-10-18): the §3 balance rule fired (max win-rate change 13.3 points at 1.25/0.8, still 11.8 at 1.2/0.83), so the user chose boost only: no penalties anywhere, 1.2 boosts and static at 1.15 (max change now 8.0).

`REGION_CONDITIONS`: region name (as `region_name(y)` returns it) → weighted list. There is one extra key, `"FISHING"`, for fishing battles.

| region | weights |
|---|---|
| CEDAR TOWN, ROUTE ONE | clear 1 (always clear, so a new player's first fights carry no rule) |
| DEEPWOOD | clear 5, rain 2, fog 2, night 1 |
| SEASIDE, FISHING | clear 4, rain 3, sun 2, fog 1 |
| RIDGE TOWN | clear 5, sun 2, rain 2, night 1 |
| ROCKY PASS | clear 4, tremor 3, sun 2, fog 1 |
| DARK CAVE | static 3, clear 2, tremor 1 |
| SPIRE RUINS | clear 3, fog 3, night 2, static 1 |
| TRAIL SUMMIT, THE TRAIL (fallback) | clear 4, sun 2, rain 1, night 1 |

**Fixed:** the gym (`trainer["id"] == "gym"`) is always `clear`, and a hunt is always `static`.

### `battle_condition(region, trainer, hunt, seed)`
A pure function. It returns a condition id.
- **Fixed cases:** the gym gives `clear`, a hunt gives `static`, and an unknown region uses the THE TRAIL row.
- **Otherwise:** `rng = mulberry32(seed)` (the existing helper), and the weighted pick uses that rng's first value, `pick = rng() * total`, walking the list in table order.
- **Seed:** `((G.steps * 31 + G.player.tx * 977 + G.player.ty * 131) ^ 0xC0DE7) >>> 0`. Python reads `self.steps`, `self.player.tx` and `self.player.ty`, and masks with `& 0xFFFFFFFF`. The XOR salt keeps this stream independent of `cave_rng = mulberry32(steps)`.
- **Never** uses `random` / `Math.random`, so the engine's random stream is untouched.

### `damage_calc(..., condition=None)` (JS: `damageCalc(..., condition)`, appended last)
- **Accuracy:** `acc = mv["acc"] + CONDITIONS[c]["acc"]` when `mv["acc"] < 999`. The miss test is the same `rnd() * 100 >= acc`. JS's existing test is `mv.acc * accStage`, so it becomes `(mv.acc + c.acc) * accStage`. Moves at 999, which can't miss, stay unaffected.
- **Boost:** after the type-effectiveness step, `dmg = int(dmg * CONDITIONS[c]["boost"].get(mv["type"], 1))`. Immunity is decided by `eff == 0` and still returns 0.
- **No condition:** `condition=None` or `clear` gives results identical to today's, and the number of `rnd()` calls is unchanged in every case.
- **Callers:** every call made from a battle passes `b.condition`, for both the player's and the foe's moves (py ~1957, html ~1754). These callers keep the default:
  - `.claude/skills/balance-report/balance_report.py`;
  - `combat/balance-report.cjs`;
  - `combat/commands_py_test.py`;
  - `combat/integration.test.js` and `combat/engine-regression.test.js`;
  - the main suites.

  Every one of them is positional, so appending the parameter last is safe.

### Battle flow
- **Storage:** `Battle.condition` is set in `start_battle` before anything is queued. It is **not saved**, because battles aren't saved mid-fight.
- **Announcement:** one `q_msg(CONDITIONS[c]["msg"])` runs, unless the condition is clear. It is queued **immediately before `"Go, X!"`** in all three branches: wild, trainer (after both trainer lines) and hunt (after the whole scare queue, so the jumpscare timing doesn't change). Everything goes through the `q_*` helpers.
- **Fishing:** Python's `start_battle` gains `fishing=False`, and the fishing path (py ~2575) passes `fishing=True`. JS already passes `{fishing:true}`. A fishing battle uses the `"FISHING"` region key.
- **Test seam:** both builds get an override, a module-level `FORCE_CONDITION = None` (py) and `G.forceCondition = null` (js).
  - **Precedence:** when it is set to an id in `CONDITIONS`, it beats every rule, including the gym and hunt rules. An unknown id is ignored, and `battle_condition` runs normally.
  - **Never saved:** it isn't added to the explicit save field lists (html ~2388/2419).
  - **Access:** MT-17 sets it through the `__GAME__` export `setForceCondition(id)`.
- **Existing tests stay untouched.** Both suites set `FORCE_CONDITION = "clear"` / `G.forceCondition = 'clear'` once at the top, before any battle test. That covers the hunt, cave, trainer, gym and scripted-playthrough tests. Only the new condition tests opt out, and they restore it in try/finally. With `clear` forced, every existing expectation is identical. The hunt intro lists at `claude's monsters.test.py:628` and `claude's monsters.test.js:511` don't change either, because the override wins over the hunt rule. One new test proves an unforced hunt queues the static message right before "Go".

## 2. Looks (SHELL only)

### Arena kind (both builds)
Both builds get a pure `arena_kind(region, tile, fishing, hunt)` / `arenaKind(...)`, which is the logic of today's `battleArenaKind()` made pure:
- a hunt gives `cave`;
- fishing gives `shore`;
- otherwise it is decided by region and tile.

**Deliberate fix:** today's shore branch tests `COAST|BEACH|SHORE`, and no region has those names, so it never fires. The new `arena_kind` maps **SEASIDE** to `shore`, which means SEASIDE battles look different from today. The `shore` regional extra is `none`.

`battleArenaKind()` and `battleSnapshot` call it, and Python gets it so `battle_scene` can be PARITY-compared. `kind` is stored as `Battle.arena`.

### Scene descriptor
`battle_scene(condition, kind, seed)` returns `{layout, time, weather, camera}`. It uses its own `mulberry32(seed ^ 0x5CE7E)`, never the engine stream or `FX_RNG`/`fxRand`.

| Field | Values |
|---|---|
| `layout` | uint32 |
| `time` | dawn / day / dusk / night. Night is forced by `night`; it is `night` in the cave; otherwise weighted day 5, dusk 2, dawn 2, night 1 |
| `weather` | `rain`, `fog`, `sun`, `dust` (tremor), `sparks` (static). Clear adds a regional extra: `leaves` (meadow), `snow` (pass), `motes` (ruins or cave), or `none` |
| `camera` | 0..3 (preset index) |

The browser passes it in `battleSnapshot()` as `scene`.

### 3D (browser, `combat/arenas.js` and `combat/presenter.js`)
- **Props:** `buildArena(T, kind, quality, scene)` jitters prop positions and sizes from `layout`. Props stay out of a clear band around both platforms.
- **Lighting:** the time of day sets the hemisphere and key light colour and strength, plus the scene background and `T.Fog` colour. Fog weather pulls the fog near.
- **Weather particles:** one `T.Points` pool for each arena.
  - **Size cap:** at most `WEATHER_MAX` (HIGH 600, STANDARD 300, LOW 120).
  - **Animation:** in `presenter.update`.
  - **Disposal:** with the arena.
  - **Reduced motion:** no falling or drifting particles and no tremor sway. Fog, tints and lighting stay.
- **Scene-wide state lives in the presenter.** `scene.fog`, `scene.background` and the camera base are scene-wide; today fog is set once in `initialize` (presenter.js:103), and the camera base is the frozen `JUICE.CAM_POS`. The presenter applies fog, background and the camera preset from `snapshot.scene` when it builds an arena, and restores the defaults in `clearBattle`. `buildArena` owns only meshes, lights and particles.
- **Default scene:** when `snapshot.scene` is missing, as in the existing presenter tests, the presenter uses `DEFAULT_SCENE = {layout:0, time:'day', weather:'none', camera:0}`. Layout 0 reproduces today's prop placement exactly. The key stays stable, so the arena never rebuilds every frame (tested).
- **Cache key:** today the presenter rebuilds when `arena.kind !== kind` (presenter.js:109). It now rebuilds when `kind|layout|time|weather|camera` changes, so a direct battle-to-battle transition still gets a new scene. A presenter test calls `sync` twice with different scenes and asserts that the arena was rebuilt.
- **Camera presets:** 4 offsets of the current base position and look target, each a small yaw or pitch change. A test asserts that every preset keeps `projected.foe.y < 286` (the 3D player HP box) and both rigs on screen.

### 2D (Python `Shell.draw_battle`, plus the HTML 2D arena)
- **Background:** a sky-band colour and a full-screen tint by time of day.
- **Weather:** particles drawn behind the HP boxes, using a small pool of their own.
- **Fixed:** platforms, sprites and HP boxes stay exactly where they are now (the player box at y=248, and the foe platform ending at y=240).

### HUD tag
A small `RAIN` / `FOG` / ... text tag sits just under the foe HP box, and there is no tag for clear. In 3D it is a DOM tag positioned in canvas-scaled units, following lesson `overlay-fixed-css-px`. In 2D it is drawn on the canvas. ASCII text only.

### Audio
A quiet synthesized loop for rain and for static, made with the existing synthesis, with no assets. It stops when the battle ends.

## 3. Testing
- **Engine, in both suites:**
  - each condition's boost applies to its types and only to those;
  - fog turns an acc-100 roll of 0.95 from a hit into a miss, and a 999 move never misses;
  - an immune matchup still gives 0;
  - `rnd` is called the same number of times with and without a condition;
  - `condition=None` matches today's output over a fuzz of 500 calls.
- **`battle_condition`:**
  - it is deterministic;
  - every region yields only the ids in its own list, and the rough frequencies over 2000 seeds are within tolerance;
  - the gym, hunt and ROUTE ONE/CEDAR TOWN cases are fixed;
  - `start_battle` leaves `random.getstate()` (Python) / the `Math.random` call count (JS) unchanged, following the scare-intro test pattern.
- **Battle flow:**
  - the message is queued after the intro, and the hunt's message comes after the scare;
  - a clear battle has no extra message;
  - the battle's damage uses `b.condition`.
- **PARITY:** the battle seed for 20 (steps, tx, ty) triples, the two tables, plus 500 `battle_condition` results over (region, seed) pairs, and `battle_scene` for the same seeds, compared across builds.
- **Scene (combat suite):**
  - the scene descriptor is deterministic;
  - the camera-preset projection holds;
  - the particle pool stays within the cap;
  - building and disposing arenas leaks no geometry or materials across 20 rebuilds;
  - Reduced motion turns off falling particles and the sway;
  - the scene picker never calls `Math.random` or `fxRand`.
- **RENDER (Python):** every condition × time of day is drawn in the battle frame, and pixel checks show the HP boxes are unchanged.
- **Balance:** `balance_report.py` is run before and after. It doesn't change: it uses the default `condition=None`, so its numbers must be **identical**. That doubles as a regression proof. Separately, the creature-designer runs a scratch script (not committed) over the three starters against each region's wild pool, at that region's levels, once per condition, and reports the win-rate change from clear. If any change is more than 8 points, the boosts drop to 1.2/0.83 and the script is run again.
- **Playtest:** the new duty MT-17 forces each condition through a `__GAME__` seam, takes screenshots in 3D and 2D, checks 390x844 and 844x390, and the console stays clean.

## Out of scope
Weather changing mid-battle, effects on catch odds or XP, chip damage, saving conditions, and Static Below changes. The webcam horror work is a separate spec.
