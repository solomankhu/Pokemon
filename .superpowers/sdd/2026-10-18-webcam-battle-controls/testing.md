---
title: Testing
sources: ["claude's monsters.test.py", "claude's monsters.test.js", "gemini's code.test.js", "campaign.test.js", ".claude/scripts/verify.js", "combat"]
synced: 2026-10-17
---
# Testing

**One command:** `node .claude/scripts/verify.js`, or `--auto` to run only what
changed. **Any FAIL makes the run a FAIL.**

| Check | Command it runs | Proves | Count (2026-10-17) |
|---|---|---|---|
| `py` | `.venv/Scripts/python.exe "claude's monsters.test.py"` | MAP, ENGINE, 200 battles, WORLD and save, SANDBOX, CAVE, RENDER (headless pygame), **PARITY** vs the HTML build | 4874 |
| `js` | `node "claude's monsters.test.js"` | the HTML port's MAP, ENGINE, BATTLE, WORLD, SANDBOX, SHELL JUICE (no pixels) | 3331 |
| `gemini` | `node "gemini's code.test.js"` | stage placement and reachability, per-tick rates, collision fuzz, nav, pulse, the difficulty readout, input math, handoff parsing, dispose leaks | 554 |
| `campaign` | `node campaign.test.js` | the campaign reducer, the message validation, the save round-trip | 8 groups |
| `combat` | `node combat/verify.cjs` | arenas, commands, effects, models, recipes, host, presenter, engine-regression, integration | 9 suites |
| `combatpy` | `combat/commands_py_test.py` | the Python command judgment matches JS | 19 tests |
| `hooks` | `node .claude/hooks/hooks.test.js` | the harness hooks | 70 |
| `tables` | `emit_tables.py` (dry run) | the HTML generated tables equal the Python ones | "already match" |

The Python suite takes about 75 s; the others take seconds.

`node combat/browser-playtest.cjs` covers live 3D rendering, touch commands, focus loss, context loss, regional arenas, lifecycle scenes, 20 battle entries and three campaign returns. The campaign browser scripts cover chapter experience and audio cleanup. Human playtesting still matters for:
- HTML drawing and touch layout;
- three.js rendering;
- real input timing;
- audio lifecycle in a real browser.

See [../playtests/](../playtests/README.md). For pygame visuals,
`MT_FRAME_DIR=<dir>` dumps about 40 frames.

**Rules:**
- Never pipe a suite into `tail`/`head`/`grep`, because it masks the exit code. The
  PreToolUse hook warns about this.
- Never weaken a test to go green. The reviewer treats that as CRITICAL.
- A new mechanic gets checks in **both** suites, plus a PARITY comparison when it
  computes shared output.

