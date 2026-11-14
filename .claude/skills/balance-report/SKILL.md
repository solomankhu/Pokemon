---
name: balance-report
description: Print a numeric balance readout of MONSTER TRAIL (BST per species, zone level bands, type coverage, hits-to-KO duel ranking). Use before and after any species/move/zone/type-chart change, or whenever someone asks whether something is over- or under-powered.
---

# Balance report

```bash
.venv/Scripts/python.exe .claude/skills/balance-report/balance_report.py                   # everything, duel at Lv 25
.venv/Scripts/python.exe .claude/skills/balance-report/balance_report.py --level 40
.venv/Scripts/python.exe .claude/skills/balance-report/balance_report.py --section zones   # species|zones|types|duel|xp
.venv/Scripts/python.exe .claude/skills/balance-report/balance_report.py --species tidecoil --section duel
.venv/Scripts/python.exe .claude/skills/balance-report/balance_report.py --xp              # XP pacing only (= --section xp)
```

It imports the Python build's pure layers. No window opens, and it changes nothing.

## Reading it
- **species**: the BST, wild level ranges (grass and fishing) and evolution, sorted by BST. Watch for a final evolution appearing wild at low levels, or a species that never spawns.
- **zones**: listed in table order, roughly south to north. Level bands should climb, and BST spread within a zone should be narrow except for deliberate rare spawns.
- **types**: flags types with no carrier species or no damaging moves. "weak to" lists the attacking types that hit it super-effectively.
- **duel**: every species against every other at the same level with its best expected-damage move (deterministic: no crits, no misses, mid roll, accuracy-weighted). `wins` counts matchups it takes in strictly fewer hits. Ranking should roughly follow BST and evolution stage. Big outliers in either direction are the things to look at.
- **xp**: XP pacing under the old (1/7) and live (`XP_NUM/XP_DEN`, 3/14) `xp_from_faint` rules. First, wild wins per level at L5-30 against a same-level foe with the median `base_exp`. Then a normal-route estimate: a L5 starter beats every `kind == "trainer"` NPC plus N = 10/20/40 wild wins per region (south to north) at the median level of that region's ungated zones (GEODE and glades excluded), reported on reaching the DARK CAVE (against `HUNT["lv_max"]`) and the gym (against LEADER VOLT's median and top level). It is a **starter-only upper bound**: all XP goes to one monster, while a real party splits it. `OVER` marks a line crossed; pacing flags are a user decision, not something to retune silently.

The model ignores speed order on ties, stat-stage moves, switching and AI choice. It's a sanity check, not a simulator. For real fights, the test suite's BATTLE section plays 200 full battles.

Always quote the before/after numbers when proposing or reporting a change.
