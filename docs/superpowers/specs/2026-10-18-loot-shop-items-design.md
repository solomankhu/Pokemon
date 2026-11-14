# Loot, bag, coins, shop and battle items (Part A): design

Date: 2026-10-18. Lane: DEEP. It touches the save format, the battle step queue, shared tables and both builds.
Source: the user's sketch. Part B (crafting from loot, the AXE, trees hiding secret areas) is a later, separate spec.
Approved approach: **2**, a new `bag` alongside the existing counters. `balls`, `materials` (stone/ore/wall), `lantern` and `pulses` are untouched.

## Goal
Creatures drop loot that depends on the area and on their type. Battles pay coins. A shop at each healing CENTRE sells balls and battle items and buys loot. The BAG holds loot and items, and battle items work in fights. All of it behaves identically in `claude's monsters.py` and `claude's monsters.html`, as proven by PARITY.

**This reverses CLAUDE.md's "deliberately out of scope: items/bag, money, shops" rule** (the user's decision on 2026-10-18). CLAUDE.md is updated to describe this system instead.

## 1. Data (Python is the source; `emit_tables.py` emits it to HTML)

`emit_tables.py` can't emit dicts yet. It needs new emitters, with placeholder `const X = {` / `};` lines seeded in the HTML before the first `--write`:
- `GOODS`: a dict of dicts, with optional per-kind keys;
- `LOOT_AREA`: weighted pairs, in the `emit_region_conditions` pattern;
- `LOOT_TYPE`: through `obj()`.

The constants are hand-ported, and PARITY checks them.

### `GOODS`: id → `name`, `kind` (loot/ball/heal/escape), `price` (buy price, or sell price for loot), `desc`, plus kind-specific fields

**Shop items:**

| id | name | kind | price | extra |
|---|---|---|---|---|
| greatball | GREAT BALL | ball | 60 (buy) | `bonus=1.5` (multiplies the existing ball bonus) |
| potion | POTION | heal | 30 (buy) | `heal=20` |
| superpotion | SUPER POTION | heal | 80 (buy) | `heal=60` |
| smoke | SMOKE | escape | 40 (buy) | |

**The BALL** stays the existing `balls` counter. The shop sells it for `BALL_PRICE = 20`, and it is not a `GOODS` entry. (The name `ITEMS` is already taken by the item-ball table at py:1548 / html:754, so this table is `GOODS`.)

**Loot** is `kind="loot"`, and `price` is its sell price:

| Item | Price |
|---|---|
| softfur SOFT FUR | 5 |
| twig TWIG | 6 |
| treesap TREE SAP | 14 |
| shell SHELL | 6 |
| seasalt SEA SALT | 14 |
| grit GRIT | 8 |
| flint FLINT | 16 |
| glowmoss GLOW MOSS | 10 |
| glowcrystal GLOW CRYSTAL | 24 |
| dust DUST | 10 |
| relicshard RELIC SHARD | 30 |
| scale SCALE | 8 |
| pearl PEARL | 30 |
| emberdust EMBER DUST | 12 |
| dewdrop DEW DROP | 12 |
| leaf LEAF | 8 |
| copperwire COPPER WIRE | 14 |
| venomsac VENOM SAC | 14 |
| feather FEATHER | 10 |
| shadowsilk SHADOW SILK | 16 |

### `LOOT_AREA`: region name → weighted list. One extra key, `"FISHING"`. Regions not listed have no area loot, so a drop there always comes from the type list.

| Region | Weights |
|---|---|
| ROUTE ONE | softfur 1 |
| DEEPWOOD | twig 3, treesap 1 |
| SEASIDE | shell 3, seasalt 1 |
| ROCKY PASS | grit 3, flint 1 |
| DARK CAVE | glowmoss 3, glowcrystal 1 |
| SPIRE RUINS | dust 3, relicshard 1 |
| FISHING | scale 3, pearl 1 |

### `LOOT_TYPE`: type → item
| Type | Item |
|---|---|
| Normal | softfur |
| Fire | emberdust |
| Water | dewdrop |
| Grass, Bug | leaf |
| Electric, Steel | copperwire |
| Poison | venomsac |
| Flying | feather |
| Psychic, Dark | shadowsilk |
| Rock | flint |

The rule is that every one of the 12 types has an entry, and this is tested.

### Constants
| Constant | Value |
|---|---|
| `BALL_PRICE` | 20 |
| `START_COINS` | 100 |
| `COINS_MAX` | 99999 |
| `BAG_MAX` | 999 (per item) |
| `LOOT_WIN_CHANCE` | 0.4 |
| `LOOT_AREA_SHARE` | 0.7 |
| `LOOT_SALT` | 0x1007 |
| `SAFETY_BALLS` | 5 |
| `GYM_BONUS` | 300 |
| `SHOP_QTY_MAX` | 10 |

## 2. Engine (pure, both builds, injectable/own randomness)

- **`loot_seed(steps, tx, ty, foe_level, battles)`** = `((steps*31 + tx*977 + ty*131 + foe_level*7919 + battles*104729) ^ LOOT_SALT) & 0xFFFFFFFF`.
  - **`battles`** is a new saved counter, `Game.battles` / `G.battles`. It goes up by 1 at every `start_battle`, so re-fishing the same tile can't farm the same PEARL roll. It is cleaned on load like coins, and is 0 when absent.
  - **JS** computes the same value with `>>> 0`, and PARITY compares 20 seeds.
- **`loot_roll(region, foe_types, caught, trainer, hunt, seed)`** returns an item id or None. It uses its own `mulberry32(seed)` and never touches `random` / `Math.random`.
  1. A trainer or a hunt gives None, with no draw.
  2. `r = rng()`. When not caught and `r >= LOOT_WIN_CHANCE`, it returns None. A catch skips that check but still makes the draw, so the number of draws is fixed.
  3. `s = rng()`. When `s < LOOT_AREA_SHARE` and the region has `LOOT_AREA` (FISHING for fishing battles), the item is a weighted pick using `rng()`. Otherwise it is `LOOT_TYPE[foe_types[0]]`.
- **`coin_reward(foe_level, trainer_max_level, is_gym, gym_paid)`:**
  - wild: `3 * foe_level`;
  - trainer: `20 * trainer_max_level`;
  - gym: the trainer amount, plus `GYM_BONUS` if not yet paid.
  - A hunt pays 0; the caller passes nothing.
- **`blackout_coins(coins)`** returns `coins - coins // 4`, so you **lose ¼, rounded down** (the user's choice).
- **`add_coins(coins, n)`** clamps to `[0, COINS_MAX]`. **`bag_add(bag, item, n)`** clamps to `[0, BAG_MAX]`, drops zero entries and returns a new dict.
- **`shop_buy(coins, balls, bag, item, qty)`** returns `(coins, balls, bag, ok, reason)`.
  - `item == "ball"` adds to `balls` at `BALL_PRICE`. Other items must be `GOODS` of a kind other than loot.
  - `qty` must be 1..`SHOP_QTY_MAX`. The purchase is refused if `price*qty > coins`, or if it would exceed `BAG_MAX`.
  - **Conservation:** `coins` falls by exactly `price*qty`.
- **`shop_sell(coins, bag, item, qty)`:** only loot can be sold, up to the amount owned. Coins rise by `price*qty`, clamped to `COINS_MAX`; past the clamp, the sale is refused rather than losing coins.
- **`ball_safety_net(balls, coins)`** returns `SAFETY_BALLS` when `balls == 0 and coins < BALL_PRICE`, otherwise 0.
- **`clean_bag(raw)` / `clean_coins(raw)` / `clean_count(raw)`** validate data loaded from a save.
  - **Accepted:** a value is accepted only if it is a finite integral number: Python `int`, or a `float` with `.is_integer()`; JS `Number.isInteger`. Bools are never accepted, in either build.
  - **Everything else becomes 0.** The result is clamped. `clean_bag` also drops non-dict data and unknown ids.
  - **Coins:** absent **or `null`** gives `START_COINS`. Any other invalid value gives 0.
  - **`flags.gym_bonus`** is normalised to a bool on load, the way `backstop` is (py:2787, html:2512).
- **`FORCE_NO_LOOT`** (py module variable / JS `let forceNoLoot` plus an exported setter) is a test seam in the style of `FORCE_CONDITION`. When it is true, `loot_roll` is skipped and coins are not paid. It is never saved, and both suites leave it false.

## 3. State and battle flow (both builds; everything goes through the `q_*` helpers)

- **`Game.bag = {}`, `Game.coins = START_COINS`, `Game.battles = 0`, `flags["gym_bonus"] = False`.** JS uses `G.bag`, `G.coins`, `G.battles` and `flags.gymBonus`. These are set by new game and by reset.
- **`Battle.fishing`** stores `start_battle`'s `fishing` flag (both builds), so loot uses the FISHING row. `Battle.reward_paid = False` (JS `rewardPaid`).
- **`heal_party`** returns the number of safety-net balls given; it has no queue to add a message to.
  - It no longer does `balls = max(balls, 20)`. It does `n = ball_safety_net(balls, coins); balls += n; return n`.
  - It still refills the lantern and tension, and clears `hunt_gone`.
  - **Callers own the nurse line.** At the H door (py:2539 / html:2283), the existing `say()` replaces "your BALL pouch is topped up to %d" (py:2542 / html:2286) with "Your team is fully healed!", and adds "Here, take these BALLs. Be careful out there." when `n > 0`. The whiteout `after()` (py:2366 / html:2076) appends the same line to its own `say` when `n > 0`. Bare test calls ignore the return value.
- **Paying out in `end_battle(result)`, using the `hunt_paid` pattern (py:2343-2348 / html:2055-2060).**
  - **Why:** `end_battle` calls `start_fade` immediately, and the fade's `after()` sets `battle = None`, which drops anything still queued.
  - **First call** (when `not b.reward_paid` and `not b.hunt`): set `reward_paid = True`, then queue the reward messages and `q_do(lambda: self.end_battle(result))`, and return.
  - **Second call:** proceeds as today.
  - **Hunts** keep their own `hunt_paid` path for the ORE reward. When a hunt is **lost**, the blackout coin loss is queued inside `hunt_over("lose")`, after its own lines, as "You dropped N coins...". Hunts never take the `reward_paid` step. This is tested.
  - **The result strings are today's:** `"win"`, `"caught"`, `"lose"` and `"run"`.
  - **`win`:** `coins = add_coins(coins, coin_reward(...))`, with "You got N coins!". In a wild battle, `loot_roll(..., caught=False, ...)`; on a drop, `bag_add`, with "The wild X dropped a TWIG!", or "...but your bag is full." when the item is already at `BAG_MAX`. The gym sets `gym_bonus`.
  - **`caught`:** `loot_roll(..., caught=True, ...)`, with "X was holding a LEAF!". This also happens when the full team releases the catch: the loot is still kept. No coins are paid.
  - **`lose`:** coins drop to `blackout_coins(coins)` **first**, with "You dropped N coins..." when N is above 0. This includes losing a hunt, because a blackout is a blackout; the hunt pays no reward, but the coin loss still applies. The safety net is checked afterwards, in the whiteout `heal_party`.
  - **`run`:** nothing is paid.
  - With `FORCE_NO_LOOT` set, no loot or coins are paid, and the blackout coin loss is also skipped. The XP messages already come before `end_battle` (py:2146-2196).
- **The battle action menu:** `["FIGHT", "BALL", "SWAP", "RUN"]` becomes `["FIGHT", "BAG", "SWAP", "RUN"]`. BAG opens a sub-list (`b.phase = "bag"`) of usable items you own: BALL (count), GREAT BALL, POTION, SUPER POTION and SMOKE. Cancel returns to the menu without using a turn. Choosing one calls `take_turn` with:
  - **`{"t":"ball", "item":"ball"|"greatball"}`:** the existing ball path. A GREAT BALL multiplies the ball bonus by 1.5 (today `catch_roll(b.foe, 1.5, ...)`, so 2.25), and decrements `bag`, not `balls`. Refusals keep today's behaviour and text: no turn used, and only the usual foe-move pick (see `take_turn`, which draws `random.choice` first).
  - **A refused GREAT BALL is not used up.** The bag is only decremented when the throw happens.
  - **`{"t":"item", "item":"potion"|"superpotion"}`:** heals the **active** creature only, with no picker in battle. It is refused at full HP ("It won't have any effect.", no turn). Otherwise it uses one potion and heals `min(heal, maxhp - hp)` with "X recovered N HP!". Then the queue runs `q_hp()`, `apply_move(False, foe_move)`, `q_hp()` and `faint_check()`, the same tail as a missed catch.
  - **`{"t":"item", "item":"smoke"}`:** refused against a trainer or in a hunt ("The smoke won't help here!", no turn, nothing used up). Otherwise it uses one SMOKE, shows "You vanished in a puff of smoke!", then `q_do(lambda: self.end_battle("run"))`. There is no RUN odds roll and no direct call.
  - **The battle BAG list** shows only the usable items you own: BALL when `balls > 0`, and the others when their bag count is above 0. If nothing is owned, choosing BAG shows "Your bag is empty!" and returns to the menu without using a turn. That replaces today's "You have no balls left!" path for the BAG slot. The text is kept only as a defensive guard in the ball branch, for a direct `take_turn` call when `balls == 0`.
  - **A missing `item` key** in `{"t":"ball"}` means `"ball"`, so the existing `take_turn(dict(t="ball"))` test calls keep working unchanged.
- **Random-stream rule:**
  - Loot, coins, the shop and the safety net **never** draw from `random` / `Math.random`.
  - An item turn draws exactly what any turn draws: the foe-move pick, then the foe's move rolls.
  - **The proof:** the same seeded battle is run twice, with `FORCE_NO_LOOT` false and then true. `random.getstate()` must be the same at the end of both runs. JS checks that the `Math.random` call count is equal.
- **Battle snapshot (JS):** `action` events gain `kind:'heal'` (actor 'mine') and the ball's `item`, so the 3D presenter can show a heal glow and a blue GREAT BALL.

## 4. Overworld UI (both builds; shell)

- **MENU_ITEMS:** `["PARTY", "SAVE", "BALLS", "CRAFT", "PULSE", "CLOSE"]` becomes `["PARTY", "SAVE", "BAG", "CRAFT", "PULSE", "CLOSE"]`. It's the same slot, so PULSE stays at row 4 and the indexes are unchanged. `menu_label` for BAG shows `BAG`.
- **BAG screen (`mode = "bag"`):**
  - A header line `COINS 1234`.
  - Sections: ITEMS (BALL plus the bag items), MATERIALS (stone/ore/wall, read-only) and LOOT. Each row shows `NAME xN`, and the description of the selected row sits at the bottom.
  - Up and down scroll, with a scrolling window of 8 rows. Confirm on a POTION opens a party picker; healing the picked creature uses one item, is refused at full HP or when fainted, and doesn't revive. Cancel goes back.
  - Touch uses the existing D-pad/A/B; the webcam isn't active outside battle.
- **Shop (`mode = "shop"`):**
  - After the CENTRE heal dialogue, the menu is `SHOP` / `LEAVE`.
  - SHOP opens BUY / SELL / BACK. BUY lists BALL, GREAT BALL, POTION, SUPER POTION and SMOKE with their prices. Left and right change the quantity from 1 to `SHOP_QTY_MAX`, the total shows, and confirm buys through `shop_buy`. A refusal shows "Not enough coins." or "Your bag is full.". BALL purchases are also capped at `BAG_MAX` (999) total balls, though the `balls` counter itself stays uncapped elsewhere.
  - **Mode lists:** the new modes `bag` and `shop` are added wherever modes are enumerated: the cave-fx mode lists (html:3113 and 3165, plus the Python equivalents) and the input dispatch. The JS `menuRows` DESCEND row, inserted at index 5 after the gym, is unaffected.
  - SELL lists the loot you own, with the sell price × quantity, through `shop_sell`.
  - Every CENTRE door (`H`) gets the shop, so the map doesn't change.
- **Text changes.** PARITY does **not** cover these strings today (it compares only `SIGNS[(28,40)]` and t7's `after`), so this work adds them to the PARITY dump:
  - the sign at (18,59): `"CENTRE: free healing, and a shop. No catch."`;
  - the NPC line at py:1562 / html:767: `"The CENTRE door heals your whole team, and its shop sells balls."`;
  - the H-door heal lines, including the new nurse line.
- **Layout:** 640x480. The HTML is checked at 390x844 and 844x390, and text must not overflow its panels.

## 5. Saves (both builds)
- **Saved:** `save_game` adds `bag` (a dict), `coins`, `battles` and `flags.gym_bonus`, through the existing flags dict.
- **Loading:** `load_game` uses `clean_bag(d.get("bag"))`, `clean_coins(d.get("coins"))` (`START_COINS` when absent or null) and `clean_count(d.get("battles"))`, so old saves load with an empty bag, 100 coins and 0 battles. `gym_bonus` is normalised to a bool.
- **HTML:** the explicit save and load field lists gain `bag`, `coins` and `battles`. Battle state is still not saved.

## 6. Testing
- **Pure functions:**
  - `loot_roll`: the win drop rate is about 0.40 and a catch always drops, over 2000 seeds each; the area/type split is about 0.7; the weights fall within tolerance; trainers and hunts give None; regions without area loot use the type list; and it is deterministic.
  - Every type is in `LOOT_TYPE`, and every table id is in `GOODS`.
  - `coin_reward`, including the gym bonus paid once; `blackout_coins` at 0, 1, 3, 4, 7 and 99999.
  - `shop_buy` and `shop_sell`: conservation, refusals, the BAG_MAX and COINS_MAX edges, loot can't be bought, shop items can't be sold, a qty of 0 or 11 is refused, and the ball goes to `balls`.
  - `ball_safety_net` edges; `clean_bag` and `clean_coins` on junk, bools, negatives, floats and unknown ids.
- **Battle:**
  - Each item's effect and refusal, and whether it uses a turn (the queue order: message, HP step, foe move).
  - GREAT BALL's `catch_roll` bonus is 2.25 (spy on the argument).
  - SMOKE ends the battle as a run with no odds draw.
  - Win, catch (including a release because the team is full) and lose messages and amounts. A hunt pays neither, but losing one still costs ¼ of your coins.
  - The messages appear in the queue **before** the fade, and none is dropped.
  - `battles` goes up once per battle.
  - The random stream is unchanged by the reward and loot code.
- **Saves:** a round-trip with a bag and coins; an old save without the fields gives `{}` and 100; junk is cleaned.
- **Deliberately changed old tests (and nothing else):**
  - **The RENDER `drive` harness** (test.py:3588-3597) maps `("ball",)` to menu index 1 and presses confirm once. It must now open BAG and then pick BALL. That affects the catch, refusal and no-ball scenarios (test.py:3902, 3956, 3965-3966): the no-ball case becomes "Your bag is empty!" when nothing is owned. The JS `confirmBattle` is index-based too (html:5493), and its tests change the same way.
  - **`BATTLE_PHASES`** (test.py:4034) gains `bag`, and **`want_modes`** (test.py:4038) gains `bag` and `shop`.
  - **The panel labels** FIGHT/BALL/SWAP/RUN (test.py:3986) become FIGHT/BAG/SWAP/RUN.
  - **The H-door heal text,** where it is asserted.
  - **The juice on/off transcript comparison** (RENDER `scripted()`, and the JS equivalent if there is one). Both Games now start from the same `START_TILE`, with `steps = 0` and `battles = 0`, so their loot seeds match. The test still proves that juice never changes a loot line. Added on 2026-10-18 during Chunk 2, as a PM decision.

  The review confirmed that no test asserts that `heal_party` refills balls to 20, or that the `BALLS` label exists.
- **PARITY:**
  - `GOODS`, `LOOT_AREA`, `LOOT_TYPE` and the constants (constants are hand-ported, not emitted);
  - 500 `loot_roll` results over (region, types, caught, seed);
  - `coin_reward`, `blackout_coins` and `shop_buy`/`shop_sell` case lists;
  - the save-cleaning cases;
  - the shell constants for the BAG and shop layout.
- **RENDER (Python):** the BAG (empty, full and scrolled), the shop BUY and SELL, the battle BAG list and the party picker draw without error and keep text inside the panels.
- **Balance:** `balance_report.py` is byte-identical, because loot and coins never change battle maths.
- **Playtest:** MT-18 covers buying and selling in the shop, using a POTION and SMOKE in battle, GREAT BALL, a loot drop message, a save round-trip and the phone layouts. The console must be empty.

## Owners and order
1. **creature-designer:** sections 1, 2, 3 (logic), 5 and 6 (engine, battle, save and PARITY tests) in both builds, plus the emitter.
2. **game-feel-engineer:** sections 3 (battle BAG list UI, 3D heal glow, GREAT BALL colour) and 4 (BAG and shop screens), plus the RENDER and layout tests.
3. **PM:** CLAUDE.md, the wiki, MT-18 and the gates.

## Out of scope (Part B or never)
Crafting from loot, the AXE and other tools, obstacles and secret areas, held items, status-cure items, buying creatures, multiple shops with different stock, and selling shop items.
