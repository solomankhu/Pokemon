# MONSTER TRAIL

Double-click **Play Monster Trail.vbs** to play in a dedicated Chrome or Edge window. Keep the launcher, both HTML files, `campaign.js`, `combat/`, and `vendor/` together. You can also open **claude's monsters.html** directly in a browser. No installation, server, or internet connection is needed for the browser game.

## Controls

- Trail: arrows/WASD to move, Z/Enter to confirm, X/Esc to cancel or open the menu, Shift to run.
- Underground: WASD to move, mouse to look, F for the light, click to pulse, Space for the jammer, Shift to sprint, Esc to pause.
- Touch controls are available. Battle SETTINGS offers basic 2D presentation, reduced motion, action-command assistance, and optional webcam input.

Beat LEADER VOLT to unlock the three-floor underground chapter. You can return to the trail from the underground pause menu. Unfinished floors resume from a checkpoint.

## Saves

Use SAVE from the trail menu. Starting over with an existing save asks KEEP SAVE / START NEW; KEEP SAVE is selected by default. Browser progress belongs to the browser profile and game location. Use the same browser/profile and keep the folder in the same location to continue. Clearing browser site data removes browser saves. The standalone Python game has a separate save.

## Optional Python game

From this folder, run:

```powershell
.\.venv\Scripts\python.exe "claude's monsters.py"
```

The Python game is the standalone trail RPG; the combined underground campaign is in the browser version.

## Verification

Run `node .claude/scripts/verify.js` for the full automated gate. See [the release-readiness report](docs/playtests/runs/2026-10-18-release-readiness.md) for tested flows and remaining manual checks.
