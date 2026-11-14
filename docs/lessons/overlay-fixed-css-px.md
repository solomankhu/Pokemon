---
key: overlay-fixed-css-px
first_seen: 2026-10-18
occurrences: 1
applies_to: ["combat/host.js", "claude's monsters.html", "combat/*.js"]
---
**Symptom:** the webcam CAM badge covered the foe HP box when the canvas was scaled down for a touch-portrait phone (canvas about 348 CSS px wide).
**Root cause:** a DOM overlay placed over the canvas used fixed CSS-pixel offsets from the canvas rect, so its position in canvas px drifted as `fitCanvas` scaled the canvas. The plan only checked the layout at 640x480.
**Caught by:** game-reviewer round 1 (MAJOR, combat/host.js:17). It was later confirmed by playtest screenshots at 390x844 and 844x390.
**Rule:** position any overlay over the canvas in canvas-scaled units (`s = r.width/640`, offsets times `s`), and test or screenshot it at the touch-portrait canvas width (about 348 px), not only at 640.
**Why:** the HTML build is played on phones, and fixed-px overlays land on HP boxes and sprites, which the 640x480 layout rules exist to keep clear.
**How to apply:** in `combat/host.js` use `align()`/`updateCamBadge` as the pattern (`FOE_BOX_RIGHT`, stacking under SETTINGS). In tests, stub `getBoundingClientRect` at 640x480 and 348x261 and assert the overlay rect doesn't intersect the foe box (24,28,260,52) or the player box at y=248.

## Casebook
- 2026-10-18: webcam battle controls, camera badge. The plan and Chunk 3 brief gave fixed `left = r.left + r.width - 218`, and plan review only checked overlap at 1:1.
