---
name: mt-3d-battle-juice-probe
description: How to catch the hit moment in MONSTER TRAIL's 3D battle presenter (combat/) - poll battle trauma and presenter effects count, 2D juice is not drawn in 3D
metadata:
  type: reference
---
Battles render through `__GAME__.battleHost` (three.js, a 2nd canvas) when `battleHost.is3D()`. `drawBattle` then skips 2D shake/flash/particles entirely.

**Why:** On 2026-10-17, MT-04 failed because b.trauma/flashT were set but nothing visible rendered. The visible juice is the lunge plus recoil, and the 3D particle count is in `battleHost.presenter.diagnostics.effects`, peaking around 38 on contact.

**How to apply:** after `takeTurn`, poll every ~5-15ms. Screenshot when `G.battle.trauma>0.05` (contact) or when `presenter.diagnostics.effects>=30` (burst peak). Press Z when `b.step.t==='msg'`. The `projected.foe/mine` diagnostics give canvas coordinates for the layout checks.
