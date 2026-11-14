---
name: loot-seed-transcripts
description: Battle transcripts now depend on Game state (tile, steps, battles) via loot_seed; tests comparing two Game objects' transcripts must equalise those or force FORCE_NO_LOOT.
metadata:
  type: project
---

Since the loot work (2026-10-18), a wild win/catch narrates a loot line rolled from `loot_seed(steps, tx, ty, foe_level, battles)`. Two `Game` objects that fight the "same" seeded battle produce different transcripts if their player tile, `steps` or `battles` differ. The RENDER juice on/off check (`scripted`, seeds 11-13) broke this way: `sg` stood at (43,104), `plain_game` at (43,107).

**Why:** the brief only allowed spec-declared test edits, so the failure had to be escalated, not patched.

**How to apply:** when adding loot/coin-affecting logic, grep the suites for transcript comparisons across Game objects (`msgs ==`) before running; propose pinning tile/steps/battles in the harness (or a FORCE_NO_LOOT try/finally) in the plan up front, so it is a declared change. Same applies to the JS port in Chunk 3.
