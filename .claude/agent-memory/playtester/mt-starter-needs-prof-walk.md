---
name: mt-starter-needs-prof-walk
description: MONSTER TRAIL new game reaches overworld with party 0; the starter is given by PROF. CEDAR at (61,107), not by the title dialogue
metadata:
  type: project
---
After NEW GAME the intro dialogue (onDone null) drops you into `overworld` at (43,107) with an empty party. `starter` mode only opens after talking to PROF. CEDAR at (61,107).

**Why:** spec MT-02 says title→starter→overworld; the real order is title→dialogue→overworld→(walk)→dialogue→starter→dialogue→overworld. Cost a detour on 2026-10-17.

**How to apply:** real-input route from spawn: ArrowDown x1, ArrowRight x18 (to 61,108; sign at 54,107 blocks row 107), ArrowUp (turns to face prof), then Z x3 → `starter`, Z x3 → overworld with party 1.
