---
name: xp-pacing-flag
description: Drops+XP Phase A (1.5x XP, 2026-11-14) put the starter-only gym-arrival estimate over VOLT's L32; flagged to the PM, user decision pending
metadata:
  type: project
---

With `XP_NUM/XP_DEN` = 3/14, `balance_report.py --xp` gives a starter-only gym arrival of L31/L37/L46 at N = 10/20/40 wild wins per region (old 1/7: L27/L32/L40), and a DARK CAVE arrival of L23/L28/L34 against `HUNT["lv_max"]` 28. Split over a 3-mon party the N=20 gym arrival is ~L26. Flagged 2026-11-14; the user decides whether trainers, the gym or the hunt get retuned.

**Why:** the brief said flag, don't fix. The model is an upper bound (all XP to one mon), and the old rule already hit L32 at N=20.

**How to apply:** before any gym, trainer or hunt level change, check whether the user decided this. Re-run `--xp` and quote it; don't retune silently. See [[gated-glade-level-cap]].
