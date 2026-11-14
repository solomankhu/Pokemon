---
key: tool-import-path
first_seen: 2026-10-17
occurrences: 1
applies_to: [".claude/skills/*/*.py", ".claude/scripts/*", "claude's monsters.py"]
---
**Symptom:** `emit_tables.py` and `balance_report.py` crashed with `ModuleNotFoundError: No module named 'combat'`, while the game's own test suite still passed.
**Root cause:** the tools load `claude's monsters.py` with `spec_from_file_location` from `.claude/skills/<s>/`, so the repo root isn't on `sys.path`. Once the game began importing a sibling package (`combat/`), every by-path loader broke.
**Caught by:** the `tables` check in `.claude/scripts/verify.js`, on the first full run after `combat/` landed. The suite alone missed it because Python puts the script's own folder (the repo root) on `sys.path`.
**Rule:** any tool that loads a game module by path does `sys.path.insert(0, ROOT)` first.
**Why:** without it, a new sibling import silently breaks the parity emitter and the balance report, and both creature workflows depend on those.
**How to apply:** when adding a new `*.py` tool under `.claude/`, or a new top-level import in a game file, run `node .claude/scripts/verify.js --only tables` and the balance report.

## Casebook
- 2026-10-17: harness build. The `combat/` package was added by a parallel session; both loaders were fixed with one line each.
