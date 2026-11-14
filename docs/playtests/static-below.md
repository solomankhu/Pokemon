# Duty spec: THE STATIC BELOW (`gemini's code.html`)

URL: `http://127.0.0.1:8765/gemini's%20code.html`. three.js r128 loads from `vendor/`
first, so no network is needed. Pointer lock is refused under automation, so call
`__STATIC__.debug.play()` instead of clicking the overlay.
State: `__STATIC__.debug.state` (`ready`, `stage`, `status`, `touchMode`, `arrival`) and
`__STATIC__.debug.sim`.

| ID | Tag | Duty | How | Assert |
|---|---|---|---|---|
| SB-01 | [smoke] | Boot | load, then wait for `state.ready` | the boot panel is gone; the console is empty; `debug.renderer` exists |
| SB-02 | [smoke] | Enter play | seam: `debug.play()` | `state.status === 'play'`, stage 1 |
| SB-03 | [smoke] | Move | input: `press('forward')` held for about 30 ticks, then `release` | the player position changed; no wall penetration |
| SB-04 | | Overhead geometry, all floors | seam: `setupStage(n)` and `overhead(true)` for n = 1..3; screenshot | floors look distinct; the refuge and exit are visible; dispose leaves no leaked lights |
| SB-05 | | Pulse and jammer | input: pulse and jam actions | battery drops by `PULSE_COST`; enemies in the cone are stunned |
| SB-06 | | Scare | seam: put a stalker at contact range | `status` goes `scare` for 72 ticks and the rest of the sim is frozen |
| SB-07 | | Pause and FLOOR PLAN | input: Esc | numbered rooms with a legend; Esc closes it |
| SB-08 | | Touch | `browser_resize` 390x844; dispatch touch on the joystick and the look zone | the on-screen buttons show; movement and look respond |
| SB-09 | | Reduced motion | Motion option set to Reduced | no shake, flash, lunge or head bob |
| SB-10 | | Frame-rate independence | throttle CPU (CDP `Emulation.setCPUThrottlingRate` 4) for 5 s | sim ticks per second stay about 60 (`SIM_STEP` accumulator) |

Full mode also runs
`node .superpowers/sdd/2026-10-17-unified-monster-trail/browser/chapter-experience.cjs`
(8 Chromium scenarios).
