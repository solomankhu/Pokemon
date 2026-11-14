---
name: line-endings
description: The game files have mixed line endings (monsters.py, CLAUDE.md, docs/wiki/*.md, docs/playtests/*.md CRLF; test.py/test.js/html LF); Git Bash grep can't count CRs here. Check in binary.
metadata:
  type: project
---

`claude's monsters.py` is CRLF, while `claude's monsters.test.py`, `claude's monsters.test.js`, `claude's monsters.html`, `.claude/agents/*.md` and `.claude/skills/*` are LF (checked 2026-10-18 and 2026-11-14). As of 2026-11-14, `CLAUDE.md`, `docs/wiki/monster-trail.md` and `docs/playtests/monster-trail.md` are CRLF: a multi-line insert with `\n` into the wiki page made it mixed until fixed. Edits made with sed or scripted rewrites turned monsters.py into LF once, and a game-reviewer flagged it. The Edit tool keeps CRLF intact (verified 2026-11-14: 7955/7955).

**Why:** on this machine, `grep -c $'\r$'` in Git Bash reported every line as CRLF in an LF file too, so it can't be trusted.

**How to apply:** before and after editing, count `\r\n` vs `\n` in binary (`.venv/Scripts/python.exe` with `rb`, or node `split('\r\n')`). Any scripted multi-line insert must match the file's ending. Compare against the backup in `.superpowers/sdd/<task>/`.
