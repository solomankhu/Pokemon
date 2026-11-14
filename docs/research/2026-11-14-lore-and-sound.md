# Research: story, lore and sound (2026-11-14)

Input for Story phase 2 (`docs/wiki/story.md`), the crafted-weapon spec
(`docs/superpowers/specs/2026-11-14-crafted-weapons-design.md`) and a first music/audio pass.
Research only: no game file was changed. Every idea below is original to this game; the
sources are techniques, not content to copy.

## Current state (checked 2026-11-14)
- **There is no music in either game.** Audio is synthesized SFX only (`Sfx._build` note
  lists in Python, WebAudio in JS), plus the cave drone (`DRONE_VOL`) and heartbeat.
- The story outline (WREN, the Relay that "listens and keeps", GLOOMSTALK as WREN's partner,
  CEDAR's cost, TAM) is approved for review; no game text has landed.

## Findings
| Source | Finding | Use here |
|---|---|---|
| Dark Souls / Hollow Knight ([Game Developer](https://gamedeveloper.com/design/narrative-design-in-dark-souls), [TV Tropes](https://Tvtropes.org/pmwiki/pmwiki.php/Main/StoryBreadcrumbs)) | Lore told almost entirely through item descriptions; optional, pieced together by the player. | Loot and craft descriptions carry lore fragments. `GOODS` is emitted by `emit_tables.py`, so parity is free. |
| UVB-76 "The Buzzer" ([Wikipedia](https://en.wikipedia.org/wiki/UVB-76), [Priyom](https://priyom.org/military-stations/russia/the-buzzer)) | Shortwave station broadcasting a repeating buzz since ~1982; no one admits running it; once aired a phone call by mistake. | Model for the Relay's carrier hum: a signal that never stops and nobody claims. |
| Electronic voice phenomenon ([Wikipedia](https://en.wikipedia.org/wiki/Electronic_voice_phenomenon), [Encyclopedia.com](https://www.encyclopedia.com/science/encyclopedias-almanacs-transcripts-and-maps/raudive-konstantin-1909-1974)) | Jurgenson (1959) recorded birdsong and heard voices on tape; Raudive made 100,000+ recordings. | **WREN is a field recordist**: she recorded monster calls at the pillars and heard voices in the hiss. |
| Horror audio ([Wayline](https://www.wayline.io/blog/silence-is-scary-sound-design-horror-games), [Dread Central](https://www.dreadcentral.com/news/477380/dissonant-voices-the-unsettling-sounds-of-fatal-frame-ii-2/)) | Pure silence feels sterile; near-silence broken by chosen cues builds dread; degraded "old recording" audio is scarier than clean. | Sparse cave; WREN's voice/tune through a tape effect; silence as the return payoff. |
| Shepard tone ([Pop Sci](https://www.popsci.com/science/shepard-tone/)) | Stacked octaves rise without resolving; sustains tension. Descending feels calmer. | Rising endless tone at the Signal Core. |
| Leitmotif ([Game Developer, Undertale](https://www.gamedeveloper.com/audio/an-examination-of-leitmotifs-and-their-use-to-shape-narrative-in-undertale-part-1-of-2)) | A character melody recurs in variations; each variation reveals something. | An original WREN's tune with variations. |
| Weapon durability ([Game Informer](https://www.gameinformer.com/opinion/2019/08/01/we-deserve-better-from-games-with-breakable-weapons), [Zelda Dungeon](https://www.zeldadungeon.net/?p=126669)) | Breakage causes anxiety and restocking chores; the most requested fix is repair. | Re-crafting the same weapon repairs it; a break is a story beat, not a punishment. |
| Palworld vs Cassette Beasts ([GamingBolt](https://gamingbolt.com/palworld-1-0-review-the-pals-are-put-to-work), [Siliconera](https://siliconera.com/review-cassette-beasts-is-an-rpg-with-a-lot-of-heart)) | Player weapons work beside monsters, but Palworld's story is weak; Cassette Beasts is praised for bonds and home. | The weapon is agency with a limit: it can never finish a fight, so the team stays the point. |
| SFX layering ([Violet Recording](https://violetrecording.com/how-to-design-sound-effects-for-games/)), tape wow/flutter ([Splice](https://splice.com/blog/how-tape-machines-shaped-lo-fi-sound/)) | Strong SFX are transient + body + tail; wow is slow and deep (~1-2 Hz), flutter fast and shallow (~4-5 Hz); hiss is filtered noise. | Weapon swing/thud/break recipes; a tape-wobble option in the synth. |

## Ideas, adopted (user chose all recommended options, 2026-11-14)

### Story and lore
1. **WREN the field recordist.** She went north to record monster calls at the humming
   pillars and heard voices in the hiss. CEDAR's lab radio plays her last tape (refines B7).
2. **Lore in item descriptions.** One fragment per loot/crafted item, e.g. SHADOWSILK
   "Spun in the dark. It hums if you hold it to your ear."; IRON SPEAR "WREN's design. The
   shaft is wrapped in recording tape." Budget: existing blurb/desc lengths.
3. **The Relay as an unclaimed station.** A sign or log gives a callsign and frequency:
   "Nobody has ever answered on it." Invented callsign; never a real one.
4. **GLOOMSTALK's cry is on the tapes.** Below, a log: "Track 41: her call. She is still
   answering it." Explains why it guards the cave.

### Sound (synthesized, no assets)
5. **WREN's tune**: an original 6-8 note motif in the existing note-list format. Variations:
   clean fragment with the ROUTE ONE/RIDGE medic; under static on the lab radio; detuned at
   the pillars at dusk; tape-wobbled at Static Below terminals; absent after the return.
6. **Tape effect**: slow pitch wobble (wow ~1-2 Hz) plus filtered hiss, as a synth option in
   both builds. Shell only; cosmetic randomness via `FX_RNG`/`fxRand`, never engine rng.
7. **Carrier hum**: after VOLT, a buzzer-like repeating pip grows near the gym hatch; it
   stops on the return (audio side of B34/B38).
8. **Rising endless tone** at the Signal Core (THE STATIC BELOW, shell only; per-tick SIM
   untouched).
9. **Weapon SFX**: swing (falling noise band), thud (click + low body), break (cracks + a
   broken fragment of WREN's tune when the spear breaks).

## Order and owners
| # | Item | Cost | Owner |
|---|---|---|---|
| 1 | WREN-as-recordist + item-description lore | text only, after the dialogue-parity test | narrative-designer |
| 2 | WREN's tune + tape effect | one synth change, both builds | game-feel-engineer |
| 3 | Crafted weapons | DEEP, see spec | sandbox / creature / feel / narrative |
| 4 | Carrier hum and its stop | needs story flags (phase 2b) | game-feel-engineer + narrative-designer |
| 5 | Signal Core rising tone | small | game-feel-engineer |

Constraints for all of it: no audio files; Python `Sfx` builds at the mixer's actual rate;
reduced motion never removes sound; any new shell constant joins the PARITY shell-constants
list; THE STATIC BELOW stays pure ASCII.
