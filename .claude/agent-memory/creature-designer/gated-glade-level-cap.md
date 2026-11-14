---
name: gated-glade-level-cap
description: Level-band rule used for optional gated pockets (GEODE, MOSS HOLLOW, OLD GROVE) - cap at the next gym-path trainer's ace level
metadata:
  type: project
---

Optional gated pockets cap their zone `max` at the ace level of the next gym-path trainer. Their `min` sits at the evolution level of any final evolution in the pool. OLD GROVE was signed off as L16-18 on 2026-10-23, cut down from the authored 16-20 (t5 ace dripling 18, t6 19-20).

**Why:** at L19-20 a wild PYRELASH one-shots a L15 SPRIGLING and a L16 THORNMANE in the balance model. A catch above the next trainers' levels would out-level the gym path instead of matching an evolved starter.

**How to apply:** for any new gated or optional zone holding final evolutions, check that the cross-level duels (player team at that stage vs foe at max) show no 1-hit KOs outside plain type disadvantage, and that the max is at or below the next trainer's ace. Earlier glade numbers are in the spec `docs/superpowers/specs/2026-10-23-axe-glades-loot-crafting-design.md`.
