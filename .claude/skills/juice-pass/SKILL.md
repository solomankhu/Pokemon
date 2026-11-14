---
name: juice-pass
description: Add game feel (screen shake, hit-stop, flashes, particles, tweens, squash-and-stretch, synth SFX) to one of the games without breaking determinism, the battle step queue or the test suites. Use when something "feels flat", for impact/feedback polish, or when adding any visual or audio feedback effect.
---

# Juice pass

Juice is seasoning, not the meal. Every effect must echo a gameplay event, be time-boxed, be tunable through a named constant, and be removable without changing the outcome of the game.

## 1. Pick the moments
List the 3-5 events the player cares about most and rank them by importance (in MONSTER TRAIL: a super-effective hit, a crit, a faint, a catch shake or catch, a level-up or evolution). Spend the most juice on the rarest and most important event.

## 2. Effect recipes
| Effect | Recipe | Defaults |
|---|---|---|
| Trauma shake | `trauma = min(1, trauma + k)` on impact; offset is `trauma² * MAX * rand(-1..1)`; decay `trauma -= DECAY * dt` | MAX 6-8 px, DECAY 1.5-2/s |
| Hit-stop | `freeze = HITSTOP` on hit; while `freeze > 0` skip *animation* time only, so input and the queue clock keep running | 0.05-0.1 s, scaled by effectiveness |
| Damage flash | draw the sprite tinted white or red for `FLASH` seconds, blinking at about 15 Hz | 0.15-0.25 s |
| HP drain tween | ease the displayed HP toward the real HP with ease-out | already exists as `disp_mine`/`disp_foe` |
| Lunge / squash | attacker offset toward the target with `sin(πt)` over 0.2 s; scale y 0.9 / x 1.1 on landing | |
| Particles | a pooled fixed-size array, colour from `TYPE_COLOR[move.type]`, with velocity, gravity and life fade | 12-24 per hit, max 128 live |
| SFX layering | a short noise click plus a pitched tone, ±5% random pitch per play | |

## 3. Where it goes (MONSTER TRAIL)
- **Shell only.** A juice system already exists: the hit step calls `game.fx_hit(side, eff, crit, move_type)` (Python, a no-op hook the `Shell` replaces with its `Juice` instance) or `juiceHit(b, side, eff, crit, type)` (JS) from inside its `q_do`. Extend those (Python `Juice.hit`/`update`/`offset`, JS `juiceHit`/`updateJuice`/`drawParticles`) instead of adding new state to `Battle`. Trigger new effects the same way, from inside a `q_do` step at the moment of impact. Reuse the shared constants (`SHAKE_MAX`, `TRAUMA_*`, `HITSTOP_*`, `PARTICLE_*`, the same values in both builds) and the cosmetic generators `FX_RNG` / `fxRand`, never the engine's random stream.
- **Never** put waits, sleeps or randomness that affects outcomes into `damage_calc`, `catch_roll` or any other layer 1-2 function. If the player should *see* a beat, queue `q_wait(seconds)` / `qWait(b, seconds)` (both take **seconds**) through the helpers, so the splice-in-place order is kept.
- Shake the arena, not the HUD. Respect the 640×480 layout (player HP box y=248, foe platform ends y=240).
- Port the change to **both** builds. No test enforces shell parity.
- Sound: extend `Sfx` (PCM note lists) in Python and the WebAudio synth in JS. No asset files.

## 4. Other games
- **gemini's code.html**: `update()` runs at a fixed 60 ticks/s, so per-tick decay constants are safe. The existing jumpscare already shakes the mesh, so don't stack camera shake during `jumpscareActive`.

## 5. Verify
Run both MONSTER TRAIL suites. The Python RENDER section checks juice invariants every frame. Add checks there for any new effect, and look at the dumped frames (`MT_FRAME_DIR=<folder>`). Then use `browser-playtest` to *look*: take a screenshot mid-effect and confirm the console is clean. Report the constants so the user can tune them.
