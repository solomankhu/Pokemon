---
title: Testing
sources: ["claude's monsters.test.py", "claude's monsters.test.js", "gemini's code.test.js", "campaign.test.js", ".claude/scripts/verify.js", "combat"]
synced: 2026-11-14
---
# Testing

**One command:** `node .claude/scripts/verify.js`, or `--auto` to run only what
changed. **Any FAIL makes the run a FAIL.**

| Check | Command it runs | Proves | Count (2026-10-18) |
|---|---|---|---|
| `py` | `.venv/Scripts/python.exe "claude's monsters.test.py"` | MAP, ENGINE, 200 battles, WORLD and save, SANDBOX, CAVE, RENDER (headless pygame), **PARITY** vs the HTML build | 5319 |
| `js` | `node "claude's monsters.test.js"` | the HTML port's MAP, ENGINE, BATTLE, WORLD, SANDBOX, SHELL JUICE (no pixels) | 3703 |
| `gemini` | `node "gemini's code.test.js"` | stage placement and reachability, per-tick rates, collision fuzz, nav, pulse, the difficulty readout, input math, handoff parsing, dispose leaks | 554 |
| `campaign` | `node campaign.test.js` | the campaign reducer, the message validation, the save round-trip | 8 groups |
| `combat` | `node combat/verify.cjs` | arenas, commands, condition-tag, effects, engine-regression, host, integration, models, pickajoo, presenter, recipes, scene, webcam, webcam-clips, webcam-host, webcam-integration, webcam-scenarios | 17 suites |
| `combatpy` | `combat/commands_py_test.py` | the Python command judgment matches JS | 19 tests |
| `hooks` | `node .claude/hooks/hooks.test.js` | the harness hooks, plus wiki-sync ORPHAN | 73 |
| `tables` | `emit_tables.py` (dry run) | the HTML generated tables equal the Python ones | "already match" |

The Python suite takes about 75 s; the others take seconds.

The webcam battle-control suites inside `combat`:
- `combat/webcam.test.js`: the old `classifyMotion` (unchanged), the v2 pipeline (`stepMotion`: duplicates, exposure steps, speckle, mirror, dt scale, gain, noise warm-up/leak), the tracker (legacy and v2: punch level, cooldown, `reason`, blob+flow sweeps, refractory), `computeLag`/`calibratePunch`, the controller against a stubbed browser (gain, zone, `lastMotion`, epoch, pause reset, duplicate capture, cost), and determinism (no `Math.random`). Gesture set: `encodeClip`/`decodeClip` round trip, `gestureScores`/`classifyGesture`, the phase-aware tracker (actions only when `phase==='menu'`; the phase-less output keeps golden digest 200/3903691192) and the guard back-date in command time (hold x LAG_SCALE).
- `combat/webcam-host.test.js`: the host's WEBCAM settings rows (by label: ON/OFF, gain slider, punch zone, mirror, overlay), the Apply merge, the calibration card (lag, punch strength, nuisance floor, zone LEFT), Test gestures, the in-battle overlay (rects at 640/400/390/348 px, refresh rate, reduced motion), the camera badge and `notify` toasts.
- `combat/webcam-scenarios.test.js`: seeded synthetic 80x60 videos through the real controller and through the old path, printing an old-vs-new table. Nuisance scenes (sway, breathing, jaw, exposure ramp/step/x1.3, 50/60 Hz flicker, fan) run 60 s x 5 seeds with 0 false triggers; punches >= 9/10 per zone and seed; 10 sweeps per direction; two hands apart; high two-hand wave (10 seconds x 5 seeds, no confirm/strike); 15/20/30 Hz, jitter, drops, duplicates; 30 s of active play; calibration floor; pipeline cost; `crosses` (rapid punches at 13-30 Hz never throw a ball) and `overhand` (exactly one ball). Includes a v2 pipeline two-hand cancel check in webcam.test.js. About 50 s. Its scene parameters are frozen.
- `combat/webcam-cancel-navigation.test.js`: chest-height two-hand cancellation at 13/15/30 Hz; geometry and occlusion negatives; shared high/chest cancel latch and release/rearm; fast-sweep continuity and direction. The scenario suite adds independent rendered chest waves and rejects nuisance navigation/cancel keys.
- `combat/webcam-continuous.test.js`: 39 checks for continuous punch combinations, small/slow sweeps, direction/phase/gap/reset guards and two-hand interruptions. Includes an independently rendered small-hand sweep through the controller at 13/15/30 Hz; no personal pixels in fixtures.
- `combat/webcam-natural.test.js`: stable arm coverage despite sleeve-edge jitter at 13/15/30 Hz; rejects drifting/high-motion holds; checks command backdating and return to a stable pre-punch fighting stance, including invalid baselines. These are synthetic feature-level samples, not copied webcam pixels.
- `combat/webcam-clips.test.js`: replays the user's recorded clips (`combat/Webcam/`, `combat/clips/`; personal, local only, never published) through the real controller at phase `menu`. It skips when no clips are present. It fails on a wrong action. The >= 80% recall bars, per gesture and overall, apply only once a gesture has 3+ clips; before that a miss prints as REPORTED. Unexpected keys fail strictly; it prints a margin column and stray keys.
- `combat/webcam-integration.test.js`: the real `claude's monsters.html` in `vm`: settings normalisation, `commandClock`, the pause counter, `webcamOptions` wiring, `webcamActive`, and webcam-vs-key parity (same tier, same `Math.random` count), plus the gesture seam: `webcamPhase` guards, every `webcamBattleAction` id, defend rejected without CombatCommands, ball refused in trainer/hunt/no-ball battles, and a real guard back-date that scores PERFECT.

`node combat/browser-playtest.cjs` covers live 3D rendering, touch commands, focus loss, context loss, regional arenas, lifecycle scenes, 20 battle entries and three campaign returns. The campaign browser scripts cover chapter experience and audio cleanup. Human playtesting still matters for:
- HTML drawing and touch layout;
- three.js rendering;
- real input timing;
- audio lifecycle in a real browser.

See [../playtests/](../playtests/README.md). For pygame visuals,
`MT_FRAME_DIR=<dir>` dumps about 40 frames.

**Rules:**
- Never pipe a suite into `tail`/`head`/`grep`, because it masks the exit code. The
  PreToolUse hook warns about this.
- Never weaken a test to go green. The reviewer treats that as CRITICAL.
- A new mechanic gets checks in **both** suites, plus a PARITY comparison when it
  computes shared output.

