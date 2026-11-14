---
name: balance-report
description: Print a numeric balance readout of MONSTER TRAIL (BST per species, zone level bands, type coverage, hits-to-KO duel ranking). Use before and after any species/move/zone/type-chart change, or whenever someone asks whether something is over- or under-powered.
---

# Balance report

```bash
.venv/Scripts/python.exe .claude/skills/balance-report/balance_report.py                   # everything, duel at Lv 25
.venv/Scripts/python.exe .claude/skills/balance-report/balance_report.py --level 40
.venv/Scripts/python.exe .claude/skills/balance-report/balance_report.py --section zones   # species|zones|types|duel
.venv/Scripts/python.exe .claude/skills/balance-report/balance_report.py --species tidecoil --section duel
```

It imports the Python build's pure layers. No window opens, and it changes nothing.

## Reading it
- **species**: the BST, wild level ranges (grass and fishing) and evolution, sorted by BST. Watch for a final evolution appearing wild at low levels, or a species that never spawns.
- **zones**: listed in table order, roughly south to north. Level bands should climb, and BST spread within a zone should be narrow except for deliberate rare spawns.
- **types**: flags types with no carrier species or no damaging moves. "weak to" lists the attacking types that hit it super-effectively.
- **duel**: every species against every other at the same level with its best expected-damage move (deterministic: no crits, no misses, mid roll, accuracy-weighted). `wins` counts matchups it takes in strictly fewer hits. Ranking should roughly follow BST and evolution stage. Big outliers in either direction are the things to look at.

The model ignores speed order on ties, stat-stage moves, switching and AI choice. It's a sanity check, not a simulator. For real fights, the test suite's BATTLE section plays 200 full battles.

Always quote the before/after numbers when proposing or reporting a change.
