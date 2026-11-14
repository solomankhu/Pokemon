---
name: line-endings
description: The game files have mixed line endings (monsters.py CRLF, test.py/html LF); Git Bash grep can't count CRs here. Check in binary with Python.
metadata:
  type: project
---

`claude's monsters.py` is CRLF, while `claude's monsters.test.py`, `claude's monsters.html` and the docs are LF (checked 2026-10-18 against the sdd backups). Edits made with sed or the Edit tool turned monsters.py into LF, and a game-reviewer flagged it.

**Why:** on this machine, `grep -c $'\r$'` in Git Bash reported every line as CRLF in an LF file too, so it can't be trusted.

**How to apply:** before and after editing, count `b"\r\n"` with `.venv/Scripts/python.exe` reading in `rb` mode. To edit monsters.py safely, read it in binary, normalise to `\n`, edit, then write it back with `\r\n`. Compare against the backup in `.superpowers/sdd/<task>/`.
