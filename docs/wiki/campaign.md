---
title: Unified campaign
sources: ["campaign.js", "campaign.test.js"]
synced: 2026-10-17
---
# Unified campaign (`campaign.js`)

`campaign.js` joins the two games. The RPG page stays loaded but paused, and the chapter
runs in a frame. The canonical detail is in CLAUDE.md under "Unified browser campaign",
and the shipped behaviour and evidence are in
[../unified-game-playtest.md](../unified-game-playtest.md).

- **Protocol:** messages are validated by source, origin and session; only the active
  frame updates the campaign. Readiness, stage checkpoints, completion and return are the
  message kinds.
- **Saves:** the browser save keeps the full RPG state plus chapter metadata. Old saves
  infer the unlock from the gym flag. Checkpoints resume at the start of a floor. Python
  saves are separate.
- **Every change here is DEEP lane** (a risky surface): plan-with-review, then
  `verify.js` (`campaign`, `js`, `gemini`), then playtester `game: campaign`, `mode: full`.
- **Tests:** `node campaign.test.js` (8 groups), plus the Chromium scripts listed in
  [../playtests/campaign.md](../playtests/campaign.md).
