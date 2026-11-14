# Creature variety: approved spec (2026-10-17)

User-approved: **redraw every unrelated species as its own animal, make evolutions change form, and add about 6 new animal species**. Art stays in the same procedural style (no image files), in both builds.

The exact data patch for SPECIES, MOVES, ZONES and WATER_ZONES is in [creature-roster-patch.py](creature-roster-patch.py). It was written as an exec'd patch against a scratch copy, so translate it into real table edits.

## Why
Measured silhouette overlap at front view, size 80 (IoU of opaque pixels):

| Pair | IoU |
|---|---|
| galebeak / tidewhisk | 1.00 |
| flutterfly / lanternfly | 1.00 |
| thornmane / voltbloom | 0.98 |
| cinderpaw / emberling | 0.94 |
| gloomstalk / pyrelash | 0.86 |

## Body map (existing 26 species; heads face -x)
NEW marks a new kind; "+flag" is a new flag on an existing kind.

| species | concept | kind / flags |
|---|---|---|
| emberling | fire fox kit | quad (retune: tall pointed ears, pointed muzzle, flame tail) |
| pyrelash | maned lion-drake | quad + **drake** (back wings, swept horns, long flame tail, no fox ears), big, mane, flame |
| cinderpaw | ember wolf | NEW **hound** (flame = ember tail tip, mane = smoke ruff) |
| gloomstalk | shadow panther | NEW **panther** (big; drop mane) |
| dripling | eel | serpent |
| tidecoil | sea dragon | serpent + **dragon** (raised S-neck, horns, frill, dorsal sail, whiskers), big, fins |
| sprigling | seed-bulb sprout | plant |
| thornmane | bramble beast | plant + **walker** (horizontal body on 4 legs, thorn-ring mane), big, thorns |
| voltbloom | snapping flytrap | NEW **flytrap** (big) |
| nibbit | rabbit-mouse | rodent |
| gnawtl | beaver-rat brute | rodent + **beaver** (paddle tail, upright, buck teeth), big, tusks |
| flutterfly | butterfly | bug |
| lanternfly | firefly | NEW **firefly** (glow) |
| galebeak | hawk | bird |
| tidewhisk | pelican seabird | NEW **pelican** |
| pebblit | pebble | rock |
| boulderon | rock golem | rock + **golem** (boulder fists, block feet, shoulder crystals), big, crystals |
| nocturn | bat | bat |
| umbrawing | night wyvern-bat | bat + **wyvern** (barbed swaying tail, wing claws, horn crown), big, horns |
| cogling | living cog | gear |
| ironclad | iron armadillo | NEW **armadillo** (big, spikes) |
| brinecrab | crab | crab |
| zapmote | spark mote | spark |
| mirepuff | bog puff | ooze |
| duneghast | sand mask spirit | NEW **mask** (relic = orbiting shards) |
| psywisp | psychic wisp | wisp |

No renames, types or colours change, so saves stay valid.

## New species (all `evo=None`)
There is also one new move: `xscissor`, Bug, physical, power 80, accuracy 100.

| id | concept | types | hp/atk/def/spa/spd/spe | BST | catch | kind |
|---|---|---|---|---|---|---|
| finnow | koi minnow | Water | 40/52/42/38/40/78 | 290 | 220 | **fish** |
| croaklet | bog toad | Poison/Water | 58/48/50/56/52/50 | 314 | 180 | **frog** (warts) |
| hootle | forest owl | Psychic/Flying | 62/42/52/74/72/56 | 358 | 110 | **owl** |
| brambuck | antlered rammer | Normal/Grass | 64/78/60/42/54/72 | 370 | 100 | **stag** |
| chithorn | rhino beetle | Bug | 62/88/86/30/52/46 | 364 | 90 | **beetle** |
| driftjelly | sea jelly | Water/Psychic | 66/38/48/70/74/50 | 346 | 130 | **jelly** |

**Spawns** (every pool still totals 100; exact weights are in the patch):

| species | where |
|---|---|
| croaklet | ZONES[2] and ZONES[3] |
| hootle | ZONES[5] |
| brambuck | ZONES[6] and ZONES[10] |
| chithorn | ZONES[9] |
| finnow | WATER_ZONES[0] (Mirror Lake) |
| driftjelly | WATER_ZONES[1] (Open Sea) |

**Measured balance.** The duel wins below are out of 31, at Lv25 / Lv40:

| species | wins |
|---|---|
| driftjelly | 15 / 15 |
| brambuck | 14 / 15 |
| chithorn | 13 / 15 |
| hootle | 10 / 11 |
| croaklet | 11 / 7 |
| finnow | 3 / 2 (filler tier) |

- **Zone bands:** the BST band in each zone is unchanged.
- **Level curve:** unchanged (gym arrival 26.5).
- **Trainers:** no new partner makes any trainer fight easier than intended.
- **BRAX:** brambuck gives the Fire starter an answer to BRAX (win rate 3% before, 31% now).

## Art envelope (every kind)
- **Size:** in units of `s` before the `big` ×1.15, x stays within ±0.72s and y within -0.70s..+0.52s. Feet sit at +0.52s.
- **Layout:** sprites must fit the battle layout (player HP box at y=248, foe platform ending at y=240), FLASH_BOX 288, and the ×1.35 hunt lunge.
- **Brush only:** draw only through `Brush` (or alpha surfaces centred on cx), so the flip test passes.
- **Eyes:** draw eyes only through `eye()`, so the back view differs from the front.
- **Fill:** at least 600 opaque pixels at size 80.

## Art briefs
**hound.** A lean raised body on 4 long legs, with a long-snout head on a raised neck and tall ears. The bushy tail curls up. Flags: flame gives an ember tip, mane gives a smoke ruff. Animation: tail sway.

**panther.** A long low body with small round ears and the head level with the back. A long S tail lies on the ground with its tip curling up. Short crouched legs and glowing slit eyes. Animation: tail-tip flick and breathing.

**flytrap.** A stalk carrying a clam head made of two toothed jaw halves with white teeth. Two base leaves and a root clump. Animation: the jaws open and close. The back view has closed jaws.

**firefly.** A slim thorax and a big glowing lantern abdomen with a pulsing halo. Two pairs of narrow, upswept translucent wings and feathery antennae. Animation: wing shimmer and lantern pulse.

**pelican.** Upright on webbed feet, with a long neck curve and a huge beak plus a gold pouch. A short folded wing. Animation: pouch wobble and head bob.

**mask.** A shield-shaped stone face plate with carved eye slots and a crack. A sand veil tapers to a wisp point. Flag: relic gives orbiting shards. Animation: bob and veil ripple.

**armadillo.** A domed shell of 4-5 banded arcs, a small pointed-snout head, 4 stubby legs and a banded tail. Flag: spikes adds ridge spikes. Animation: breathing bands.

**fish.** A deep oval body hovering over a ripple, with a forked tail, dorsal and pelvic fins, a gill arc and one large eye. Animation: fin ripple and bob.

**frog.** A wide squat body with eye domes on top, folded hind legs, a wide mouth and a c2 throat sac. Flag: warts adds dots. Animation: throat pulse.

**owl.** An upright egg body with a round c2 face disc and big front eyes. Ear tufts, a hooked beak, folded wings and talons. Animation: blink and head tilt.

**stag.** Tall thin legs, a horizontal body and a raised neck. Branching c2 antlers with leaf tips, and a white tail tuft. Animation: ear flick and leaf sway.

**beetle.** Heavy domed elytra with a split line, a big curved forward horn plus a small second horn, and 6 bent legs. Animation: the elytra lift slightly.

**jelly.** A translucent scalloped bell (alpha surface) with an inner c2 glow. 4-5 wavy tentacles reach to +0.52, and the eyes sit on the bell. Animation: bell squash-stretch and tentacle waves.

**Evolution flags.** Each of these takes its evolution pair to IoU ≤ 0.65:

| flag | species | adds |
|---|---|---|
| drake | pyrelash | wings and horns |
| dragon | tidecoil | neck, frill and sail |
| walker | thornmane | legs, body and mane |
| beaver | gnawtl | paddle tail and upright stance |
| golem | boulderon | fists and feet |
| wyvern | umbrawing | barbed tail and claws |

## Tests to add or extend
- **Kind count:** Python RENDER kind count goes from 13 to 26.
- **No shared kinds:** unrelated species must not share a kind. Group species into families via `evo`. Each kind maps to one family, and a member sharing its base's kind must carry a silhouette flag the base lacks (`big` alone doesn't count).
- **Silhouette overlap:** the IoU between any two species must be ≤ 0.85. Evolution pairs that share a kind must be ≤ 0.65.
- **GLOOMSTALK:** update the kind and mane asserts (`quad` becomes `panther`) in both suites.
- **JS draw check:** a recording fake ctx draws every species and asserts no throw and enough fill calls. Add a `default:` branch that fails loudly in tests, because today an unknown kind draws blank in both builds.
- **PARITY:** compare the full `art` dict and WATER_ZONES, not just `art.kind` and ZONES.
- **Engine:** Bug now has 2 damaging moves and Poison has 2 carriers.

## Build order (sequential, the same two files)
1. **Art first (game-feel-engineer):** 13 new kinds plus 6 flag variants in both builds, verified with synthetic art dicts before any species points at them.
2. **Data (creature-designer):** xscissor, the 6 species, the art edits on 14 existing species, and the ZONES edits, emitted with emit_tables. Hand-port WATER_ZONES.

Fallback if the art budget is tight: ironclad as `gear + mech` instead of a new armadillo kind.
