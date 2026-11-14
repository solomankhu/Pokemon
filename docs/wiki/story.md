---
title: Story outline (MONSTER TRAIL + THE STATIC BELOW)
sources: ["claude's monsters.py", "gemini's code.html"]
synced: 2026-11-14
---
# Story outline

Status: **phase 1, outline only.** No game file has been edited. Phase 2 lands the text in
both builds together, and adds the dialogue-parity test first. The research behind this page
is [the 3D action and narrative brief](../research/2026-10-17-3d-action-and-narrative.md),
section B and Top-10 items 9-10. The worker rules are in [agent-contract.md](agent-contract.md).

## 1. Current story inventory

### What the game says today
- **The trail is a tutorial with flavour.** 20 NPCs (`claude's monsters.py:2667-2776`), 13
  signs (`:2631-2666`), one gym leader (`:2777`). Most lines teach a mechanic: catching,
  fishing, ledges, mining, type tips. No character has a name that recurs, and nobody wants
  anything.
- **The premise is "be the best".** The professor sends you north to beat VOLT
  (`:2562-2564`), and after the gym the only payoff is "Champion of the trail!" (`:2566`).
- **There is a hook, and it goes unexplained.** The opening says the trail "has been closed
  for a season" (`:2833`). Nothing ever says why.
- **There are strong wrong notes, but they are isolated:**
  - the angler's "Something bigger is down there too" (`:1433`);
  - the humming pillars (`:1385`);
  - "not quite alive" (`:1386`);
  - the hunting thing in the cave (`:1390`, `:1508`).
- **None of them connect to THE STATIC BELOW.** The only bridges are the JS victory prompt
  "to follow the signal below" (`claude's monsters.html:5076`), the `campaign.js` dialog
  "A strange signal leads to a hatch beneath the gym" (`campaign.js:141`) and the chapter's
  intro and victory lines.
- **Below, there is no story at all.** The floors have room names only (`gemini's
  code.html:426-430`). Terminals toast `NODE ONLINE n/t` (`:1871`) and carry no log text.
  The final message is `FACILITY FULLY RESTORED & SECURED!` (`:884`).
- **No NPC remembers anything.** NPC `lines` never change. Trainers have exactly two states
  (`intro`/`defeat` before, `after` once beaten). The only flag-keyed text in the game is
  in the professor (`:2553-2566`, starter/gym), the gym door (`:2531-2544`) and the JS return
  toast (`claude's monsters.html:5799`, `chapter.completed`).
- **Build drift (fixed 2026-10-18).** The Python gym door said "Four trainers beaten, that's
  the rule", but `GYM_REQUIREMENT` is 6 and the JS build said "Six". It now says "Six" in both.
  No test caught it, because that string lives in a function, not a table (see E4).

> **Line numbers drift.** This table was re-anchored on 2026-11-14 (after the AXE, glades and
> visual-crafting work grew both builds). Every other `:NNNN` reference on this page is as of
> 2026-10-17, so find each line by grepping its quoted text. Phase 2 has not landed:
> no game file mentions WREN yet.

### The 14 lines that matter most
| # | Where | Line |
|---|---|---|
| 1 | `claude's monsters.py:4293` | "CEDAR TOWN. The trail north has been closed for a season." |
| 2 | `:2687` ANGLER PIP | "DRIPLING bite all day. Something bigger is down there too." |
| 3 | `:2681` CHILD | "I found a ball just lying on the ground up north!" |
| 4 | `:2636` sign (34,13) | "The pillars hum at dusk. Nobody agrees why." |
| 5 | `:2637` sign (52,22) | "Whatever drifts between these stones is not quite alive." |
| 6 | `:2641` sign (28,40) | "Something big hunts in there. PSYCHIC tricks do nothing to it." |
| 7 | `:2760` CAVER NOX | "You brought a light? Shame. I like it dark." |
| 8 | `:3145` hunt scare | "Something was breathing right behind you..." |
| 9 | `:3177` hunt reward | "It left %d %s behind in the dark." (since 10-17 the material is a parameter, not a fixed ORE) |
| 10 | `:2774` GYM WARDEN | "VOLT has been up there all week, waiting." |
| 11 | `:2780` LEADER VOLT | "Beautiful. The trail is yours." |
| 12 | `gemini's code.html:1093` | "The signal that pulled you off the trail... X isn't here to help you now." |
| 13 | `gemini's code.html:1105` | "The static clears. Somewhere above, X is still waiting for you." |
| 14 | `claude's monsters.html:7584` | "Signal silenced. Welcome back!" |

### Slot facts that constrain the plan
- **NPC `lines`** is one conversation: each element is a page, and the first page is
  prefixed `NAME: ` (`claude's monsters.py:2366`). Trainer `intro`/`defeat`/`after` are
  single strings with the same prefix (`:1828`, `:2024`, `:2362`). A sign is a list of pages.
- **The box** (`:4851-4852`, also used by battle text at `:5430`) wraps at 564 px of the 15 pt
  font, with 3 lines per page. **Budget: 108 characters per page, prefix included, and at
  most 2 pages.** Every draft below meets it.
- **The Python build has no chapter.** `G.chapter` exists only in the HTML build
  (`claude's monsters.html:1440`, `:2340`). So any "after the return" beat is JS-only by
  construction.

## 2. Premise

A season ago, **WREN**, PROF. CEDAR's lab assistant, walked north with a lantern to find out
why the SPIRE RUINS hum. She went down a hatch beneath the gym and never came back. LEADER
VOLT closed the trail and has been sitting on that hatch ever since.

Under the trail is a relay older than the towns. It does not broadcast. It **listens and
keeps**: every voice that has crossed the trail is on its tapes. The static is all of them
replayed at once, and the replay is how it calls people down. It calls them away from their
monsters, which is why "X isn't here to help you now." WREN's partner would not follow her
past the lift. It is still in the DARK CAVE, keeping off any lamp that isn't hers. That is
GLOOMSTALK.

**Why the player cares within 5 minutes:** the first sign in town is a MISSING notice. The
child holds a ball WREN promised to come back for. The professor hands you a starter, and
she is not asking you to be champion. She is asking you to find her assistant.

## 3. Three acts on the real map
**Act 1, the wrong note** (CEDAR TOWN y103-108 → ROUTE ONE y92-101).
- Mundane, but off: a MISSING sign, a radio left on in the lab, a promise to a child, a
  humming fishing line.
- The mentor beat: CEDAR wants WREN back.
- A rival seed: TAM, WREN's younger brother, is ahead of you.

**Act 2, the creep** (DEEPWOOD y79-90 → SEASIDE y66-77 → RIDGE TOWN y53-64 → ROCKY PASS
y40-51 → DARK CAVE/GEODE y25-38 → SPIRE RUINS y12-23 → TRAIL SUMMIT y1-10).
- The static moves into the senses: the seer sees only static, a compass points at the
  ridge, a medic remembers WREN humming.
- The DARK CAVE is the Lavender Town beat. A lantern trail, and GLOOMSTALK, which keeps off
  lamps "like it's checking whose light it is".
- At the summit, the warden and VOLT admit there is a hatch. CEDAR's cost: she sent WREN,
  and closed the trail behind her.

**Act 3, the genre break and the return** (THE STATIC BELOW: Intake → Archives → Signal
Core → back to the trail).
- WREN's 15 logs, one per terminal, in activation order:
  - Intake: what this place is;
  - Archives: what the static is;
  - Signal Core: what it kept, including WREN, and "tell CEDAR it was not her fault".
- Silencing the core is the victory. Then, on the trail, the radio is quiet, the pillars are
  silent, the medic's tune is gone, and CEDAR leaves the lab light on. WREN does not come
  back. Like Lavender Town, the grief is left implied.

## 4. Beat table
Pages are separated by ` // `. `%s`/`%d` are the existing format slots. Character counts were
checked by script, with the prefix included and `%s` taken as a 10-char name. The longest
page is 103 and the longest log is 66.

| Beat | Act | Where (cite) | Draft line | Plants / pays | Mechanism |
|---|---|---|---|---|---|
| B1 | 1 | New-game intro, `claude's monsters.py:2833`, `claude's monsters.html:5248` | CEDAR TOWN. The trail north has been closed since WREN walked up it in spring. // PROF. CEDAR is waiting by the lab on the east side of town. | plants WREN, the closed trail | new-string-same-slot |
| B2 | 1 | sign (19,107) `:1400` | CEDAR TOWN - where every trail starts. // MISSING: WREN, lab assistant. Last seen walking north with a lantern. | plants WREN and the lantern | text-only |
| B3 | 1 | `prof`, pre-starter `:2558` | PROF. CEDAR: There you are! VOLT has opened the trail again, and I need someone to walk it. // Three young monsters are waiting. Choose the one that suits you. | mentor beat 1: the want | new-string-same-slot |
| B4 | 1 | `prof`, `choose_starter` `:2574` | You received %s! // PROF. CEDAR: Head north. If you see a lantern up there, it's WREN's. Tell her to come home. | plants the lantern | new-string-same-slot |
| B5 | 1 | `kid` `:1425` | CHILD: WREN gave me a ball before she went north. She said keep it till she's back. // They look like little spheres. Walk up and press the action button. | the wrong note; paid at B38 | text-only |
| B6 | 1 | `nurse1` `:1417` | MEDIC: The CENTRE door heals your whole team and restocks your balls. // There's another centre in RIDGE TOWN. WREN's last letter came from there. | points at B12 | text-only |
| B7 | 1 | sign (54,107) `:1401` | PROF. CEDAR RUNS THE LAB. Knock before you wander in. // Through the window: a radio, left on. It only plays static. | plants static (the radio hisses); paid at B37 | text-only |
| B8 | 1 | `angler` `:1430` | ANGLER PIP: Stand on the shore, face the water, press the action button. // DRIPLING bite all day. Something bigger is down there. My line hums when it passes. | plants the hum, "below"; paid at B42 | text-only |
| B9 | 1 | `t2` SCOUT DELL `after` `:1444` | SCOUT DELL: GALEBEAK nest east of here. And a kid called TAM tore past, asking after WREN. | rival seed 1 | text-only |
| B10 | 2 | `t4` MYSTIC SAORI `defeat` `:1457` | MYSTIC SAORI: ...I did not see that. Past the ridge, all I see is static. | static escalates (perception) | text-only |
| B11 | 2 | `t5` SAILOR BRAX `after` `:1464` | SAILOR BRAX: Fish the bay. BRINECRAB come up angry. And my compass points at the ridge now. | static escalates (the world bends) | text-only |
| B12 | 2 | `nurse2` `:1471` | MEDIC: Rest up. The cave above town is no place for a tired team. // WREN slept here last. Left before dawn, humming a tune I didn't know. | plants the tune (a voice on the tapes); paid at B39 | text-only |
| B13 | 2 | `ranger` RANGER HOLT `:1474` | RANGER HOLT: LEADER VOLT takes challengers who beat six trainers. There are eight on the trail. // We closed the trail when WREN didn't come back. VOLT only opened it this week. | explains B1; plants VOLT knowing | text-only |
| B14 | 2 | `quarry` `lines[0]` `:1495` | QUARRY HAND: WREN took my last lamp oil up that cave. Have my spare PICK instead. // (page 2 unchanged) | lantern trail | text-only |
| B15 | 2 | `t6` ROCKHOUND MAYA `intro` `:1485` | ROCKHOUND MAYA: Nothing gets past my wall of stone. Well. Nothing but that TAM kid. | rival seed 2 | text-only |
| B16 | 2 | `cavenpc` SPELUNKER `:1489` | SPELUNKER: It's pitch black in that cave. Follow the walls; the galleries link up. // The big one keeps off a bright lamp. Like it's checking whose light it is. | **GLOOMSTALK is WREN's partner**; the `keep_out` mechanic becomes story | text-only |
| B17 | 2 | `t7` CAVER NOX `defeat` `:1507` | CAVER NOX: Fine. Take the shaft south. Last lamp I saw down here was WREN's. | lantern trail ends in the cave | text-only |
| B18 | 2 | hunt reward, `hunt_over` `:1885`, `claude's monsters.html:1603` | It left %d ORE behind, like it was keeping them for someone. | grief left implied; paid at W-2/W-11 | new-string-same-slot |
| B19 | 2 | sign (34,13) `:1384` | SPIRE RUINS. Older than the towns, older than the trail. // The pillars hum at dusk. Since spring, they hum all night. | static escalates; paid at B40 | text-only |
| B20 | 2 | `t8` SEER ILVA `defeat` `:1513` | SEER ILVA: The stones are not always right. Lately they only say one name: WREN. | the static speaks a name (the tapes) | text-only |
| B21 | 2 | sign (48,7) `:1383` | Beyond this point the wind does the talking. // Under the gym floor, something talks back. | plants the hatch | text-only |
| B22 | 2 | `warden` `:1517` | GYM WARDEN: Six trainers beaten and the doors open. Not before. // VOLT hasn't left the gym all week. Says someone has to sit on the hatch. | VOLT the gatekeeper | text-only |
| B23 | 2 | gym door, count refused `:2542` | GYM WARDEN: Six trainers beaten, that's the rule. You have %d. | **bug fix** (it says "Four"; the HTML says Six) | new-string-same-slot |
| B24 | 2 | `GYM_LEADER.intro` `:1525` | LEADER VOLT: So you made it up the trail. Good. I need someone who can climb back out. | VOLT gates the Below on purpose | text-only |
| B25 | 2 | `GYM_LEADER.defeat` `:1526` | LEADER VOLT: Beautiful. WREN went where you're going next. Come back up, whatever you find. | the warning, then the key (build-neutral, see E1) | text-only |
| B26 | 2 | victory subtitle, `:5562`, `claude's monsters.html:5064` | LEADER VOLT has been defeated. The floor is humming. | the turn | new-string-same-slot |
| B27 | 2 | `prof`, post-gym `:2566` | PROF. CEDAR: VOLT let you through. Then you've seen the hatch. // I should have gone down myself. I sent WREN instead, and closed the trail behind her. | mentor beat 3: **the cost**; paid at W-14 | new-string-same-slot |
| B28 | 2 | gym door, post-gym, **Python only** `:2533` | The hatch under the gym is sealed tight. LEADER VOLT gives you a nod. | the Python build has no chapter (E1) | new-string-same-slot |
| B29 | 2 | descent dialog body, `campaign.js:141` | WREN's hum leads to a hatch beneath the gym. Your monsters will wait above. You can return at any time. | the descent | text-only (in campaign.js, see E5) |
| B30 | 3 | Intake terminals, `gemini's code.html:339-343`, toast `:1871` | W-1: The hum is a carrier. Someone built this place. / W-2: She won't come past the lift. I told her to wait by the lamp. / W-3: The intake takes in voices. I can hear the trail in it. | pays B16/B18 (GLOOMSTALK) | needs-new-slot: `logs` in stageConfigs (E3) |
| B31 | 3 | Archives terminals `:356-362` | W-4: Tapes. Every trainer who ever walked the trail. / W-5: CEDAR is on one, young. So is VOLT. / W-6: The static is just them. All of them, at once. / W-7: It plays them back. That is how it calls people down. / W-8: TAM, if you find this: go home. I mean it. | **reveal: what the static is**; pays B7/B10/B20, the rival | needs-new-slot (E3) |
| B32 | 3 | Signal Core terminals `:381-389` | W-9: The core does not send. It listens, and it keeps. / W-10: My own voice is on the tapes now. It sounds happy. / W-11: The lamp is low. I keep hearing her up in the cave. / W-12: If it keeps us, it can let us go. Shut every node. / W-13: Do not wait for me. Wait for the quiet. / W-14: Tell CEDAR it was not her fault. Tell her I heard the trail. / W-15: Last node. Shut it, and go back up the lift. | pays B27 (the cost) and B12 (the tune) | needs-new-slot (E3) |
| B33 | 3 | stage-3 win message `gemini's code.html:884` | SIGNAL CORE SILENCED. THE TAPES HAVE STOPPED. | closes the reveal (ASCII) | text-only (and update `gemini's code.test.js:336`) |
| B34 | R | JS return toast, completed, `claude's monsters.html:5799` | The hum has stopped. Welcome back. | the return | new-string-same-slot (JS only) |
| B35 | R | `prof`, post-return | PROF. CEDAR: The lab radio went quiet this morning. First time since spring. // You heard her down there, didn't you. ...I'll leave the lab light on. | mentor beat 4: recontextualises B3/B7 | needs-flag:chapter.completed |
| B36 | R | `kid`, post-return | CHILD: The radio stopped! Does that mean WREN's coming back for her ball? | pays B5 | needs-flag:chapter.completed |
| B37 | R | `nurse2`, post-return | MEDIC: I caught myself humming WREN's tune today. Then it just... stopped. | pays B12 | needs-flag:chapter.completed |
| B38 | R | sign (34,13), post-return | SPIRE RUINS. Older than the towns, older than the trail. // The pillars are silent now. Someone has scratched a W into one. | pays B19; "a small space that changed" | needs-flag:chapter.completed |
| B39 | R | `campaign.js:139-141`, completed body | The hatch is quiet. VOLT leaves it open now, in case anyone else comes up. | VOLT's arc closes | needs-flag:chapter.completed (the branch exists for the title only) |
| B40 | 2 | `angler`, post-gym | ANGLER PIP: My line's hummed nonstop since VOLT lost. Something below woke up. | escalates B8 | needs-flag:gym |
| B41 | 2 | `cavenpc`, after a hunt win | SPELUNKER: The big one's gone quiet. I think it's still waiting by her lamp. | pays B16 | needs-flag:hunt_beaten |
| R1 | 1 | ROUTE ONE, near `t2` (42,93) | TAM: You're CEDAR's new one? I'll find my sister before you do. // (defeat) TAM: Fine. You're slow anyway. | rival beat 1: cocky | needs-new-npc |
| R2 | 2 | RIDGE TOWN | TAM: WREN slept here. I'm not turning back. // (defeat) TAM: ...Okay. That one hurt. | rival beat 2: rattled | needs-new-npc |
| R3 | 2 | ROCKY PASS, by the cave mouth (after the cave) | TAM: I saw it in there. It was guarding a lantern. Her lantern. // (defeat) TAM: Go if you want. I can't. | rival beat 3: **reveal and cost** (he quits) | needs-new-npc + needs-flag |
| R4 | R | CEDAR TOWN, post-return | TAM: You heard her down there? Then show me what she taught you. // (defeat) TAM: Thanks. For going where I couldn't. | rival beat 4: ally | needs-new-npc + needs-flag:chapter.completed |

**Kept on purpose:**
- the jumpscare text (`:1853-1861`);
- the PSYCHIC hint lines (`:1390`, `:1508`, PARITY-compared in `hunt`);
- the GEODE seam directions (`:1499`);
- all type tips;
- `introLine`/`victoryLine` (`gemini's code.html:1074-1089`). They already carry the theme,
  and `gemini's code.test.js:475` pins `introLine` exactly.

**Beat count (45):**

| Mechanism | Beats | Share |
|---|---|---|
| text-only or new-string-same-slot | 31 (B1-B29, B33, B34) | **69%** |
| needs-new-slot | 3 (B30-B32) | |
| needs-flag | 7 (B35-B41) | |
| needs-new-npc | 4 (R1-R4) | |

## 5. Clue → payoff map (staged escalation)
The stages follow Inscryption's ladder:
- **S0:** a mundane wrong note;
- **S1:** a sensory glitch;
- **S2:** horror as a mechanic;
- **S3:** the genre break;
- **S4:** a small, familiar space that has changed.

| Thread | S0 (Act 1) | S1 (Act 2 barks) | S2 (cave) | S3 (Below) | S4 (return) |
|---|---|---|---|---|---|
| WREN is missing | B1 intro, B2 MISSING sign, B5 child's ball | B6/B12 her letter and her bed, B20 "one name: WREN" | B17 "last lamp was WREN's" | W-1..W-15, her voice | B35 CEDAR, B36 child |
| The static is voices | B7 radio of static, B8 humming line | B10 seer sees static, B11 compass, B19 pillars hum all night | the tension grain (existing feel) | W-4..W-7 **the tapes** | B34 "hum has stopped", B37 tune gone, B38 pillars silent |
| The lantern / GLOOMSTALK | B2 "with a lantern", B4 "it's WREN's" | B14 lamp oil | B16 "whose light it is", B18 "keeping them for someone", B41 | W-2 "wait by the lamp", W-11 "hearing her up in the cave" | (GLOOMSTALK still hunts: left unresolved, like Marowak) |
| VOLT guards the hatch | B1 trail closed | B13 "VOLT only opened it this week", B21 "something talks back", B22 "sit on the hatch" | | B24/B25 then W-5 "so is VOLT, young" (he has heard himself) | B39 hatch left open |
| CEDAR's cost | B3 "I need someone to walk it" | B27 "I sent WREN instead" | | W-14 "not her fault" | B35 "I'll leave the lab light on" |
| TAM, the rival | B9 Dell's sighting, R1 | B15 Maya, R2 | R3 he saw the lantern and quits | W-8 "TAM, go home" | R4 ally |
| "Something bigger is down there" | B8 | B40 (post-gym) | | THE STATIC BELOW is the literal "down there" | |

## 6. The rival arc
**No rival exists in the code today.** All 8 trainers (`t1`-`t8`) are one-shot strangers,
with no shared name and no recurrence, and no NPC moves between regions.

- **The minimal version that ships now (text-only):** TAM exists *only in other people's
  mouths* (B9, B15, W-8). This is the absent-rival technique: the player is racing someone
  they never meet. It costs nothing, and it reads as setup for R1-R4.
- **The full version (DEEP, creature-designer):** one new trainer NPC, `tam`, with 4
  flag-gated placements (R1-R4): cocky → rattled → quits after the cave → ally on the
  return.
  - R3's flag could be "has entered `CAVE_BAND`" or `hunt_beaten`.
  - Placements must respect the trunk-road and solid-NPC rules, so they stay off the
    2-wide road or leave a way around.
  - "The rival takes the starter strong against yours" would need starter logic. It is
    **not proposed**: TAM is WREN's brother, not CEDAR's pick, so no starter theft is needed.
  - Team and level curve: creature-designer.

## 7. Phase 2 work split
1. **Phase 2a: STANDARD text pass** (narrative-designer, after the HTML owner releases
   `claude's monsters.html`).
   - Add the dialogue-parity test first (section 8).
   - Then B1-B27, B33 and B34 in both builds.
   - B28 waits for decision E1. B29 waits for E5. B33 needs the paired
     `gemini's code.test.js:336` edit.
   - Tables (NPCS, SIGNS, GYM_LEADER) are hand-ported; `emit_tables.py` does not cover
     them. Function strings (B1, B3, B4, B18, B23, B26, B27) are hand-ported line for line.
2. **Phase 2b: DEEP flag-variant text** (creature-designer). A tiny pure helper picks a line
   variant: `story_lines(entry, flags, chapter)` / `storyLines`.
   - It reads optional `lines_gym` / `lines_below` on NPC and SIGN entries.
   - It covers B35-B41 with one mechanic; I then fill the strings.
   - `chapter.completed` exists only in the HTML build (see E2).
3. **Phase 2c: terminal log slot** (game-feel-engineer for the toast and HUD,
   narrative-designer for the strings).
   - Add `logs: [...]`, one per terminal, to each `stageConfigs[n]`.
   - Show `logs[sim.activated - 1]` in the `terminal` event toast (`gemini's code.html:1871`).
     It is indexed by activation order, not terminal index, so the story reads in order
     whatever the route.
   - The SIM stays pure (this is data only); the text stays ASCII. A toast-width check is
     needed, since the logs are at most 66 chars.
4. **Phase 3: the rival** (creature-designer, DEEP). R1-R4.

## 8. The dialogue-parity test (first thing in phase 2)
The model is the existing PARITY section (`claude's monsters.test.py:4520-4982`). `JS_DUMP`
evals the html script, reads `globalThis.__GAME__`, which already exports `NPCS`, `SIGNS`
and `GYM_LEADER` (`claude's monsters.html:5825-5827`), and prints JSON. The test then diffs
each key against `python_tables()`. Today only two story strings are compared, inside
`hunt`: `SIGNS['28,40']` and `t7.after` (`:4703`, `:4740`).

1. **Add a `story` key to `JS_DUMP`:**
   - `npcs`: `g.NPCS.map(n => [n.id, n.name, n.lines || null, n.intro || null, n.defeat || null, n.after || null, n.backstop || null])`;
   - `signs`: `Object.fromEntries(Object.keys(g.SIGNS).sort().map(k => [k, g.SIGNS[k]]))`;
   - `gym`: `[g.GYM_LEADER.name, g.GYM_LEADER.intro, g.GYM_LEADER.defeat, g.GYM_LEADER.after]`.
2. **Add `python_story()`** with the same shape. Sign keys become `"%d,%d"`, and the quarry's
   list-valued `after` passes through as a list. Add `"story"` to the key loop at
   `claude's monsters.test.py:4978`.
3. **Function strings.** The professor, gym door, new-game intro, starter, hunt reward and
   victory subtitle can't be read from a table today. That is why the "Four"/"Six" drift went
   unseen. **Proposal (E4):** hoist them into a `STORY` table in both builds and compare it
   under `story` too. It is a pure literal-to-lookup refactor with no behaviour change.
   Build-only strings (B28 Python, B34 JS) go in explicit `STORY_PY_ONLY` / `STORY_JS_ONLY`
   lists, which the test asserts are disjoint from the shared keys.
4. **Box fit (a Python RENDER check).** For every page of every NPC, sign, gym and `STORY`
   string, run the real `Shell.wrap` measurement at `W - 76` px in `f15`, with the `NAME: `
   prefix and `%s` set to the longest species name, and assert that it is 3 lines or fewer.
   A script then enforces the overflow rule, so no agent has to eyeball it.
5. **ASCII for THE STATIC BELOW.** A `gemini's code.test.js` check that every `logs` string
   and room name is code points 32-126. This lands with phase 2c.

## 9. Open decisions (for the PM)
- **E1.** The Python build has no chapter. Options:
  - (a) a build-neutral VOLT defeat line (B25 as drafted), with Python's post-gym door saying
    the hatch is sealed (B28);
  - (b) Python-specific VOLT text, which breaks table parity and needs an override list;
  - (c) no hatch mention in Python at all, which makes CEDAR's B27 dangle.

  Recommend (a).
- **E2.** The return beats key on `chapter.completed`, which only the JS build has. Options:
  - (a) the variant tables exist in both builds, PARITY-compared, but only JS selects
    `lines_below`;
  - (b) a never-set `below` flag in Python.

  Recommend (a).
- **E3.** The terminal `logs` slot (phase 2c) is a shell change to the toast. The owner is
  game-feel-engineer.
- **E4.** Hoisting function strings into `STORY` touches function bodies in both builds. Does
  narrative-designer own it as text plumbing, or does the PM route it?
- **E5.** `campaign.js` dialog copy (B29, B39) is player-facing but not in the story-surface
  list. Who owns it?
- **E6.** `gemini's code.test.js:336` pins the old win message (B33). It must be edited
  together with the string.
