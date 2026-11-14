# Loot, Bag, Coins, Shop and Battle Items (Part A): Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** creatures drop loot that depends on the area and on their type. Battles pay coins, every CENTRE has a shop, and a BAG holds loot and the battle items (GREAT BALL, POTION, SUPER POTION, SMOKE). All of it behaves identically in both MONSTER TRAIL builds.

**Architecture:** this is approach 2: a new `bag` dict plus `coins` and `battles` counters, kept next to the untouched `balls`, `materials`, `lantern` and `pulses`.
- **Tables:** the pure tables (`GOODS`, `LOOT_AREA`, `LOOT_TYPE`) are emitted from Python into the HTML.
- **Functions:** pure functions (`loot_roll` with its own `mulberry32`, coins, shop and save cleaning) are hand-ported and PARITY-compared.
- **Battle flow:** battle payouts reuse the `hunt_paid` re-entry pattern, so no message is lost when the fade starts.

**Tech stack:** Python 3.13 + pygame (`.venv`), vanilla JS, three.js r128 (combat/), the node suites, `.claude/scripts/verify.js`.

**Spec (approved, reviewed twice):** `docs/superpowers/specs/2026-10-18-loot-shop-items-design.md`. **The spec is the source of truth for every message string, number and rule.** This plan says where and in what order.

**Repo notes:**
- **No git.** "Checkpoint" means copying each file you will change into `.superpowers/sdd/2026-10-18-loot-shop-items/` before your first edit to it, then running the named verify.
- **Line endings.** Check them in binary before editing. `claude's monsters.py` is **CRLF**; the suites, the html and the emitter are LF. Keep each file's endings, and never let a script rewrite flip them.
- **Line numbers** in the spec predate the battle-conditions work and are approximate. Find code by name (`end_battle`, `heal_party`, `take_turn`, `save_game`, `load_game`, `hunt_over`, `pick_up`, `MENU_ITEMS`).
- **Existing seams:** both suites already force `FORCE_CONDITION="clear"` and `FORCE_SCENE=DEFAULT_SCENE` at the top. Leave them alone.
- **Paused work:** battle conditions are paused after Chunk 3 (`docs/handoffs/2026-10-18-battle-conditions.md`). Don't touch `combat/arenas.js` or `presenter.js` scene code beyond what Chunk 4 below names.

**Owners:** they work in sequence, never two on the same file.
- Chunks 1-3: **creature-designer** (data, engine, state, battle logic, saves, emitter, JS port, PARITY).
- Chunk 4: **game-feel-engineer** (screens, battle BAG list drawing, 3D cues, layout).
- Chunk 5: the PM.

---

## Chunk 1: Python data and pure functions

**Files:** `claude's monsters.py` (DATA near `MATERIALS`; ENGINE after `battle_scene`), `claude's monsters.test.py` (a new section `LOOT - goods, drops, coins, shop, save cleaning`, placed before RENDER).

### Task 1.1: Tables (TDD)
- [ ] **Step 1: Failing tests.**
  - **GOODS:** it has exactly the 24 ids from spec §1 (4 shop items plus 20 loot), and every entry has `name`, `kind`, `price` and `desc`. Balls carry `bonus`, heals carry `heal`, and every price is above 0.
  - **LOOT_AREA:** every key is a `REGIONS` name or `FISHING`, every id in it is loot in GOODS, and every weight is above 0.
  - **LOOT_TYPE:** it covers every key of `TYPE_CHART` (12), and every value is loot in GOODS.
  - **Constants:** the values match the spec §1 table.
  - **No clash:** the item-ball table `ITEMS` is unchanged (it keeps its existing keys).
- [ ] **Step 2:** Run `.venv/Scripts/python.exe "claude's monsters.test.py"` and expect an `AttributeError` on `GOODS`.
- [ ] **Step 3:** Add `GOODS`, `LOOT_AREA` (a dict of lists of `(id, weight)` tuples), `LOOT_TYPE` and the constants (`BALL_PRICE`, `START_COINS`, `COINS_MAX`, `BAG_MAX`, `LOOT_WIN_CHANCE`, `LOOT_AREA_SHARE`, `LOOT_SALT`, `SAFETY_BALLS`, `GYM_BONUS`, `SHOP_QTY_MAX`, plus `FORCE_NO_LOOT = False`), copying the spec §1 values exactly. GOODS preserves the spec's row order.
- [ ] **Step 4:** PASS.

### Task 1.2: Pure functions (TDD)
- [ ] **Step 1: Failing tests,** one block per function, each assertion taken from spec §6 "Pure functions":
  - `loot_seed`: 3 fixed values, plus wrapping with a large `steps`.
  - `loot_roll`:
    - over 2000 seeds, a win drops at a rate within 0.40±0.04;
    - a catch always drops;
    - for drops in a region with area loot, the area share is within 0.70±0.04;
    - the area weights fall within ±0.05;
    - a trainer or a hunt gives None;
    - ROUTE ONE with a Fire foe can give only `softfur` or `emberdust`;
    - RIDGE TOWN (no area row) always gives the type item;
    - it is deterministic;
    - it never changes `random.getstate()`.
  - `coin_reward`: wild level 10 gives 30; a trainer with max level 12 gives 240; the gym unpaid gives the trainer amount + 300, and paid gives the trainer amount.
  - `blackout_coins` (spec list): 0→0, 1→1, 3→3, 4→3, 7→6, 99999→75000.
  - `add_coins` / `bag_add`: clamping, zero entries dropped, the input dict never mutated.
  - `shop_buy` / `shop_sell`: conservation; the not-enough-coins, BAG_MAX and qty 0 / qty 11 refusals; loot can't be bought, shop items can't be sold; a ball adds to `balls`; the ball total cap is 999; selling past COINS_MAX is refused; the reasons are exactly `"coins"`, `"full"`, `"qty"` and `"item"`.
  - `ball_safety_net`: (0,19)→5, (0,20)→0, (1,0)→0.
  - `clean_bag` / `clean_coins` / `clean_count`: junk (`None`, list, string, dict-with-junk), bools rejected, `1.0` accepted as 1, `1.5` gives 0, negative values clamped to 0, unknown ids dropped, absent or `None` coins give 100, a missing count gives 0.
- [ ] **Step 2:** FAIL.
- [ ] **Step 3: Implement.** The reference code for the trickiest function:

```python
def loot_seed(steps, tx, ty, foe_level, battles):
    return ((steps * 31 + tx * 977 + ty * 131 + foe_level * 7919 + battles * 104729) ^ LOOT_SALT) & 0xFFFFFFFF


def loot_roll(region, foe_types, caught, trainer, hunt, seed):
    """Pure: the loot id a battle drops, or None. Own mulberry32; never random."""
    if trainer or hunt:
        return None
    rng = mulberry32(seed)
    if rng() >= LOOT_WIN_CHANCE and not caught:
        return None
    pool = LOOT_AREA.get(region)
    if rng() < LOOT_AREA_SHARE and pool:
        pick = rng() * sum(w for _, w in pool)
        for item, w in pool:
            pick -= w
            if pick < 0:
                return item
        return pool[-1][0]
    return LOOT_TYPE[foe_types[0]]


def _whole(v):
    """A save value as a non-negative int, or None: finite integral numbers only, never bools."""
    if isinstance(v, bool) or not isinstance(v, (int, float)):
        return None
    if isinstance(v, float) and not v.is_integer():
        return None
    return int(v)
```

  Build the rest (`coin_reward`, `blackout_coins`, `add_coins`, `bag_add`, `shop_buy`, `shop_sell`, `ball_safety_net`, `clean_bag`, `clean_coins`, `clean_count`) exactly as spec §2 describes, keeping them pure, with no `self`.

  **The draw order is fixed and PARITY-checked:**
  1. r, the drop check;
  2. s, the area-or-type choice;
  3. a pick, only on the area branch.

  `clean_coins(None)` and a missing value both give `START_COINS`. A `float('nan')` or `inf` gives 0 (guard with `math.isfinite`).
- [ ] **Step 4:** PASS. Checkpoint with `node .claude/scripts/verify.js --only py`. PARITY doesn't compare the new names yet, so it stays green.

---

## Chunk 2: Python state, battle, heal, hunt and saves

**Files:** `claude's monsters.py` (`Game.__init__` / new game / reset, `Battle.__init__`, `start_battle`, `take_turn`, `end_battle`, `hunt_over`, `heal_party`, the H-door handler, `save_game` / `load_game`, the battle input handler and `MENU_ITEMS`, the minimal battle BAG draw), `claude's monsters.test.py`.

### Task 2.1: State, fields and saves (TDD)
- [ ] **Tests:**
  - a new game has `bag == {}`, `coins == 100`, `battles == 0` and `flags["gym_bonus"] is False`;
  - `start_battle` increments `battles` and stores `b.fishing`, `b.reward_paid=False`;
  - a save round-trip keeps bag, coins, battles and gym_bonus;
  - an old save (dict without the fields) gives `{}`, 100, 0, False;
  - a junk save is cleaned (spec §5);
  - `gym_bonus: "yes"` becomes a bool.
- [ ] **Implement:** the fields in new game and reset; save adds `bag`, `coins` and `battles`, with `flags` already saved; load uses the clean functions and normalises `gym_bonus` (copy how `backstop` is normalised).

### Task 2.2: `heal_party` and the H door (TDD)
- [ ] **Tests:**
  - `heal_party` no longer raises balls to 20;
  - it returns 5 and adds 5 balls when balls=0 and coins<20, and returns 0 otherwise;
  - the lantern, tension and `hunt_gone` behave as before;
  - the H-door dialogue lines: "Your team is fully healed!", plus the nurse line only when the net fired;
  - the whiteout dialogue appends the nurse line only when the net fired.
- [ ] **Implement** as spec §3, then update the sign at (18,59) and the NPC line (spec §4 text).

### Task 2.3: Payouts in `end_battle` and `hunt_over` (TDD)
- [ ] **Tests** (spec §6 Battle):
  - **Wild win:** with `FORCE_CONDITION` clear and a seeded steps/tx/ty, the queue shows "You got 30 coins!" plus the loot line when `loot_roll` says so, before the fade (`battle` is still set when they're queued). The coins and bag change.
  - **Trainer win:** coins only; the gym pays the bonus once and sets `gym_bonus`.
  - **Catch:** the loot line. Also with the team at 6 (release): the loot is kept and there are no coins.
  - **Lose:** "You dropped N coins..." and the ¼ loss; then the whiteout heal runs the safety net after the loss (order test).
  - **Hunt:** a win gives no coins or loot, only ORE as today; a loss loses ¼ through `hunt_over`.
  - **Run:** nothing.
  - **`FORCE_NO_LOOT=True`:** no loot, no coins, and no blackout loss.
  - **The random-stream proof:** the same seeded wild battle run with `FORCE_NO_LOOT` False and True ends with equal `random.getstate()`.
  - **Bag full:** with the item at BAG_MAX, "...but your bag is full.".
- [ ] **Implement** the first-pass payout block at the top of `end_battle`. Run it after the `hunt_paid` block, with `if not b.hunt and not b.reward_paid:`. Pay through the pure functions, queue the messages, then `q_do(lambda: self.end_battle(result))` and return. Add the hunt-lose coin loss inside `hunt_over` (spec §3). The foe's level and types come from `b.foe`. A trainer's max level is the highest level in `trainer["team"]`. Check the team tuple shape in the code.

### Task 2.4: Battle items in `take_turn` and the battle BAG phase (TDD)
- [ ] **Tests** (spec §3 battle bullets):
  - `{"t":"ball"}` without `item` behaves exactly as today (existing calls unchanged);
  - a GREAT BALL passes bonus 2.25 to `catch_roll` (monkeypatch spy) and uses the bag, not balls; a refused GREAT BALL (hunt or trainer) isn't used up;
  - POTION: refused at full HP (no turn, nothing used); otherwise it heals `min(20, missing)`, then the queue order is message, `q_hp`, the foe's move, `q_hp`, faint check;
  - SUPER POTION heals 60;
  - SMOKE: refused against a trainer or in a hunt (not used up, no turn); otherwise it is used up, the message is queued, the battle ends as "run", and the odds roll is never drawn (count `random.random` calls);
  - an item turn draws exactly the usual `random.choice` foe-move pick plus the foe's move rolls.
- [ ] **Battle menu:** labels `["FIGHT", "BAG", "SWAP", "RUN"]`.
  - Confirming BAG enters `b.phase = "bag"`, with a list built from the owned usable items (spec order: BALL, GREAT BALL, POTION, SUPER POTION, SMOKE).
  - Up and down move the cursor, confirm calls `take_turn`, and cancel returns to `menu`.
  - An empty list gives "Your bag is empty!" and `menu`, with no turn used.
  - A minimal draw of the list in the battle panel (name and count, a cursor) is enough here; Chunk 4 polishes it.
- [ ] **Deliberate test updates (spec §6), and only these:**
  - the RENDER `drive` harness `("ball",)` now selects BAG, then BALL;
  - `BATTLE_PHASES` gains `bag`, and the panel labels are updated;
  - the no-ball scenario expects "Your bag is empty!";
  - the H-door text assertions.

  If any other existing assertion fails, **stop and report it**.
- [ ] **Overworld menu: not in this chunk.** PARITY already compares `MENU_ITEMS` (test.py ~5268 / ~5073), so the BALLS→BAG rename happens in **both** builds at once, in Chunk 3. Chunk 2 adds no `mode="bag"`.
- [ ] **Battle cursor (plan-review fixes):**
  - **Vertical cursor:** `move_cursor` uses 2-column grid maths (`cursor + dx + dy*2`, py ~3189). Add a `b.phase == "bag"` branch that moves one row per up/down, ignores left/right and clamps to the list.
  - **Harness:** the RENDER `drive` harness `nav()` (test.py ~3519) needs the same vertical branch.
  - **Cancel:** the battle cancel handler (py ~3150) gets a `bag` branch back to `menu`, with no turn used.
  - **Empty bag:** "Your bag is empty!" is queued exactly like today's no-balls path (py ~3081-3089): `b.phase = "anim"`, `q_msg`, then a `to_menu` `q_do`. It is not a toast, because `drive` only records queued messages.
- [ ] **GREAT BALL decrement:** it happens inside `throw()` (py ~2268-2299), next to `balls -= 1`, so the ball is used only when thrown. The throw message is "You threw a GREAT BALL!", and today's BALL text is unchanged.
- [ ] **`battles`:** it is incremented **after** the `first_alive` guard in `start_battle`. `start_battle` computes and stores `b.loot_seed = loot_seed(self.steps, p.tx, p.ty, foe.level, self.battles)` straight away, using the post-increment `battles`. The payout uses `b.loot_seed`, so nothing that happens later in the battle can change it. JS mirrors this as `b.lootSeed`.
- [ ] **Verify:** `.venv/Scripts/python.exe "claude's monsters.test.py"` must PASS. Then run `.venv/Scripts/python.exe .claude/skills/balance-report/balance_report.py` and confirm it is byte-identical to a "before" copy saved at the start of Chunk 2.

---

## Chunk 3: Emitter, JS port and PARITY

**Files:** `.claude/skills/add-monster/emit_tables.py`, `claude's monsters.html`, `claude's monsters.test.js`, the test.py PARITY section.

- [ ] **Task 3.1, the emitter:**
  - **Emitters:** `emit_goods` (a dict of dicts; optional keys `bonus` and `heal` are emitted only when present), `emit_loot_area` (the `emit_region_conditions` pattern) and `emit_loot_type` (`obj()`).
  - **`BLOCKS`:** add the three.
  - **Placeholders:** seed `const GOODS = {` / `};`, `const LOOT_AREA = {` / `};` and `const LOOT_TYPE = {` / `};` in the html, near `REGION_CONDITIONS`.
  - **Docstring:** update it.
  - **Run:** dry run, then `--write`, then a second dry run that should say the tables already match.
- [ ] **Task 3.2, the JS port (TDD in test.js),** mirroring Chunks 1-2 one for one:
  - **Pure functions and constants:** `lootSeed` with `>>> 0`, and `cleanBag`/`cleanCoins`/`cleanCount` using `Number.isInteger` and `Number.isFinite`, rejecting booleans. `forceNoLoot` gets an exported setter.
  - **Game state:** `G.bag`, `G.coins`, `G.battles`, `flags.gymBonus`, `b.fishing`, `b.rewardPaid`.
  - **`heal_party` and its callers,** and the `endBattle` payout plus `huntOver` loss.
  - **`takeTurn`:** the item branches, and the battle BAG phase in the index-based `confirmBattle`.
  - **The overworld menu rename BALLS→BAG in both builds together** (Python `MENU_ITEMS` and `menu_label`, plus JS `MENU_ITEMS` and `menuLabel`), keeping PARITY green. Until Chunk 4, choosing BAG keeps today's BALLS behaviour, a toast, now reading "COINS N - BALLS N". There is no new mode yet.
  - **The save/load field lists** (`bag`, `coins`, `battles`).
  - **The JS CombatCommands battle layout** ATTACK/DEFEND/BALL/SWAP/RUN, ordered `[0,4,1,2,3]` (html ~5093 and ~5581): BALL becomes BAG, and the hint text is updated. Index 1 stays the BAG slot. The plain layout `opts = ['FIGHT','BALL','SWAP','RUN']` (html ~5099) also becomes BAG.
  - **The JS `moveCursor`** (html ~5585) gets the same vertical `bag` branch as Python.
  - **Draw order (warning):** keep `rng() >= LOOT_WIN_CHANCE && !caught`. Writing `!caught && rng()...` would skip the draw and break PARITY.
  - **The text changes.**
  - **Tests:** the spec §6 list, plus the `Math.random` call-count proof with `setForceNoLoot`. Update the JS `confirmBattle` index tests deliberately.
  - **Exports:** `GOODS, LOOT_AREA, LOOT_TYPE`, the constants, the pure functions and `setForceNoLoot` on `__GAME__`.
- [ ] **Task 3.3, PARITY:**
  - **`python_tables()` / `JS_DUMP` gain `loot`:** the three tables (deep-converted via `json.loads(json.dumps(...))`), the constants, 20 `loot_seed` values, 500 `loot_roll` results over (region incl. FISHING and RIDGE TOWN, types, caught, seed), `coin_reward` / `blackout_coins` case lists, 30 `shop_buy`/`shop_sell` cases (each result tuple as a list) and 20 save-cleaning cases.
  - **Also compare the strings** listed in spec §4: the (18,59) sign, the NPC line and the H-door heal lines, including the nurse line.
- [ ] **Verify:** `node .claude/scripts/verify.js --only py,js,combat,combatpy,tables` must be GREEN. A mutation check (one price in a scratch copy of the html) proves PARITY catches it.

---

## Chunk 4: Screens, battle BAG list, 3D cues (game-feel-engineer)

**Files:** `claude's monsters.py` (Shell drawing and the bag/shop mode input), `claude's monsters.html` (the same), `combat/effects.js` or `presenter.js` (only the heal glow and GREAT BALL colour), RENDER in test.py, SHELL JUICE in test.js, the combat tests.

- [ ] **Task 4.1, the BAG screen (`mode="bag"`)** in both builds, per spec §4. Choosing BAG on the overworld menu now opens this mode, replacing Chunk 3's toast. **Input:** the overworld cancel branch (py ~3147, which covers only menu/party/craft) and `move_cursor` both gain `bag` and `shop` branches, so the player can never be stuck.
  - **Layout:** the COINS header, the ITEMS / MATERIALS / LOOT sections, an 8-row scroll window and a description line.
  - **POTION:** confirming opens the party picker, which refuses at full HP or when fainted and never revives.
  - **Touch:** works through the existing keys.
- [ ] **Task 4.2, the shop (`mode="shop"`):**
  - **Entry:** after the H-door heal, `say(..., on_done)` shows SHOP / LEAVE.
  - **BUY / SELL** use the quantity picker and `shop_buy`/`shop_sell` with the spec's refusal texts. The ball total is capped at 999.
  - **Every H door.**
  - **Modes:** add `bag` and `shop` to the cave-fx mode lists and the input dispatch in both builds.
- [ ] **Task 4.3, the battle BAG list:** polish Chunk 2's minimal list to match the battle panel style; it must stay within the panel.
- [ ] **Task 4.4, 3D cues:**
  - **Snapshot actions:** they gain `kind:'heal'` (actor mine) and the ball's `item`.
  - **Presenter:** a green self ring or glow for heal (the existing kindless-ring path) and a blue tint for a GREAT BALL throw.
  - **Tests:** no `Math.random`, and the existing reduced-motion rules hold.
- [ ] **Task 4.5, tests and layout:**
  - **RENDER:** the BAG (empty, full, scrolled), shop BUY/SELL, the battle BAG list and the party picker draw with text inside the panels. `want_modes` gains `bag` and `shop`.
  - **JS:** pixel-free checks of the list builders.
  - **PARITY:** the new BAG and shop layout constants go into `SHELL_KEYS`, per spec §6.
  - **Browser screenshots** at 640x480, 390x844 and 844x390 (headless Chromium, **never with the camera**).
- [ ] **Verify:** the full `node .claude/scripts/verify.js` must be GREEN.

---

## Chunk 5: Docs, playtest, gates (PM)
- [ ] **CLAUDE.md:** replace the "deliberately out of scope: items/bag, money, shops" bullet with a description of this system (GOODS, the loot seed, payouts through `reward_paid`, the shop at the H door, the save fields, `FORCE_NO_LOOT`). Add GOODS, LOOT_AREA and LOOT_TYPE to the emit_tables coverage, and update the check counts.
- [ ] **Wiki:** update testing.md and monster-trail.md, then run `node .claude/scripts/wiki-sync.js`.
- [ ] **`docs/playtests/monster-trail.md`:** add the MT-18 row (spec §6 Playtest).
- [ ] **Gates:** the full verify, the game-reviewer per chunk and at the end, playtester `full` (MT-18 plus regressions MT-04/05/06/09/13/14), and the learning loop.

## Continuation status (2026-10-18)

Chunks 1-4 were already reviewed; Chunk 5 docs and continuation playtests are now implemented. See `docs/playtests/runs/2026-10-18-continuation.md` and `docs/handoffs/2026-10-18-resume.md` for final verification. Historical step checkboxes above are retained.
