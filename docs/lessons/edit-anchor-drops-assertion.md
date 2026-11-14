---
key: edit-anchor-drops-assertion
first_seen: 2026-11-14
occurrences: 1
applies_to: ["claude's monsters.test.py", "claude's monsters.test.js", "gemini's code.test.js", "campaign.test.js", "combat/*.test.js"]
---
**Symptom:** an existing test assertion disappeared from a suite while the suite stayed green and its check count still rose.
**Root cause:** the worker used an existing assertion line as an Edit `old_string` anchor to insert new checks, then left that line out of `new_string`.
**Caught by:** game-reviewer (Chunk 5 r1, CRITICAL), by diffing the test file against the pre-chunk backup. verify.js could not catch it.
**Rule:** before handing back, diff every removed line in each test file against the chunk backup (or `git diff`). A removed `ok(`/assert that wasn't moved elsewhere blocks the hand-back.
**Why:** a net rise in the check count hides a deleted check. The behaviour that check covered becomes silently untested.
**How to apply:** workers run the removed-line audit as the last step before return. Reviewers check the `<` lines of a test-file diff, not just the totals.

## Casebook
- 2026-11-14: visual crafting Chunk 5 (icons in BAG/shop). The scrolled battle-BAG up-cue `ok(` was dropped from test.py while +21 checks were added; the brief had no removed-line audit step. Restored in r2, review PASS r2.
