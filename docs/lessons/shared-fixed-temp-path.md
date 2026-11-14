---
key: shared-fixed-temp-path
first_seen: 2026-10-23
occurrences: 1
applies_to: ["claude's monsters.test.py", "claude's monsters.test.js", "combat/*.test.js", ".claude/scripts/verify.js"]
---
**Symptom:** a full `verify.js` run showed `py FAILED (exit 1)`. PARITY had already printed every section as identical, then crashed with `FileNotFoundError: ...\Temp\monster-trail-parity.js` at `os.remove(script)`. A re-run of `--only py` passed (5537).
**Root cause:** the PARITY section of `claude's monsters.test.py` (~:6958) writes and deletes one **fixed** temp path, `tempfile.gettempdir()/monster-trail-parity.js`. Two suite runs at the same time, from another session or a parallel worker, overwrite and delete each other's script.
**Caught by:** the PM's full verify (a false red), confirmed by an immediate green re-run.
**Rule:** any test helper that writes a temp file uses a per-run unique name (`tempfile.mkstemp`/`NamedTemporaryFile(delete=False)`, or include `os.getpid()`), and deletes it with a tolerant remove.
**Why:** this workspace often runs more than one Claude session and parallel workers. A shared temp path turns concurrent gates into false reds, which fire a spurious REFLECT-DUE and teach agents to ignore red.
**How to apply:** grep the suites for `gettempdir()` / `os.tmpdir()` joined with a constant name. Related: `verify-during-concurrent-edit` (a different cause: a sibling mid-writing a file the suite loads).

## Casebook
- 2026-10-23: Part B Chunk 3. The PM's full verify raced with session game-c9 (webcam work), which ran the same Python suite at the same time. game-c9 had also done Task 3.5 on files this session's game-chore was assigned, because there was no cross-session ownership note until after the fact. The fix (a unique temp name) is queued as a one-line change for the next test.py PARITY edit.
