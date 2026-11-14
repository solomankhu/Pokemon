# Crafted weapons: design (2026-11-14)

Status: **design approved by the user (all recommended options), not started.** Lane: DEEP
(battle step queue, save format, shared tables, both builds). Inputs: consultation with
creature-designer, sandbox-designer, game-feel-engineer, narrative-designer, game-reviewer
and playtester (2026-11-14), and `docs/research/2026-11-14-lore-and-sound.md`.

## Decisions (user, 2026-11-14)
| Question | Decision |
|---|---|
| Who uses it | The player strikes in battle (not a held item on a monster). |
| Where | Wild battles and the GLOOMSTALK hunt. Refused in trainer and gym battles. |
| Limits | Two tiers, durability, re-craft to repair. |
| Menu | Through the battle BAG; no new top-level action. |
| Hunt | Allowed, but never KOs: a monster must land the final blow. |
| Tone | Striking GLOOMSTALK feels wrong (it is WREN's partner). |
| Story | The spear is WREN's design; tied to the WREN mystery. |
| Timing | Starts after visual crafting Chunks 5-6 (Chunk 4 landed 2026-11-14) and Part B Chunk 5 land, and after the Story phase 2 dialogue-parity test exists. |

## Rules
- **Name in code: `gear`** (`GEAR` table, `Game.gear` / `G.gear`). "weapon" already names the
  move-implement system (`MOVE_WEAPONS`, `draw_action_weapon`, `combat/recipes.js`).
- **Table:**

  | id | name | tier | recipe | damage | durability |
  |---|---|---|---|---|---|
  | `club` | WOOD CLUB | 1 | 3 TWIG | 15% of foe max HP | 6 |
  | `spear` | IRON SPEAR | 2 | 1 ORE + 1 FLINT + 2 STONE + 1 TWIG | 25% | 8 |

- **Damage** is pure integer maths, identical in both builds:
  `gear_hit(maxhp, hp, id) = min(hp - 1, max(1, (maxhp * pct + 99) // 100))`. Typeless; ignores
  the type chart, stages and weather; no engine rng call.
- **1 HP floor** in every battle, the hunt included. XP, loot and `hunt_over` are unchanged,
  because a monster always lands the KO.
- **Refusals** happen in the BAG confirm, before `take_turn`, so they use no turn, no
  durability and no rng: trainer/gym battle ("trail code" line; VOLT has his own line), and a
  foe already at 1 HP.
- **Turn order**: the swing uses the player's turn; the foe then acts through the normal path
  (its move pick uses the engine rng as today).
- **Durability** drops by 1 per swing that lands. At 0, `gear` becomes `None` and a break
  message plays.
- **Crafting** (`sets_gear` recipe key; `craft()` stores nothing for it, like `sets_tool`):
  - none held, or a lower tier held: make it, at full durability (replacing the lower one);
  - the same id, worn: refill to full (the repair path);
  - the same id at full, or a higher tier held: refused (`recipe_owned` reports owned).
- **Discovery**: `note_found` records a held gear id; `craft_cells` reveals a recipe once
  *any* of its GOODS needs is found (`all` -> `any`; no existing recipe changes). New 16x16
  `ICONS["club"]`, `ICONS["spear"]`.
- **Save**: top-level `gear`. `clean_gear(raw)` returns `{id, dur}` only for a known id with an
  int (not bool) `dur`, clamped to `1..GEAR[id].dur`; anything else is `None`. Old saves load
  `None`. The JS load assigns it unconditionally (so a stale in-memory gear never survives
  loading an older save). The browser save doubles as the campaign save.

## Presentation (game-feel-engineer)
- Queue, through the helpers only: `q_msg(swing)` -> `q_do(fx_gear swing)` ->
  `q_wait(GEAR_SWING_TIME = 0.28)` -> `q_do(apply: damage, durability, fx_hit(eff=1,
  crit=False, type None), thud)` -> `q_hp` -> [if broken: `q_do(fx break)` -> `q_msg(break)`]
  -> foe turn -> faint_check. Damage and durability apply inside the `q_do`, never at queue-build
  time (so 3D and HP bars never show the hit early). Waits are the same length under reduced
  motion.
- Do **not** use `q_action`/`move_timeline`/`recipeFor` (they throw for non-move ids). Python
  gets a `q_event(kind)` helper; JS uses `eventAction(b, 'gear', 'mine', {gearId})` with a
  presenter branch. `draw_action_weapon`/`action_pose` return early when `moveId not in MOVES`.
  3D `targetOf` must target the foe for `gear`.
- 2D: procedural club/spear glyph arcs from the bottom left to the foe, staying above y=240.
  Neutral spark colour `GEAR_SPARK`; break burst of `GEAR_SHARD = 6` pooled particles plus
  `TRAUMA_GEAR_BREAK = 0.15`.
- Audio: swing (falling noise band), thud (click + 90 Hz body, pitch jitter from FX_RNG), break
  (cracks + descending tone; the spear's break quotes a broken fragment of WREN's tune).
- BAG row: `WOOD CLUB 3/6` with pips; greyed with a text reason in trainer battles. No
  permanent battle HUD element.
- Reduced motion: static glyph, no shake, hit-stop or flash, fewer particles; sound and text
  kept. Touch: no change. Webcam: no new gesture (RAISE opens BAG).
- All new constants join the PARITY shell-constants list.

## Story (narrative-designer)
Text lives in a PARITY-compared table (`GEAR_TEXT`), never in function literals.
- Teaching: FORESTER KIT `after` "A TWIG and a STONE make a club..." (reword to TWIG only);
  QUARRY HAND page 1 "WREN had me forge her a spear before she went up..."; CAVER NOX defeat
  "...Last lamp I saw was WREN's. She had a spear, too." (these replace outline B14/B17,
  approved here).
- Refusal: "The trail code: no hands on a trainer's monster!"; VOLT: "Put that down. Up here we
  fight through our team."
- Swing/soften/break lines; GLOOMSTALK lines "It flinches from the SPEAR. It knows that shape."
  and "The spear snaps. It is still watching you."
- Blurbs: club "Softens a wild foe."; spear "Hits harder. Lasts longer."
- Payoff below: W-11 "The lamp is low. I left her my spear. I keep hearing her up in the cave."

## Sequence
0. Prerequisites: visual crafting Chunks 5-6, Part B Chunk 5, Story phase 2 dialogue-parity test.
1. Data, engine, save, craft rules (Python): sandbox-designer.
2. `emit_tables.py` (`sets_gear` -> `setsGear`, new `emit_gear` block with its anchor), JS port,
   PARITY: game-chore.
3. Battle use and refusals, both builds: creature-designer.
4. Presentation and audio, both builds and 3D: game-feel-engineer.
5. Text: narrative-designer.
6. Gates: `verify.js`, game-reviewer per step, playtester `full` with MT-20, MT-21, CP-06
   (MT-19 stays reserved for Part B Chunk 5). wiki-sync and CLAUDE.md count updates.

## Tests (from the reviewer's audit)
- PARITY: `GEAR`, `sets_gear` in the recipe tuple (`claude's monsters.test.py` recipe parity),
  `gear_hit` over max HP 1..200 x both tiers, refusal cases, `clean_gear` cases.
- Engine: never KOs; first swing >= 1; zero engine rng in the swing; refusal leaves
  `random.getstate()` unchanged and the turn unspent; durability and break; craft matrix
  (none / club@6 / club@2 / spear x each recipe) with conservation; extend the recipe-out
  assertions with an explicit `sets_gear` clause rather than loosening them.
- AXE stays craftable after weapons (TWIG is shared, but renewable).
- Queue transcript order in both builds; real-input BAG cursor -> confirm integration test.
- Hunt: swing then loss calls `hunt_over` exactly once.
- Save fuzz in both builds; old save -> `None`; stale JS gear reset on load; `campaign.test.js`
  round trip keeps gear.
- Catch: pin `catch_roll` odds after N swings; run `balance_report.py` before and after.
- RENDER: BAG gear row, a mid-swing frame, craft grid with gear cells, juice invariants. JS
  SHELL JUICE: same order, `Math.random` never called. `combat/presenter.test.js` gear case.

## Debug seams the playtest needs
`__GAME__` gear grant (`giveGear(id, dur)`), a trainer-battle starter, `GEAR` export, a turn
counter on the battle, and confirming TWIG is read from `G.bag`.
