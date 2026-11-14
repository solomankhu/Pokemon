# Lessons

There is one file per failure mode, named `<key>.md`, where the key is the row key in
[`../FAILURE_PLAYBOOK.md`](../FAILURE_PLAYBOOK.md). Only
[`reflect-and-learn`](../../.claude/skills/reflect-and-learn/SKILL.md) creates these files.

```markdown
---
key: <kebab-slug>
first_seen: YYYY-MM-DD
occurrences: 1
applies_to: ["claude's monsters.py", "claude's monsters.html"]   # globs
---
**Symptom:** what a player or test saw.
**Root cause:** the actual mistake, as one sentence a reviewer can check.
**Caught by:** test name / reviewer / playtest / the user (the worst case, and the reason to add a gate).
**Rule:** the one-line thing to do differently.
**Why:** what breaks if you don't.
**How to apply:** where to look while working (file, function, checklist section).

## Casebook
- YYYY-MM-DD: one line per occurrence. Note what was being built and which brief missed it.
```
