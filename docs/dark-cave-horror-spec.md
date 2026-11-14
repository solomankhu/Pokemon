# Dark Cave horror kit — approved spec (2026-10-17)

**Status: built in both builds (steps 1-3 complete, 2026-10-17).** Python suite 4876 checks, JS suite 3261 checks, all passing.

Gemini's THE STATIC BELOW mechanics ported into MONSTER TRAIL's DARK CAVE (both builds). User-approved with: **auto-pulse on lunge**, **step-based stalker only (no idle creep)**, **HUD tension meter + effects**. A pulse fired with nothing in range is still consumed.

**Loop:** the lantern is a shield that runs out. Walking the trunk at full light (~16 steps) is safe. Exploring the side galleries, the dark grass or the GEODE spends light and nerve, and that is when the stalker hunts. ORE buys back light (OIL) or a way past (PULSE) instead of BALLs.

## Map facts (measured)
- Trunk is columns 42–43. South mouth (42/43, 39) to north mouth (row 24) is 15–16 steps. The chokepoints are rows 24–26 and 37–39 at x=42–43. CAVER NOX is at (42,31), facing down, sight 3.
- The farthest cave tile from a mouth is (34,31), 67 steps away.
- Encounters roll only on `,`/`;` (the `GRASS` tuple), never on cave floor `c`.
- There are no player walls in the cave (`in_sandbox` = ROCKY PASS). Only the authored K seams open floor in the cave.

## 1. Species + forced battle (creature-designer)
```python
"gloomstalk": dict(name="GLOOMSTALK", types=["Dark"],
    base=dict(hp=75, atk=100, def_=60, spa=40, spd=60, spe=75),   # BST 410
    catch_rate=3, base_exp=190,
    art=dict(kind="quad", c1=(40, 32, 56), c2=(178, 120, 230), big=True, mane=True),
    learn=[(1, "scratch"), (1, "leer"), (1, "bite"), (1, "quickattack"),
           (20, "howl"), (22, "crunch"), (33, "nightveil")],
    evo=None),
HUNT = dict(species="gloomstalk", lv_min=22, lv_max=28, lv_offset=-1, run_odds=0.5,
            reward_first={"ore": 3}, reward_repeat={"ore": 1})
def hunt_level(party_levels): return clamp(max(party_levels) + HUNT["lv_offset"], HUNT["lv_min"], HUNT["lv_max"])
```
- GLOOMSTALK is never in ZONES or WATER_ZONES, so it is uncatchable. BALL is refused with "It melts into the dark before the BALL can land!" and no turn is used.
- `Game.start_battle(foe, trainer=None, hunt=False)` stores `Battle.hunt`. The battle is wild-style, so XP is paid normally.
- RUN uses the fixed `HUNT["run_odds"]`. Success: "You bolted into the dark... it lost your scent. For now." Failure: "It cut you off!" plus the normal free foe attack.
- `end_battle` with `b.hunt` calls `Game.hunt_over(result)` with result "win", "run" or "lose".
  - **Win:** the reward goes to `materials["ore"]` through `q_msg`. `flags["hunt_beaten"]` is a count that selects first vs repeat reward.
- **Jumpscare intro (`b.scare` phase):** hard cut with the sprite hidden → sfx "scare" → "Something was breathing right behind you..." → reveal (shell lunge, flash, shake) → "GLOOMSTALK lunged out of the dark!" → "It's hunting you. There's no time to aim a BALL!" → "Go, <mon>!". Under REDUCED_MOTION it uses the normal fade, a held dark frame (`q_wait(0.4)`), and no flash, shake or lunge. The text and sound stay. One flash only, never strobing.
- **Hint:** "PSYCHIC tricks do nothing to it" goes in CAVER NOX's after line or the sign at (28,40).
- Measured win rates: 86–97% at full HP, about 71% when caught at 60% HP.

## 2. Lantern (sandbox-designer)
- `Game.lantern` runs 0..100 and drains 1 per completed step inside CAVE_BAND. It never drains outside the cave or while paused.
- `lantern_radius(c) = R_MIN + (R_MAX-R_MIN)*sqrt(bucket/8)`, where `bucket = ceil(8*c/max)`, R_MAX = 4.7 tiles, R_MIN = 2.25 tiles. The fixed clear core is 34 px, so the 4 neighbouring tiles are always lit.
- `heal_party()` refills it to 100. The OIL recipe `dict(id="oil", out="lantern", count=50, needs={"ore": 1}, cap=100)` adds 50.
- `craft()` with a `cap`: refuse when `have >= cap`, otherwise `min(cap, have+count)`.
- Labels: `MATERIAL_LABEL["lantern"]="LAMP OIL"`, `["pulse"]="PULSE"`. The OIL message reads "Lantern refilled to N%."

## 3. Tension
- `Game.tension` runs 0..100. Per cave step, `tension_step(t, charge, hunted, safe)`:
  - **Base:** +1.
  - **Low light:** +1 more when the lantern is under 50%, and +2 more when it is under 20%.
  - **Hunted:** +3 more while the stalker is in hunt mode.
  - **Safe zone (mouth):** −2 instead.
- `tension_event`: wild win in the cave −10, run +5, pulse −15. Clamp to 0..100.
- Tension resets to 0 on a stalker battle end, on `heal_party`, and on leaving CAVE_BAND.
- `ENC_BASE = 0.14`, `encounter_rate(t) = ENC_BASE*(1+0.75*t/100)`. It applies only in the cave and makes **exactly the same number of `random.random()` calls as today**.
- **Screen (game-feel):**
  - t ≥ 25: HUD meter beside the lantern bar.
  - t ≥ 50: edge vignette, alpha rising to 120.
  - t ≥ 75: heartbeat pulse, film-grain static, occasional tear lines and a heartbeat sfx.
  - REDUCED_MOTION: static vignette, no pulse, grain or tears; the meter and sfx stay.

## 4. Stalker overworld AI
- **Domain:** `stalker_walkable` is 27 ≤ y ≤ 36, not `tile_blocked` (walls, unpicked balls and NPCs are solid to it), and Manhattan distance > 4 from every mouth tile (42/43,25) and (42/43,38). That gives 505 tiles. It never touches the chokepoints or mouths.
- **Never solid to the player:** it is not in NPCS and not in `blocked_for`.
- **Moves only on completed player steps.** Patrol moves 1 per 2 steps; hunt moves 4 per 5 steps, so it is always outrunnable. Each tick runs one BFS from the player (`cave_dist`), with tie order up/left/right/down.
- **Hunting:**
  - Hunt starts when its BFS distance ≤ `stalker_sense(c,t) = 4 + round(4*(1-frac)) + t//25`. It loses track beyond sense + 4.
  - Patrol walks the waypoint loop `(7,33),(7,28),(30,28),(38,30),(56,31),(62,28),(79,28),(79,35),(56,36),(38,35),(20,36),(7,36)`, with a 20% injected-rng pause. The lair is (7,33).
- **Light shield (`keep_out`):** 3 at ≥ 50% lantern, 2 at ≥ 20%, 1 below that, and 1 lower at t ≥ 75 (minimum 1). It never ends a move inside `keep_out`, and it retreats at once if the player closes in.
- **Lunge:** only when `keep_out == 1`, Manhattan ≤ 1 after its move, it is not stunned, `grace == 0`, the player is not in a safe zone, and the party is alive. **On a lunge with a pulse carried, the pulse auto-fires instead.**
- **Bump:** walking onto it unstunned is a deliberate fight; it never auto-pulses. A stunned stalker is walk-through.
- **Spawn:** `stalker_spawn` places it at the waypoint farthest by BFS from the player. It spawns on cave entry, when `hunt_rest` expires, and on load inside the cave. Its position is never saved, and leaving the cave removes it.
- **After a battle:**
  - **Win:** `hunt_gone = True` until `heal_party`.
  - **Run:** `hunt_rest = 40`.
  - **Lose:** the normal whiteout, then `hunt_rest = 80`.
  - `hunt_rest` counts down on cave steps only.
  - `grace = 3` ticks after any battle.
- **Step order:** `cave_step` (lantern, tension, rest) → `check_trainer_sight` → stalker tick → `try_encounter`, guarded so that nothing double-fires.
- **Handoff:** stop movement → sfx "hunt" → `fx_world("lunge", ...)` → `make_mon("gloomstalk", hunt_level(...))` → `start_fade(lambda: start_battle(foe, hunt=True))`.
- **RNG:** the stalker uses its own `mulberry32` (ported to Python, so traces match across builds) and never the global `random`/`Math.random`. `cave_rng = mulberry32(self.steps)` on cave entry.
- **Rendering:** draw the stalker under the darkness mask, and its eyes above the mask while it is hunting within sense.

## 5. Stun pulse
- **Recipe:** `dict(id="pulse", out="pulse", count=1, needs={"ore": 1, "stone": 2}, cap=3)`. Stored in `Game.pulses` (0..3).
- **Menu:** `MENU_ITEMS = ["PARTY","SAVE","BALLS","CRAFT","PULSE","CLOSE"]`, labelled "PULSE xN". A fires it and closes the menu. With 0 charges it toasts "No PULSE. Craft one from ORE."
- **Range:** BFS path distance ≤ 4, so it never passes through walls.
- **Hit:** stun for 10 player steps, push up to 3 tiles along increasing BFS distance, tension −15.
- **Miss:** the charge is consumed with "The PULSE flares... nothing there." Tension −15 still applies.
- `fx_world("pulse", ...)` is the juice hook.

## Tables
```python
ENC_BASE = 0.14
LANTERN = dict(max=100, drain=1, oil=50, r_max=4.7, r_min=2.25, core_px=34, buckets=8)
TENSION = dict(max=100, base=1, dim=1, dark=2, hunted=3, safe=-2, fear=75, enc_bonus=0.75,
               events=dict(win=-10, run=5, pulse=-15))
KEEP_OUT = ((0.5, 3), (0.2, 2), (0.0, 1))
HUNT_AI = dict(rows=(27, 36), safe_r=4, mouths=((42, 25), (43, 25), (42, 38), (43, 38)),
               lair=(7, 33), patrol=[...12 waypoints above...], pace_patrol=(1, 2), pace_hunt=(4, 5),
               pause=0.2, sense_base=4, sense_dark=4, sense_div=25, lose_track=4,
               rest_lose=80, rest_run=40, grace=3)
PULSE = dict(max=3, range=4, stun=10, push=3)
```
**Pure functions (camelCase in JS):**
- Lantern: `lantern_frac`, `lantern_step`, `lantern_radius`.
- Tension and safety: `keep_out`, `in_safe_zone`, `tension_step`, `tension_event`, `encounter_rate`.
- Stalker: `stalker_walkable`, `cave_dist`, `stalker_sense`, `stalker_spawn`, `stalker_tick(st, player, c, t, edits, picked, npc_tiles, rng) -> (st2, event)` with event None/"hunt"/"lost"/"retreat"/"lunge", and `bump`.
- Pulse: `pulse_apply`.
- `mulberry32`.

**Save:** `cave=dict(lantern, tension, pulses, rest, gone)`. A missing or garbage `cave` falls back to defaults (100, 0, 0, 0, False), clamped.

## Tests (both suites unless noted)
1. **Lantern:** the floor radius is ≥ 2.25 and the 4 neighbours are lit at 0 (Py render). The radius is monotone. Drain, its bounds, and refill on heal/whiteout all hold. OIL and PULSE recipes conserve materials and respect their caps, and the old recipes still conserve.
2. **Tension:** it stays in bounds and is monotone with darkness. Safe zones lower it, and the resets fire. `encounter_rate(0) == 0.14` exactly and `(100) == 0.245`. The rng call count is unchanged.
3. **Domain:** it is false on the chokepoint rows, mouth zones, NPC tiles and unpicked balls, both on the base map and with the seams mined. Every waypoint is walkable and every leg is connected.
4. **Can't block:** with the stalker plus its 4 neighbours solid, south still reaches north for all 505 positions.
5. **Always completable:** `rest_lose` (80) is greater than 67 and greater than 16. In the zero-light, max-tension, zero-pulse sim from every start, the player reaches the north mouth, and every contact resolves as a loss.
6. **Light shield:** 1000 ticks at ≥ 50% light and tension < 75 give 0 lunges. There is no lunge in a safe zone or during grace.
7. **Determinism and parity:** an identical 300-tick trace in each build, and identical across builds via node.
8. **Pace and sense:** pace rules, sense, and lose-track behave as specified, with no movement without a step.
9. **Pulse:** the range is by path, not through walls. Stun, walk-through and push work. With 0 charges there is no state change. A lunge auto-fires; a bump never does.
10. **Handoff:** the battle has `b.hunt`, the species and the level. The lose/run/win rules apply. GLOOMSTALK is in no pool, BALL is refused, and RUN uses fixed odds.
11. **Save round-trip:** old saves, garbage values, and loading inside the cave all behave as specified.
12. **Py RENDER:** lantern buckets 0/4/8 × tension 0/50/100 × REDUCED_MOTION on/off. Eyes show while hunting, the PULSE menu row renders, and the craft menu fits in 480.
13. **PARITY:** LANTERN, TENSION, KEEP_OUT, HUNT_AI, PULSE, ENC_BASE, HUNT, new RECIPES and MENU_ITEMS (hand-ported, or extend `emit_tables.py`).

## Build order (sequential: the same four files)
1. **creature-designer:** species, HUNT, `start_battle(hunt)`, `b.scare`, `hunt_over` hook, both builds.
2. **sandbox-designer:** lantern → tension (incl. the ENC_BASE swap) → stalker AI → pulse, state wiring, both builds and both suites.
3. **game-feel-engineer:** bucketed lantern masks, HUD lantern/tension bars, vignette/static/heartbeat, stalker sprite and eyes, lunge freeze, pulse flash, REDUCED_MOTION, browser playtest.

## Risks
- **RNG stream drift:** keep the global `random` untouched.
- **MENU index shift:** CLOSE moves to index 5.
- **CRAFT height:** 7 rows plus BUILD/BACK must fit.
- **pygame masks:** cache small per-bucket hole sprites.
- **Photosensitivity:** a single flash only.
