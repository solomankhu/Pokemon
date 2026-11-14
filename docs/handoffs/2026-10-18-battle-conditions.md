# battle-conditions - handoff 2026-10-18

## Goal
"Each fight scene should be random and different", with approach 1 chosen: one announced condition per battle, plus a varied scene. The user paused it after Chunk 3 to design the loot system first.

## Done
- **Chunk 1, Python rules** (`claude's monsters.py`, `claude's monsters.test.py`): game-reviewer PASS, round 1. The conditions are boost-only (Water/Fire/Dark/Rock 1.2, Electric 1.15, fog -10 accuracy); the user chose boost-only after the balance rule fired. balance_report is byte-identical.
- **Chunk 2, emit + JS port + PARITY** (`emit_tables.py`, `claude's monsters.html`, `claude's monsters.test.js`, the test.py PARITY `conditions` key): game-reviewer PASS, round 1.
- **Chunk 3, 3D scene** (`combat/arenas.js`, `combat/presenter.js`, `combat/host.js`, new `combat/scene.test.js`, `combat/condition-tag.test.js`): the worker reported DONE_WITH_CONCERNS, and the game-reviewer round 1 was dispatched on 2026-10-18. Check its verdict before resuming.
- Verify after Chunk 3: `PASS combat ok`, `PASS js 3510`, `PASS py 5044`.

## In progress / not done
- **Chunk 3 review: PASS, round 1.** Fold these minors in when resuming:
  - The spec says "counts" are jittered, but only positions and sizes are. Amend the spec, or add count jitter.
  - `combat/scene.test.js:76` tests only thornmane. Loop over all species, and assert against the live 3D player box at y=286 (html:5053) rather than 248. GLOOMSTALK is 252 even at today's camera. Correct the spec's 248 to 286 for 3D.
  - The cave is always night now; sign that look off by eye in MT-17.
  - Add a tag test with `clientLeft=2` and `clientWidth=r.width-4`.
  - Optional: a camera-only change could skip the arena rebuild.
- **Chunk 4** (plan `docs/superpowers/plans/2026-10-18-battle-conditions.md`): 2D weather in both builds (`SCENE_SKY` and `WEATHER_2D` shell tables plus PARITY), the 2D condition tag at (30,108), drawn only when `!battleHost.is3D()` so there is never a double tag, the rain and static loops, and RENDER tests.
- **Chunk 5:** CLAUDE.md, the wiki, the MT-17 duty, the full verify, the reviewer, a full playtest and the learn loop.

## Decisions made
- Approach 1, no mid-battle events (user).
- Boost-only values, no penalties (user).
- SEASIDE maps to the shore arena (PM, spec).
- Both suites force `clear` plus `DEFAULT_SCENE` (PM, after spec review).
- Camera preset 3 is [.6,.2,.8] (worker, to keep the HP box clear).

## Open decisions for the user
- Cave battles are now always "night" and a little darker (`CAVE_TIME_WEIGHT` .4 in `combat/arenas.js`; set it to 0 to undo).

## Verify state
`VERIFY: PASS (3 checks)` for combat, js and py after Chunk 3.

## Traps
- `claude's monsters.py` is **CRLF**. The suites and the html are LF. Preserve the line endings, because scripted rewrites flipped them once.
- `combat/presenter.js` ends with a stray `\n\r\n` that the Edit tool normalises. Keep it.
- The playtest must never grant the camera (see `docs/playtests/monster-trail.md`).

## Resumed and completed

The remaining Chunks 4-5 and review notes were handled in the continuation. Full verify PASS (8 checks), all species/camera presets tested against the real 3D HP boundary, pygame weather frames and browser desktop/phone evidence inspected. Cave night retained after visual inspection. See `docs/handoffs/2026-10-18-resume.md` and `docs/playtests/runs/2026-10-18-continuation.md`. The paused-state sections above are historical.
