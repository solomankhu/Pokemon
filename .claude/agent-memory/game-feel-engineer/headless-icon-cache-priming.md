---
name: headless-icon-cache-priming
description: JS suite can't see icon blits (iconCanvas returns null without document); prime g.ICON_CACHE with tagged stand-ins and record drawImage on the withCtx stub
metadata:
  type: reference
---

In `claude's monsters.test.js`, `iconCanvas` returns null headlessly, so `drawIcon` never reaches `ctx.drawImage` and icon layout is invisible to the recording stub. The working pattern (SHELL BAG/SHOP section, Chunk 5, 2026-11-14): set `g.ICON_CACHE.set(id + '|1|normal', { iconId: id })` for every `g.ICONS` key not already cached, add `drawImage(cv, x, y, w, h)` to the stub's base object to push `{id: cv.iconId, x, y, w, h, ti: texts.length}`, then delete the primed keys afterwards.

**Why:** it tests the real draw code with no extra test seam in the game file; `ti` pairs each icon with the next string drawn (the row name).
**How to apply:** any new icon placement in the HTML build (CRAFT, BAG, shop, future lists). The Python counterpart is wrapping `sh.list_icon` per instance and `del sh.list_icon` to restore. See [[mt-frame-dir-leaks-into-verify]] for frame dumps.
