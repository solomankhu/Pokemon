# Duty spec: unified campaign (descent and return)

Owner modules: `campaign.js` (lifecycle and messages), with both HTML games embedded.
The detailed scenario list is in [../unified-game-playtest.md](../unified-game-playtest.md).
This spec only says which scenarios to run.

| ID | Tag | Duty | How | Assert |
|---|---|---|---|---|
| CP-01 | [smoke] | Fresh game is locked | load MONSTER TRAIL fresh | there is no DESCEND option before the gym flag |
| CP-02 | [smoke] | Descend and return | seam: set the gym flag; DESCEND; RETURN TO TRAIL | same window; RPG state is identical before and after (party, position, flags) |
| CP-03 | | Checkpoint resume | reach floor 2, reload, CONTINUE | resumes at the start of floor 2 |
| CP-04 | | Spoofed message | `postMessage` from a wrong source or session | ignored; state unchanged |
| CP-05 | | Audio closes on return | return through both paths | 0 open child AudioContexts |

Full mode runs these, in order:

```bash
node .superpowers/sdd/2026-10-17-unified-monster-trail/browser/smoke.cjs
node .superpowers/sdd/2026-10-17-unified-monster-trail/browser/campaign-flow.cjs       # 12 scenarios
node .superpowers/sdd/2026-10-17-unified-monster-trail/browser/chapter-experience.cjs  # 8 scenarios
node .superpowers/sdd/2026-10-17-unified-monster-trail/browser/audio-lifecycle.cjs
```

`runtime.cjs` hard-codes a Playwright path in the npx cache. If that path is gone, report
the run as BLOCKED, not FAIL, and fall back to the MCP duty cycle.
