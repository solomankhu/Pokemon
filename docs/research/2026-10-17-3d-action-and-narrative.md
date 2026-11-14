# Research: 3D battle action and narrative (2026-10-17)

A web-research brief requested by the user ("explore best practice from the internet, then
implement good 3D action and good narrative"). Items tagged **[rec]** are the
researcher's recommendations, not published figures. This file is the canonical home of
the brief: the briefs for game-feel-engineer and narrative-designer link here.

## A. 3D battle action and feel

### Camera
- Turn-based play leaves the camera free, so spend it on presentation: per-ability shots
  and dynamic cuts, as in FFX and FFVII.
  ([Kotaku](https://kotaku.com/a-closer-look-at-final-fantasy-viis-battle-cinematics-1821366955))
- **Shot set [rec]:**
  - *establishing*: a 3/4 over-shoulder shot with the foe in the top-right third, FOV about 50;
  - *attacker*: a punch-in;
  - *impact*: the target at center.
  - Cut for reads; dolly with an ease-out over 0.3-0.5 s for wind-ups.
  - Add an **FOV kick of -4 to -6 on impact**, recovering in about 150 ms.
- Physical moves must **lunge to contact**. Legends: Arceus was praised for this, and S/V
  was criticised for "invisible force" hits.
  ([Sportskeeda](https://www.sportskeeda.com/pokemon/news-game-freak-small-indie-company-fans-criticize-pokemon-scarlet-violet-s-battle-animations))
- **Persona-style splash card** for a crit or a super-effective hit: a one-frame hard
  swap to a flat two-colour splash.
  ([Mechanics of Magic](https://mechanicsofmagic.com/2022/04/23/visual-design-of-games-persona-5/))

### Impact
- **Hit-stop:** 50-100 ms on heavy hits, scaled by damage and capped. Freeze only the
  attacker and the target, not the UI or audio.
  ([Wayline](https://www.wayline.io/learn/game-feel/1),
  [Bugnet](https://bugnet.io/blog/how-to-fix-hitstop-or-freeze-frame-feeling-off))
- **Sakurai's rules:**
  - both parties freeze for the same time, longer for more damage, with a hard cap;
  - both vibrate during the freeze, side to side on the ground and up and down in the air;
  - electric hits get extra stop.

  ([Source Gaming](https://sourcegaming.info/2015/11/11/thoughts-on-hitstop-sakurais-famitsu-column-vol-490-1/))
- **Trauma shake:**
  - add trauma in 0..1 and decay it linearly;
  - `shake = trauma²` (or ³), driven by smooth noise rather than random jitter;
  - apply it to camera rotation plus a small offset.

  ([Game Developer](https://www.gamedeveloper.com/programming/video-sprucing-up-cameras-with-math))
- **Kick and recoil:** knock the body back a few units, then slide it back.
  ([infovore](https://infovore.org/?p=5275))
- **The 12 principles on procedural rigs:**
  - anticipation: a crouch or squash of about 150 ms before the lunge;
  - squash and stretch that preserves volume (`scale.y = 1/scale.x`);
  - follow-through: ears and tails lag on a spring;
  - slow-in and slow-out.

  ([Game Developer](https://gamedeveloper.com/production/the-12-principles-of-animation-in-video-games))

### Timed hits (action commands)
- **Mario & Luigi tiers:** EXCELLENT 3 frames, GREAT 5, GOOD 7, otherwise OK. At 60 fps
  that is about 50/83/117 ms.
  ([Mario Wiki](https://www.mariowiki.com/Action_Command))
- **Super Mario RPG:** close timing gives +50%, perfect gives ×2, and a perfect block
  shows a visible barrier. Telegraph the timing through the animation itself.
- **Sea of Stars:** windows are short, and accessibility lives in options:
  - auto-time at half the bonus;
  - a success flare;
  - a high-risk mode.

  This maps onto our ASSIST and AUTO modes plus a success flare.
  ([Steam](https://steamcommunity.com/app/1244090/discussions/0/3805028677406464110),
  [PCGamesN](https://www.pcgamesn.com/sea-of-stars/relics))

### VFX readability (three.js)
- Use `AdditiveBlending`, `transparent: true`, `depthWrite: false` and keep
  `depthTest: true`. Transparent objects sort by bounding-box centre, so **set
  `renderOrder` by hand** for rings and decals.
  ([three.js forum](https://discourse.threejs.org/t/threejs-and-the-transparent-problem/11553))
- **Shape grammar [rec]:**
  - FIRE: rising cones;
  - WATER: arcs and droplets;
  - ELECTRIC: jagged line strips;
  - GRASS: spinning leaves;
  - every type: a ground shockwave ring (scale 0→3, fading over 300 ms) and a decal
    under the target.

### Presentation
- **A Persona "One More" beat:** a weakness hit gets a big beat. It turns turn-based
  slowness into rhythm.
  ([Game Developer](https://www.gamedeveloper.com/design/learn-how-to-make-turn-based-battles-from-persona-5))
- **Stingers on the audio clock:** schedule them on `AudioContext.currentTime` with about
  a 100 ms look-ahead, not `setTimeout`.
  ([web.dev](https://web.dev/articles/audio-scheduling))

## B. Narrative
- **The Pokémon formula** (mentor, bratty rival, chosen starter) works, but copied
  wholesale it reads as generic. Temtem was criticised for exactly that.
  ([Pocket Tactics](https://www.pockettactics.com/temtem/review))
  Coromon starts casual and escalates the stakes.
  ([Gamepressure](https://www.gamepressure.com/editorials/the-best-creature-collecting-games-that-arent-pokemon-or-palworld/z16d7))
- **Black/White:** a sympathetic antagonist, and a true villain foreshadowed through his
  speeches. ([RPGamer](https://rpgamer.com/spoiler-warning/pokemon-black-and-white/))
- **Lavender Town** is the blueprint for horror inside a cozy creature game:
  - grief left implied;
  - horror as a mechanic ("too scared to move" until you have the scope).

  ([Bulbapedia](https://bulbapedia.bulbagarden.net/wiki/Marowak_(ghost)))
- **Undertale:** environmental jokes that double as characterisation, and NPCs that
  remember you.
  ([Mechanics of Magic](https://mechanicsofmagic.com/2025/05/16/critical-play-worldbuilding-27/))
- **Inscryption** builds the shift in stages:
  - contradictory information from characters;
  - audiovisual glitches;
  - static-made items entering the loot pool;
  - a small space that subtly changes.

  The genre break reads as progression, not shock.
  ([TechRaptor](https://techraptor.net/gaming/reviews/inscryption-review))
- **Pony Island:** fake crashes, and a low hum with CRT shake.
  ([TechRaptor](https://techraptor.net/content/literally-developed-by-satan-a-pony-island-interview))
  **OMORI:** recurring mirror hallucinations that point at the hidden truth.
  ([TV Tropes](https://tvtropes.org/pmwiki/pmwiki.php/Foreshadowing/Omori))
- **Tiny-dialogue techniques [rec]:**
  - 1-2 line barks that change after each story flag;
  - signs that get corrupted after the gym;
  - one rival with 4 fights (cocky → rattled → shaken by the cave → ally on the return);
  - a gym leader who knows about the Below and gates it on purpose;
  - a post-game NPC who names the static.

### Three-act template
1. **Act 1, Town → routes** (hook within 5 minutes):
   - the mentor gives a starter;
   - someone went "down" and never came back;
   - the rival takes the stronger starter;
   - a radio sign hisses.
2. **Act 2, Routes → DARK CAVE → gym:**
   - static creeps into signs, item text and barks;
   - GLOOMSTALK is the Lavender Town beat;
   - rival fight #2 comes right after he fled the cave;
   - the gym leader's win speech warns you off, then hands over the key.
3. **Act 3, THE STATIC BELOW → return:**
   - terminal logs across the three floors hold the missing person's notes;
   - the Signal Core reveals what the static is;
   - on the return, the town text is restored or changed;
   - rival fight #4 is friendly;
   - the mentor's post-game line recontextualises the opening.

## Top 10, by impact per effort
1. Lunge-to-contact plus an anticipation squash (wind-up: `scale.x` 1.15, `scale.y` 0.87, spring back).
2. Damage-scaled hit-stop (60-120 ms, capped) with target vibration; the HUD and audio keep running.
3. Trauma shake plus an FOV kick (`fov -= 5*trauma`, then `updateProjectionMatrix()`).
4. Tiered timed hits (3/5/7-frame windows) with a text pop and a success flare; an ASSIST toggle.
5. A shot-list camera (establishing / attacker / impact) with hard cuts; lerp only for wind-ups.
6. Additive type VFX plus a shockwave ring (`RingGeometry`, additive, `depthWrite: false`, explicit `renderOrder`).
7. A super-effective splash card (a flat two-colour overlay, about 400 ms).
8. WebAudio stingers on the audio clock, quantised to a beat.
9. Static creep in signs and barks after the gym flag (flag-keyed text variants; a few chars garbled with a seeded rng).
10. A rival with 4 flag-gated encounters, and the gym leader's warning, reusing the trainer and `q_msg` systems.

**Ownership:**
- 1-3 and 5-7: game-feel-engineer (`combat/`).
- 4: the combat command layer (`combat/commands.*`, engine-side, DEEP).
- 8: game-feel-engineer (audio).
- 9-10: narrative-designer for the text. The flags or encounter mechanics are creature-designer's (DEEP).
