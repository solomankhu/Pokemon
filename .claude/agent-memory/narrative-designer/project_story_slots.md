---
name: story-slots-and-constraints
description: Non-obvious constraints on MONSTER TRAIL story text - box budget, which text slots are flag-keyed, Python has no chapter, story bible location
metadata:
  type: project
---

The story outline (WREN missing, TAM rival, VOLT gatekeeper, GLOOMSTALK = WREN's partner) lives in docs/wiki/story.md (phase 1 written 2026-10-17; phase 2 pending PM decisions E1-E6).

**Why:** phase 2 must land text in both builds together and add the dialogue-parity test first.

**How to apply:**
- Box budget is 108 chars per page including the "NAME: " prefix, max 2 pages. NPC `lines` = one conversation (each element a page); trainer intro/defeat/after are single strings.
- NPC lines never vary by flag; only professor_talk, gym_door and the JS return toast are flag-keyed. Any "after gym / after return" bark needs a mechanic (escalate).
- The Python build has no chapter state (G.chapter is JS-only), so return beats are JS-only.
- Function-literal strings (prof, gym door, intro) are not covered by PARITY; that is how the warden's "Four" vs "Six" drift went unseen.
- gemini's code.test.js pins introLine and the win message text exactly.
- Sign lines: keep each element <= ~64 chars (the longest pre-Part-B sign line); the dialogue wrap is W-76 px at f15.
- Git-bash `sed -i` silently converts the CRLF .py to LF; edit the .py with Edit or Python binary I/O, then recheck the CR count against the line count.
- verify.js `combat` can FAIL as "RACED" while another session edits combat/; that is not caused by text edits.
