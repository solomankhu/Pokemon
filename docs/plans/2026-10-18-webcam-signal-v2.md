# Webcam signal v2 (Phases 1-3) - plan

Lane DEEP (persisted settings keys). Owner: **game-feel-engineer**, one worker, sequential
(all files below are one owner; nothing runs in parallel). Spec being amended:
`docs/superpowers/specs/2026-10-18-webcam-battle-controls-design.md`. Still no ML, no assets,
no Math.random, browser-only (commands.py untouched on purpose).

## Acceptance criteria
1. New pure stateful pipeline `createMotionModel()` / `stepMotion(model, gray, dtMs, opts)` in
   `combat/webcam.js` returns the existing motion shape (`zones,total,centroidX,centroidY,event`)
   plus `blob {x,y,area}`, `flow {dx,dy}`, `punch` (0..1) and is what the controller uses.
   `classifyMotion` stays exported and unchanged (existing tests keep passing).
2. Phase 1 signal: 3x3 box blur; per-frame mean-brightness normalisation (a global exposure
   step of +40 gives zero motion); per-pixel noise EMA updated only on non-moving pixels;
   threshold = max(MIN_T, k(gain) * noise); diffs scaled by 33/dtMs so 15 Hz and 30 Hz give
   the same decisions; 3x3 open (erode then dilate) on the mask.
3. Phase 2 gestures: largest 4-connected blob tracked for sweeps (sweep needs blob travel
   > SWEEP_SPAN_V2 with consistent block-flow sign); punch = fast-rising motion energy in the
   configured punch region (`webcamZone` CENTER | LEFT | RIGHT); slow sway (rise spread over
   > 200 ms) never fires. Tracker emits `reason` ('cooldown'|'noisy'|'confirm-pending'|null).
4. Scenario suite `combat/webcam-scenarios.test.js` with synthetic 80x60 videos (seeded
   mulberry32 sensor noise): punch hit rate >= 9/10 per zone; head sway, breathing, talking
   jaw, exposure ramp + step, flicker: 0 false punches; hand sweep L/R/U/D detected and
   two-hands-apart gives no sweep; 15 Hz vs 30 Hz same intents. Prints old-vs-new table.
5. Phase 3 settings (normalizeSettings in `combat/commands.js`): `webcamGain` int 1..9
   (default derived from legacy `webcamSensitivity` LOW 3 / MED 5 / HIGH 7, else 5);
   `webcamPunch` number 0.05..0.6 or null (null = default); `webcamZone`; `webcamOverlay`
   boolean false. `webcamSensitivity` still normalised (old saves load unchanged).
6. Calibration card: still step also feeds the noise model; each of the 3 punches records
   its peak `punch`; `webcamPunch = clamp(0.5*median peak)`; result text shows lag + strength.
7. Settings panel: gain slider (1..9) replaces the LOW/MED/HIGH select, zone select, overlay
   checkbox, "Test gestures" button -> modal with live preview, mask, zones and last
   detected gesture label (scratch tracker, no game input: it is a modal).
8. In-battle overlay (when `webcamOverlay`): small DOM canvas (mask + zones) + reason text,
   placed clear of foe HP box (canvas 24..284 x 28..80) and player box (y>=248), hidden in
   reduced motion? no - static, so allowed; removed when camera not live.
9. `node .claude/scripts/verify.js` green; no `Math.random` in webcam.js (existing scan).

## Files (owner game-feel-engineer)
- `combat/webcam.js`: add pipeline + constants, tracker reason + punch/flow use, controller
  uses model (reset on measureFloor/halt), calibration listener gets the v2 motion.
- `combat/commands.js`: normalizeSettings keys. (`commands.py`: no change - browser-only keys.)
- `combat/host.js`: settings rows, calibration strength, test-gestures modal, overlay.
- Tests: `combat/webcam.test.js`, `combat/webcam-host.test.js`, `combat/commands.test.js`,
  new `combat/webcam-scenarios.test.js`.
- `claude's monsters.html`: only if the overlay needs canvas rect / reducedMotion access
  (prefer host.js, which already places the badge).
- Docs: CLAUDE.md combat paragraph, spec addendum section, docs/wiki/testing.md,
  docs/wiki/monster-trail.md, docs/playtests/monster-trail.md webcam duty.

## Risks
- Determinism: the noise RNG lives only in tests; webcam.js gets no randomness (scan test).
- Old saves: missing new keys -> defaults; legacy sensitivity maps to gain (commands.test).
- Perf: blur+morph+CC+flow at 80x60 must stay < 4 ms/frame in Node (budget test 1000 frames < 2 s).
- Layout: overlay overlaps HP boxes -> host test asserts its rect.
- Lag calibration semantics unchanged (webcamLagMs).

## Verification
`node .claude/scripts/verify.js --only combat,js` then full `node .claude/scripts/verify.js`.
Playtester `game: monster-trail` `mode: duty` with the webcam duty (fake camera), plus the
new test-gestures modal and overlay screenshots.

## Amendments from review (binding; override the ACs above where they differ)
- **No edits to `claude's monsters.html`/`.py`/their tests**: peer session game-b7 is editing them (loot work).
  Overlay, test modal and calibration live in `combat/host.js` only.
- dt: scale = clamp(33/dt, 0.5, 2). Duplicate frames (video.currentTime unchanged, or diff all zero)
  are skipped: no EMA update, prev/prevT unchanged. EMA alpha is dt-based.
- Noise model: every pixel updates during warm-up/settle; afterwards only non-moving pixels, plus a slow
  leak for pixels moving > 2 s (fans/TV can't become permanent blobs). measureFloor resets it.
- `noisy` in v2 = mask fraction >= NOISY_MIN in >= 7 zones *after* brightness normalisation. Existing
  controller tests that relied on full-frame 255 = noisy, per-zone `noiseFloor`, or 33 -> 2000 ms jumps
  are rewritten deliberately and listed in the return; `noiseFloor` getter is kept (per-zone summary).
- Exposure tests: additive +40 step AND multiplicative x1.3 step give no punch/sweep.
- Pause (gen change): tracker = createTracker() keeping lastOnsetMs; model temporal state reset (not noise).
  measureFloor bumps an epoch checked after every callback like `token`; stepMotion runs before callbacks.
- Overlay: fed by a new read-only `lastMotion` getter (mask copy), polled from updateCamBadge, never the
  calibration listener slot. Canvas-px rect about x520..616 y84..156 scaled by rect.width/640,
  pointer-events:none, re-placed every update; host test asserts no overlap with foe box, player box
  (2D y248 / 3D y286), SETTINGS gear, CAM badge (both positions), condition tag (30,108,66x16), text panel
  (16..624 x 362..464) at 640 px and ~400 px wide. Reduced motion: overlay refreshes at <= 3 Hz.
- Calibration onsets/peaks use v2 `punch` in the configured `webcamZone`; falls back to zones[4] when a
  sample has no `punch` (host-test stubs). Host test with zone LEFT.
- Test gestures: enabled under the same gating as Calibrate; sets diagnostics.settingsOpen; uses the
  calibration listener + a scratch tracker; never dispatches. Test: gesture in modal, close, no intent.
- Settings panel tests select by label, not index. Unsupported camera disables slider, zone, overlay,
  mirror, Calibrate and Test. Controller reads `webcamGain`; legacy `webcamSensitivity` kept and frozen.
  Tests: {webcamSensitivity:'HIGH'} -> gain 7; an existing gain wins over legacy.
- New pure functions sit above `createWebcamController` (static Math.random scan covers them). Buffers
  preallocated (CC uses a typed-array stack). Controller cost measured on the pipeline only. Perf budget
  generous (1000 frames < 3 s).
- Docs also: spec constants line + settings table, MT-16 duty row in docs/playtests/monster-trail.md.

## Review log
| # | Persona | Severity | Finding | Resolution |
|---|---|---|---|---|
| 1 | Gap | CRITICAL | dt scaling breaks 33->2000 ms tests / dropped frames | Fixed: clamp 0.5..2, tests rewritten |
| 2 | Gap | CRITICAL | brightness norm kills full-frame noisy test, noiseFloor | Fixed: v2 noisy rule, getter kept |
| 3 | Gap | GAP | host tests pin select index; unsupported disables | Fixed: by-label tests, disable all |
| 4 | Gap+Risk | GAP/RISK | calibration hard-codes zone 4 | Fixed: v2 punch in zone, fallback |
| 5 | Gap+Risk | GAP/MINOR | test modal gating/streaming | Fixed: Calibrate gating, scratch tracker |
| 6 | Gap+Risk | GAP/RISK | overlay touch, resize, rects, reduced motion | Fixed: rect list, pointer-events, 3 Hz |
| 7 | Gap+Risk | MINOR | legacy sensitivity semantics | Fixed: frozen key + round-trip tests |
| 8 | Gap | MINOR | random scan scope, flaky perf | Fixed: placement, generous budget |
| 9 | Gap | MINOR | stale docs | Fixed: listed |
| 10 | Risk | RISK | single listener slot for overlay | Fixed: lastMotion getter |
| 11 | Risk | RISK | pause keeps trail/cancel/model history | Fixed: full tracker+model reset |
| 12 | Risk | RISK | measureFloor re-entrancy | Fixed: epoch |
| 13 | Risk | RISK | duplicate frames/jitter vs EMA | Fixed: skip dups, dt alpha, clamp |
| 14 | Risk | RISK | EMA never adapts to flicker | Fixed: warm-up all pixels + leak |
| 15 | Risk | MINOR | cost includes listener; perf | Fixed: preallocate, pipeline-only cost |
| 16 | Risk | MINOR | settings/saves safe | No change needed |
| - | PM | RISK | peer session editing monsters.html | Fixed: html out of scope |

## Reviewer acceptance bar (consult, binding)
- Multiplicative exposure: normalise by ratio (or mean+contrast), and test x1.3 on a high-contrast background.
- Leak: 30 s of continuous active play, then a punch still hits.
- Frame rate: identical intents (timestamps within 1 frame) at 15, 20 and 30 Hz plus jittered dt. Rise-time and
  sweep windows are in ms, not frames. Duplicate frames change nothing.
- Calibration: 3 weak punches never give a threshold that breathing or talking can cross (floor the threshold
  above the measured nuisance peak).
- LEFT/RIGHT zone punch with no command emits no arrow, and the double-burst `z` rule stays.
- Numbers: punch >= 9/10 per zone over >= 5 seeds; 0 false punches or sweeps per nuisance scenario over >= 60 s
  each and >= 5 seeds (sway, breathing, jaw, ramp, step, x1.3, 50/60 Hz flicker); sweeps 10/10 in all
  4 directions; two hands apart give 0; pipeline < 3 ms/frame.
- Every v2 number is an exported named constant. The rewritten noisy test uses real per-pixel noise. The rng
  call-count test is kept.
- Scenario parameters are frozen before tuning. The real-camera claim stays "passes synthetic" until the user confirms it.

## Continuation status (2026-10-18)

Continuation fixes and regression/browser evidence are recorded. See `docs/playtests/runs/2026-10-18-continuation.md` and `docs/handoffs/2026-10-18-resume.md` for final verification. Historical step checkboxes above are retained.
