# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

**MONSTER TRAIL** is one browser campaign with the embedded underground chapter **THE STATIC BELOW**. Beat the gym, descend, then return with shared progress in the same window. See `docs/unified-game-playtest.md` and `docs/superpowers/specs/2026-10-17-unified-monster-trail-design.md`; the older `docs/finale-handoff-spec.md` is historical. The pygame RPG remains standalone. There is no build system, package manifest or linter.

| File | Title | Stack | Role |
|---|---|---|---|
| [claude's monsters.py](claude's%20monsters.py) | MONSTER TRAIL | Python + pygame | Creature-collector RPG (primary build) |
| [claude's monsters.html](claude's%20monsters.html) | MONSTER TRAIL | Canvas 2D + campaign.js | Main browser campaign; shared RPG tables kept at parity |
| [gemini's code.html](gemini's%20code.html) | THE STATIC BELOW | Vendored three.js r128 | Embedded three-floor chapter; also playable standalone |

Filenames contain a space and an apostrophe. Always quote them in shell commands:
`.venv/Scripts/python.exe "claude's monsters.py"` — not `.venv/Scripts/python.exe claude's monsters.py`.

## Running

**Both HTML games** need no build, server, or install — open them directly in a browser.
- `gemini's code.html` loads pinned three.js r128 from `vendor/` first, with CDN mirrors only as fallback. Normal play works offline. Click the overlay (desktop) to acquire pointer lock; on touch it uses on-screen controls.
- `claude's monsters.html` has no external dependency at all and works offline.

**MONSTER TRAIL's Python build** needs pygame, which is installed in `.venv/` (uv-seeded, CPython 3.13, pygame 2.6.1). The system Python does **not** have it, so use the venv interpreter:

```bash
.venv/Scripts/python.exe "claude's monsters.py"
```

Gemini's game has its own suite, `node "gemini's code.test.js"`, but visual changes still need a browser check (`browser-playtest` skill). MONSTER TRAIL is tested in both builds: see its architecture section below.

**One gate for everything:** `node .claude/scripts/verify.js` runs every suite (py, js, gemini, campaign, combat, combatpy), the harness hook tests and the `emit_tables` parity dry run, and prints PASS/FAIL per check. `--auto` runs only the checks whose inputs changed since the last green run; `--only py,tables` picks checks. Don't pipe suites through `tail`/`head`, because that hides the exit code. Details are in `docs/wiki/testing.md`.

`combat/` holds the 3D battle presentation (plan: `docs/superpowers/plans/2026-10-17-3d-combat.md`). Its suites are `node combat/verify.cjs` (every `combat/*.test.js`) and `.venv/Scripts/python.exe combat/commands_py_test.py`; `claude's monsters.py` imports `combat.commands`, so tools that load the game by path must put the repo root on `sys.path` (lesson `tool-import-path`).

This directory is **not a git repository**, so there is no history to diff against or revert to.

## Unified browser campaign

`campaign.js` owns the versioned chapter metadata and parent/frame lifecycle. `claude's monsters.html` remains loaded while its RPG updates, rendering, sound and input pause. Source/origin/session-validated messages carry readiness, stage checkpoints, completion and return. Only the active frame can update the campaign. Browser saves retain the full RPG state plus chapter metadata; checkpoint resume starts at the beginning of a floor. Old saves infer unlock from the gym flag. Python saves are separate.

The chapter now has three distinct authored floors (Intake, Archives, Signal Core). Each `stageConfigs[n]` owns walls, rooms, refuge and exit; simulation, navigation and rendering use those same walls. `getNav(n)` caches a grid per floor. The exported legacy `walls` fixture remains only for collision regression tests. Arrival refuges exclude enemies and protect oxygen/sanity; all terminals lie outside. Paused FLOOR PLAN uses numbered rooms with a readable legend and accessible connectivity description.

Run `node campaign.test.js` alongside both existing JavaScript suites and the Python suite. The real Chromium flow and touch/layout scenarios are documented in `docs/unified-game-playtest.md`. Source backups and evidence are under `.superpowers/sdd/2026-10-17-unified-monster-trail/` because this workspace has no Git history.

## Architecture: gemini's code.html

THE STATIC BELOW is **MONSTER TRAIL's embedded underground chapter**: beating the gym unlocks it through `campaign.js`. It is one inline `<script>` with two layers, and the boundary between them is load-bearing.

**SIM** is pure, with no THREE or DOM:
- `stageConfigs` is the content layer. Each floor owns its wall geometry, room graph, refuge, exit, entities and difficulty numbers.
- Collision is `moveBox` on square bodies, pushing out X then Z, which gives wall sliding.
- Navigation: `buildNavGrid` is cached per floor. One Dijkstra flow field from the player is re-planned every `NAV_REPLAN_TICKS`, and enemies string-pull it through `pickWaypoint`. Stage walls stop both enemies and knockback.
- The `createSim`/`stepSim` state machine has `status` play/scare/cleared/dead/won. It emits `sim.events` and never touches the screen.

**SHELL** is three.js, WebAudio (`Sfx`, synthesized, no assets), the DOM HUD and menus, input and the loop. It drains the sim's events for sound, effects and UI.
- `setupStage(n)` builds a new sim plus `buildStageView`.
- `clearEntities()` disposes per-stage materials and lights. Shared geometry lives in `makeAssets`.

The rest:
- **Fixed timestep.** `animate()` steps `stepSim` at `SIM_STEP = 1/60`, and every rate is **per tick**. Rendering interpolates the player, camera and enemies by `alpha = simAcc / SIM_STEP`. Keep new rates per tick; keep cosmetic timing (shake, flashes, intro) in seconds, in the shell.
- **One input path.** Keyboard, mouse, the touch joystick/look zone and the on-screen buttons all call `press(action)`/`release(action)` through `KEYMAP`. Touch UI shows on coarse pointers or after the first touch.
- **Loading.** `loadThree()` loads three.js r128 behind a boot panel, trying the vendored runtime first, then CDN mirrors. Failure shows Retry and an embedded Return to Trail option.
- **Handoff arrival.** `?from=trail` and/or `localStorage["monsterTrail.handoff"]` go through `resolveArrival`/`parseHandoff`, which tolerate missing, garbage or old records and clean the name. A record is consumed once and rendered with `textContent` only; a test bans `innerHTML`. With no handoff, it starts standalone.
- **Enemies.** Resonators drain sanity, through walls, and the jammer blocks them. Stalkers drain oxygen, need a clear line, and only the pulse stops them. Contact starts a 72-tick jumpscare, and `status === 'scare'` freezes the rest of the sim.
- **Reduced motion.** The system setting, or the in-game Motion option (Auto/Full/Reduced), removes shake, flash, lunge and head bob. Settings persist in `localStorage["staticBelow.settings"]`.
- **Tests.** `node "gemini's code.test.js"` runs 497 checks and exits non-zero on failure. It evals the script headless with a tiny THREE stub and covers:
  - stage placement and reachability, and per-tick rates;
  - collision fuzzing, and enemies routing around walls;
  - the pulse cone, and stage/death flow;
  - a difficulty readout (route vs oxygen per stage; the margins must shrink each stage and stay at or above 1.4x);
  - input math and handoff parsing;
  - stage build/dispose leaks.

  Keep SIM import-safe. Playtests can use `__STATIC__.debug` (`play()`, `setupStage`, `press`, `overhead(true)`), because pointer lock is refused under automation.
- **Keep the file pure ASCII.** Some editing tools decode backslash-u / backslash-x escapes, so the name-stripping regex is built from code points (`NAME_STRIP`).

## Architecture: MONSTER TRAIL (claude's monsters.py / .html)

The same game in two implementations: **26 species across 12 types** (25 catchable, plus the DARK CAVE's uncatchable GLOOMSTALK), on an **88x110 world of nine regions**. **`claude's monsters.py` (pygame) is the primary one**; the `.html` build came first and is kept as a straight port. They share one design, so a change to a mechanic or a table belongs in *both* - the suite's PARITY section fails the build if they diverge.

Four layers, and the boundary between them is load-bearing:

1. **DATA** - `TYPE_CHART`, `MOVES`, `SPECIES`, `MAP`, `ZONES`. Pure tables. A new creature is one `SPECIES` entry; a new area is one `ZONES` entry.
2. **ENGINE** - `damage_calc`, `catch_roll`, `gain_xp`, `stat_at`. Pure functions with an **injectable `rng`**, no display access and no global reads.
3. **STATE** - the `Game` object and its `mode` machine (`title`/`overworld`/`battle`/`menu`/`party`/`dialogue`/`starter`/`victory`/`craft`).
4. **SHELL** - rendering, input, main loop. The only layer that touches pygame's display.

**Layers 1-3 never open a window, and `main()` sits behind an `if __name__ == "__main__"` guard**. That is what makes the suite possible:

```bash
.venv/Scripts/python.exe "claude's monsters.test.py"    # ~4880 checks, non-zero exit on failure
node "claude's monsters.test.js"                        # the HTML port's equivalent, ~3260
```

**The HTML build's data tables are generated from the Python ones, not hand-typed.** When a table changes, re-emit with `.venv/Scripts/python.exe .claude/skills/add-monster/emit_tables.py --write` (no flag = dry-run diff) rather than transcribing - that is how the two stay at parity. It covers `MOVES`, `SPECIES`, `STARTERS`, `MAP`, `ZONES`, `MATERIALS`, `BLOCKS` and `RECIPES`; other tables are still ported by hand. The logic, however, is hand-ported, so a new *mechanic* must be written twice.

Eight sections (~4880 checks): the CAVE section covers the horror kit below, including the can't-block and always-completable proofs: map geometry/connectivity (including the **gated-reachability** rule below), engine correctness, 200 simulated battles, world traversal + save round-trip, **SANDBOX** (mining, crafting, placement rules, PICK tiers, the seam and GEODE, the backstop, saves, two scripted playthroughs), a **RENDER** pass, and a **parity check** that shells out to node, reads the `.html` build's tables through its `__GAME__` export, and fails if species, moves, zones, map, type chart, starters or the computed sandbox data (tile hashes, ore spots, mineable/buildable tiles, seams, backstop and `load_edits` cases) have drifted apart. It also compares the shared shell constants (juice/HUD constants, GEODE crystal spots, picked-ball lines), so a feel tweak made in one build fails until it is made in the other. That parity section is the only thing keeping the two builds honest - it skips cleanly if node is missing. The RENDER pass builds the real `Shell` on SDL's dummy drivers. It draws every species (front, back and flipped, with pixel checks), every glyph in every region band, all 8 modes and every battle phase, frame by frame. It checks every juice invariant (hit-stop freezes animation but never the queue, shake ≤ `SHAKE_MAX` and clear of the HP boxes, the particle pool stays bounded, `REDUCED_MOTION`). It also verifies that juice never touches the engine's random stream, and checks synthesized sound buffer lengths. Set `MT_FRAME_DIR=<folder>` to dump ~40 key frames as PNGs. The JS suite has MAP, ENGINE, BATTLE, WORLD, SANDBOX and a pixel-free SHELL JUICE section (world-fx rules through `__GAME__`, and a check that `Math.random` is never called by juice). It has no RENDER, so HTML drawing and touch controls are still checked by eye with the `browser-playtest` skill. **Preserve the import-safety of layers 1-3** - without it the only way to check a change is to play it.

- **Battles run on a step queue**, not straight-line code. `q_msg`/`q_do`/`q_wait`/`q_hp` push steps; `pump_queue` drains one at a time, blocking on messages until a key is pressed. The critical detail: when a `do` step's function queues more steps, `pump_queue` swaps in an empty queue and **splices the result in at the current position**. Appending instead would narrate the faint before the attack that caused it. Any new queueing code must go through these helpers.
- **`def` is spelled `def_` throughout the Python build**, because `def` is a keyword. Stat-stage keys, `Mon` attributes and move `eff` tuples must all agree, or a stat-lowering move writes to a key `damage_calc` never reads. The suite checks every status move's stat key for exactly this reason.
- **Damage is the real formula** (level/attack/defense, then STAB 1.5x, type chart, crit, 0.85-1.0 roll). Crits ignore the attacker's negative and the defender's positive stat stages, as in the actual games.
- **DARK and STEEL are second-generation types** and carry the table's only immunities: PSYCHIC does nothing to DARK, POISON does nothing to STEEL. `damage_calc` returns 0 damage and "It had no effect" for these - do not "fix" a zero multiplier into a floor of 1.
- **Sprites are procedural.** `draw_creature` switches on `art["kind"]` (`quad`, `serpent`, `plant`, `rodent`, `bug`, `bird`, `bat`, `gear`, `crab`, `spark`, `rock`, `ooze`, `wisp`), drawn through a small `Brush` translate/flip helper since pygame has no transform stack - matching the no-asset constraint the other two games set. Boolean art flags (`big`, `mane`, `horns`, `spikes`, `glow`, `relic`, ...) vary a kind without a new branch. A new species needs a `SPECIES` entry; a new *look* also needs a `kind` branch in **both** builds.
- **Audio is synthesized into raw PCM at first use.** `Sfx._build` mixes a note list into one buffer with the delays baked in, so a multi-note jingle is a single `Sound.play()` and needs no scheduler. It renders at whatever rate and channel count the mixer *actually* opened (`pygame.mixer.get_init()`), and `Shell` calls `mixer.pre_init` before `pygame.init()`. Assuming 22050 Hz mono once made every sound play 4x fast; the RENDER pass checks buffer lengths for this.
- **The map is literal strings, one char per tile**, but it is *authored by coordinate*: the level-design pass paints regions, then emits the rows. Every row must be exactly `MAP_W` chars. The suite checks width, ledge-aware flood-fill connectivity, that every NPC/sign/item/door is reachable, that no grass tile sits outside an encounter zone, that the trunk road stays in exactly 2 columns, and that the bridge meets land at both ends. It has already caught a sealed cave chamber and a bridge that dead-ended in open sea.
- **Regions are y-bands**, and three of them change how tiles draw: `CAVE_BAND` gets lantern-radius darkness, `RUINS_BAND` draws `B` as weathered pillars instead of windowed houses, `ROCK_BAND` draws `.` as scree and `#` as boulders. `region_name(y)` feeds the HUD. Adding a region means adding a band, not a new tile set.
- **Terrain glyphs**: `.` ground, `,` tall grass, `;` dark grass (stronger encounters; it rolls exactly like `,` - both are in `GRASS`, and until the GEODE work `try_encounter` only rolled on `,`, so every cave and ruins zone was silently dead), `_` path, `~` water, `=` bridge, `s` sand, `f` flowers, `c`/`C` cave floor and wall, `B` building, `H`/`D`/`G` doors, `S` sign, `o` item ball, `v` ledge, `W` player-built wall (only ever in the `Game.edits` overlay, never in `MAP`), `K` cracked seam (authored, solid, IRON PICK only; there are exactly two, both on the GEODE).
- **`v` (ledge) is the one conditional tile.** `blocked_for(x, y, moving)` lets you enter it only when heading south, and the move handler then vaults you to the tile *beyond*. Everything that pathfinds - including the test suite's BFS - has to model that, or it will think the world is smaller than it is.
- **Decorative tiles borrow their ground.** `ground_tone(x, y)` samples neighbours so a sign or item ball on sand or cave floor is not a green square. Without it the cave items were invisible. A *collected* ball draws as `picked_ground(x, y)` / `pickedGround` (the neighbouring ground glyph), not `.`, which painted a lawn square in the cave.
- **Fishing** is `WATER_ZONES` plus facing water and pressing confirm; **item balls** are `ITEMS` keyed by tile with `Game.picked` recording what is gone; **signs** are `SIGNS` keyed by tile. All three are pure tables - the suite asserts the tables and the map agree in both directions.
- **The gym is gated**: `GYM_REQUIREMENT` trainers must be beaten before the doors open, so the world's size is load-bearing rather than decorative.
- **NPCs are solid**, beaten trainers included, so trainer placement must always leave a way around. Trainers sit on the 2-wide trunk road covering one column each; `check_trainer_sight` casts along their facing. A few townsfolk carry `wander` and drift around a remembered `home` tile.
- **Hunt battles (DARK CAVE horror kit, see `docs/dark-cave-horror-spec.md`).** `start_hunt(foe)` / `startHunt(foe)` starts the forced fight against GLOOMSTALK, which is in no zone so it can't be caught. It is a hard cut, or the normal fade under REDUCED_MOTION. `Battle.hunt` makes BALL refused without using a turn and RUN use the fixed `HUNT["run_odds"]`. The intro is the `b.scare` jumpscare queue (dark → reveal → settled), built only from `q_msg`/`q_do`/`q_wait`. While it is dark the foe sprite and HP box are hidden, and the reveal fires the `fx_scare(calm)` / `juiceScare` hook once. `end_battle` calls `Game.hunt_over(result)` exactly once, before fading. It pays the `HUNT` ORE reward (3 the first time, then 1) and counts `flags["hunt_beaten"]`; the overworld consequences go in its marked STEP 2 block. The JS build spells the same keys in camelCase (`huntBeaten`, `runOdds`).
- **DARK CAVE horror kit** (ported from THE STATIC BELOW; spec in `docs/dark-cave-horror-spec.md`).
  - **Lantern:** `Game.lantern` (0..100) drains 1 per completed step inside `CAVE_BAND`. The lit radius is `lantern_radius()` in 8 buckets, never below 2.25 tiles, and a 34 px clear core keeps the 4 neighbouring tiles lit. It refills on `heal_party` and with the OIL recipe (1 ORE → +50, `cap` 100).
  - **Tension:** `Game.tension` (0..100) climbs per cave step, faster in low light and while hunted, and falls in the mouth safe zones. In the cave it scales the wild roll through `encounter_rate()`, which keeps `ENC_BASE` = 0.14 and makes the same single random call.
  - **Stalker:** GLOOMSTALK on the overworld is `Game.stalker`. It is never saved and moves only on player steps, via the pure `stalker_tick` with its own `mulberry32`. **Never use the global random for it.** Its domain is rows 27-36, minus everything within 4 tiles of a mouth, so it can never stand on a chokepoint. It is never solid to the player. The lantern's `keep_out` holds it off, so it can lunge only in low light or in fear.
  - **Contact:** a bump starts a deliberate hunt battle. A lunge does too, unless a PULSE is carried, in which case the PULSE auto-fires. After a hunt: win means gone until `heal_party`, run means it rests 40 cave steps, lose means whiteout plus 80. The suite proves `rest_lose` outlasts the longest walk out of the cave, and that no stalker position blocks the trunk.
  - **PULSE:** a counter (cap 3) at menu row 4, so CLOSE is row 5. It stuns for 10 steps within 4 tiles by path, never through rock.
  - **Recipe caps:** recipes may carry a `cap` for counters, and `emit_tables.py` emits it.
  - **Parity:** the PARITY `cave` section compares every table, the domain and three 300-tick stalker traces across builds.
  - **Feel (shell only):** `CaveFx` (Python) / `CFX` (JS) holds the cave's screen state. `fx_world("lunge"|"pulse")` feeds it, `update_cave_fx` / `updateCaveFx` advances it, and the overworld draw renders it.
    - **Lantern:** one cached cut-out sprite per lantern bucket. Inside `LANTERN["core_px"]` it is always clear, and `LAMP_FEATHER` softens the edge.
    - **Tension:** `tension_fx(t, reduced)` adds a vignette from 50. At fear it adds a heartbeat pulse, grain and tear lines. Reduced motion drops those but keeps the meter and the heartbeat sound.
    - **Stalker:** the shadow body draws *under* the darkness, and the eyes draw over it only when `stalker_eyes` allows.
    - **Lunge:** holds the overworld for `LUNGE_TIME` before the cut, buffering any confirm pressed meanwhile, with one non-strobing flash.
    - **PULSE ring:** lights only tiles a path search reaches, so it stops at walls.
    - **Randomness:** all cosmetic randomness is `FX_RNG` / `fxRand`. The suites assert that a full cave walk gives the same trace, the same engine `random` state and the same stalker `mulberry32` value with the shell running. The feel helpers are pure and PARITY-compared, and their constants are in the shell constants list.
- **Battle juice lives in the shell.** The engine calls a no-op `Game.fx_hit` hook (Python) or `juiceHit` (JS) from the hit step. The pygame `Juice` class and the JS juice block handle trauma shake, hit-stop, white flash and pooled type-coloured particles, with identical constants (`SHAKE_MAX`, `TRAUMA_*`, `HITSTOP_*`, `PARTICLE_*`) in both builds. Cosmetic randomness uses its own generator (`FX_RNG` / `fxRand`), never the engine's random stream. `REDUCED_MOTION` turns shake, hit-stop and flash off (JS reads `prefers-reduced-motion`; Python is a constant).
- **The HTML build has touch controls.** All input goes through `press(k)`/`release(k)` with canonical keys, which keyboard and the DOM touch overlay (D-pad, A, B, RUN) both feed. `fitCanvas()` scales the fixed 640x480 canvas with CSS and keeps the controls in space the canvas doesn't use.
- **Battle layout is tight at 640x480.** The player's HP box sits at y=248 specifically to clear the foe's platform, which ends at y=240. Moving either will overlap them.
- The Python build writes saves to `monster-trail-save.json` beside the script; the HTML build uses `localStorage`.
- **Sandbox slice (ROCKY PASS).** The QUARRY HAND NPC gives a PICK (`flags["pick"]`). Facing a pass boulder (`#` inside `in_sandbox`) and confirming mines it. Drops come from the pure `mine_drop` (STONE always; ORE when `tile_hash(x, y)` says so: 12 of the 55 boulders), so they can't be save-scummed. `RECIPES` turn 2 STONE into 1 WALL and 2 ORE into 1 BALL, through `craft()`, which conserves items exactly. MENU → CRAFT → BUILD WALLS places walls. **`MAP` is never mutated:** all changes live in the `Game.edits` diff overlay, which `tile_at(x, y, edits)`, `blocked_for`, trainer sight, wander and drawing all read, and which is saved and re-validated on load (`load_edits`). `placement_ok` refuses a wall off bare pass ground, on or next to the player, an NPC or an interactive tile, or anywhere that would cut off a currently reachable tile (a ledge-aware BFS). That last rule is why a wall can never seal the player or a target. PARITY compares the computed engine output (hashes, ore spots, mineable and buildable tiles), not just the tables.
- **PICK tiers, the CRACKED SEAM and the GEODE.** `flags["pick"]` is a tier: 0 none, 1 PICK, 2 IRON PICK (`PICK_MAX`). `pick_tier(v)` normalises it, so old saves with `True` load as 1 and junk loads as 0. Every `BLOCKS` entry has a `tier`: `#` and `W` are 1, `K` (CRACKED SEAM) is 2 and `authored_only`, which means it breaks only where `MAP` itself has a `K` (it lies outside `in_sandbox`), drops a fixed 2 ORE and leaves `c`. `C` is never mineable. `can_mine(tile, x, y, tier)`. The `iron_pick` recipe (3 ORE + 6 STONE) has `sets_tier=2`: `craft(materials, recipe, tier)` takes its needs, stores nothing in `materials`, and refuses once the tier is already 2, while `Game.craft_recipe` raises the tier. `load_edits` accepts `K`→`c` only at authored seams. The GEODE (`GEODE = (65, 30, 75, 34)`) is a sealed pocket in the DARK CAVE. Its entrance seam is (70,34), mined from (70,35) right above the (70,36) ball, and an inner seam sits at (65,33). Inside are dark grass (zone x66..74 y31..32, L24-28, the only wild emberling and sprigling) and an 8-ball item at (75,30). **Soft-lock backstop:** ORE never grows back (12 boulders, and BALL crafting can burn it all), so `quarry_backstop(materials, tier, edits)` gives `BACKSTOP_ORE` (3) once, when tier is 1, ORE is under 3 and every `ORE_DEPOSITS` boulder is mined. The QUARRY HAND pays it and sets `flags["backstop"]`. His third `after` line points at the seam.
- **Gated reachability (test rule).** The MAP section keeps the plain flood fill `seen` (nothing mined) and adds `seen_mined` (every `K` mined). Every NPC, door, sign and trainer must be in `seen`, which proves nothing required is behind a mineable tile. `seen_mined - seen` must equal exactly the GEODE's open tiles plus the seams. An item or zone that is reachable only in `seen_mined` is *gated*: it is accepted only if it lies inside `GEODE`, and exactly one of each exists. A new mineable gate needs its own bounded region and must keep this equality.
- Deliberately **out of scope**: status conditions (poison/burn/paralysis), a general items/bag inventory, money, and shops. Balls are a bare counter refilled at the centre. The one exception is the sandbox: three fixed counters on `Game.materials` (`stone`, `ore`, `wall`) plus the pick tier and the one-off backstop flag, used only for mining and building. The IRON PICK is a tier, not an item. It is not a bag: no item lists, no using items in battle, no selling.

## Expert team (`.claude/`)

The full map of the harness is `docs/wiki/harness.md`. In short:

- **Orchestration.** The `game-pm` skill runs in the main session, because subagents can't spawn subagents. The `pm-route.js` UserPromptSubmit hook reminds the session to use it.
  - It triages each request into a lane. **FAST**: the PM does it. **STANDARD**: brief → worker → verify → reviewer. **DEEP**: `plan-with-review` first.
  - Risky surfaces always go DEEP: engine rng, the step queue, save formats, `campaign.js`, MAP and reachability, shared tables, Static Below SIM rates.
  - Briefs use `docs/templates/task-brief.md`.
- **Workers:**
  - **creature-designer** (creatures and balance);
  - **sandbox-designer** (building, crafting, terrain);
  - **game-feel-engineer** (juice, loop, performance, UI and touch);
  - **narrative-designer** (story, dialogue and signs in both builds);
  - **game-chore** (mechanical edits).

  Each declares Owns / Does NOT own and a return format, follows `docs/wiki/agent-contract.md`, and has `memory: project`.
- **Judges (never edit code):**
  - **game-reviewer**: its Step 0 runs `verify.js` (red means `PRECONDITION_FAILED`). It returns a JSON verdict PASS/NEEDS_REVISION/FAIL with `file:line` issues and uses the `game-review-checklist` skill. Max 2 rounds; then escalate a lane, then ask the user.
  - **playtester**: `game: monster-trail|static-below|campaign`, `mode: smoke|duty|full`, driven by the duty specs in `docs/playtests/`. Any FAIL is a FAIL; BLOCKED is never PASS.
- **Learning loop:**
  - `reflect-and-learn`: failures. It self-gates, counts under exact keys in `docs/FAILURE_PLAYBOOK.md` with lessons in `docs/lessons/`, and proposes a CLAUDE.md rule plus a checklist line at the 2nd occurrence. The user locks it; a locked rule that recurs becomes a script check.
  - `capture-knowledge`: successes go in `docs/SOLUTIONS.md`.
  - `skill-evolution`: at 2 reuses, it writes `≤12`-line entries into `skills/<s>/learned/`.
  - `wiki-sync`: doc drift. `node .claude/scripts/wiki-sync.js` reports STALE, UNDOCUMENTED, COUNT-DRIFT and BROKEN-LINK.
- **Domain skills:**
  - `add-monster` (`emit_tables.py`);
  - `balance-report` (`.venv/Scripts/python.exe .claude/skills/balance-report/balance_report.py`);
  - `juice-pass`, `fixed-timestep`, `sandbox-prototype`, `game-ui`, `browser-playtest`.
- **Hooks** (`.claude/settings.json`; all fail open; tests in `.claude/hooks/hooks.test.js`):
  - SessionStart injects PROGRESS `## Next`, verify freshness and pending proposals.
  - PreToolUse denies writes into `E:\SSM` (a read-only reference) and `.env*` access. It warns on exit-code-masking pipes and whole-file reads of big files.
  - PostToolUse runs the ASCII check on `gemini's code.html`, and gives emit_tables and parity reminders.
  - **Stop** blocks a turn that changed game files once, until verify is green after the last edit, the reviewer ran (or `review=skipped(FAST)`), due reflection happened, and the reply ends with a `LOOP:` line.
- **Commands:** `/verify`, `/playtest`, `/review`, `/route`, `/status`.
- **State:** `.claude/state/` (verify results; scratch, safe to delete). Unfinished work leaves a handoff in `docs/handoffs/`.

This folder is not a git repo, so parallel agents must never edit the same file.

## Controls

**THE STATIC BELOW:** WASD + mouse look (pointer lock), Shift sprint, F flashlight, click to fire pulse, Space jammer, Esc pause, R restart from stage 1. Touch: left joystick moves, drag right side to look, LIGHT/RUN/JAM/PULSE buttons.
**MONSTER TRAIL (both builds):** arrows/WASD move, Shift run, Z or Enter confirm/interact, X or Esc cancel (opens the menu in the overworld).

## Other agent configs present

`~/.codex` and `~/.gemini` exist on this machine. To bring their MCP servers, slash commands, subagents, or instructions into Claude Code, reply `/import` to scan and list what's importable, then `/import --yes=<digest>` to apply.

