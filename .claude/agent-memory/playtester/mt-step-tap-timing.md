---
name: mt-step-tap-timing
description: MONSTER TRAIL taps pressed while the player is still mid-step are dropped; wait ~100ms after a press before polling G.player.moving
metadata:
  type: feedback
---
A keydown/keyup tap that lands while `G.player.moving` is true is dropped. If you poll `moving` immediately after a press, it still reads false (the move starts on the next frame), so the next tap lands mid-step and half the presses are lost.

**Why:** the first MT-03 attempt moved 2 tiles for 4 presses. This is a harness timing issue, not a game bug.

**How to apply:** press, wait 100ms, then poll until `!moving`, then press the next one.
