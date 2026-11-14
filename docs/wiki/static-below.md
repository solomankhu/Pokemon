---
title: THE STATIC BELOW
sources: ["gemini's code.html", "gemini's code.test.js"]
synced: 2026-10-17
---
# THE STATIC BELOW

This is MONSTER TRAIL's underground chapter, a single inline script in `gemini's code.html`.
The canonical detail is in CLAUDE.md, under "Architecture: gemini's code.html".

- **SIM** (pure, testable headless): `stageConfigs`, `moveBox`, the nav grid and flow
  field, `createSim`/`stepSim`, `sim.events`.
- **SHELL** (three.js r128 vendored, WebAudio, DOM): `setupStage`, `clearEntities`,
  `makeAssets`, `animate()` with a fixed `SIM_STEP = 1/60` accumulator and render
  interpolation.
- **Debug seams** for playtests: `__STATIC__.debug` (`play`, `setupStage`, `press`,
  `release`, `overhead`, `state`).
- **Rules:**
  - rates are per tick;
  - cosmetic timing is in seconds, in the shell;
  - the file stays pure ASCII (the PostToolUse hook checks);
  - handoff text uses `textContent` only;
  - difficulty margins shrink each floor and stay ≥ 1.4x.
- **Owners:**
  - game-feel-engineer: shell, loop, touch;
  - sandbox-designer: floor geometry and voxel work;
  - the PM: lifecycle changes (DEEP).
- **Tests:** `node "gemini's code.test.js"` (361 checks). Browser duties are in
  [../playtests/static-below.md](../playtests/static-below.md).
