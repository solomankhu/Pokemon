---
name: tested-helper-not-wired
description: combat/ modules can export a tested helper the game never calls; grep the game file for the call before trusting a test as proof
metadata:
  type: feedback
---

Before accepting a combat/ unit test as proof of a game behaviour, grep `claude's monsters.html` (and `.py`) to confirm the game actually calls the tested function.

**Why:** 3D combat review (2026-10-17): `combat/arenas.js` `arenaKindFor` was tested (SEASIDE->shore, fishing->shore), but the game used its own `battleArenaKind()` that never returns 'shore'. Likewise browser-playtest scenario names ("hunt presentation") overstated what they asserted (only `diagnostics.arena`).

**How to apply:** For each acceptance criterion, read the assertion lines, not the test name, and trace the wiring from the game file to the tested helper. A quick vm-load probe of `__GAME__` (pattern in combat/integration.test.js) verifies real behaviour cheaply. Also check what a new `if (!live3D)` style gate skips: in the 3D path it skipped the hunt veil and scare flash. See [[combat-review-hotspots]].
