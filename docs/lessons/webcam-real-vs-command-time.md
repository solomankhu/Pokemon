---
key: webcam-real-vs-command-time
first_seen: 2026-10-24
occurrences: 1
applies_to: ["combat/webcam.js", "combat/webcam-integration.test.js", "claude's monsters.html"]
---
**Symptom:** the webcam guard back-date moved a timed `guard` press 1.8x too early, so a well-timed guard could miss PERFECT.
**Root cause:** a time offset added to `commandInput`'s `at` was in real seconds, but the command clock runs at real x LAG_SCALE (0.55).
**Caught by:** game-reviewer round 1 (MAJOR). Unit tests passed because they stubbed the clock in real time.
**Rule:** every offset the webcam adds to `at` goes through `lagToCommandTime`, and a test runs it against the real HTML `commandClock`.
**Why:** a unit mismatch looks right with a 1:1 stub clock and only shows as wrong timing tiers in real battles.
**How to apply:** in `combat/webcam.js`, check anything that computes `at`. In `webcam-integration.test.js`, add a real-HTML case that checks the tier.

## Casebook
- 2026-10-24: webcam gesture set Phase 2 (guard extra trigger). The game-feel-engineer brief did not mention that the command clock is scaled. Also in this task: the parallel 2a/2b briefs disagreed on `webcamPhase` during commands (null vs 'command'). Write the shared contract once and paste it into both briefs.
