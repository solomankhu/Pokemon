# One browser game: MONSTER TRAIL

## Intent and success criteria

The user wants one browser game: start in MONSTER TRAIL, descend into THE STATIC BELOW, and return with shared progress in the same window. MONSTER TRAIL is the main game and identity. Players must never need to open a second file or browser tab during this journey.

## Approach

Keep `claude's monsters.html` as the main entry page. Run `gemini's code.html` in a full-window, same-origin embedded chapter when descending. The parent remains loaded with its RPG state intact. This avoids combining two large inline scripts with conflicting globals, DOM IDs, input listeners, and rendering loops.

Alternatives considered: navigating between pages preserves separate runtimes but interrupts the continuous game experience; merging both rendering engines into one script creates unnecessary coupling. An embedded chapter provides the requested continuous experience with clear ownership.

The browser build owns this feature. Python remains a playable version of the RPG; shared data and existing parity checks must keep passing. This project does not port the 3D engine to pygame.

## Player journey

1. Start or continue MONSTER TRAIL normally.
2. Defeating LEADER VOLT unlocks the descent. After victory, offer DESCEND or RETURN TO TRAIL. A persistent post-victory menu option allows descent later without altering the world map.
3. Before entering, save the RPG state and record the current return location. Explain that the monsters wait above while the player follows the signal.
4. Show a reduced-motion-safe transition and load THE STATIC BELOW within the same page. Display its controls before play.
5. Offer RETURN TO TRAIL in the horror pause, death, and victory screens. Returning exits pointer lock, stops chapter audio and animation, removes its frame, and resumes MONSTER TRAIL at the saved return location with input reset.
6. Clearing all three stages records chapter completion. Show a completion message on return, persist it, and permit replay from the descent menu. Completion grants no new creature, item, or balance change.

## Shared progress and checkpoints

MONSTER TRAIL owns the campaign save. Preserve party stats and HP, balls, trainer and gym flags, picked items, mining edits, materials, cave state, and player position. Add a versioned chapter record for unlocked/completed status, active chapter, and next playable stage.

Checkpoint at horror chapter entry and each stage transition. A checkpoint resumes at the beginning of its recorded stage with normal starting resources; it does not serialize every enemy or transient effect. Returning early retains that checkpoint. Completing the chapter clears its active checkpoint and records completion. Replaying starts at stage 1 without clearing prior completion.

CONTINUE restores the campaign and offers to resume an unfinished descent or return to the trail. Old saves default to no chapter progress and infer unlock from the existing gym flag. NEW GAME clears campaign chapter progress after the existing new-game confirmation behavior. Settings remain independent.

## Chapter interface and lifecycle

Use a small versioned parent/frame message protocol: ready, start with a sanitized lead-monster summary and checkpoint, stage checkpoint, return, and completed. Validate message source against the actual chapter frame, message type and payload bounds. Use same-origin checks for served pages; support local-file operation through source-identity validation without trusting arbitrary window messages. Insert names as text.

Suspend the RPG update, sound, and keyboard/touch handlers while the chapter is active. Restore them on return and clear held inputs. Only an active embedded chapter can send completion. The horror page remains standalone when opened directly, using its existing menus and settings.

## Loading and failure recovery

Vendor the existing pinned three.js r128 runtime locally with its license, avoiding the CDN failures recorded in browser logs. Both local files and locally served pages must load the chapter. A loading error offers retry and return to the trail. A timeout or missing readiness message must also permit return.

If persistent storage is unavailable, retain campaign progress in memory and clearly report that it could not be saved. Do not enter the chapter after a failed save without giving the player an explicit continue-without-saving choice. Corrupt or unsupported chapter metadata falls back to the trail with existing RPG progress preserved.

## Verification

Run all three existing suites: Python RPG, JavaScript RPG, and horror simulation. Add focused tests for backward-compatible campaign metadata, unlock gating, checkpoint validation, source validation, completion, replay, and return preserving RPG state. Verify in a real browser: new game, existing save, victory unlock, deferred descent, stage checkpoint, pause return, death return, victory return, refresh and resume, loading failure recovery, and keyboard/touch input isolation. Check console errors and that repeated enter/return cycles leave one active game loop and no chapter sound after exit. If browser automation is unavailable, report the missing verification explicitly.

## Scope boundary

This combines the existing adventures into one campaign. Creature battles stay in the RPG and first-person horror stays below. A new shared combat system, new monsters, multiplayer, full mid-frame horror saves, and Python/3D integration are outside this change.

## Research-led room and map revision (2026-10-17)

The user additionally requested internet research, analysis, brainstorming, then implementation. This section proposes the room/map scope for review alongside the campaign design above.

### Findings and application

- The Level Design Book's critical-path guidance distinguishes the intended completion route from actual exploration. Mark spawn, objectives, exit, and optional branches explicitly; validate resource budgets against detours as well as an ideal route. Source: https://book.leveldesignbook.com/process/layout/criticalpath
- Its typology guide describes hub-and-spoke, loopbacks, corridors, and arenas. Use a compact arrival hub, connected objective rooms, and deliberate escape loops rather than repeated long barriers. These are patterns, not universal rules. Source: https://book.leveldesignbook.com/process/layout/typology
- In the developer interview about The Anacrusis, Chet Faliszek describes the original Director's alternating downtime and exciting encounters. Apply that pacing principle through protected arrival areas and separated encounter spaces; a new adaptive director is unnecessary for this scope. Source: https://www.unrealengine.com/developer-interviews/the-anacrusis-colorful-retro-futurism-delivers-left-4-dead-play-to-70s-outer-space?lang=en-US
- Frictional's indoor-level performance documentation is engine-specific. Treat it as background for controlling visible complexity, not as a performance guarantee for three.js. Measure the browser implementation itself. Source: https://wiki.frictionalgames.com/page/HPL3/SOMA/Level_Design/Indoor_Level_Performance

### Existing-map assessment

The current horror chapter uses a 60-by-80-unit enclosure with three horizontal interior barriers. All three stages share its geometry, with 3/5/7 terminals and different enemies and supply stations. Existing tests validate objective reachability, collision, navigation, and oxygen margins. The layout provides pursuit loops but lacks recognizable room identities and distinct stage layouts. Existing safeguards must carry forward when geometry changes.

### Recommended layout

Keep the MONSTER TRAIL overworld and its proven progression. Use the gym's post-victory descent option as the entrance to an underground signal facility.

The facility uses original authored room layouts, not downloaded or copied commercial maps. Implement three distinct compact floors inside the current outer bounds:

1. **Intake:** protected arrival vestibule -> central junction -> pump room and maintenance room -> signal control -> descent. Three terminal objectives introduce the mechanics. Connect the two wings behind the junction so a pursuing enemy cannot turn a required room into a single-exit trap.
2. **Archives:** protected arrival -> archive hub -> west records loop and east relay loop -> central monitoring room -> descent. Five terminals distribute objectives across the loops. Give the two wings different silhouettes and signs, with refill stations at the transition between routes.
3. **Signal Core:** protected arrival -> outer service ring -> two equipment rooms -> inner core -> surface-return lift. Seven terminals use the established mechanics. Obstacles break sightlines and the service ring supplies an escape route; no mandatory objective sits in an unmarked dead end.

Room identities use simple original geometry, readable text signs, equipment silhouettes, and lighting. Pair color with labels/shapes so navigation does not depend on color alone. Do not add imported art packs, procedural maze generation, new key puzzles, or extra floors.

### Mechanics and technical implications

- Stage data owns walls, room bounds/labels, objectives, supply stations, arrival refuge, and exit landmark. Rebuild navigation for each floor; collision, AI, line-of-sight, and rendering must consume that same stage geometry.
- Preserve existing player/enemy movement and pulse rules unless measured route budgets require resource tuning.
- Arrival refuge: a clearly marked room in which enemies cannot enter or drain the player, and oxygen/sanity do not decay. Required terminals remain outside it. Leaving begins normal danger; returning remains possible. No forced ambush breaks that rule.
- Existing automatic terminal activation and stage progression remain, with the exit landmark explaining the next descent. Avoid introducing a separate exit-unlock puzzle.
- Refill placement must permit both loop directions. Validate radius-aware reachability for the player and enemies, clear spawns, and routes to every required objective.
- Recalculate path/resource estimates per floor. Preserve at least the existing tested 1.4x ideal-route oxygen margin; separately simulate a 25% route detour and a refill route. This is a deterministic design check, not evidence that real players will find the layout easy.
- A floor-name/room-name HUD and a static floor-plan panel available while paused support orientation. The plan shows room connections, objectives, and the player's current room; it does not track enemies.

### Acceptance checks added

Verify each floor has distinct geometry, all terminals and stations are reachable with collision clearance, both planned loops connect, refuge protection works, no enemy spawns in the refuge, and resource-route budgets pass. Browser checks must confirm sign readability, floor-plan orientation, doorway passage, evasion loops, checkpoint resume, and returning to the RPG with the original campaign state preserved.

### Alternatives considered

Keeping the barrier map and adding signs is the smallest change but does not provide the requested room structure. Procedurally generated floors create navigation and pacing risks without advancing the combined-campaign goal. Three authored floors are the recommended middle ground.
