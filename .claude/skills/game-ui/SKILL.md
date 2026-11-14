---
name: game-ui
description: Game UI/UX for the HTML games - touch controls for phones/tablets, responsive canvas scaling, menus/HUD/party screens, key remapping, and accessibility (colourblind-safe type cues, reduced motion, readable text). Use when a game must work on mobile, when a screen is cluttered or unclear, or for any input-method or accessibility request.
---

# Game UI

Good game UI is invisible: the player always knows what they can do, what just happened and how to back out. Every input method must reach the same actions, and the canvas game must stay playable from 360 px phones to 4K monitors.

## 1. One input path (do this before adding touch)
In `claude's monsters.html` the keyboard flows through `onKeyDown`/`onKeyUp` (around line 2991). That code sets the held-key map `keys[k]` (read by overworld movement and Shift-run) and fires one-shot actions: `moveCursor(dx, dy)`, `confirmKey()`, `cancelKey()`. **Don't write a second input system for touch.** Split it instead:
```js
function press(k)   { if (keys[k]) return; keys[k] = true; /* the existing moveCursor / confirmKey / cancelKey dispatch */ }
function release(k) { keys[k] = false; }
function onKeyDown(e) { const k = e.key.toLowerCase(); if ([...].includes(k)) e.preventDefault(); press(k); }
function onKeyUp(e)   { release(e.key.toLowerCase()); }
```
Touch, gamepad and remapped keys then call `press`/`release` with the *canonical* keys (`arrowup`…, `z`, `x`, `shift`). Game logic never learns a new device exists, and the node suite (`claude's monsters.test.js`) keeps passing because the seams it drives are unchanged.

## 2. Touch controls (MONSTER TRAIL)
- **Layout:** a D-pad bottom-left; **A** (confirm, `z`) and **B** (cancel, `x`) bottom-right; a small **RUN** toggle (latches `shift`). They're DOM buttons over the page, not drawn on the canvas, so they stay crisp and hit-testable.
- **Show only on touch:** `@media (pointer: coarse)`, or reveal on the first `touchstart`. Hide the keyboard `#hint` line on touch devices.
- **Events:** use `pointerdown` → `press(k)` and `pointerup`/`pointercancel`/`pointerleave` → `release(k)`, with `setPointerCapture`. Put `touch-action: none` on the controls and `preventDefault` to stop scroll, zoom and the 300 ms delay. Let a finger slide across the D-pad: on `pointermove`, find the direction under the pointer, release the old one and press the new one.
- **Sizes:** targets at least 48×48 CSS px with 8 px gaps, semi-transparent (opacity ~0.35, 0.7 while pressed), and kept clear of `env(safe-area-inset-*)`.
- **Never block the action:** the canvas must shrink to leave room for the controls, or the controls overlay letterbox space only. They mustn't cover the battle menu or the dialogue box.
- **Haptics (optional):** `navigator.vibrate?.(10)` on A/B, behind a setting.

## 3. Responsive canvas
The internal resolution stays **640×480**. All game layout, including the HP box at y=248 and the foe platform ending at y=240, is authored in those pixels. Scale only the CSS size:
- Fit by aspect: `scale = min(availW/640, availH/480)`, using integer scale factors when ≥ 2 for crisp pixels (`image-rendering: pixelated` is already set). Recompute on `resize` and `orientationchange`.
- In portrait phone mode, put the canvas at the top and the controls in the space below. In landscape, put the controls in the side gutters.
- Use `devicePixelRatio` only if you move to a high-DPI backing store. Then `ctx.setTransform(dpr,0,0,dpr,0,0)` and keep game coordinates at 640×480.

## 4. Screens, HUD and menus
- **Hierarchy:** one focal point per screen. In battle the order is HP bars, then the message, then actions. Avoid more than about 4 numbers visible at once.
- **Always show the way back:** every submenu responds to cancel, and the bottom line hints at the current context (`A: select  B: back`). On touch, the hint shows button names, not keys.
- **Feedback for every input:** cursor movement and confirm/cancel each get a blip (`Sfx`/WebAudio) and a visible change within a frame.
- **Text:** at least 12 internal px for body text at 640×480. Never put text over busy art without a panel, and keep message boxes to two lines.
- For MONSTER TRAIL, any HUD or menu change must land in **both** builds (pygame `Shell.draw_*` and JS `draw*`). Run both suites. The Python RENDER section draws every mode, but the HTML build is only checked by eye, so playtest it.

## 5. Accessibility checklist
- **Type isn't colour-only:** pair `TYPE_COLOR` with the type name or a glyph, and make super-effective / not-very-effective readable from text alone.
- **Reduced motion:** honour `matchMedia('(prefers-reduced-motion: reduce)')` using the existing `REDUCED_MOTION` flag (it already zeroes shake, hit-stop and flash in the HTML build). Coordinate with `juice-pass` constants.
- **Remapping:** a small settings table of `{action: [keys]}` saved to `localStorage` (the HTML build already saves there; use a separate key from the save game). Feed it through `press`.
- **No time pressure on reading:** messages wait for confirm, as the battle queue's `msg` step already does. Keep it that way.
- **Contrast:** at least 4.5:1 for text on panels.

## 6. Verify
1. Run both MONSTER TRAIL suites. They must stay green.
2. `browser-playtest` at desktop size. Then `browser_resize` to a phone (e.g. 390×844 portrait and 844×390 landscape) and set touch emulation where available, or dispatch `pointerdown`/`pointerup` on the buttons with `browser_evaluate`.
3. At each size, screenshot the title, overworld, a battle menu and a dialogue box. Check that nothing overlaps, the controls don't cover UI, and the console has no errors.
4. Report the sizes tested and what you saw.
