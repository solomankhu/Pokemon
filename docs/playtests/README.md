# Playtest duty specs

The [`playtester`](../../.claude/agents/playtester.md) agent is **one parameterised agent**
(`game: monster-trail | static-below | campaign`, `mode: smoke | duty | full`). What it
checks lives here as data, so adding a check means editing a spec, not the agent.

| Spec | Game |
|---|---|
| [monster-trail.md](monster-trail.md) | `claude's monsters.html` (and the pygame build through its RENDER frame dump) |
| [static-below.md](static-below.md) | `gemini's code.html` standalone |
| [campaign.md](campaign.md) | the descent and return across both files |

## Duty cycle (every duty, every game)
1. **Load:** navigate, wait for ready, and read the console. Any error is a FAIL.
2. **Input:** drive it through real keys or touch where the duty says *input*, and through
   debug seams (`__GAME__`, `__STATIC__.debug`) only where it says *seam*.
3. **Snapshot before and after:** read state with `browser_evaluate`, then screenshot the
   moment that matters.
4. **State check:** the duty's assertion on the state you read. Don't judge it from the pixels.
5. **Console zero:** read the console again. A new error is a FAIL, even if the duty passed.

## Roll-up
Any FAIL makes the run a FAIL. Results are never averaged. A duty that couldn't run
(tooling broken, port busy) is **BLOCKED**, not PASS. Report each duty as
`ID · PASS|FAIL|BLOCKED · what you saw · screenshot path`.

## Modes
- `smoke`: the duties tagged `[smoke]` only (about 1 minute).
- `duty`: the duties the brief names, plus the smoke duties.
- `full`: every duty, plus the scripted Chromium suites listed in each spec.

## Server
Playwright blocks `file://`, so serve the folder first:

```powershell
.\.venv\Scripts\python.exe -m http.server 8765 --bind 127.0.0.1 --directory E:/game
```

Run it in the background and stop it when done. The scripted suites under
`.superpowers/sdd/2026-10-17-unified-monster-trail/browser/*.cjs` use the same port.
