---
name: edit-tool-strips-stray-cr
description: The Edit tool rewrote combat/presenter.js's odd trailing "\n\r\n" to "\n\n"; check CR byte counts against the backup after editing mixed-ending files
metadata:
  type: feedback
---

Briefs here ask to "preserve each file's line endings". `file` reports some combat files as "CRLF, LF" even though they contain only one stray CR (combat/presenter.js ended `});\n\r\n` and presenter.test.js has two at its end). The Edit tool normalised that ending away silently.

**Why:** found on 2026-10-18 (battle conditions, Chunk 3) only by comparing `tr -cd '\r' | wc -c` and `tail -c` with the backup.
**Count CRs only with `tr -cd '\r' < f | wc -c`.** In this Git Bash, `grep -c $'\r$'` printed 0 for the fully CRLF `claude's monsters.py` (2026-10-23). That made me wrongly report the file as LF to the coordinator.
**Confirmed safe (2026-10-24):** a 645-line Edit insert into the fully CRLF `claude's monsters.py` came out all CRLF (counts stayed equal), so for big table pastes, generate the text in the scratchpad, Read it, and paste it with one Edit. Don't use a scripted rewrite.
**How to apply:** before the first edit, record the CR count and the last bytes of each file. After editing, compare them again and restore the bytes with a latin1 read/write in node if they changed.
