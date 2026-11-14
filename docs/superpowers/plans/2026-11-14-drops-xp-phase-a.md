# Drops + XP, Phase A: implementation plan

**Spec:** docs/superpowers/specs/2026-11-14-drops-xp-crafting-design.md, Phase A (user-approved
2026-11-14). The spec wins on conflict.
**Lane:** DEEP. It touches engine XP, the loot rng draw order, a shared constant table and PARITY traces.
**Owner:** creature-designer (XP pacing and loot are RPG systems), one worker, Python then JS then PARITY.
**Files:**
- `claude's monsters.py`
- `claude's monsters.html`
- `claude's monsters.test.py`
- `claude's monsters.test.js`
- `.claude/skills/balance-report/balance_report.py` (optional XP-pacing readout)

No save format change: bag ids already exist and the counts go through `bag_add`.

**Traps:**
- `claude's monsters.py` is CRLF and pure ASCII. Use the Edit tool only, and check the CR count afterwards.
- The other files are LF.
- Never use the global `random` or `Math.random`.
- After editing a test file, diff its removed lines against the backup (lesson `edit-anchor-drops-assertion`).
- Changing a loot draw order changes every pinned seed, so rewrite those tests on purpose; never delete them (lesson `state-seed-cross-game-compare`).
- Backups: `.superpowers/sdd/2026-11-14-drops-xp/phase-a/`.

## Task A1: XP (both builds)
- **Constants:** `XP_NUM, XP_DEN = 3, 14`, which means `base_exp * level * 1.5 / 7` in integers only.
- **Python:** `xp_from_faint(foe) = max(1, SPECIES[foe.id]["base_exp"] * foe.level * XP_NUM // XP_DEN)`.
- **JS:** `xpFromFaint` uses `Math.floor` on the same integer product. Products stay well under 2^53.
- **Trainers** use the same function. That is unchanged.
- **Tests (py + js):**
  - xp_from_faint equals the formula for every species at L1, L5, L50 and L100, and is ≥ 1;
  - the old/new ratio is in [1.4, 1.6] for L ≥ 5.
  - PARITY compares `xpFromFaint` over every species × {1, 7, 30, 100}, plus the two constants.
- **Pacing evidence:**
  - add a `--xp` readout to `balance_report.py`: wins per level at L5, 10, 15, 20, 25 and 30, before and after;
  - simulate a "normal route" estimate of the starter's level on reaching the gym: the 6 required trainers' XP (from `TRAINERS`) plus N wild wins at each region's median zone level, for N = 10, 20, 40;
  - report it against LEADER VOLT's team (L28-32).
  - **Flag, don't fix:** if the starter is above L32 at N = 20, stop and report to the PM. The gym-balance follow-up is a user decision.

## Task A2: loot (both builds)
- **Constants:**
  - remove `LOOT_WIN_CHANCE`;
  - add `LOOT_DOUBLE = 0.35`, `LOOT_RARE = 0.10`;
  - keep `LOOT_AREA_SHARE` and `LOOT_SALT`.
- **Rare pick:**
  - `loot_rare(region)` returns the pool entry with the strictly smallest weight, and only when the pool has ≥ 2 entries;
  - otherwise it returns None. ROUTE ONE (one entry) and type-only places have no rare.
  - FISHING's rare is pearl.
- **`loot_roll(region, foe_types, caught, trainer, hunt, seed)`:**
  - returns a list of `(id, n)`, possibly empty;
  - trainer or hunt returns `[]`;
  - **draw order (fixed, both builds):**
    1. `rng() < LOOT_AREA_SHARE and pool`: area or type;
    2. the area branch only: a weighted pick;
    3. `n = 2 if rng() < LOOT_DOUBLE else 1`;
    4. `rng() < LOOT_RARE and rare`: append `(rare, 1)`. If rare == the main item, merge it into one entry with n+1.
  - A catch drops exactly as a win does, which keeps today's "a catch always drops".
- **The award, at `Game` end of battle (~py:3186; JS ~:2602):** for each `(id, n)` in order:
  - **message, win:** `"The wild %s dropped %s!"` with `"a NAME"` when n == 1 and `"2 NAME"` otherwise;
  - **message, catch:** `"%s was holding %s!"`;
  - **message, rare:** the rare entry, when it is a separate entry, gets its own message: `"...and a rare NAME!"`;
  - if the bag already holds `BAG_MAX`, keep `"...but your bag is full."`. Otherwise `bag_add` `min(n, BAG_MAX - have)`.
  - Engine rng: none. The loot seed is unchanged.
- **Tests, rewritten in place in both suites:**
  - py ~:2879-2923 and ~:3047-3139; js ~:1994-2021 and ~:2073-2138;
  - the constants tuple;
  - every wild win/catch drops ≥ 1;
  - the measured double rate over 4000 seeds is within ±0.03 of 0.35;
  - the rare rate is within ±0.02 of 0.10 in DEEPWOOD;
  - no rare in ROUTE ONE;
  - trainers and the hunt get `[]`;
  - deterministic;
  - global random untouched (the `Math.random` spy);
  - the ST_DROP/ST_NONE integration tests become "a 1-drop seed" vs "a 2-drop + rare seed", driving the real battle end and checking the queued messages and the bag counts;
  - bag-full at BAG_MAX-1 with n = 2 adds 1.
- **PARITY:** update LOOT_CONST_KEYS and const_keys on both sides; the loot traces now compare lists (JSON round-trip on the Python side).

## Task A3: gates
- `node .claude/scripts/verify.js` 8/8.
- game-reviewer.
- playtester `game: monster-trail`, `mode: duty`, MT-18 (loot messages, counts, bag-full) plus a levelling check: a wild win's XP gain is 1.5x, read from the battle message.
- Update `docs/playtests/monster-trail.md` MT-18. New duty IDs, if any, start at MT-22 (MT-20/21 and CP-06 are reserved by the crafted-weapons plan).

## Functions changed (for the crafted-weapons plan's anchors)
`xp_from_faint`/`xpFromFaint`, `loot_roll`/`lootRoll`, a new `loot_rare`/`lootRare`, the loot block of the battle-end code, and the constants block near `BAG_MAX`. RECIPES, `craft`, `craft_cells`, the battle BAG and save/load are **not** touched in Phase A.

## Revisions from plan review (binding; these override the tasks above where they differ)
- **R1, the `__GAME__` export (html ~:7887-7891):** remove `LOOT_WIN_CHANCE`. Add `LOOT_DOUBLE`, `LOOT_RARE`, `lootRare`, `XP_NUM` and `XP_DEN`. Do this in the same edit that deletes the const; a stale export name throws a ReferenceError on load.
- **R2, empty arrays in JS:** `[]` is truthy in JS.
  - Every JS caller and test checks `.length`, never truthiness or `=== null`.
  - Sets and equality compare `JSON.stringify(...)`.
  - Every seed-search loop (`while`/`next`) gets an iteration cap and fails loudly when it hits the cap.
  - `ST_NONE` is removed, not searched for. Its successors are `ST_ONE` (one entry, n = 1, no rare) and `ST_MULTI` (n = 2 plus a separate rare).
- **R3, the full rewrite ranges:**
  - py ~3044-3148: the drop-chance test; the real fight, where "the drop is the last line" becomes "the loot lines are the last lines, in order"; the bag-full test; the gc/gc6 full-party catch tests.
  - js ~1994-2021 and ~2066-2165: the same tests, plus the throw-path catch loop.
  - The catch tests compare the bag with the full list `loot_roll` returns.
  - List each rewritten test by name in the return, and run the removed-line audit.
- **R4, PARITY coverage:**
  - add a 200-seed sweep over DEEPWOOD, ROCKY PASS and FISHING, caught both false and true, to `lootData` and `python_loot`;
  - assert that the sweep hits a double, a separate rare and a rare == main merge, each at least once.
  - Also add `xpFromFaint` over every species × {1, 7, 30, 100}.
- **R5, pacing (balance_report `--xp`):**
  - parameterise the multiplier so both the old 1/7 and the new 3/14 print;
  - model all 8 trainers from `[n for n in NPCS if n["kind"] == "trainer"]` plus N wild wins per region at its zones' median level (region from `region_name(z["y1"])`), with N = 10, 20, 40;
  - this is a starter-only upper bound (XP goes to `b.mine` only); say so in the output;
  - report the starter's level at two points: (a) on reaching DARK CAVE, against `HUNT["lv_max"]` = 28 (the hunt is party max -1, clamped to 22..28); (b) on reaching the gym, against LEADER VOLT's median L30 and top L32;
  - the flag-don't-fix rule applies to both;
  - document `--xp` in `.claude/skills/balance-report/SKILL.md`.
- **R6, messages and the bag cap:**
  - the count is printed with `%d` (n can be 3 after a merge);
  - `"a NAME"` only when n == 1;
  - a merged rare gets no separate callout;
  - a separate rare gets `"...and a rare NAME!"`;
  - `added = min(n, BAG_MAX - have)`; `"...but your bag is full."` is queued whenever added < n;
  - narration order is unchanged: EXP, level-ups/moves/evolution, coins, main drop, rare;
  - pin all three cases (n = 1, a merge, bag-full partial) with exact message lists in both suites.
- **R7, rate tests:**
  - the rare rate counts rare *units*, merged included: expect 0.10 ± 0.02 over 4000 seeds;
  - the double rate is measured from n before the merge: expect 0.35 ± 0.03.
- **R8, ordering:**
  - do A1 (XP) first and run `verify.js --only py,js`; level-up scenario tests (py ~5400-5420) may now jump two levels;
  - fix any by rewriting the setup, not by deleting checks;
  - then do A2.
- **R9, docs (part of A3):**
  - CLAUDE.md:138 (loot sentence) and the test counts;
  - `.claude/agents/creature-designer.md:24` (the XP formula);
  - `docs/wiki/monster-trail.md`: link the spec;
  - the MT-18 row;
  - then run wiki-sync.
- **Notes:** `FORCE_NO_LOOT` does not suppress XP, so the playtest XP check runs with it off. Nothing new needs emitting. There is no save change. combat/*.js doesn't read loot or XP.

## Plan review log (plan-with-review, 2026-11-14)
| # | Persona | Severity | Finding | Resolution |
|---|---|---|---|---|
| 1 | Gap + Risk | GAP/RISK | `__GAME__` still exports LOOT_WIN_CHANCE; the new names are missing | Fixed: R1 |
| 2 | Gap + Risk | GAP/RISK | `[]` is truthy in JS, and the ST_NONE loop would run forever | Fixed: R2 |
| 3 | Gap + Risk | GAP/RISK | the integration tests reach past the listed ranges | Fixed: R3 |
| 4 | Gap + Risk | GAP/RISK | the GLOOMSTALK hunt check was dropped from pacing | Fixed: R5 |
| 5 | Gap | GAP | balance_report can't do the pacing as written (no TRAINERS, no XP code) | Fixed: R5 |
| 6 | Gap + Risk | GAP/MINOR | stale docs (CLAUDE.md:138, creature-designer.md:24, wiki) | Fixed: R9 |
| 7 | Gap + Risk | MINOR/RISK | PARITY uses 5 seeds and may miss the rare/merge paths | Fixed: R4 |
| 8 | Gap + Risk | MINOR | message wording: n = 3, bag-full partial | Fixed: R6 |
| 9 | Gap | MINOR | narration order unstated | Fixed: R6 |
| 10 | Risk | MINOR | the model has 8 trainers, not 6; thresholds at L30 and L32 | Fixed: R5 |
| 11 | Risk | MINOR | the rare-rate test misses merged rares | Fixed: R7 |
| 12 | Risk | MINOR | level-up tests may jump two levels | Fixed: R8 |
| 13 | Gap | MINOR | FORCE_NO_LOOT / fishing / emit / save / combat checked clean | No change needed |
| 14 | Gap | MINOR (unverified) | phone message width | Fixed: covered by the MT-18 playtest at 390x844 |
