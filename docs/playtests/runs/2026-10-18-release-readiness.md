# MONSTER TRAIL release readiness

Date: 2026-10-18. Scope: the combined browser campaign and standalone Python RPG in this folder.

## Checks

- Browser controls/presentation: 20 Chromium scenarios passed; continuation features: 13 groups passed. No page or console errors. Temporary browser profiles and fake camera devices only.
- Campaign: 12 scenarios passed, including save/reload, storage denial, loading recovery and direct file operation.
- Underground experience: 8 scenarios passed, including all three floors, completion, replay and phone controls/layouts. Both audio-return paths close chapter audio and resume trail audio.
- Offline: a fresh browser context with network disabled loaded the main game and underground chapter from disk, with zero HTTP requests and zero page errors.
- Python: the real main loop initialized on SDL dummy drivers and exited through a QUIT event with exit code 0.
- Launcher: registered Chrome and Edge executables exist; the launcher quotes the game path correctly. All ten local script dependencies and vendored THREE r128 are present.

Browser campaign objective tests use the exposed simulation seams, combined with real keyboard/touch and collision/navigation tests. These are automated playtests, not a claim of a human completing every encounter manually. The normal browser profile and its saves were not opened or changed.

## Release repair

The audit reproduced an existing save-loss path: one confirm at the title could overwrite prior browser progress. Both builds now offer KEEP SAVE / START NEW before resetting an existing game, defaulting to KEEP SAVE. Cancelling preserves the stored save. A failed CONTINUE reports failure and preserves the save instead of starting a new game.

Campaign browser fixtures were updated for the `gymBonus` default and explicit new-game confirmation. The test expectations continue to require saved party/chapter progress to survive.

## Manual checks

Real-camera responsiveness and microphone-free room conditions were not tested with the user's hardware. Webcam automation used fake video only. The Windows launcher command and prerequisites were inspected without opening the user's normal Chrome/Edge profile. A visible launcher/fullscreen check and personal playtesting remain useful hardware checks.

See [the player guide](../../../README.md) for launch, controls and save-location guidance.

## Final verification

`node .claude/scripts/verify.js` exited 0 after the last code edit: all 8 checks pass. Python 5319 checks; browser RPG 3703; underground 554; campaign 8 groups; all combat suites; Python commands 19; harness hooks 70; emitted-table parity OK. Log: `.superpowers/sdd/2026-10-18-resume/release-verify.txt`.

The save regression tests first reproduced five failures in each build, then passed after the fix. A real pygame event-loop regression also verifies that Escape closes confirmation and leaves the application running until QUIT, preserving exact save bytes.

Status: ready to play in the current workspace. No confirmed software blocker remains in the completed automated/read-only readiness checks; hardware/manual checks above remain explicitly unverified.

Independent final save-safety review: clear, no confirmed blockers. Reviewed both builds, touch input routing, failed CONTINUE, explicit reset, byte-preservation tests and real pygame cancel dispatch.
