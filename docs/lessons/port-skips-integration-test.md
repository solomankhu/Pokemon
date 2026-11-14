---
key: port-skips-integration-test
first_seen: 2026-10-18
occurrences: 1
applies_to: ["claude's monsters.test.js", "claude's monsters.test.py", "claude's monsters.html", "docs/superpowers/plans/*.md"]
---
**Symptom:** the JS loot port tested the catch reward only by calling `endBattle(G.battle, 'caught')` directly. The real path (throw, then `keep()`, then a nested `qDo` re-entry) and the full-team release case had no JS test. Python had both.
**Root cause:** the JS port copied the Python tests at the unit level and left out the one test that drives the real nested queue path.
**Caught by:** game-reviewer round 1 (MAJOR, test.js:1744).
**Rule:** a brief for porting one build to the other names, one by one, every Python test that drives real input through the queue to an outcome, and requires a JS twin for each.
**Why:** if a test calls the endpoint directly, it can't catch an ordering or re-entry bug, such as `keep()` with `rewardPaid` or messages arriving before the fade. Those bugs are exactly what goes wrong when a port is done by hand.
**How to apply:** when writing the Chunk "JS port" brief, grep the new Python section for tests that call `take_turn`, `confirm` or `drive` and then drain the queue. List them in the brief as "must have a JS twin". The reviewer checks that list.

## Casebook
- 2026-10-18: loot Part A, Chunk 3. Plan Task 3.2 said "mirroring Chunks 1-2 one for one" but didn't name the catch keep()/release path. Fixed in round 2 with real-throw tests that use `setCatchRoll`.
