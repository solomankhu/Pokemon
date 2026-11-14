# Unified MONSTER TRAIL Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [x]`) syntax for tracking.

**Goal:** Deliver one browser campaign with three authored underground floors and safe return to the RPG with shared progress.

**Architecture:** MONSTER TRAIL hosts the horror chapter in a disposable full-window iframe. A pure campaign module normalizes save metadata and chapter messages. Each underground floor owns geometry used consistently by simulation, navigation, rendering, and the map panel.

**Tech Stack:** Existing Canvas 2D, JavaScript, three.js r128 vendored locally, localStorage, Node test scripts, Python/pygame parity suite.

**Spec:** `docs/superpowers/specs/2026-10-17-unified-monster-trail-design.md`

## Global Constraints

- One browser window; MONSTER TRAIL is the main entry and identity.
- Preserve RPG inventory, monsters, world edits, position, and old saves.
- Three authored floors: Intake, Archives, Signal Core; 3/5/7 terminals.
- Stage checkpoints resume at stage start, not a transient simulation state.
- Honor reduced motion; support keyboard and touch.
- Keep existing standalone horror play and Python RPG tests passing.
- Preserve at least 1.4x ideal-route oxygen margin; check 25% detours and refill routes.
- This workspace has no Git repository: use timestamped source backups inside the workspace before editing, and do not run Git commits or worktree commands.

## Review Focus

- Storage unavailable or full: preserve in-memory state and require an explicit continue-without-saving choice.
- Stale frame messages or repeated clicks: only the active frame can mutate chapter progress.
- Old/corrupt saves: preserve usable RPG data and fall back to the trail.
- Repeated enter/return: remove chapter listeners, audio, pointer lock, and rendering with the frame; reset RPG input.
- New geometry: player and enemy clearance, pulse line-of-sight, and route budgets must agree.

## File ownership and structure

- Create `campaign.js`: pure metadata and message validation plus browser campaign host, exposed for headless tests without booting a DOM.
- Create `campaign.test.js`: metadata, message, save, and host lifecycle tests.
- Modify `claude's monsters.html`: campaign save integration, victory/descent menu, update/input suspension, continue/resume prompt.
- Modify `gemini's code.html`: authored floor data, per-stage navigation and rendering, refuge, room HUD/map, embedded protocol and return menus, local dependency loader.
- Modify `gemini's code.test.js`: geometry-aware fixtures and room/refuge/route tests while retaining existing mechanics coverage.
- Modify `claude's monsters.test.js` only where campaign integration requires new assertions.
- Create `vendor/three-r128.min.js` and `vendor/three-LICENSE.txt`: pinned official runtime and license.
- Create `docs/unified-game-playtest.md`: verification results and any limits.

### Task 1: Campaign metadata and protocol

**Interfaces:** `normalizeChapter(raw, gymWon)` returns `{v:1, unlocked:boolean, completed:boolean, active:boolean, stage:1|2|3}`. `validateChapterMessage(data)` returns a normalized `{type, stage?}` or null. Envelope namespace is `monsterTrail.chapter`, version 1. Message types are ready, start, checkpoint, return, completed. Parent validates `event.source === activeFrame.contentWindow` and same origin for HTTP(S); local-file operation still requires exact source identity. A per-entry session token binds messages to the current descent.

- [x] Back up affected source and test files before editing.
- [x] Write failing Node tests for old saves, invalid versions/stages, gym unlock, explicit completion, invalid payloads, wrong source, and stale tokens.
- [x] Run `node campaign.test.js` and confirm failures are the missing module/interfaces.
- [x] Implement pure metadata/protocol functions in `campaign.js`; export to Node and browser.
- [x] Run `node campaign.test.js`; all tests pass.

### Task 2: Embedded campaign lifecycle and save integration

**Interfaces:** host exposes `enterChapter(stage)`, `returnToTrail(result)`, and `isChapterActive()`. Child start payload contains validated stage, sanitized lead summary, and session token. Checkpoint messages carry stage 1..3; completed is accepted only for an active chapter after final victory. Save adds `chapter` metadata under the existing RPG save record.

- [x] Add failing tests proving entry/return preserves RPG snapshots, completion persists, early return retains checkpoint, replay starts at 1, new game resets chapter state, and corrupt metadata preserves RPG state.
- [x] Add host tests for storage failure choices, frame readiness timeout, duplicate entry, stale messages, input reset, and frame removal on return.
- [x] Integrate save/load and post-victory DESCEND/RETURN TO TRAIL flow; add persistent descent access after gym victory and CONTINUE resume/trail choices.
- [x] Suspend RPG updates, sounds, and input while embedded; implement transition/loading/retry/return UI and memory-only save handling.
- [x] Add child ready/start/checkpoint/return/completed messages and embedded return buttons in pause/death/victory. Preserve standalone menus. Parent validates completion against its chapter session; child emits completion only on final won state.
- [x] Vendor official three.js r128 and its license; load locally first, keeping a clear retry/return failure panel.
- [x] Run `node campaign.test.js`, `node "claude's monsters.test.js"`, and `node "gemini's code.test.js"`; all pass before proceeding.

### Task 3: Three authored floors and simulation geometry

**Interfaces:** each `stageConfigs[n]` owns `walls`, `rooms`, `refuge`, and `exit` in addition to current entities. `getNav(stageNum=1)` caches that stage's grid. `roomAt(stageNum,x,z)` returns the current room descriptor or null; `inRefuge(stageNum,x,z)` returns boolean. Simulation retains `sim.nav` and uses `sim.cfg.walls` for movement, sightlines, pulse, and navigation.

- [x] Write failing tests for distinct floor geometry, connected room loops, reachable terminals/stations/exits, clear player/enemy spawns, refuge exclusion, and protected resource counters.
- [x] Author original Intake, Archives, and Signal Core room coordinates inside existing bounds, with SPAWN in the protected arrival room and all required terminals outside it.
- [x] Replace global-wall assumptions throughout simulation with stage-owned geometry; preserve collision radius and enemy path clearance.
- [x] Enforce refuge protection from enemy entry/contact/drains and ambient oxygen/sanity loss, including pulse knockback boundary cases.
- [x] Adapt existing mechanics tests to explicitly use the relevant stage geometry; retain collision fuzzing and pursuit coverage rather than deleting failing checks.
- [x] Compute radius-aware routes for all floors, ideal-route oxygen margin >=1.4, a 25% detour, and a station-refill route. Tune station placement or oxygen drain only if these checks require it; document before/after numbers.
- [x] Run `node "gemini's code.test.js"`; all mechanics and new layout tests pass.

### Task 4: Readable room presentation and floor plan

**Interfaces:** `buildStageView` consumes stage walls/rooms/exit; the HUD uses `roomAt`; paused FLOOR PLAN displays the current stage's room connectivity, objective states, and current room with no enemy tracking.

- [x] Add tests that rendered wall descriptors match collision geometry and plan labels/coordinates derive from stage data.
- [x] Render distinct room silhouettes, equipment, labels, lighting, refuge markings, and exit landmarks with bounded original geometry and shared materials where practical.
- [x] Add floor/current-room HUD and accessible pause-map panel, keyboard/touch close controls, and readable labels beyond color differences.
- [x] Verify repeated stage build/dispose cycles release per-stage assets using existing THREE stub leak checks.
- [x] Run `node "gemini's code.test.js"` and `node campaign.test.js`.

### Task 5: Campaign verification and launch

- [x] Run `.venv/Scripts/python.exe "claude's monsters.test.py"`, `node "claude's monsters.test.js"`, `node "gemini's code.test.js"`, and `node campaign.test.js`; record exact totals.
- [x] Use an available real-browser runner; if none is installed, inspect available local browser/Playwright tooling and set up a minimal runner within the workspace.
- [x] Playtest fresh/old save, gym unlock, defer descent, entry, stage checkpoint, pause/death/victory return, replay, refresh/resume, corrupt metadata, storage denial, and loading failure.
- [x] Test keyboard/touch isolation, door passage, both loop directions, refuge, floor-plan readability, reduced motion, and at least three enter/return cycles. Capture screenshots and console output.
- [x] Resolve reproducible failures and rerun affected checks. Document any verification that remains unavailable without claiming it passed.
- [x] Write launch instructions and evidence in `docs/unified-game-playtest.md`, then open the main browser game for the user.

## Execution recommendation

Use native execution in this session because campaign state, frame lifecycle, and stage geometry have tightly dependent interfaces. Keep one implementation owner; request a separate final review if available under the applicable workflow. Review the plan before product-code changes.
