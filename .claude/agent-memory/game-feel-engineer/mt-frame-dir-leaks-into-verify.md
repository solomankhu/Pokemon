---
name: mt-frame-dir-leaks-into-verify
description: Setting MT_FRAME_DIR on verify.js makes combatpy fail (it saves frames there without makedirs); dump frames from the py suite alone
metadata:
  type: feedback
---

Do not run `node .claude/scripts/verify.js` with `MT_FRAME_DIR` set. The env leaks into
`combat/commands_py_test.py`, which saves `python-action-*.png` into that folder without
creating it, so a new folder gives a false combatpy FAIL ("Couldn't open ...png").

**Why:** 2026-10-23 Task 4.2: verify went red only from this; a clean re-run was green.
**How to apply:** dump frames with `MT_FRAME_DIR=... .venv/Scripts/python.exe "claude's monsters.test.py"`
(or pre-create the folder), then run verify.js with no MT_FRAME_DIR. Also: a combat RACED line
means another session (game-c9) edited combat/ mid-run; just re-run.
