---
name: parity-diff-truncates
description: PARITY failure lines in test.py show only the first 4 differences; how to get the full list without editing the suite
metadata:
  type: reference
---

The PARITY reporter in `claude's monsters.test.py` prints `"; ".join(d[:4])`, so an expected-red Part A run hides most of the differing keys (e.g. icons, labels, recipes behind craftBlurb/craftCells).

**Why:** a brief may ask for the "exact" expected PARITY failures; the verify line alone can't prove that nothing unexpected differs.
**How to apply:** copy the suite to the scratchpad with `sed -e 's/"; ".join(d\[:4\])/"; ".join(d)/' -e "s|^HERE = .*|HERE = 'E:/game'|"`, then run it with `PYTHONPATH=E:/game` (the game imports `combat.commands`). Never edit the real suite for this.
