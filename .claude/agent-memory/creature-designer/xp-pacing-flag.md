---
name: xp-pacing-flag
description: 1.5x XP (3/14) kept; user settled on gym +2 (VOLT L30-34) and t7/t8 +2 on 2026-11-14, after a +4 pass simulated as too harsh
metadata:
  type: project
---

XP stays 3/14. `balance_report.py --xp` starter-only arrival: DARK CAVE L23/L28/L34, gym L31/L37/L46 at N = 10/20/40 (2-mon split: L24/L29/L36). On 2026-11-14 the user first chose gym +4, then, after a Monte Carlo readout, settled on **+2**: VOLT L30/31/32/32/34, CAVER NOX L25-26, SEER ILVA L29-30 (ILVA's top equals VOLT's lowest; the ladder test is <=). Gym payout 980 then 680 coins.

Monte Carlo readout (real `damage_calc`, stages, random foe moves, greedy player, no potions, switch only on faint), N=20 solo L37, win % for pyrelash/tidecoil/thornmane/zapmote: old gym 99/36/53/58, +2 89/12/27/36, +4 76/6/2/4.

**Why:** the user rejected +4 once the sim showed it near-unwinnable for non-fire starters.

**How to apply:** before further gym/trainer level changes, re-run `--xp` plus a team sim and quote per-starter win rates; FIRE hard-counters VOLT's STEEL/BUG members, so levels alone mislead. See [[gated-glade-level-cap]].
