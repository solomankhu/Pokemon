# Webcam Battle Controls - Design

Status: approved in brainstorming 2026-10-18 (approach A: motion zones). Lane: DEEP.

## Goal

Let the player fight MONSTER TRAIL battles (browser build only) with body motion seen by
their webcam: punch/block/throw to time the existing strike, guard and catch commands,
wind up and release for charge, and sweep to move through the battle menu. Keyboard and
touch keep working at the same time. The feature is opt-in and off by default.

## Non-goals

- Overworld movement, THE STATIC BELOW, and the Python/pygame build (no clean webcam path;
  same split as the 3D presentation, which is browser-only).
- Pose or hand tracking, ML models, or any downloaded asset. Motion zones only.
- Any change to the engine, step queue, rng, shared tables, MAP or the save format beyond
  the new settings keys below.

## Existing integration points

- Battle commands are chosen by the battle, not the player. A command (`strike`, `charge`,
  `guard`, `catch`; `PROFILES` in `combat/commands.js`) is resolved by one confirm press
  and release timed against its window.
- All confirm input flows `press('z')` / `release('z')` -> `commandInput(pressed, released, at)`
  in `claude's monsters.html`.
- **`at` is command time, not wall time.** It is in seconds of `b.command.elapsed`, which
  advances at `dt * 0.55` (the `pumpQueue` `cmd` step). `stepCommand` clamps it to
  `[0, profile.duration]`. When `at` is omitted, `commandInput` uses
  `elapsed + fractional`, where `fractional` is the time since `lastBattleFrameAt`
  (capped at 50 ms) times 0.55.
- **Arming handshake.** A new command starts with `ready=false`. The first press sets
  `ready=true, waitingRelease=true`, a release clears `waitingRelease`, and only then
  does the command clock run and judge presses. Keyboard players already press once
  to start the window and once to hit. `releaseAll()` resets this.
- `strike`/`guard` finish on the first judged press; `charge`/`catch` arm on press
  (`armed`, `held`) and are judged on release. When a command finishes, `b.command`
  becomes `null`, so later presses are ignored naturally. `b.commandInput` is cleared every
  frame.
- Input is dropped while `combatModal` is set (`press()` returns early) or
  `battleFocused` is false (`commandInput` returns early). The battle update also returns
  early while `combatModal` is set, so **the command clock is paused while any host modal
  is open.**
- Menu navigation is `press('arrowleft'|'arrowright'|'arrowup'|'arrowdown')`, confirm is
  `press('z')`, cancel is `press('x')`.
- Battle settings live in `G.settings`, normalised by `CombatCommands.normalizeSettings`.
  The settings panel is built in **`combat/host.js`** (`openSettings`, through `showModal`,
  which calls `onModal(true)`, which sets `combatModal`, and `presenter.suspend()`). Its
  Apply handler currently persists a literal four-key object, and its fallback
  `settings()` keeps only those four keys.
- `combat/commands.py` has its own `normalize_settings`. It deliberately does **not** get
  the webcam keys, because the Python build is out of scope. This is not a parity gap.

## Architecture

New file `combat/webcam.js`, UMD-wrapped like `combat/commands.js`, exporting
`MonsterWebcam`. Three layers; only layer 3 touches the browser.

### Layer 1 - `classifyMotion(prev, curr, opts)` (pure)

- Input: two `Uint8Array` grayscale frames of `W*H` (W=80, H=60), and
  `opts = { threshold, noiseFloor, mirror }`.
- Per pixel, `|curr - prev| > threshold` counts as motion. The frame is divided into a
  3x3 zone grid (zone index `row*3+col`, centre = 4, upper corners = 0 and 2). Each
  zone value is its moving fraction minus `noiseFloor`, floored at 0. Output:
  `{ zones: number[9] (0..1), total (0..1, whole frame), centroidX, centroidY (0..1, or
  null when total is 0), event }`.
- `event` labels single-frame facts only: `null | 'burst' | 'noisy'`. It is `'burst'`
  when `zones[4] >= BURST_MIN`, and `'noisy'` when 7 or more zones are `>= NOISY_MIN`
  (noisy wins). Sweeps and holds need history, so layer 2 decides them. `mirror` flips X
  before zones and the centroid are computed.
- Named constants, exported for tests: `FRAME_W=80`, `FRAME_H=60`, `BURST_MIN=0.18`,
  `NOISY_MIN=0.25`, `SWEEP_SPAN=0.45`, `SWEEP_WINDOW_MS=400`, `CANCEL_MIN=0.18`,
  `CANCEL_HOLD_MS=1500`, `COOLDOWN_MS=250`, `THRESHOLDS={LOW:40,MED:28,HIGH:18}`.
- No allocation per call beyond the result object. Budget: 1000 classifications in
  under 1 s in Node.

### Layer 2 - `createTracker(settings)` / `stepTracker(tracker, sample, nowMs)` (pure)

A state machine turning the layer-1 stream into input intents.
`sample = { motion (layer-1 result), command }`, where `command` is `null` or
`{ kind, ready, waitingRelease, held }` copied from `b.command`. Returns
`{ tracker, intents }`. Each intent is one of:

- `{ type: 'arm' }`: press and release with no lag correction, for a command that is
  not `ready` yet.
- `{ type: 'press', lagged: true }` / `{ type: 'release', lagged: true }`: a timed
  command input.
- `{ type: 'key', key }`: a menu or message key (`'z'`, `'x'` or an arrow).

Rules:

- **Burst onset** happens when `zones[4]` rises to `>= BURST_MIN` from idle. Hysteresis:
  the next onset needs `zones[4] < BURST_MIN / 2` and `COOLDOWN_MS` since the last onset.
- **The burst maps by context.**
  - `command` is null: a **double burst** (a second onset within `DOUBLE_MS` = 900 ms)
    emits `{ type:'key', key:'z' }`, for menus and messages. One stray burst never
    confirms. (Changed after plan review: someone walking past could otherwise pick a
    move or RUN.)
  - `command.ready === false`: `{ type:'arm' }`. This mirrors the keyboard, where you
    move once to start the window and again to hit.
  - `command.waitingRelease`: nothing happens; the controller's arm already released.
  - `strike`/`guard`: `press` (lagged). The command finishes on that press.
  - `charge`/`catch` with `command.held === false`: `press` (lagged). The tracker enters
    `holding`.
  - `charge`/`catch` with `command.held === true`: `release` (lagged). Using `held` from
    the command, not tracker memory, means a press made on the keyboard can be released
    by a webcam burst and the other way round.
  - If the command becomes null while holding, the tracker returns to idle and emits
    nothing.
- **Sweeps.** When `centroidX` (or `centroidY`) travels more than `SWEEP_SPAN` within
  `SWEEP_WINDOW_MS` while `total` is above 0, the tracker emits
  `{ type:'key', key:'arrowleft'|'arrowright'|'arrowup'|'arrowdown' }`. This happens only
  when `command` is null, because sweeps are for menus. A sweep cancels a burst onset in
  the same window.
- **Cancel.** `zones[0]` and `zones[2]` both `>= CANCEL_MIN` continuously for
  `CANCEL_HOLD_MS`, with `command` null, emits `{ type:'key', key:'x' }` once per hold.
- **Noisy.** While `motion.event === 'noisy'` no intents fire, any onset in progress is
  dropped, and `tracker.status = 'noisy'`. Otherwise `status` is `'idle'` or `'holding'`.
- Pure: no `Date.now`, no `Math.random`; time arrives as `nowMs`.

### Layer 3 - `createWebcamController(options)` (shell)

`options = { doc, global, getSettings, setSettings, isBattle, isInputOpen, getCommand,
commandClock, pauseGeneration, press, release, commandInput, onStatus }`.

- `isInputOpen()` is `!combatModal && battleFocused`. Intents arriving while it is false
  are **dropped on purpose**, matching key input.
- `commandClock()` returns the current command time in seconds, `elapsed + fractional`.
  It is the existing expression from `commandInput`, moved into a named helper in the
  HTML so both paths use it. `commandInput`'s behaviour is unchanged.
- `pauseGeneration()` returns a counter the HTML increments in `releaseAll()` and
  whenever `combatModal` turns on. It is the only new battle-side state.

- `start()`: if `navigator.mediaDevices?.getUserMedia` is missing, returns status
  `unavailable`. Otherwise it requests `{ video: { width: 160, height: 120 }, audio: false }`,
  attaches the stream to a hidden `<video muted playsinline>`, and samples it into an
  offscreen 80x60 canvas at 30 Hz with `setTimeout`. If the 8 ms per-frame cost is
  exceeded three times in a row, it drops to 15 Hz.
- Per sample: grayscale -> `classifyMotion` -> `stepTracker` -> dispatch intents, only
  if `isInputOpen()`:
  - `arm`: `commandInput(true,false)` then `commandInput(false,true)`, with no `at`.
  - `press`/`release` (lagged):
    `at = max(0, commandClock() - (webcamLagMs / 1000) * 0.55)`, then
    `commandInput(true,false,at)` or `commandInput(false,true,at)`. The 0.55 converts
    wall-clock lag into command time. **Pause guard:** the controller remembers
    `pauseGeneration()` at every sample. If it changed between the previous sample and
    this one (a modal, blur or `releaseAll` happened during the lag window), the lagged
    intent is dropped and the tracker reset, so a pause can never back-date a press
    into time that was not played.
  - `key`: `press(key)`, then `release(key)` on the next sample.
- **Warm-up.** For the first 1 s after `start()` the controller dispatches no intents.
  It discards the first frame, since there is no valid previous frame and diffing it
  against blank would look like a burst. It measures a **per-zone** `noiseFloor[9]`
  (mean moving fraction per zone), and the classifier subtracts each zone's own floor.
  The calibration "stay still" step measures it the same way.
- **Turning ON mid-battle.** Choosing ON in the settings panel during a battle calls
  `start()` immediately. If `webcamCalibrated` is false, the calibration card then
  opens.
- **AUTO action mode** still needs the arm press. This is existing behaviour for
  keys too, so with webcam + AUTO the one arm burst is the only gesture needed. That is
  expected, not a bug.
- `stop()`: stops every track, clears the timer, removes the video element and listeners.
  It is idempotent.
- `dispose()`: `stop()` plus dropping all references.
- Frames are never stored, drawn to the game canvas, or sent anywhere. Only the
  calibration preview draws the live image, into its own small canvas, and only while
  the card is open.

### Input arbitration

There is no new arbitration state. The existing command flow already enforces one
result per window: `strike`/`guard` finish on the first judged press, and `b.command`
then becomes `null`, so any later press (key or webcam) finds no command and is ignored.
For `charge`/`catch` the tracker reads `command.held` rather than its own memory (see
layer 2), so mixed key and webcam input stays consistent. If a key press and a webcam
press land in the same frame, the later `commandInput` call's timestamp wins, exactly as
two key events in one frame do today.

Battle-side changes, all in `claude's monsters.html`: extract `commandClock()`, add
`pauseGeneration`, create the controller, and call its lifecycle. The command and judge
logic is unchanged.

## Lifecycle

| Event | Controller |
|---|---|
| Battle begins and `settings.webcam === 'ON'` | `start()` |
| Battle ends (any result), campaign descends, `G.mode` leaves `battle` | `stop()` |
| `visibilitychange` hidden or window `blur` | `stop()`; on return to a battle with ON, `start()` again. The existing `releaseAll()` already pauses the command. |
| Settings switched OFF | `stop()` |
| Track `ended` / permission revoked | `stop()`, set `webcam: 'OFF'`, show toast once |
| Page unload | `dispose()` |

The camera light must be off whenever no battle is running. Because `requestAnimationFrame`
pauses in a hidden tab, the blur and `visibilitychange` handlers call `sync(false)`
directly, and the sampler stops itself when `document.hidden`. While a permission request
is pending, `sync(false)` defers the stop until the request settles, so a blur caused by
the prompt does not cause a re-prompt loop. Warm-up ignores frames until the video is
ready, plus `SETTLE_MS` (500), and caps each zone's floor at `BURST_MIN / 2`. Calibration
is offered only in a battle with the webcam ON, and it waits for the camera to be live.

**Permission prompts.** The game usually runs from `file://`. In Chromium, a camera
grant ("Allow" or "Allow this time") lasts at least as long as the page stays open, so
`getUserMedia` calls again in later battles of the same session do not re-prompt. A
browser may still prompt again after a reload. That is accepted, and better than
keeping the camera open between battles. The playtest checks the behaviour for real
(two battles in a row with no second prompt under a granted permission). If a target
browser does re-prompt every battle, that is a finding to bring back to the user, not
something to fix silently by holding the stream open.

## Settings

`normalizeSettings` in `combat/commands.js` gains five keys (unknown or junk values fall
back to defaults; old settings objects without them load unchanged). `combat/host.js`
must stop dropping them. Its fallback `settings()` passes through the webcam keys, and
its Apply handler persists `Object.assign(settings(), {changed keys})` instead of a
literal four-key object.

| Key | Values | Default |
|---|---|---|
| `webcam` | `'OFF'` / `'ON'` | `'OFF'` |
| `webcamSensitivity` | `'LOW'` / `'MED'` / `'HIGH'`. v1 pixel threshold 40 / 28 / 18; since v2 it is legacy: normalised and kept but frozen, and it only seeds `webcamGain` for old saves | `'MED'` |
| `webcamGain` | integer 1..9 (v2; numeric strings parsed, clamped, rounded); missing or junk derives from `webcamSensitivity` LOW 3 / MED 5 / HIGH 7 | `5` |
| `webcamPunch` | number 0.05..0.6 (v2, set by calibration; clamped) or `null` = `PUNCH_DEFAULT` 0.25 | `null` |
| `webcamZone` | `'CENTER'` / `'LEFT'` / `'RIGHT'` (v2 punch region) | `'CENTER'` |
| `webcamOverlay` | boolean, in-battle mask overlay (v2) | `false` |
| `webcamMirror` | boolean | `true` |
| `webcamLagMs` | integer 0..300 (a numeric string is parsed; out-of-range is clamped; NaN gives the default) | `120` |
| `webcamCalibrated` | boolean, set true when calibration finishes with DONE | `false` |

UI: a WEBCAM group in the existing battle settings panel, with ON/OFF, Sensitivity,
Mirror and a CALIBRATE button. While the camera is live, a small corner badge in battle
shows a camera icon and a 5-step motion meter that turns amber when noisy. Clicking it
opens settings. The badge is a DOM element with `aria-label="Webcam control on"`.

## Calibration card

Opened automatically when `webcam` is set ON while `webcamCalibrated` is false, and
from CALIBRATE. It is a new host modal, `openCalibration()` in `combat/host.js`, built
on the same `showModal`, so `combatModal` is set and the command clock is paused while
it is open (see integration points). It replaces the settings panel when opened from
there. Closing it returns to battle, with the usual `disarm()` input reset.

1. Live 160x120 preview with the 3x3 grid; zones light up when they move.
2. "Stay still for 2 seconds." Records the mean centre-zone motion and sets `noiseFloor`.
   This is session-only and not saved; it is recomputed silently over the first
   1 s of each `start()`.
3. "Punch when the ring closes", three times. Lag is the median of (onset - ring time),
   clamped 0..300, and saved to `webcamLagMs`.
4. DONE / RETRY / TURN OFF. TURN OFF stops the camera and sets OFF, and leaves
   `webcamCalibrated` and `webcamLagMs` unchanged.

Because the card is a host modal, `isInputOpen()` is false while it is open and no
intents are dispatched. Calibration reads `classifyMotion` results and burst onsets
from the controller's sample loop directly, through a `onCalibrationSample` callback,
never through game input.

The card suggests ASSIST action mode for webcam play but does not change it.

## Failure handling

| Case | Result |
|---|---|
| `getUserMedia` missing (old browser or blocked context) | WEBCAM row disabled with "Not available in this browser"; stays OFF |
| Permission denied | OFF; message "Camera blocked: keyboard and touch still work." No re-prompt until the player picks ON again |
| Revoked / unplugged mid-battle | `stop()`, OFF, one toast; the battle continues on keys/touch |
| Focus loss during a held charge | Existing `releaseAll()` pause; the tracker resets to idle; a fresh press is required |
| Noisy scene | No intents; amber badge; "Too much motion" in the badge title |
| Slow device | Drops to 15 Hz as above |

## Testing

New `combat/webcam.test.js`, picked up by `combat/verify.cjs` (and therefore by
`node .claude/scripts/verify.js`):

1. **Classifier:** synthetic frames for a centre burst, a still scene, full-frame noise
   and a two-corner patch each give the expected zones/event. Below-threshold motion gives
   `event: null`. `noiseFloor` is subtracted. `mirror` flips `centroidX`, and `centroidY`
   is reported. Performance budget: 1000 classifications in under 1 s.
2. **Tracker:** hysteresis (no re-fire without falling below half), cooldown, and the
   burst-mapping table row by row: null -> `key z`; not ready -> `arm`; waitingRelease ->
   nothing; strike/guard -> `press`; charge/catch with held false -> `press`; held true ->
   `release`. A charge abandoned when the command becomes null emits nothing. Sweeps in
   four directions fire only when command is null and suppress a burst. Cancel needs a
   continuous `CANCEL_HOLD_MS`. Noisy blocks all intents.
3. **Settings:** `normalizeSettings` with missing, junk and boundary webcam values
   (`webcamLagMs` -1, 301, '120', NaN) gives defaults or clamps; existing keys are
   unchanged.
4. **Controller (stubbed `getUserMedia`, video and timers):** it starts only in battle
   with ON; it stops on battle end, hide, blur, descent, OFF and denial; every track's
   `stop()` was called. Ten enter/exit cycles leave zero timers, listeners and video
   elements. `unavailable` is reported when `mediaDevices` is absent.
   `at = commandClock() - lag*0.55`, clamped at 0. A changed `pauseGeneration` drops the
   lagged intent. Intents while `isInputOpen()` is false are dropped.
5. **Arbitration and handshake:** on a fresh strike command, two webcam bursts (arm, then
   hit) produce a judged result. A key press that finishes a strike, followed by a webcam
   burst, gives exactly one result. A key-held charge is released by a webcam burst.
   `host.js` Apply keeps the webcam keys, which is a regression test for the literal
   four-key object.
6. **Determinism:** the module never references `Math.random`, checked by a source scan
   plus a spy. A battle driven by fake webcam intents leaves the engine rng call count
   identical to the same battle driven by keys.
7. **Integration through `__GAME__`:** a fake intent stream drives `commandInput` and
   gives the same judgment tier as the equivalent key timing.

Existing suites must stay green: `node .claude/scripts/verify.js`.

**Browser check (playtester, `game: monster-trail`):** Chromium with
`--use-fake-ui-for-media-stream --use-fake-device-for-media-stream`. Checks: the
calibration card renders and completes, the badge shows in battle, the stream's tracks
end after the battle, the denied-permission path shows the message, and there are no
console errors. A feel test with a real webcam is a manual user check.

## Files

- New: `combat/webcam.js`, `combat/webcam.test.js`.
- Edit: `combat/commands.js` (normalizeSettings keys); `combat/host.js` (settings
  passthrough, Apply merge, WEBCAM rows in `openSettings`, `openCalibration`, camera
  badge); `claude's monsters.html` (script tag after `combat/commands.js`,
  `commandClock()` extraction, `pauseGeneration`, controller construction and
  lifecycle calls at battle start/end, visibility hooks, and `__GAME__` exposure for
  tests).
- Docs: CLAUDE.md (combat/ paragraph and the HTML build's input notes),
  `docs/wiki/testing.md`, and a duty in `docs/playtests/` for the fake-camera check.
- Untouched: `claude's monsters.py`, shared tables, MAP, the save schema (except the
  settings keys), `campaign.js`, `gemini's code.html`.

No Git: back up each edited file under
`.superpowers/sdd/2026-10-18-webcam-battle-controls/` before editing.

## Addendum (2026-10-18): v2 signal

Plan: `docs/plans/2026-10-18-webcam-signal-v2.md` (including its amendments and reviewer bar). v1 diffed raw
frames at a fixed threshold, froze a per-zone floor after 1 s, doubled its sensitivity at 15 Hz, tracked a global
centroid and fired on any centre-zone motion. v2 replaces the controller's signal. `classifyMotion` is kept,
exported and unchanged, and the scenario suite runs it as the "old" column.

**Pipeline**: `createMotionModel()` / `stepMotion(model, gray, dtMs, opts)` is pure and stateful. The model owns
preallocated buffers, and time arrives only as `dtMs`. `opts = {gain, mirror, zone, punchMin, learn:'all'|'still'}`.
Each frame goes through these steps:
1. **Blur.** A 3x3 box blur.
2. **Duplicates.** A first frame, or an all-zero diff, returns `null` and changes nothing.
3. **Exposure fit.** A robust fit `cur ~ a*prev + b`: the median diff, then two least-squares passes over the inlier
   pixels. It cancels additive (+40) and multiplicative (x1.3) exposure steps.
4. **Residual.** The residual is compared with a per-pixel threshold `k(gain) * max(MIN_NOISE, noise)`.
5. **Noise model.** The noise EMA's alpha is dt-based. During warm-up and settle every pixel learns. Afterwards only
   still pixels learn, and a pixel that has been moving for more than 2 s leaks slowly, so a fan or TV can't stay a blob.
6. **Open.** A 3x3 erode-then-dilate on the mask.
7. **Outputs.** Zones, the largest 4-connected blob, block flow from a motion-history image, and the punch score.

`noisy` means the raw (pre-open) mask is at or above `NOISY_MIN` in 7 or more zones.

**dt.** The scale `clamp(33/dt, 0.5, 2)` multiplies the motion *energy* (`motion.energy`), not the pixel
threshold. Contrast does not depend on frame rate; swept area does. Scaling the pixel residual (the plan's literal
wording) lost low-contrast fists at 15 Hz. The punch integrates unscaled swept energy over a fixed `PUNCH_WIN_MS`, so
15, 20 and 30 Hz give the same value.

**Punch**: `punch = clamp((E - RISE_K*Q) / PUNCH_FULL) * gate`, where:
- `E` is the masked swept energy in the punch region over the last `PUNCH_WIN_MS`.
- `Q` is the minimum of the *soft* energy (sub-threshold motion included) over the last `RISE_MS`. A slow sway or
  lean therefore has a non-quiet baseline.
- `gate` falls from 1 to 0 as the region's block-flow coherence rises from `COH_LO` to `COH_HI`. A head sway slides
  one way (coherence near 1); a fist toward the camera spreads out (near 0.5). A sideways hook is therefore not a
  punch: punch toward the camera.

Punch regions are each middle-row cell grown into its neighbours (`PUNCH_RECT`, display px), because real fists
straddle cell borders. Energy is per one cell of area (`PUNCH_NORM_PX`).

**Tracker**: a v2 motion (one with `blob`/`punch`) uses `punch / punchMin` as the burst level, with re-arm below
`REARM`.
- An onset inside `PUNCH_COOLDOWN_MS` is used up, so a fist's retract can't fire later.
- Sweeps need the largest blob (at least `SWEEP_AREA_MIN`) to travel more than `SWEEP_SPAN_V2` within
  `SWEEP_WINDOW_MS`, with the trail reset on a jump over `BLOB_JUMP`. Global block flow must agree in sign with
  at least `FLOW_MIN`, so two hands moving apart cancel.
- There is one sweep per `SWEEP_REFRACT_MS`.
- `tracker.reason` is `'noisy' | 'cooldown' | 'confirm-pending' | null`.
- Legacy motions keep the v1 rules exactly.

**Controller**:
- It reads `webcamGain`, `webcamZone`, `webcamPunch` and `webcamMirror` every frame.
- A video `currentTime` that has not changed skips capture (at most `DUP_RUN_MAX` in a row).
- `measureFloor` resets the noise model and bumps an epoch that any callback re-checks.
- A pause gives a fresh tracker (keeping `lastOnsetMs`) and a temporal model reset (noise kept).
- Cost for the 30/15 Hz switch counts capture plus pipeline only.
- `lastMotion` is a read-only snapshot with a display-orientation mask copy, for the overlay and the test modal.
- `noiseFloor` is now a per-zone mean of the per-pixel noise.

**Calibration**:
- The still step also feeds the noise model and records the nuisance peak (the punch score in its second half).
- Each of the 3 punches records its peak `punch` over `CAL_PEAK_MS` in the configured zone. A sample without
  `punch` falls back to `zones[4]`.
- The threshold is `webcamPunch = calibratePunch(peaks, nuisance)`: `max(0.5 * median, CAL_FLOOR,
  CAL_NUIS_K * nuisance)`, clamped to 0.05..0.6.
- The result shows the delay and the punch strength.

**UI** (`combat/host.js`):
- The settings rows are found by label. Webcam gain is a slider (1..9) that replaces the LOW/MED/HIGH select;
  then come Punch zone, Mirror webcam, Show webcam overlay in battle, Calibrate webcam and Test gestures.
- Unsupported cameras disable all of them.
- Test gestures is a modal with the Calibrate gating, a live preview and scratch trackers; it never dispatches. It runs the trackers at phase `menu` and names PUNCH/GUARD/THROW/SHOVE/RAISE/LEAN. On desktop it has RECORD (Clip label select, 1 s aria-live countdown, 3 s of post-warm-up frames, downloads `webcam-clip-<label>-<n>.json` via `encodeClip`; hidden on coarse pointers).
- Gesture set (plan `docs/plans/2026-10-23-webcam-gesture-set.md`): when the HTML's `getPhase()` returns `menu`, `classifyGesture` turns guard/throw/shove/raise/lean into `{type:'action',id}` intents for `battleAction(id)` (defend, ball, swap, bag, run-cursor; punch = attack). Without a phase the tracker is byte-identical to before. Guard also triggers a timed `guard` command, back-dated in command time.
- The overlay sits at canvas px (520, 84), 96x72, scaled with the canvas but never above CSS y 83 (clear of
  SETTINGS and both CAM badge slots), and is hidden if it would reach y 240. It has `pointer-events: none`,
  redraws at 15 Hz (3 Hz under reduced motion) and is removed when the camera is not live or a modal is open.

**Constants** (all exported from `combat/webcam.js`):
- `V2 = {DT_REF 33, DT_SCALE_MIN .5, DT_SCALE_MAX 2, MIN_NOISE 2.5, GAIN_K_MAX 7, GAIN_K_STEP .55, NORM_BAND 40,
  NORM_BAND2 16, NORM_MIN_FRAC .3, NORM_MIN_VAR 25, NORM_GAIN_MIN .6, NORM_GAIN_MAX 1.7, NOISE_TAU_WARM 250,
  NOISE_TAU 1500, NOISE_TAU_LEAK 4000, NOISE_LEAK_MS 2000, NOISE_CAP 40, MHI_MS 500, FLOW_BLOCK 10, FLOW_STEP 2,
  FLOW_BLOCK_MIN 4, REARM .5, AGE_EPS_MS 1, PUNCH_WIN_MS 133, RISE_MS 200, RISE_K 3, SOFT_FRAC .5, COH_LO .8,
  COH_HI .95, PUNCH_FULL .2, HIST 32}`.
- `GAIN_MIN 1`, `GAIN_MAX 9`, `GAIN_DEFAULT 5`; `k(gain) = 7 - 0.55 * (gain - 1)`.
- `PUNCH_DEFAULT .25`, `PUNCH_MIN .05`, `PUNCH_MAX .6`, `PUNCH_COOLDOWN_MS 350`.
- `SWEEP_SPAN_V2 .35`, `SWEEP_AREA_MIN .01`, `BLOB_JUMP .5`, `SWEEP_REFRACT_MS 700`, `FLOW_MIN .35`.
- `DUP_RUN_MAX 3`.
- `CAL_FLOOR .12`, `CAL_NUIS_K 1.5`, `CAL_ONSET .08`, `CAL_PEAK_MS 300`.
- `PUNCH_NORM_PX 540`, `PUNCH_RECT {LEFT [0,36,8,58], CENTER [16,64,8,58], RIGHT [44,80,8,58]}`.

**Evidence**: `combat/webcam-scenarios.test.js` (frozen synthetic scenes; the claim is "passes synthetic" until a
real-camera check by the user).
