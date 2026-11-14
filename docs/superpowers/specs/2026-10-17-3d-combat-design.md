# MONSTER TRAIL: interactive 3D battles and visible weapons

## User intent

The user explicitly chose **full 3D battle scenes**, requested richer fire/wind/other effects, and requires weapons or attack sources to be visibly used during every action. The game still opens through the existing dedicated game-window launcher. This supersedes the research brief's recommendation to retain 2D battle presentation.

Success means recognizable 3D creatures acting in a real 3D arena, with visible move-specific weapons/body parts/projectiles and player-controlled attack/defense timing. Recolored sprites or particles over the old arena do not satisfy this design.

## Presentation and scope

Use original stylized 3D creature models assembled from authored mesh parts and articulated groups. Preserve the existing roster's silhouette, species colors and distinguishing features. All 26 species need a model, including evolutions and GLOOMSTALK. The existing overworld remains its current exploration style; every browser RPG battle context uses the new 3D presentation: wild encounters, trainers, gym, fishing, cave and hunt.

Create meadow, shore, rocky-pass, ruins and cave arena variants selected from the encounter's actual location. Include floor detail, depth, controlled lighting and grounded shadows. A stable angled camera keeps both fighters, their attack paths, HP, choices and timing cues readable. Brief camera emphasis may accompany major hits, with a stable-camera reduced-motion option.

The underground chapter is already 3D. Add compatible polish to its pulse discharge, enemy hit reaction, station activation and stage-clear transition, while preserving its authored floors, horror pacing and mechanics.

## Visible weapons and move choreography

Every move in the existing MOVES table must have an explicit visual recipe with a named emitter or articulated attack part. A lookup test must reject missing recipes; do not silently substitute one generic colored burst for unimplemented moves.

The word weapon includes the creature's physical attack parts and conjured weapons. Show the actual selected implement: claws for SCRATCH/METAL CLAW, fangs for BITE/CRUNCH/INFERNO FANG, tail for AQUA TAIL/IRON TAIL/TAIL WHIP, wings for WING ATTACK/AERIAL ACE, a visible leaf blade for LEAF BLADE, a growing vine for VINE WHIP, and an extended stinger for POISON STING. TACKLE/BODY SLAM visibly move the attacker's body into the strike. Do not introduce an unrelated sword or firearm inventory.

Special moves originate from a recognizable mouth, horn, limb, wing or energy focus on the model. Fire produces visible flame projectiles/streams, wind produces wing-driven gust ribbons/vortices, water produces bubbles/waves, electric produces branching arcs, rock produces flying stones, psychic produces rings/beams, poison produces viscous droplets, and dark moves produce directed shadow effects. Status moves visibly use their named part or a clear aura/shield/sound-wave gesture on the correct target.

Each action has four visible phases: **preparation -> execution/travel -> contact/result -> recovery**. Physical weapons remain attached to the correct model joint; projected weapons/projectiles follow a visible path from their emitter. Defender recoil and HP loss occur at contact. A miss passes the target without a successful-hit flash. Immunity gives no damage impact. Buffs/debuffs and capped stats communicate the real result without implying damage.

The same requirement covers both player and enemy actions. Send-out, swap, faint, escape, capture throw/shakes/result, level-up and evolution receive deliberate 3D transitions appropriate to the event. Evolution changes to the new species model after its reveal. A ball visibly leaves the player side and reaches the target.

## Interactive combat

Implement the existing `docs/interactive-battle-spec.md` action-command design rather than treating it as already built:

- Physical attack: strike timing with one confirm press.
- Special attack: hold/release charge.
- Enemy damaging action: readable guard cue with a confirm press.
- Capture: shrinking catch ring with release timing.
- Status, swap and escape do not require a timing minigame.
- ON is default; ASSIST widens windows; AUTO resolves without timed input. Settings persist and old saves receive safe defaults. Avoid rapid repeated button presses.
- Good attack 1.1x; Perfect 1.2x; no input keeps the original 1.0x baseline. Perfect may add at most 0.05 crit probability. Guard reduces damage by 20%, perfect guard by 35%. Catch tiers use 1.15x / 1.5x / 1.85x modifiers. Judge boundaries and normal/hunt/ace windows must be fixed in the implementation plan and verified through deterministic tests and balance simulations.

Keyboard and touch use the existing shared confirm press/release path. Losing focus pauses active timing and clears held inputs; resuming must not award a free held-button result or resolve a command accidentally. Rendering frame rate must not change the judgment. AUTO and reduced motion are independent.

## Architecture and resources

Keep DATA/ENGINE/STATE import-safe and simulation-authoritative. Add optional timing/crit/catch parameters whose defaults preserve existing results and random-call counts. Implement commands and choreography through explicit queue steps so preparation precedes damage and defeat cannot be narrated before the attack lands. Effect randomness uses a separate cosmetic generator.

Add focused browser modules for creature rigs, arena creation, move recipes/effects, and the battle presenter. The presenter consumes a sanitized battle snapshot and explicit action events; it never independently rolls damage, hits, capture or progression. The existing battle UI overlays the arena with clear DOM/canvas layout boundaries, and receives the same authoritative state.

Use the already vendored three.js r128 runtime and APIs supported by that version. Do not copy current WebGPU/TSL examples into the pinned WebGL runtime. Models, weapons and effects are authored locally; no CDN or asset download is required for ordinary play. Use bounded particles/trails, shared geometry/materials and pooled effects. Avoid creating a renderer for every action.

Only the active scene renders. Hide/stop the battle presenter outside combat and during the underground chapter. Dispose scene-owned geometry, textures and materials on replacement, while retaining shared resources intentionally. Verify repeated battle/overworld/chapter transitions do not accumulate GPU contexts, listeners or audio.

If WebGL fails, clearly explain the failure and provide an explicitly labeled basic presentation mode so the saved campaign stays playable; never silently claim the basic mode is the requested 3D result. Normal supported execution must use real 3D models and arenas.

The browser game is the full 3D deliverable. Preserve Python gameplay/data parity and mirror action commands and readable elemental feedback in its pygame shell; replacing pygame with a separate 3D renderer is outside this browser-game presentation change.

## Accessibility and performance

Keep HP and interaction cues outside attack occlusion. Combine shape, motion, text and sound, not color alone. Reduced motion removes shake, sudden camera movement and full-screen flashes while preserving attack direction, weapon visibility and timing information. Provide effect quality choices that lower particles/shadows without removing required weapon/action readability.

Measure desktop and touch-emulated frame cost with representative actions, including all strong effects and repeated battles. Target smooth 60 Hz on the development machine in the standard quality mode; report measured frame percentiles and the test environment rather than asserting a universal device guarantee. Preload/compile needed assets before the first command and keep loading/failure UI responsive.

## Validation and completion criteria

- Every species has a recognizable, nonempty articulated model and stable attachment points for its recipes.
- Every move has an explicit recipe, visible attack source and bounded timeline. Verify both directions, status targeting, misses, immunity, crits and effectiveness.
- Deterministic tests cover command boundaries, bonuses/caps, default RNG equivalence, focus pause/resume, AUTO/ASSIST and old-save settings.
- Queue tests prove damage/contact/narration/faint/capture/evolution ordering.
- Render/browser evidence shows representative fire, wind, water, electric, grass, rock, poison, psychic, dark, claw/fang/tail/wing actions, a buff/debuff, capture and evolution. Test all move recipes structurally and smoke their rendering; screenshots alone cannot prove interactivity.
- Test every arena variant, normal and hunt views, reduced motion and quality settings, desktop and touch, and missing WebGL recovery.
- Run both RPG suites including Python rendering/parity, chapter and campaign suites, plus the new model/recipe/command/lifecycle tests. Re-run the combined campaign browser journey to verify 3D combat did not break descent, checkpoints or return.
- Capture performance results, representative screenshots and console output. Repeated battles and campaign transitions must leave only the intended renderer/resources active.
- Update launch/play instructions and reopen the game in its dedicated window after verification. Preserve existing saves and create source backups because this folder has no Git history.

## Research

- Riot's VFX education: satisfaction, thematic identity and gameplay clarity should reinforce one another. https://www.riotgames.com/en/artedu/visual-effects
- Game Accessibility Guidelines: timing alternatives, clear controls and adjustable presentation. https://gameaccessibilityguidelines.com/full-list/
- MDN: cache repeated work and measure rendering performance. https://developer.mozilla.org/en-US/docs/Web/API/Canvas_API/Tutorial/Optimizing_canvas
- three.js cleanup: explicitly release geometry/material/texture resources. Use only APIs verified against the installed r128 runtime. https://threejs.org/manual/pages/cleanup.html and https://archive.threejs.org/docs/api/en/renderers/WebGLRenderer.html
