# MONSTER TRAIL: 3D combat playtest and launch

Spec: `docs/superpowers/specs/2026-10-17-3d-combat-design.md`. Plan: `docs/superpowers/plans/2026-10-17-3d-combat.md`.
Ledger, backups and evidence: `.superpowers/sdd/2026-10-17-3d-combat/`.

## Launch

- Double-click `Play Monster Trail.vbs` to open the combined campaign in a game window, or open `claude's monsters.html` directly in a browser.
- Everything is local: three.js r128 comes from `vendor/`, and the combat modules from `combat/`. Normal play needs no network.
- In battle, **SETTINGS** (top right) sets Action commands (ON/ASSIST/AUTO), Effects quality (HIGH/STANDARD/LOW), Reduced motion and Basic presentation (2D). The settings are saved with the browser save. If storage is blocked, they apply in memory for the session.
- If WebGL fails or the context is lost, a dialog offers **RETRY 3D** or **BASIC PRESENTATION**. The battle resumes without repeating damage, rewards or captures.

## Pickajoo and Thunder

Choose **PICKAJOO** as the fourth starter, or talk to Professor Cedar in an existing game to receive one when the team has a free slot. The gift is granted once; full parties are preserved. Pickajoo has yellow fur, black ear tips, red cheeks and an articulated lightning-shaped tail in 3D, plus matching 2D artwork in both builds. It knows **THUNDER** immediately, using the visible branching lightning effects (Electric, power90, accuracy100).

For save compatibility, Pickajoo uses the existing `zapmote` species ID and Thunder uses `thunderbolt`. Existing electric partners gain Thunder on load, keep their HP/XP and custom nicknames, and the former default name updates to PICKAJOO. The other three starters remain available. There are still26 species and47 move IDs; this is a makeover of the existing electric partner. `combat/pickajoo.test.js` covers starter availability, immediate Thunder, gift/full-party behavior, old saves and the distinctive model parts. Python focused coverage now has19 tests; browser coverage now has19 scenarios with `pickajoo-starter.png` and `pickajoo-thunder-*.png` evidence.

## Commands (keyboard: Z/Enter, touch: A)

Battles are **1 vs 1**: one active creature per side. Reserve creatures stay out of the arena. Initial creatures and replacements remain hidden until their own send-out begins; the previous model is removed before a replacement is attached. Knockouts can lead to the trainer's next creature or a player replacement choice. The same visibility rules apply in Basic presentation. A repeated20-replacement presenter test and a real trainer knockout/send-out browser scenario verify the rule (20 browser scenarios total; `one-v-one-replacement-*.png`).

Browser battles now use a slower guided flow. Choose **ATTACK** or **DEFEND**; read the explanation, then confirm with Z/Enter/A or go back with X/B. Attack previews show the move's type, power and accuracy (or its status purpose). Defend spends the turn bracing and reduces the next damaging hit by at least 20%; a perfect guard can reduce it further. Ball, Swap and Run remain available.

Every strike, charge, guard and throw first waits on a **when ready** guide with no timer running. Press and release confirm to start, then use a fresh input for the timing challenge. The browser meter runs at 55% of its former speed, and move animations last 1.6 times as long. Timing thresholds remain the same on the slower meter. AUTO also waits for readiness before handling timing. These browser controls do not change the standalone Python controls.

| Command | When | Input | Result tiers |
|---|---|---|---|
| Strike | your physical move | press on the cue | Good 1.1x, Perfect 1.2x plus 0.05 crit |
| Charge | your special move | hold, release on the cue | Good 1.1x, Perfect 1.2x plus 0.05 crit |
| Guard | foe's damaging move | press on the cue | Guard 0.8x, Perfect 0.65x damage taken |
| Catch | ball throw | hold, release in the ring | Nice 1.15x, Great 1.5x, Excellent 1.85x |

With no input, the baseline is 1.0x. ASSIST doubles each window, hunt battles narrow them to 0.8x and ace trainers to 0.9x. AUTO resolves at the target with baseline multipliers and no timing bonus. If the window loses focus, the command pauses and a held command needs a fresh press.

Defense has a visible shield: blue during the guard cue, retained through a successful block, gold on a perfect block. Harden and Iron Guard raise it as well. The shield follows the defending creature, works in Basic presentation, stays still with reduced motion, and releases its graphics resources when the presenter is disposed. `presenter.test.js` covers both motion settings, successful/failed blocks and exit cleanup; the browser harness includes a shield contact screenshot (`defense-perfect-shield.png`) and now runs 16 scenarios.

Attack/defeat follow-up: contact adds orange expanding fire explosions, branching electric arcs, layered water/wind rings and physical impact rays. These use the existing bounded effect pool, skip misses/immunity and respect reduced motion. Fainting emits one short purple dissolve burst; a full-team loss shows a dark defeat overlay during the existing return transition. New effect tests verify elemental geometry in both motion modes, one-shot faint emission and particle expiry. Browser coverage now totals 17 scenarios with `impact-*.png`, `defeated-creature.png` and `team-defeated.png` evidence. Battle outcomes, damage, saves and healing rules are unchanged.

## Automated evidence (2026-10-17)

| Command | Result |
|---|---|
| `node .claude/scripts/verify.js` | py 4874, js 3331, gemini 554, campaign 8, combat, Python commands 19, hooks 70, table parity |
| `node combat/verify.cjs` | commands 123, engine regression 3900 pre-change output/RNG comparisons, integration 122, models 52959, arenas 896, host 18, effects (47 moves x 6 quality/motion profiles) plus 3444 impact checks, presenter lifecycle plus 207 impact checks, recipes (47 moves) |
| `node combat/browser-playtest.cjs` | 20 real-Chromium scenarios pass, including 1 vs 1 replacement visibility, Pickajoo/Thunder, guided Attack/Defend choices, readiness pause, shield/explosion/defeat frames, all moves in both directions, 26 species/contact sheet, five arenas, touch guard, keyboard strike/charge/catch, focus pause, settings rebuilds, context-loss/basic recovery with exactly one contact, hunt, lifecycle events, 20 battle entries, three battle/chapter/return cycles, performance |
| campaign browser scripts (`.superpowers/sdd/2026-10-17-unified-monster-trail/browser/`) | smoke, campaign-flow (12), chapter-experience (8), audio-lifecycle: all pass |

Performance with active flameburst (HeadlessChrome 149, Windows, 1280x900, STANDARD): frame interval median 8.3 ms, p95 9.0 ms; explicit render CPU time median 1.3 ms, p95 1.5 ms; 0 frames above 33.4 ms. The frame interval includes the application's update/render loop; the separate CPU sample measures an additional render call. Headless timing is not GPU frame time on a real display.

Screenshots: `.superpowers/sdd/2026-10-17-3d-combat/browser/` (`species-*.png` contact frames, `action-*.png` weapon frames, `arena-*.png`, `battle-low-reduced-motion.png`, `underground-*.png`).

## Balance readout

From `node combat/balance-report.cjs` (`balance-results.json`). These are seeded mirrored level-20 duels, so they measure the command modifiers rather than full encounters.

| Mode | Win rate (n=1000) |
|---|---|
| No input | 49.2% |
| AUTO | 49.2% |
| Always perfect | 97.0% |

Catch rate over 5000 seeded throws is 17.2% at baseline, 19.9% for Nice, 26.2% for Great and 32.4% for Excellent.

Independent review findings repaired: inland fishing routes to shore; 3D hunts retain darkness/reveal flash; lifecycle snapshots do not replay completed actions; evolving rigs survive stale species snapshots; Python ace context and AUTO baseline match JavaScript. The player HP panel sits below the 3D fight and settings has a 44px touch target. GLOOMSTALK has its own menacing articulated model. Existing narrative outline work in `docs/wiki/story.md` remains a separate proposal.

## Re-running

```bash
node .claude/scripts/verify.js
node combat/verify.cjs
node combat/browser-playtest.cjs      # PLAYWRIGHT_MODULE / BROWSER_EXECUTABLE override discovery
```
