---
name: webcam-frame-diff-two-stills
description: combat/webcam.js diffs consecutive frames, so a still frame right after a motion frame still reads as motion; tests need two still frames before a new burst can register
metadata:
  type: feedback
---
`classifyMotion(prev, curr)` measures change between two frames, so leaving a pose counts as motion just as entering it does. After a burst frame, the centre zone only drops below `BURST_MIN/2` after **two** still frames. Until then the next burst is ignored, because of the hysteresis in `stepTracker`.

**Why:** the plan's hand-traced tests used one still frame between bursts, and they failed in chunks 1 and 4 until a second still frame was inserted.

**How to apply:** in any synthetic frame sequence for `combat/webcam*.test.js`, put `still, still` between bursts that must both fire. The same applies when reasoning about warm-up: a diff spans two frames, which is why the `prevT` settle guard exists.
