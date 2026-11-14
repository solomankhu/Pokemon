# Webcam battle controls (DEEP)
Spec: `docs/superpowers/specs/2026-10-18-webcam-battle-controls-design.md`. Detailed steps and code: `docs/superpowers/plans/2026-10-18-webcam-battle-controls.md`.

**Goal / acceptance:**
1. With webcam ON, a centre-zone motion burst arms, then judges, strike/guard/charge/catch through the existing `commandInput` (same tier as a key press at the same command time).
2. In battle menus, sweeps send arrows, a double burst (within 900 ms) confirms, and a two-hand 1.5 s hold cancels. One stray burst never confirms.
3. The camera streams only when `G.mode==='battle'`, focused, not `campaignBusy`, and `G.settings.webcam==='ON'`. After a battle, `webcam.state==='off'` and every track is stopped.
4. Denied, unavailable or ended: OFF, plus one toast. No re-prompt loop.
5. Old settings/saves load; the 4 existing settings keys behave identically; engine rng untouched (no `Math.random` in webcam.js).

**Files and owner (sequential; one worker, game-feel-engineer, because the work is input/UI):**
1. `combat/webcam.js` + `combat/webcam.test.js` (new): classifier, tracker, computeLag, controller.
2. `combat/commands.js:11` normalizeSettings (+5 keys) + `combat/commands.test.js`. The build counterpart `combat/commands.py` is **deliberately unchanged** (browser-only feature).
3. `combat/host.js`: settings() passthrough (line 5), Apply merge plus WEBCAM rows (17), openCalibration, camera badge, notify, exports + `combat/webcam-host.test.js` (new).
4. `claude's monsters.html`: script tag, `commandClock()` extracted from commandInput, `webcamPauseGen` (releaseAll + onModal), `webcamOptions()`, controller in boot, `webcam.sync(...)` in the frame loop, pagehide dispose, `__GAME__` exports + `combat/webcam-integration.test.js` (new).
5. Docs: CLAUDE.md, docs/wiki/testing.md, docs/playtests/monster-trail.md (MT-16).
There is no parallelism, because steps 3 and 4 depend on step 1's API.

**Tests:** all new checks go in combat/*.test.js (auto-discovered by combat/verify.cjs). The Python suite and the claude's monsters.test.js counts are unchanged.

**Risks:**
- Step queue / command flow: commandClock must give the same value as the old inline code. integration.test.js lines 23-26 (key-timed strike) must stay green.
- Save format: G.settings gains keys. Old saves go through normalizeSettings on load (html:2414), giving defaults.
- host.js Apply previously wrote a literal 4-key object. It now merges; host.test.js must stay green.
- Input dropped during modals/blur (isInputOpen) and pause counter: prevents back-dated presses.
- The camera light stays on after a battle (privacy): covered by the lifecycle tests plus MT-16.
- Determinism: webcam.js layers 1-2 are pure; there is a source scan plus a Math.random spy.

**Verification:** `node .claude/scripts/verify.js --only combat,js,campaign,py`, then the full `verify.js`. Playtester `game: monster-trail, mode: duty, MT-16, MT-04, MT-13, MT-14`.

## Review log

| # | Persona | Severity | Finding | Resolution |
|---|---|---|---|---|
| 1 | Risk | CRITICAL | Hidden tab: rAF pauses, so the frame-loop `sync(false)` never runs and the camera stays on | Fixed: the blur and visibilitychange handlers call `webcam.sync(false)`; `tick` stops itself when `document.hidden`; controller test plus MT-16 check |
| 2 | Gap | CRITICAL | `lastGen` is only set in `start()`, so the first burst on a headless controller was dropped as a "pause" | Fixed: set at creation, in `measureFloor` and on reaching live; test "first burst after warm-up is not mistaken for a pause" |
| 3 | Risk | RISK | `halt()` dropped `pendingRelease`, leaving `keys['z']`/an arrow stuck | Fixed: halt releases the key; test |
| 4 | Risk+Gap | RISK/GAP | Calibration can open outside a battle, or with the webcam OFF, and loops "Missed" | Fixed: Calibrate only when in battle and ON; the card waits for `live` and reports a dead camera; tests |
| 5 | Risk | RISK | Floor measured during start-up/exposure could exceed BURST_MIN | Fixed: wait for readyState ≥ 2, then SETTLE_MS 500; floor capped at BURST_MIN/2; tests |
| 6 | Risk | RISK | Blur caused by the permission prompt aborts the request, so it re-prompts in a loop | Fixed: `sync(false)` while starting defers the stop (wantStop); test |
| 7 | Risk | RISK | One stray burst confirms menus (could pick RUN) | Fixed: a double burst within 900 ms is needed; spec updated; tests |
| 8 | Gap | GAP | The spec's lifecycle, key-then-webcam, key-held charge and rng-count tests were missing | Fixed: added to webcam-integration.test.js (`webcamActive` extracted). campaignBusy/battleFocused aren't settable headless; they're covered by code review plus MT-16 |
| 9 | Gap | GAP | testing.md "9 suites" goes stale | Fixed: Task 9 updates the count |
| 10 | Both | MINOR | Badge overlaps the foe HP box; badge keys reach the game | Fixed: badge top-right; key stopPropagation |
| 11 | Gap | MINOR | Escape doesn't close calibration | Fixed: `settingsOpen=true`; test |
| 12 | Both | MINOR | pagehide dispose is permanent after a bfcache restore | Fixed: persisted, so sync(false) only |
| 13 | Risk | MINOR | Slow mode never recovers | Fixed: back to 33 ms after 60 fast ticks |
| 14 | Risk | MINOR | `display:none` video may not decode on Safari | Fixed: 1px transparent fixed video |
| 15 | Gap | MINOR | The webcam release can cut off a Z the player is physically holding | Deferred: needs keyboard and webcam at once on the same key; harmless (one release); revisit if the playtest shows it |
| 16 | Gap | MINOR | A reload with webcam ON may prompt at the first battle | Deferred (accepted in spec); MT-16 now records it |
