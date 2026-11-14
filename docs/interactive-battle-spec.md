# Interactive battles (action commands) — approved spec (2026-10-17)

User-approved choices: **all commands**, **modest** bonuses, default setting **ON**. Both MONSTER TRAIL builds (pygame + HTML), with parity.

## Sources (research summary)
- **Super Mario RPG / Paper Mario action commands.** Timed presses boost attacks or block hits. Variants include press, hold-release, mash and aim. https://www.mariowiki.com/Timed_Hit and https://www.dampfkraft.com/games/paper-mario-combat.html
- **Clair Obscur: Expedition 33 "reactive turn-based".** On the enemy's turn you get a wide-window dodge or a tight-window parry. https://blog.playstation.com/?p=394441
- **Undertale FIGHT slider.** Damage depends on where you stop a sweeping bar. https://game-wisdom.com/analysis/undertale
- **Pokémon GO throw ring.** Nice / Great / Excellent multiply catch odds by 1.15 / 1.5 / 1.85. https://www.esports.net/wiki/guides/pokemon-go-excellent-throw-curveball-guide/
- **QTE accessibility.** Timing must be adjustable or skippable. https://caniplaythat.com/2023/04/11/hi-fi-rush-update-addresses-qte-accessibility/ and https://gameaccessibilityguidelines.com/?p=3196

## Commands (A / confirm only, so touch works)
| Scenario | Command | Tiers → effect (modest; final values measured by creature-designer) |
|---|---|---|
| Physical move | **Strike bar**: a marker sweeps once and you press A in the zone | Miss / OK ×1.0, Good ×1.1, Perfect ×1.2, plus a small extra crit chance on Perfect |
| Special move | **Charge**: hold A, release while the meter is in the band | Same tiers as the strike bar |
| Foe's damaging move | **Guard**: a "!" cue, press A within the window | Guard −20% damage, Perfect guard −35% ("BLOCKED!"). There is no parry counter |
| BALL | **Catch ring**: a shrinking ring, release while it is small | Nice ×1.15, Great ×1.5, Excellent ×1.85 to `ball_bonus` (Pokémon GO values) |
| Status move, RUN, SWAP | none | — |
| GLOOMSTALK hunt | Same commands, with tighter windows and a later "!" cue | — |
| Gym leader's ace | Slightly tighter windows | — |

A command that isn't pressed in time counts as OK (×1.0). Never punish below today's baseline.

## Engine (pure, deterministic)
- `damage_calc(..., timing=1.0)` multiplies the final damage by `timing`. The default leaves every result identical to today, so all existing tests and the 200-battle sim are unchanged.
- The crit bonus on a Perfect is a parameter, e.g. `crit_bonus=0.0`. It must not change random-call counts in the default path.
- `catch_roll(mon, ball_bonus, rng, throw=1.0)` multiplies `ball_bonus`.
- Guard is applied as a `timing` < 1 on the foe's hit.
- Tier tables live in DATA: `ACTION_TIERS`, `GUARD_TIERS`, `THROW_TIERS`, plus window sizes per context (normal / hunt / ace). They are PARITY-compared.
- Window evaluation is a pure function, `judge(t_press, window) -> tier`. Tests drive it with exact times, with no real-time dependency.

## Setting
`ACTION` = `ON` (default) / `ASSIST` (2× windows) / `AUTO` (always Good / guard / Great, no input). It is reachable from the menu, saved (localStorage / save file), and old saves default to ON. It is independent of REDUCED_MOTION. Under REDUCED_MOTION the cues stay but bounce and flash are removed.

## Shell
- Each command shows its UI over the battle (bar, meter, "!" cue, ring) and gives clear tier feedback text: "NICE!", "GOOD!", "PERFECT!", "BLOCKED!".
- It uses the existing juice (hit-stop and particles scale with the tier) and synthesized sounds.
- Timing is measured in battle time, with the fixed tick in JS and `dt` in pygame, and never blocks the step queue. Commands are queue steps (e.g. a `cmd` step type) that resolve to a tier, then splice the hit.
- On touch, the DOM A button fires the same `press` / `release`.

## Tests
- `judge()` boundary cases for every tier and context, plus ASSIST doubling.
- AUTO gives fixed tiers. Defaults reproduce today's numbers exactly (seeded battles and the random stream unchanged).
- Bonus caps hold. Measured win rates stay in the target band with optimal play vs no input. The catch ring multiplies odds correctly.
- The queue order is intact: the command resolves before damage narration.
- Python RENDER draws every command UI in both motion modes. JS SHELL checks use `__GAME__`.
- PARITY covers the tier tables and window sizes.
- Browser playtest: each command on desktop and touch, and the setting toggle.

## Build order (sequential)
1. **creature-designer:** engine parameters, tier tables, measured bonus sizes and windows, tests, both builds.
2. **game-feel-engineer:** command UIs, input, setting, feedback, sounds, tests, browser playtest, both builds.
