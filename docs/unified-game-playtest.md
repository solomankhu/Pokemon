# Unified MONSTER TRAIL — implementation and verification

Implemented 2026-10-17 from the approved [design](superpowers/specs/2026-10-17-unified-monster-trail-design.md) and [plan](superpowers/plans/2026-10-17-unified-monster-trail.md).

## Play

For a dedicated game window without browser tabs or an address bar, double-click **`Play Monster Trail.vbs`** in the game folder. It uses Chrome or Edge app mode, maximizes the window, and keeps the normal browser profile and existing file-based saves. Close it with the window close button or Alt+F4. The launcher does not install anything.

Open `claude's monsters.html` in a browser. It works directly from disk, including the underground chapter. Alternatively serve this folder and open `http://127.0.0.1:8765/claude's%20monsters.html`.

```powershell
.\.venv\Scripts\python.exe -m http.server 8765 --bind 127.0.0.1 --directory E:/game
```

Start or continue MONSTER TRAIL. Beat LEADER VOLT, then confirm the victory screen to choose DESCEND or RETURN TO TRAIL. Descent remains available from the post-victory menu and gym entrance. Your monsters wait above while you explore Intake, Archives, and Signal Core.

Pause below to open FLOOR PLAN or RETURN TO TRAIL. Return is also available on death and victory. Completing all three floors records completion, and the descent menu permits replay. CONTINUE offers the last unfinished floor checkpoint after reloading.

RPG controls: arrows/WASD move, Z/Enter confirm, X/Esc cancel/menu, Shift run. Underground controls: WASD move, mouse look, F light, click pulse, Space jammer, Shift sprint, Esc pause. Touch controls are included in both chapters.

Browser saves retain party HP/stats, balls, materials, picked items, trainer/gym flags, world edits, cave counters, and return position. Underground checkpoints restart at the beginning of their floor with normal resources. Old browser saves are supported; the Python RPG remains standalone and its save is not imported automatically. Settings remain independent.

## Delivered

- `campaign.js`: versioned campaign state, validated frame protocol, saving and memory-only recovery, loading/retry/return handling, shared campaign header.
- `claude's monsters.html`: campaign save metadata, victory/descent flow, persistent descent access, CONTINUE/resume, new-game reset, input/audio/update/render suspension while below.
- `gemini's code.html`: embedded chapter lifecycle, three authored room layouts, stage-specific collision/navigation/rendering, protected arrival refuges, escape loops, room signs/equipment, floor/room HUD and paused map with readable room legend.
- `vendor/three-r128.min.js` and `vendor/three-LICENSE.txt`: pinned official runtime and MIT license. No external download is needed for ordinary play.
- Original source backups and execution evidence remain under `.superpowers/sdd/2026-10-17-unified-monster-trail/`; this workspace has no Git history.

## Automated checks

| Command | Result |
| --- | --- |
| `.\.venv\Scripts\python.exe "claude's monsters.test.py"` | 4,876 checks, including dummy-display rendering and Python/browser data parity |
| `node "claude's monsters.test.js"` | 3,261 checks |
| `node "gemini's code.test.js"` | 361 checks |
| `node campaign.test.js` | 8 campaign test groups |
| `node .superpowers/sdd/2026-10-17-unified-monster-trail/browser/campaign-flow.cjs` | 12 real Chromium campaign scenarios |
| `node .superpowers/sdd/2026-10-17-unified-monster-trail/browser/chapter-experience.cjs` | 8 real Chromium gameplay/UI scenarios |
| `node .superpowers/sdd/2026-10-17-unified-monster-trail/browser/audio-lifecycle.cjs` | Both parent-bar and child-menu return paths close chapter audio |

The Node chapter suite checks distinct floor geometry, terminal/station/exit reachability, collision fuzzing, AI routing, pulse line-of-sight, protected refuge and knockback, bidirectional escape loops, stage build/dispose ownership, and resource routes. RPG tables were not changed.

| Floor | Original route / oxygen margin | New route / oxygen margin | Oxygen after 25% detour without refills | Oxygen after detour and refill route |
| --- | --- | --- | --- | --- |
| Intake | 122 units / 5.47× | 102 units / 6.53× | 81.4% | 91.2% |
| Archives | 207 units / 2.20× | 216 units / 2.10× | 41.1% | 92.4% |
| Signal Core | 251 units / 1.48× | 232 units / 1.60× | 19.8% | 73.1% |

Oxygen drain rates remain 0.015 / 0.022 / 0.027 per tick. All ideal-route margins exceed 1.4×. These are deterministic navigation/resource checks, not a claim that every player route or encounter is survivable.

## Browser evidence

Chromium tested HTTP and direct `file://` operation. Unexpected JavaScript errors: none. Expected aborted requests were injected only for loading-recovery tests.

Campaign scenarios cover: fresh-game lock, victory/deferred descent, persistent menu, same-window entry, frozen RPG state/input, duplicate entry and spoofed messages, floor checkpoint and pause return, refresh/CONTINUE resume, three enter/return cycles, failed load return, readiness-timeout retry, blocked storage with explicit cancel/continue choices and successful recovery, and local-file entry/return.

Gameplay/UI scenarios cover: protected arrival, actual keyboard movement through the arrival doorway, paused floor plan and Escape close, reduced-motion preference, progression through terminals on all three floors and persistent final completion, replay, death return, new-game reset, actual touch joystick and look gestures, flashlight/pulse/pause controls, and landscape/portrait map and return controls.

CDP WebAudio measurements verify that both return paths close the running child audio context and leave zero open child contexts after iframe removal. Parent audio suspends during descent and resumes on return. Chromium retains metadata for closed contexts without an immediate contextDestroyed event; the report does not mistake retained metadata for live sound. Evidence is in `browser/audio-lifecycle-results.json` under the execution directory.

Completion tests use the game's exposed simulation seams to reach each objective and exercise the real stage-transition and victory event handlers. This avoids pretending an automated teleport is a complete manual playthrough. Navigation/resource suites separately traverse collision-aware routes, while browser keyboard and touch tests verify the actual input paths.

Screenshots inspected:

- [Intake floor plan](../.superpowers/sdd/2026-10-17-unified-monster-trail/browser/intake-floor-plan.png)
- [Archives geometry](../.superpowers/sdd/2026-10-17-unified-monster-trail/browser/archives-overhead.png)
- [Signal Core geometry](../.superpowers/sdd/2026-10-17-unified-monster-trail/browser/signal-core-overhead.png)
- [Return to the trail](../.superpowers/sdd/2026-10-17-unified-monster-trail/browser/campaign-return.png)
- [Touch landscape floor plan](../.superpowers/sdd/2026-10-17-unified-monster-trail/browser/touch-floor-plan.png)
- [Touch portrait floor plan](../.superpowers/sdd/2026-10-17-unified-monster-trail/browser/touch-portrait-map.png)

## Review and repairs

A fresh independent review found no Critical or Important defects. Its smaller findings were addressed: storage warnings clear after saving recovers, the accessible map includes the junction/control connection, and reducer tests now assert actual immutability while browser snapshots verify RPG preservation.

Browser regression checks caught and verified repairs for Enter activating a newly opened modal, Chromium's different local-file location/message origins, clipped short-screen map content, and campaign controls overlapping the portrait chapter title. A separate campaign header and numbered map/readable room legend resolve the layout issues. Rotation guidance appears during touch play rather than over the paused map.

Research links and the reasoning behind authored loops, landmarks, quiet arrival areas, and critical-route budgets are preserved in the design document. The maps and equipment are original geometry; no commercial floor plan or art pack was copied.
