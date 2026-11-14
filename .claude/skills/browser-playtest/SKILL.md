---
name: browser-playtest
description: Open one of the HTML games in a real browser with the Playwright MCP tools, play it with key presses or clicks, take screenshots and read console errors. Use to verify any visual, feel, input or loop change to claude's monsters.html or gemini's code.html.
---

# Browser playtest

> This is the tool how-to. *What* to check per game lives in the duty specs,
> `docs/playtests/<game>.md`, and formal sign-off is the **playtester** agent's job.

The tools are `mcp__plugin_playwright_playwright__browser_*`. Load them with ToolSearch (`select:` the names) before calling them.

**Playwright blocks `file://` URLs here.** Serve the folder first and browse `http://127.0.0.1:8765/...` instead:
```bash
.venv/Scripts/python.exe -m http.server 8765 --bind 127.0.0.1 --directory E:/game   # run in the background; stop it when done
```
Screenshots and logs land in `E:\game\.playwright-mcp\`, which is scratch output, not part of the games.

## Targets
| Game | URL | Notes |
|---|---|---|
| MONSTER TRAIL | `http://127.0.0.1:8765/claude's%20monsters.html` | Fully offline. Z/Enter confirms, X/Esc cancels, arrows move, Shift runs. Saves go to `localStorage`, so clear it for a fresh run: `browser_evaluate` → `localStorage.clear()`. |
| THE STATIC BELOW | `http://127.0.0.1:8765/gemini's%20code.html` | three.js r128 loads from `vendor/` (CDN only as a fallback), so it works offline. Pointer lock fails under automation, so use `__STATIC__.debug.play()` and drive it with `debug.press`/`release`; read `debug.state` / `debug.sim`. A click fires a pulse. |

## Loop
1. `browser_navigate` to the target, then `browser_take_screenshot` to see the start state.
2. `browser_console_messages`: any error is a finding. Check again after every interaction burst.
3. Drive it: `browser_press_key` (e.g. `z`, `ArrowUp`) for keyboard games. For holds or sequences, use `browser_evaluate` to dispatch `keydown`/`keyup` with a delay, or `browser_run_code_unsafe` for a scripted run.
4. For MONSTER TRAIL, read state rather than guess: `browser_evaluate` → `__GAME__.G.mode`, `__GAME__.G.player`, `__GAME__.G.battle`. The seams (`startBattle`, `takeTurn`, `healParty`) can jump straight to the scene under test, e.g. start a battle and take a turn to screenshot a hit effect.
5. Screenshot the exact moment that matters (mid-shake, the catch, the evolution) and describe what's visible. Don't claim a visual result you didn't see.
6. `browser_close` when done.

## Report
For each check: what you did, what you saw (screenshot), console errors (or "none"), and pass or fail. If something only reproduces at certain timings, say so.
