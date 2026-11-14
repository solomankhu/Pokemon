# Webcam MediaPipe tracking - contingency plan (draft, not approved)

Trigger: only if webcam signal v2 (docs/plans/2026-10-18-webcam-signal-v2.md) fails the user's real-camera
check. The default zero-asset motion path stays as-is and remains the fallback. Needs the user's OK, because it
lifts the spec's "no ML / no downloaded asset" rule for an opt-in mode.

## Findings (research 2026-10-18, verified in headless Chrome on this machine)
- `@mediapipe/tasks-vision` 1.1.1 (Apache-2.0). `vision_bundle.js` is an IIFE (global `Vision`), so it loads as a classic script.
- Offline from file:// works: vendor the wasm loader, the .wasm and the .task as classic scripts that assign base64 strings,
  turn them into Blob URLs for `wasmLoaderPath` and `wasmBinaryPath`, and pass the model via
  `baseOptions.modelAssetBuffer`. Plain fetch/XHR from file:// is blocked. Proof page:
  scratchpad `mp/t.html` (session 96e94f86).
- Size (base64): wasm about 18 MB, pose_landmarker_lite about 7.7 MB (hand model about 10.4 MB, not needed).
  Loaded lazily only when "Advanced tracking" is turned ON.
- Cost: pose lite about 17 ms CPU / 12 ms GPU per frame (headless, 320x240). GPU delegate with CPU fallback;
  detect every 2nd frame if slow.

## Shape
- New `combat/webcam-pose.js`: pure classifiers over landmark arrays (Node-testable) plus a lazy loader shell.
  - Punch: wrist z-velocity, plus wrist-shoulder 2D extension growth, over 3-4 frames, with a cooldown.
  - Block (guard): both wrists above the elbows, near the face, held 150 ms.
  - Sweep: mirrored wrist x-velocity between hip and shoulder height.
  - visibility > 0.5 gate on every landmark used.
- Emits the same intents as the motion tracker into the controller's dispatch (commandInput/press seams). The
  lag calibration, pause generation and modal rules are reused unchanged.
- Setting `webcamMode: 'MOTION' | 'POSE'` (default MOTION). If POSE fails to load, it falls back to MOTION with a
  toast.
- vendor/: the bundle + `mp_wasm.js` + `mp_pose_lite.js` + the Apache LICENSE/NOTICE, and a credits line.

## Open
- Confirm the model-card licence (believed Apache-2.0).
- Repo size budget: is about 26 MB of vendored files acceptable?
