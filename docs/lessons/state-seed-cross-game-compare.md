---
key: state-seed-cross-game-compare
first_seen: 2026-10-18
occurrences: 1
applies_to: ["claude's monsters.py", "claude's monsters.html", "claude's monsters.test.py", "claude's monsters.test.js", "docs/superpowers/specs/*.md"]
---
**Symptom:** after loot was added, the RENDER juice on/off transcript test (`scripted()`, seeds 11 and 12) failed. One transcript had "The wild SPRIGLING dropped a LEAF!" and the other did not.
**Root cause:** a new roll seeded from game state (`loot_seed` uses steps, tx, ty and battles) gives different results for two Game objects that an existing test compares, because the two Games stand on different tiles.
**Caught by:** the Python suite. The spec's "deliberately changed old tests" list had missed it.
**Rule:** when a spec adds any roll seeded from game state, the declared-changes list must name every test that compares two separate Game objects (transcript equality or state equality), and say how their seed inputs are aligned.
**Why:** the spec reviewer searched for assertions on the changed values. A comparison between two Games asserts no value, so it slips past that search and turns verify red mid-chunk.
**How to apply:** during spec review, grep both suites for comparisons between two Game objects. Look for `msgs ==`, transcripts, `plain_game`, and `getstate() ==` across games. Check whether the seed inputs (position, steps, counters) match on both sides. The fix pattern is to align the inputs before setup (`START_TILE`, `steps = 0`, `battles = 0`) instead of switching the roll off, so the test still covers the new line.

## Casebook
- 2026-10-18: loot Part A, Chunk 2. The spec §6 list covered the drive harness, labels and phases, but not `scripted()`'s comparison of the shared `sg` (43,104) against `plain_game` (43,107). The fix was the PM's decision, option (a): align the inputs.
