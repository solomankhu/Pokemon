---
name: recipe-loops-in-tests
description: Adding any RECIPES row breaks generic SANDBOX test loops and a hard-coded recipe-order list in test.py; plans tend to miss them
metadata:
  type: project
---

`claude's monsters.test.py` SANDBOX has three things that every new RECIPES row touches:
1. the recipe-sanity loop (`r["out"] in mt.MATERIALS or ... r.get("sets_tool")`), which needs an explicit clause for a new tool kind (e.g. `sets_gear`);
2. the "craft conserves exactly" loop (`inv = dict(stone=.., ore=.., ...)`, `for r in mt.RECIPES`), whose inventory must fund every recipe and whose tool-skip condition must list every tool key;
3. an exact recipe-order list (`grep -n "recipe order:"`), next to the AXE checks, which must be extended (never loosened) when rows are appended.

**Why:** Part B (2026-10-23) missed loop 2; crafted weapons (2026-11-15) missed item 3. Both went red only at run time.
**How to apply:** when adding a recipe or a tool flag, grep test.py and test.js for `for r in mt.RECIPES` / `RECIPES.forEach` and `recipe order`, and update each. Tell game-chore the JS mirror needs the same.
