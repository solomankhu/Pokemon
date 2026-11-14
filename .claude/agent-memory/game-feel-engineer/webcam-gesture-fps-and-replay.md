---
name: webcam-gesture-fps-and-replay
description: Webcam gesture tuning pitfalls - per-frame zone fractions are fps-dependent (user clips ~13 fps vs 30 Hz scenes), and how to start a clip replay without a cold-start spike or blinded noise model
metadata:
  type: project
---

The player's recorded webcam clips (combat/Webcam/, combat/clips/) run at ~13 fps (dt ~75 ms), not 30. Any gesture
threshold on `motion.zones`/`total` (fraction moving THIS frame) scales with frame interval, so a rule tuned on the
clips fails the 30 Hz synthetic scenes and vice versa. Use the time-based activity map `motion.recent` (MHI coverage
over V2.RECENT_MS) or ms-based durations for anything that must hold at 13/15/30 Hz.

**Why:** cost several tuning rounds in Phase 2 (2026-10-23): shove, raise's "real motion" check and lean's side
motion all flipped between 15 and 30 Hz until switched to `recent`.

**How to apply:** when adding or retuning a webcam detector, run it on the clips AND on synthetic scenes at 30 and
15 Hz before trusting a margin. Replaying a clip: start like the controller after a pause (measureFloor(0,0), bump
pauseGeneration on frame 1). Do NOT prime with learn:'all' on clip frames - one 'all' frame on an already-moving arm
lifts those pixels' threshold ~4x for >1 s; and a fresh model with no history scores frame 1 as a punch out of
silence. webcam-clips.test.js documents this rule. See [[webcam-frame-diff-two-stills]].
