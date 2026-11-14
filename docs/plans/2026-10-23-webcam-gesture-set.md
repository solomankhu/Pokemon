# Webcam gesture set (record first, then distinct detectors) — DEEP

**Goal.** Today one "punch" (fast-rise motion in the punch zone) means everything, by context. Add distinct body
gestures, tuned on the user's own recorded clips. Browser-only (`combat/commands.py` has no webcam keys; no Python parity).

| Gesture | Battle menu (`phase==='menu'`, ids ATTACK 0 / DEFEND 4 / BAG 1 / SWAP 2 / RUN 3) | Timed command |
|---|---|---|
| Punch (fist at camera) | ATTACK -> move list (then sweeps + double punch pick a move, as today) | all kinds, unchanged |
| Guard (forearms crossed, then held still ~300 ms) | DEFEND -> choice screen; punch confirms | extra trigger for `guard` |
| One-hand overhand throw (top corner -> centre, downward arc) | wild battle with balls: throws BALL via the BAG confirm path; trainer/hunt/no balls: nothing | extra trigger for `catch` press (punch still press/release) |
| Shove (both palms forward) | SWAP -> party screen (reversible) | — |
| One hand raised and held (~600 ms) | BAG -> bag screen | — |
| Lean/step out of frame (>=1 s) | cursor to RUN only; punch confirms (never flees on its own) | — |
| Kept unchanged: sweeps, two-hand cancel (x), double punch = confirm everywhere else | | |

**Acceptance.** (1) Test gestures gets RECORD (desktop; hidden when download is unsupported): label select, 3 s
aria-live text countdown, records 3 s of post-warm-up frames (copied with `slice()`), downloads
`webcam-clip-<label>-<n>.json` with header {v:1,w,h,label,mirror,gain,zone,punchMin,t[]}; Esc/Close mid-record clears
timers, listener and revokes the Blob URL; never dispatches. (2) `classifyGesture` (ring inside the tracker, so a pause
resets it) on user clips: >=4/5 right per gesture, <=1 wrong label overall, idle/talk/sway clips 0 actions.
(3) Actions are opt-in by `sample.phase==='menu'`; without a phase the tracker output is byte-identical to today, so
existing scenario/legacy tables and `webcam.test.js:37,39` stay green unchanged. (4) An action consumes the onset
(clears `pendingBurstAt`, sets `lastOnsetMs`): punch+punch within 500 ms gives ATTACK only, not a move.
(5) `battleAction(id)` re-checks `!campaignBusy && !combatModal && battleFocused && phase==='menu' && !b.step &&
!b.queue.length && G.fadeDir===0 && CFX.lungeAge===null`, rejects ids not in the visible menu (id 4 when
`!CombatCommands`), then goes through `confirmKey`. Dispatch ignores actions when `o.battleAction` is missing.

**Phase 1 — recorder (game-feel-engineer).** `combat/webcam.js`: listener gets `(motion,t,frame,state)`; pure
`encodeClip/decodeClip`. `combat/host.js` `openTestGestures`: RECORD UI. Tests: `webcam.test.js` round trip,
`webcam-host.test.js` button, cleanup, no dispatch.
**STOP: user records ~5 clips per gesture + 3 idle/talk clips into `combat/clips/` (README: personal, local, never copy/publish).**

**Phase 2 — detectors (game-feel-engineer).** `webcam.js`: `classifyGesture`, phase-aware `stepTracker`, `action`
intent -> `o.battleAction`. `claude's monsters.html`: `webcamOptions()` adds `getPhase`, `battleAction`.
Tests: new `combat/webcam-clips.test.js` (passes with no folder), new frozen synthetic scenes for each gesture
(nuisance scenes count actions via a stub), `webcam-integration.test.js` (each id, guards, no-CombatCommands, trainer throw).
Docs (wiki-sync): testing.md suite count + entry, monster-trail.md, playtests MT-16, webcam spec 399-401, CLAUDE.md webcam paragraph.

**Verification.** `node .claude/scripts/verify.js --only combat,js` per phase, full gate at end; game-reviewer;
playtester `game: monster-trail mode: duty` MT-16 (no camera granted); real-camera feel = user check.

## Review log
| # | Persona | Sev | Finding | Resolution |
|---|---|---|---|---|
| 1 | Risk | CRIT | Matching-kind-only would break punch in guard/catch | Fixed: new gestures are extra triggers; punch unchanged |
| 2 | Risk | CRIT | Action + pending double punch picks move 0 | Fixed: action consumes the onset; test (4) |
| 3 | Gap | CRIT | id 4 means RUN without CombatCommands | Fixed: reject ids not visible; test |
| 4 | Both | GAP | Tracker has no phase | Fixed: `getPhase` seam, opt-in actions |
| 5 | Gap | GAP | Single gesture could flee | Fixed: lean only moves cursor to RUN |
| 6 | Both | GAP | ATTACK/DEFEND/BAG are two-step; "best ball" unreal | Fixed: flows spelled out; throw uses BALL, trainer/hunt no-op |
| 7 | Risk | RISK | battleAction skips key-path guards | Fixed: guard list in (5) |
| 8 | Both | GAP | Recorder: no frame, buffer aliasing, thin header, warm-up | Fixed: frame+state arg, slice(), full header, skip warm-up |
| 9 | Gap | GAP | Modal cleanup, a11y, iOS download | Fixed: cleanup, aria-live, desktop-only |
| 10 | Gap | GAP | Stale docs | Fixed: wiki-sync step in Phase 2 |
| 11 | Both | MIN | Clip privacy/size (~0.6 MB each) | Fixed: README marker; clips local only |
| 12 | Risk | MIN | Hold timers across pause | Fixed: ring inside tracker |

## Phase 1 result (2026-10-23)
Done: game-reviewer PASS r1; `verify.js --only combat,combatpy` PASS (webcam 238, host 145, scenarios 181 unchanged).
Deferred to Phase 2 (reviewer MINORs): hide RECORD on coarse pointers (`host.js:107`, iOS passes the download check);
copy the frame only once (`webcam.js:264` + `host.js:137`); a mid-record camera stall should keep or explain the partial
clip (`host.js:133`); the MT-16 playtest screenshots must include Test gestures with RECORD.
