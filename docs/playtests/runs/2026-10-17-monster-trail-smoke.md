# PLAYTEST monster-trail smoke - 2026-10-17: FAIL

The first end-to-end harness run. The three smoke duties PASS; the extra duty MT-04 FAILs.
The PM saved the playtester's report verbatim.

| ID | result | saw | screenshot |
|---|---|---|---|
| MT-01 | PASS | `G.mode === 'title'`; canvas 640x480 (the only canvas at boot); every combat/*.js and vendor/three-r128.min.js loaded with HTTP 200; console 0 messages; title screen with logo, 3 starters and NEW GAME | .playwright-mcp/mt-smoke-01-title.png |
| MT-02 | PASS (spec order wrong) | title → `dialogue` → `overworld` with an empty party. The starter comes only after walking to PROF. CEDAR (61,107) and pressing Z: `dialogue` ×2 → `starter` → Z×3 → `overworld`, party = [EMBERLING] | .playwright-mcp/mt-smoke-02-starter.png, mt-smoke-02-overworld-after-starter.png |
| MT-03 | PASS | 4 real ArrowLeft presses: (59,108) → (55,108), one tile each, no errors | .playwright-mcp/mt-smoke-03-walk.png |
| MT-04 (extra) | **FAIL** | The 3D presenter took over (arena `meadow`). Four SCRATCH turns: foe HP 19→16→13→10→7. HP box clearance OK (foe projects to y≈243 < 248). **Hit juice is not visible:** at contact the state has trauma 0.35, freeze 0.035–0.06, flashSide 'foe' and 38 particles, but frames show no shake, no flash and no visible burst. The EMBERLING shadow stays put during the lunge. No timed-command step appeared for SCRATCH | .playwright-mcp/mt-smoke-04-battle-intro.png, -battle-hit.png, -hit-f0.png, -hit-f1.png, -hit-impact.png |

CONSOLE: 0 errors, 0 warnings for the whole session.

SUSPECT:
- `claude's monsters.html:4794-4796`: when `battleHost.is3D()`, `drawBattle` skips the 2D arena block that draws the shake, the flash and `drawParticles`. The engine sets trauma, flash and freeze, but nothing draws them in 3D.
- `combat/effects.js:41`: the contact burst is emitted at the target anchor, inside the foe mesh, so depth testing probably hides it (unconfirmed).
- `combat/presenter.js:16`: the lunge moves `rig.root.position.x`, but the blob shadow isn't parented to the rig.

WORKFLOW FEEDBACK was folded into `docs/playtests/monster-trail.md`:
- MT-02 route;
- MT-03 timing;
- MT-04 and MT-11 rewritten for the 3D presenter;
- new MT-12 to MT-14.
