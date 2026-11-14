---
description: Harness status - verify freshness, progress, playbook escalations, doc drift
allowed-tools: Bash(node .claude/scripts/wiki-sync.js:*), Read
---
Show a compact status:
1. `.claude/state/last-verify.json`: when, GREEN/RED, and the per-check counts.
   Compare against the game files' modification times and say whether it is stale.
2. `docs/handoffs/PROGRESS.md` `## Next`.
3. `docs/FAILURE_PLAYBOOK.md`: the rows with occurrences ≥ 2, and any PROPOSED rule
   awaiting the user's lock.
4. `docs/SOLUTIONS.md`: the rows with reuses ≥ 1, and any at 2 that are due for
   skill-evolution.
5. `node .claude/scripts/wiki-sync.js --summary`.

Keep it to one short section each. Don't run the test suites; say "run /verify" if
they're stale.
