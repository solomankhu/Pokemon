---
key: exact-list-assertion-missed
first_seen: 2026-11-15
occurrences: 1
applies_to: ["claude's monsters.test.py", "claude's monsters.test.js", "docs/superpowers/plans/*.md", "docs/superpowers/specs/*.md"]
---
**Symptom:** after two recipes were appended to `RECIPES`, the Python suite's
"recipe order:" check failed. The plan's list of tests to change didn't name it.
**Root cause:** a test pins a table's ids as a hard-coded exact list (order or set). The plan listed
the exact-set tests it knew about (`ICON_WANT`) but never grepped for other literal id lists of the
same table.
**Caught by:** the Python suite, in the worker's Part A run, not by plan review.
**Rule:** when a plan adds rows to a shared table, grep both suites for literal lists of that table's
ids (`same(`, `== [`, `sorted(`, `.sort()`, "order") and name every hit in the plan's test-change list.
**Why:** a plan reviewer looks for assertions about the new feature. A literal id list asserts
nothing about it, so it slips past and turns verify red in the middle of a chunk.
**How to apply:** while writing or reviewing a plan, run
`grep -n "'<last existing id>'" "claude's monsters.test.py" "claude's monsters.test.js"` with the
table's last id (e.g. `'smoke'`). Every hit is an exact list the new rows must extend.

## Casebook
- 2026-11-15: crafted weapons, Chunk 1 Part A. The plan named `ICON_WANT` (plan review G3) but
  missed "recipe order:" in both suites. Part A extended the Python one at run time. The PM then
  pre-warned Part B's brief, and Part B extended the JS one.
