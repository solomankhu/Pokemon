---
title: MONSTER TRAIL
sources: ["claude's monsters.py", "claude's monsters.html", ".claude/skills/add-monster/emit_tables.py", "docs/superpowers/specs", "docs/playtests/runs"]
synced: 2026-11-14
---
# MONSTER TRAIL (two builds, one design)

The canonical detail is in CLAUDE.md, under "Architecture: MONSTER TRAIL". This page is
the map.

## Where a change goes
| Change | Python (primary) | HTML | How parity is kept |
|---|---|---|---|
| species, move, zone, starter, map row, sandbox table | the table in `.py` | **generated** | `emit_tables.py --write`; the dry run must say "already match" |
| type chart, other tables | `.py` | hand-port | PARITY compares them |
| engine formula or mechanic | `.py` ENGINE | hand-port to JS | PARITY compares the computed output (hashes, traces) |
| juice or feel constants | the `.py` shell | the JS shell | PARITY shell-constants list |
| drawing code, touch UI | `.py` shell | the JS shell | **nothing automatic**: RENDER covers pygame, a browser playtest covers HTML |
| loot, coins, BAG and shops | `GOODS`, seeded loot/rewards, shop helpers, bag/shop shell | emitted tables + matching helpers/screens | PARITY, RENDER, MT-18 |
| battle conditions and scenes | condition/scene seeds, `damage_calc(condition)`, 2D weather | matching rules, 2D/3D scenes, condition chip | emitted tables, PARITY, combat scene tests, MT-17 |
| webcam battle controls | none (browser-only by design) | `combat/webcam.js` (v2 signal: `stepMotion` model, punch in `webcamZone`, blob+flow sweeps; menu gestures punch/guard/throw/shove/raise/lean via `classifyGesture`) + host (settings rows, calibration strength, Test gestures with RECORD, overlay) + HTML wiring (`getPhase`/`battleAction`) | `combat/webcam*.test.js` incl. `webcam-scenarios`; playtest MT-16. `combat/commands.py` deliberately lacks the `webcam*` settings keys |

## Feature specs (raw sources)
All three shipped and passed the [continuation playtest](../playtests/runs/2026-10-18-continuation.md).
When a spec and CLAUDE.md disagree, CLAUDE.md and the code win.
- [Loot, bag, coins, shop and battle items (Part A)](../superpowers/specs/2026-10-18-loot-shop-items-design.md).
  It reversed the old "no items, money or shops" rule. Status conditions stay out of scope,
  Part B shipped afterwards (see below).
- [Battle conditions and scenes](../superpowers/specs/2026-10-18-battle-conditions-design.md).
  Weather only boosts damage, or applies a fog accuracy penalty. Its seeds are separate, so
  the engine's random stream and the balance report are unchanged.
- [Webcam battle controls](../superpowers/specs/2026-10-18-webcam-battle-controls-design.md).
  The spec's Layer 1 `classifyMotion` was replaced by the v2 pipeline in its own addendum.
  `classifyMotion` is kept only for comparison.
- [More XP, generous drops, and a use for every drop](../superpowers/specs/2026-11-14-drops-xp-crafting-design.md)
  (2026-11-14; not part of the continuation playtest above). Phase A: 1.5x XP (`XP_NUM/XP_DEN` = 3/14)
  and every wild win drops 1-2 items plus a ~10% region rare (plan
  `docs/superpowers/plans/2026-11-14-drops-xp-phase-a.md`; playtest MT-18). Phases B-D are pending.

## Crafting, glades and the CRAFT grid (Part B)
- The **AXE** is a recipe (2 twig + 1 flint, `sets_tool`) that sets `flags["axe"]`; it cuts the
  `THICK TREE` (`T`, `tool="axe"`) that seals each of the two DEEPWOOD glades (`GLADES`,
  `GLADE_GATES`, the gated-reachability rule in CLAUDE.md). Recipes can need loot goods, not only
  ORE and STONE.
- MENU -> CRAFT is a **recipe-book grid** (`craft_cells`, `grid_move`, a detail pane). Cells are
  hidden (silhouette, `???`), locked, ready or owned; BUILD WALLS is the last cell.
- `Game.found` records every item id ever held; it is saved and cleaned on load (`clean_found`).
- The engine's no-op `fx_craft` / `juiceCraft` hook drives the shell's `CraftFx` / `CRFX`
  animation (glow only under reduced motion).
- **Icons:** `ICON_PALETTE`, `ICON_SHADOW` and `ICONS` are emitted tables. CRAFT cells, BAG and
  shop rows, and COINS lines draw them. A new item needs an `ICONS` entry. Playtest rows MT-07,
  MT-11 and MT-18.
- Specs and plans: `docs/superpowers/plans/2026-10-23-visual-crafting.md` and
  `docs/superpowers/plans/2026-10-23-axe-glades-loot-crafting.md`.

## The four layers
DATA → ENGINE (pure, with an injectable `rng`) → STATE (`Game`, `mode`) → SHELL. Layers 1-3
are import-safe, and that is what makes the headless verification suite possible.

## Owners
| Area | Owner agent |
|---|---|
| RPG data, engine, balance | creature-designer |
| sandbox rules (ROCKY PASS, PICK tiers, GEODE) | sandbox-designer |
| shell, juice, cave feel, touch | game-feel-engineer |
| mechanical ports and renames | game-chore |

## Traps (each has a checklist line)
- step-queue append instead of splice;
- `def_`;
- the 0x immunity "fixed" to 1;
- a grass glyph outside a zone;
- mutating `MAP`;
- a global rng in juice or the stalker;
- HP box y=248 vs the platform at y=240;
- assuming the mixer rate.

See [game-review-checklist](../../.claude/skills/game-review-checklist/SKILL.md).
