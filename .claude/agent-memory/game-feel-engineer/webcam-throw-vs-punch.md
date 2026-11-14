---
name: webcam-throw-vs-punch
description: In combat/webcam.js a cross punch's blob path looks like an overhand throw; what actually separates them (wind-up, follow-through, flow) and the frame-diff lag on retracts
metadata:
  type: project
---
A cross/straight punch from a high guard has the same blob-centroid shape as an overhand throw (top-side start, drop,
end near the middle), so centroid-only throw rules gave BALL on the player's punch clip (2026-10-24). What separates them:
the throw is wound up (the hand rises up its side into the corner first), follows through (never comes back up), and
leaves a block-flow gradient along the path. Blob-label jumps between body parts show flow against the path.
A frame diff marks LEAVING a pose at the pose, so a punch's first retract frame has the extended fist's centroid. The
return shows one frame later, which is why the follow-through window is 250 ms, not ~130 ms.

**Why:** cost several rounds in Phase 3. Each single-term fix (sideways travel, then flow) left another punch path
scoring 0.75-0.92. Synthetic throws also burst in the punch zone (punch/punchMin up to 4), so "no punch burst" can't
tell them apart.

**How to apply:** for any new arc-like webcam gesture, test against a combination-of-crosses scene (webcam-scenarios
`G13.crosses`) at 13/15/30 Hz, and measure peak scores (margin), not just pass/fail. Clips without a still pre-roll
(punch-1, guard-1 holding only ~140 ms) can't be fixed by tuning, so ask for a re-record. See [[webcam-gesture-fps-and-replay]].
