---
name: node-test-timer-granularity
description: Node host tests on this Windows box - setTimeout(5) polls take ~15 ms, so short UI steps (10 ms countdown) are missed; log writes instead
metadata:
  type: feedback
---

In the combat/*-host.test.js suites, an `until(()=>el.textContent===X)` poll can skip a UI state that lasts under ~15 ms, because Windows timer resolution makes `wait(5)` sleep ~15 ms. A 10 ms clipTiming countdown read "3, then Recording", never "2" or "1".

**Why:** Hit while testing the webcam RECORD 3-2-1 countdown (2026-10-23). It failed on the first run and was not a code bug.

**How to apply:** To assert a sequence of short-lived texts, wrap the element's `textContent` in `Object.defineProperty` to log every write, then assert the log. Keep timing seams (`calibrationTiming`, `clipTiming`) small, but never rely on sampling to see each step.
