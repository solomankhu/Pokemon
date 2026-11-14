---
name: combat-review-hotspots
description: Where 3D-combat / action-command regressions hide in MONSTER TRAIL (parity of command context, presenter rebuild churn, 2D overlay gates)
metadata:
  type: feedback
---

Hotspots to check whenever battle presentation or action commands change:
- Command context parity: JS derives 'ace' from `teamIdx === team.length-1`; Python originally read a non-existent `trainer['ace']` key. Compare the context derivation in both builds, not only the judge tables (those are parity-tested; the derivation is not).
- Presenter `sync()` vs `update()` both calling `replace()` can fight each other (evolution rebuilt the model about 99 times in 1.6 s). Probe by wrapping `MonsterModels.buildCreature` with a counter in a node script with a stub WebGLRenderer.
- Event actions without `moveId` don't update `lastActionId`, so `play()` re-fires every sync.
- The 2D canvas HUD is fixed (player HP box y=248). The 3D foe's feet project to about y=246, so lunges and wide models cross into the box.

**Why:** These were found in the 2026-10-17 3D combat review; all suites were green.

**How to apply:** Run these probes in Step 2 for any change touching combat/presenter.js, battle queue steps or settings. Related: [[tested-helper-not-wired]].
