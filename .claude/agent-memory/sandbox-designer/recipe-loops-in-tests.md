---
name: recipe-loops-in-tests
description: Adding any RECIPES row breaks generic SANDBOX test loops that iterate all recipes from one fixed inventory; plans tend to miss them
metadata:
  type: project
---

`claude's monsters.test.py` SANDBOX has a generic "craft conserves exactly" loop (`inv = dict(stone=.., ore=.., ...)`, `for r in mt.RECIPES`) that funds EVERY recipe from one inventory and builds the expected delta, skipping tool recipes (`sets_tier`, and since Part B `sets_tool`). A new recipe with new need ids (e.g. loot) fails "craft(x) succeeds with enough" there until the ids are added to `inv`.

**Why:** the Part B plan (2026-10-23) listed only the recipe-sanity loop; this second loop went red and needed extending (not weakening).
**How to apply:** when adding a recipe or a new tool flag, grep test.py and test.js for `for r in mt.RECIPES` / `RECIPES.forEach` and extend each loop's inventory and tool-skip condition. Tell game-chore the JS mirror needs the same.
