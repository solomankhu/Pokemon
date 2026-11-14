---
key: hook-rule-untested-branch
first_seen: 2026-10-17
occurrences: 1
applies_to: [".claude/hooks/*.js", ".claude/scripts/*.js"]
---
**Symptom:** game-reviewer returned NEEDS_REVISION (round 1) on the combat/ gate change. The subagent-dispatch mtime branch, the main real-world path, had no test, and nothing proved that a green verify clears the gate.
**Root cause:** the PM's brief listed the tests to add (the main-session Edit path, the negative case), but **not** the branch that actually fires in practice (subagent edits, which the main transcript never shows) or the positive clear case.
**Caught by:** game-reviewer, round 1 (fixed in round 2).
**Rule:** a new hook or gate detection rule needs tests for every branch that can fire, plus the "gate clears after the fix" positive case. The brief must name them.
**Why:** an untested detection branch either never fires (the gate is silently off) or never clears (the gate blocks forever). Both look fine until the real flow hits them.
**How to apply:** when briefing harness changes, list each branch with its test, and include "would the test fail if the fix were reverted?"

## Casebook
- 2026-10-17: GAME_DIRS for combat/. The reviewer's proposal became a checklist line (held until the user locks it).
