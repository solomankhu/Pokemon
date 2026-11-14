# Interactive combat and elemental effects: research and code assessment

Date: 2026-10-17. Request: more interactive fighting, stronger fire/wind/other action effects, and better visual feedback across scenes, informed by internet research.

This document records the initial findings and alternatives. The user subsequently chose full 3D battle scenes and required visibly used weapons/attack sources for every action. The selected direction is captured in `superpowers/specs/2026-10-17-3d-combat-design.md`; the earlier 2D recommendation below is retained as research history, not the current implementation target. These changes are not yet implemented.

## Existing implementation

- Browser RPG: Canvas 2D at 640 by 480, procedural creature sprites, synthesized audio, and an existing queued battle system. It launches in a Chrome/Edge app window through `Play Monster Trail.vbs`.
- Python RPG: pygame port with shared tables and mechanics parity; visual work should be reflected in both builds unless the user changes that scope.
- Battles already have a 64-particle pool, damage tint, HP tween, trauma shake limited to the arena, and short animation hit-stop. Most damage feedback changes only its color by move type. There is no distinct elemental projectile/choreography layer.
- `applyMove` applies damage and then invokes `juiceHit` in the hit queue step. Status actions mostly play a sound. Normal battle rendering uses the same outdoor gradient even when the encounter is in a different region, aside from the special hunt veil.
- `docs/interactive-battle-spec.md` documents previously approved strike, charge, guard, and catch commands, but the current source does not implement those commands or timing parameters. It is a design reference, not evidence of a completed feature.
- Wind attacks already exist as Flying moves such as GUST, WING ATTACK and AERIAL ACE. They should receive distinct air-motion effects without inventing a new elemental type.

## Primary-source findings

1. **Recognizable action and origin are more useful than indiscriminate spectacle.** Riot's own VFX education material emphasizes balancing satisfaction with gameplay clarity, thematic consistency, and clear character/source identity. Application: every move should have a recognizable shape, direction, and impact; HP and action prompts remain readable.
   https://www.riotgames.com/en/artedu/visual-effects

2. **Cache repeated art and avoid expensive work every frame.** MDN recommends pre-rendering repeating primitives, separating frequently changing content from static content where useful, batching canvas work, avoiding unnecessary state changes and expensive shadow blur, and using requestAnimationFrame. Application: cache effect stamps/backdrops, bound particles/trails, reuse arrays, and measure actual browser frame cost rather than promising performance from appearance alone.
   https://developer.mozilla.org/en-US/docs/Web/API/Canvas_API/Tutorial/Optimizing_canvas

3. **Precise timing needs alternatives.** Game Accessibility Guidelines recommend alternatives to mandatory precision, avoiding repeated rapid inputs, distinguishing information beyond color alone, and supporting adjustable effects/assistance. Application: one confirm input for commands, no mashing, wider ASSIST windows, AUTO resolution, visible labels/shapes as well as sound/color, and reduced-motion presentation.
   https://gameaccessibilityguidelines.com/full-list/

4. **Timing-free play is a documented game accessibility feature.** Steamworks describes supporting play without precisely timed button presses as an accessibility capability. Application: automatic action resolution remains playable and persistent in settings.
   https://partner.steamgames.com/doc/accessibility_features?l=english

These sources inform design principles; they do not establish exact timing windows, particle counts, or performance on this machine. Those values need tests and visual playtesting.

## Recommended direction

Preserve the current creatures and exploration style, adding layered animated effects and reactive combat to the existing battle flow. This keeps the unified campaign, offline operation, saves, touch input and game-window launcher while making attacks much more expressive.

Alternative A: visual effects only. Smallest scope; improves spectacle but does not address the request for more interactive fighting.

Alternative B (recommended): enhanced stylized effects plus the existing designed action commands. Improves both presentation and player agency using the present engine.

Alternative C: full 3D battles. Requires original creature models, rigs, animations, battle stages, camera rules, asset loading and fallback strategy. It is a larger art/engine project, and should be selected explicitly rather than silently replacing the game's established style.

## Proposed effect language

| Action family | Preparation and travel | Impact and recovery |
| --- | --- | --- |
| Fire | Warm charge glow; distinct ember, fireball, or fang arc | Flame bloom, rising embers, short smoke tail |
| Wind / Flying | Curved translucent ribbons, gust funnel, or wing slash | Air ring, directional streaks, drifting dust/leaves |
| Water | Bubbles, water pulse ring, or sweeping tail trail | Splash crown, droplets, receding ripples |
| Grass | Vine extension, spinning leaves, or charged seed orb | Leaf scatter and brief growth-shaped accents |
| Electric | Branching arcs and a bright contact core | Short spark forks and residual fine sparks |
| Rock / Ground | Lifted fragments, thrown stone or ground ripple where supported by existing moves | Shards and a settling dust ring |
| Psychic | Focus rings and a beam or expanding wave | Geometric pulse and a fading halo |
| Dark / Ghost | Narrow shadow trails or wisps for existing move types | Silhouette rim and dispersing smoke |
| Poison | Droplet/stinger travel and a viscous trail | Splash flecks and slowly fading haze |
| Bug / Steel | Bite/web or metallic slash for existing moves | Contact marks, short strands or sharp sparks |
| Normal / physical | Attacker lean, lunge, swipe/fang/body trajectory | Defender recoil, impact star and recovery pose |
| Buff / debuff | Targeted aura, shield/arrow/sound-wave motif | Clear stat-direction feedback, no fake damage impact |

Each existing move receives an explicit effect recipe or a tested category fallback. Animation strength tracks the actual move and result. A miss travels past its target; immunity never displays a successful hit; crit and effectiveness feedback reinforce the result rather than obscuring it.

## Proposed interaction and scenes

- Physical moves: timed strike. Special moves: hold/release charge. Enemy damage: guard cue. Ball: shrinking catch ring. Use the existing Z/Enter/touch-A path.
- Use the modest bonuses and ON/ASSIST/AUTO modes in the existing interactive-battle design. Preserve engine defaults and random-call order when timing bonuses are not supplied. Combat timing pauses with focus loss and must not be tied to render frame rate.
- Stage each action as preparation -> travel -> impact -> recovery. Damage and narration remain correctly ordered through the existing step queue.
- Add battle backgrounds derived from the encounter region: meadow, shore, rocky pass, cave and ruins. Keep the hunt reveal and HUD clear.
- Extend send-out, catch shakes/success, faint, level-up and evolution with their own short readable transitions. These are presentation changes, not new creatures or progression rules.
- Mirror shared RPG behavior in Python and browser builds. The underground chapter retains its own horror style; its pulse/hit/station/stage feedback can receive a separate compatible polish pass once the combat scope is confirmed.

## Verification requirements

Test deterministic command judgment boundaries, correct queue ordering, old-save settings defaults, no-input/automatic behavior, bounded bonuses, frame-rate independent updates, reduced-motion behavior, cosmetic RNG separation, effect lifetime/pool bounds, region background selection and every existing move's recipe coverage. Run both RPG suites, chapter/campaign regression suites, Python rendering and data parity. Inspect representative fire, wind, water, electric, physical, status, catch and evolution frames in the actual browser on desktop and touch; measure effect frame cost and verify HP/prompt readability.
