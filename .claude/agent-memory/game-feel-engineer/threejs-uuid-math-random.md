---
name: threejs-uuid-math-random
description: three.js r128 calls Math.random for object UUIDs, so a "no Math.random" spy in combat tests must start after presenter enter()/createEffects, not before
metadata:
  type: feedback
---

three.js r128 calls `Math.random` (MathUtils.generateUUID) whenever a Mesh/Material/Geometry is constructed. A `Math.random` call-count spy that wraps `createBattlePresenter(...)` + `enter(...)` therefore fails even when the effect code itself never calls it.

**Why:** cost one red run on 2026-10-18 (loot Chunk 4 heal/GREAT BALL cues in combat/presenter.test.js).
**How to apply:** install the spy after `enter()` (or after `createEffects`), count only across `sync`/`update` frames, and restore it before `dispose()`. The static guard in presenter.test.js (regex for `Math.random` in the combat sources) covers construction-time code.
