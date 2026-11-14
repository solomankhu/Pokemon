---
description: Dispatch the playtester agent against a duty spec
argument-hint: "<monster-trail|static-below|campaign> [smoke|duty|full] [duty IDs...]"
---
Dispatch the **playtester** agent (Agent tool, `subagent_type: playtester`) with:
- `game`: the first word of `$ARGUMENTS` (default `monster-trail`);
- `mode`: the second word (default `smoke`);
- `duties`: any remaining IDs (e.g. `MT-04 MT-10`);
- `focus`: what changed recently, if this conversation shows it.

When it returns, save its report verbatim to `docs/playtests/runs/YYYY-MM-DD-<game>-<mode>.md`, then relay its result table, its CONSOLE and SUSPECT lines, and that
path, without rewording them. Any FAIL makes the run a FAIL, and BLOCKED is reported as
BLOCKED.
