---
name: game-review-checklist
description: The repo-specific review checklist for MONSTER TRAIL (both builds), THE STATIC BELOW and campaign.js - parity, def_, import-safety, step-queue splicing, determinism and rng separation, MAP immutability and reachability, 640x480 layout, no assets, per-tick rates, ASCII, save compatibility. Used by game-reviewer on every review and by workers as a self-check before returning.
---

# Game review checklist

Run only the sections whose trigger matches what changed. Each line is a yes/no question;
a "no" is an issue, and its severity is given in brackets.
Cite `path:line`. Lines tagged `(lesson: <key>)` come from `docs/FAILURE_PLAYBOOK.md`.

> Precedence: a **gate** (a test or `verify.js`) beats a **rule** (CLAUDE.md) beats a
> checklist line. If a line here contradicts a passing test, the line is wrong, so report it
> as workflow feedback.

## ALWAYS
- [ ] `verify.js` was green **after** the last edit, and the brief's checks were the right ones [CRITICAL]
- [ ] No test was weakened, skipped, loosened or deleted to go green [CRITICAL]
- [ ] Every acceptance criterion maps to a check, a number or a screenshot [MAJOR]
- [ ] No asset files were added (images, audio, fonts); everything is procedural or synthesized [MAJOR]
- [ ] New tunables are named constants, not magic numbers in logic [MINOR]

## MONSTER TRAIL: any change to `claude's monsters.py` or `.html`
- [ ] **Both builds.** A mechanic changed in one build is hand-ported to the other, and a table change went through `emit_tables.py --write` (the dry run says "already match") [MAJOR]
- [ ] **Import-safety.** Nothing in DATA, ENGINE or STATE touches pygame display, `document`, `canvas` or `window` at import; `main()` stays behind `__name__ == "__main__"` [CRITICAL]
- [ ] **`def_`.** Python stat-stage keys, `Mon` attributes and move `eff` tuples say `def_`; JS says `def` [CRITICAL]
- [ ] **Naming parity.** Python snake_case corresponds to JS camelCase (`hunt_beaten`/`huntBeaten`), and new shell constants are added to the PARITY shell-constants list [MAJOR]
- [ ] **Out-of-scope creep.** No status conditions, bag, money or shops slipped in [MAJOR]

## BATTLE: queue, damage, hunt
- [ ] New queueing goes through `q_msg`/`q_do`/`q_wait`/`q_hp`, and a `do` step that queues more steps relies on `pump_queue`'s **splice at the current position**, never an append (lesson: queue-append-not-splice) [CRITICAL]
- [ ] The damage formula is untouched, or the change is intended and tested. A 0x multiplier still means 0 damage and "It had no effect" (no floor of 1) [CRITICAL]
- [ ] Crits still ignore the attacker's negative and the defender's positive stages [MAJOR]
- [ ] Hunt: BALL is refused without using a turn, RUN uses `HUNT["run_odds"]`, and `hunt_over` is called exactly once [MAJOR]

## DETERMINISM: rng
- [ ] Engine randomness goes through the injectable `rng`; there are no global `random` reads in layers 1-3 [CRITICAL]
- [ ] Cosmetic randomness is `FX_RNG`/`fxRand` only; `Math.random` and the engine stream are never used by juice [CRITICAL]
- [ ] The stalker uses its own `mulberry32`, and the 300-tick traces still match across builds [CRITICAL]

## DATA and MAP
- [ ] Every `MAP` row is exactly `MAP_W` chars; there are no new glyphs without a `draw` branch in both builds [CRITICAL]
- [ ] New grass is inside an encounter zone, and `try_encounter` rolls on every `GRASS` glyph (lesson: encounter-only-on-comma) [MAJOR]
- [ ] New NPCs, signs, items and doors are reachable with ledge-aware BFS, and the trunk road stays 2 columns [CRITICAL]
- [ ] `ITEMS`/`SIGNS`/`WATER_ZONES` agree with the map in both directions [MAJOR]
- [ ] A new decorative tile uses `ground_tone`, and a collected ball draws `picked_ground` (lesson: picked-ball-lawn) [MINOR]

## SANDBOX
- [ ] `MAP` is never mutated; all changes go through `Game.edits`, and every reader uses `tile_at(x, y, edits)` [CRITICAL]
- [ ] `placement_ok` still refuses tiles that would cut off reachability; the gated-reachability equality `seen_mined - seen == GEODE open + seams` still holds [CRITICAL]
- [ ] `craft` conserves items exactly; caps (`cap`) and `sets_tier` are respected [MAJOR]
- [ ] `load_edits` re-validates new edit kinds, and old saves (`pick: True`) still load [CRITICAL]

## SHELL, FEEL and LAYOUT (both games)
- [ ] The 640x480 battle layout is intact: the player HP box at y=248 clears the foe platform ending at y=240; shake ≤ `SHAKE_MAX` keeps clear of the HP boxes [MAJOR]
- [ ] Hit-stop freezes animation, never the queue or input buffering [CRITICAL]
- [ ] REDUCED_MOTION (and the Static Below's Motion option) removes shake, flash, lunge and bob, but keeps the meters [MAJOR]
- [ ] Particle and debris pools are bounded; there's no per-frame allocation in the hot path [MINOR]
- [ ] Audio renders at the mixer's *actual* rate and channel count (lesson: mixer-rate-assumed) [MAJOR]
- [ ] Touch: all input goes through `press`/`release`, and the controls don't overlap the canvas at phone portrait or landscape [MAJOR]
- [ ] A visual change has a playtester or frame-dump screenshot [MAJOR]

## THE STATIC BELOW: `gemini's code.html`
- [ ] The SIM stays pure (no THREE or DOM); new rates are **per tick**; cosmetic timing is in seconds in the shell [CRITICAL]
- [ ] The file is still pure ASCII; the name regex is built from code points (`NAME_STRIP`) [MAJOR]
- [ ] New per-stage materials and lights are disposed in `clearEntities`; shared geometry is in `makeAssets` [MAJOR]
- [ ] The difficulty readout margins still shrink each stage and stay ≥ 1.4x [MAJOR]
- [ ] Handoff text renders with `textContent` only (a test bans `innerHTML`) [CRITICAL]

## CAMPAIGN: `campaign.js`
- [ ] Messages are source-, origin- and session-validated; only the active frame updates the campaign [CRITICAL]
- [ ] The save format is backwards compatible (old saves infer unlock from the gym flag) [CRITICAL]
- [ ] RPG input, audio, update and render are suspended while below, and resume on return [MAJOR]
