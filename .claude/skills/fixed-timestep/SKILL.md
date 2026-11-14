---
name: fixed-timestep
description: Make a game's simulation independent of display refresh rate using a fixed-timestep accumulator loop (Glenn Fiedler's "Fix Your Timestep!"). Use for gemini's code.html, whose update() is per-frame and runs about 2.4x faster on 144 Hz, or any loop where speed or physics depends on frame rate.
---

# Fixed timestep

## The pattern
```js
const STEP = 1 / 60;              // simulation tick, seconds
let acc = 0, last = performance.now();
function animate(now) {
  requestAnimationFrame(animate);
  let frame = (now - last) / 1000; last = now;
  if (frame > 0.25) frame = 0.25;   // clamp: tab switch / breakpoint must not cause a spiral of death
  acc += frame;
  while (acc >= STEP) { update(STEP); acc -= STEP; }
  // optional: alpha = acc / STEP to interpolate positions for render
  renderer.render(scene, camera);
}
requestAnimationFrame(animate);
```
Choosing STEP = 1/60 keeps every existing per-frame constant *numerically identical at 60 Hz*. The game then plays exactly as tuned on a 60 Hz screen, and the same on every other one.

## Applying it to gemini's code.html
1. Replace `animate()` at the bottom of the script with the loop above. The current one calls `update()` once per rAF.
2. Choose one of two approaches:
   - **Minimal (recommended first):** keep `update()` taking no arguments and call it `while (acc >= STEP)`. All per-frame constants (`stamina -= 0.5`, `battery -= 0.35`, speeds `0.1`/`0.18`, `stunnedTimer` frame counters, jumpscare frame counts) now mean "per 1/60 s". There's no constant to edit.
   - **Full:** thread `dt` through `update(dt)` and turn constants into per-second rates (`x * 60 * dt`). Do this only if variable-step physics is needed later.
3. **Input:** mouse-look happens in event handlers, so it's already refresh-independent. Don't move it into the tick. Discrete actions (click → `firePulseWave()`, Space jammer) should still fire once per press, not once per tick.
4. **`jumpscareActive`** short-circuits `update()`. Its shake and timer are also per-frame, so they're covered by the same loop.
5. **Pointer lock / overlay:** while paused or the overlay is showing, reset `last = now` and `acc = 0` on resume so time spent paused isn't simulated in a burst.

## MONSTER TRAIL
Both builds already use variable `dt` clamped to 0.05 s (`clock.tick(FPS)` in Python, `Math.min(dt, 0.05)` in JS) and every rate is per-second. Only switch to an accumulator if determinism across machines is required (replays, lockstep multiplayer).

## Verify
Use `browser-playtest`. Measure something rate-dependent (stamina draining from full while sprinting, in seconds) and confirm it matches at 60 fps and when throttled. Playwright can emulate slower frames with CPU throttling, or you can log `performance.now()` at stamina 100 and 0. Report both timings.
