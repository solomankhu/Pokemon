---
key: verify-during-concurrent-edit
first_seen: 2026-10-17
occurrences: 1
applies_to: [".claude/scripts/verify.js", "combat/*", "claude's monsters.html"]
---
**Symptom:** a worker's `verify.js` run showed `combat` FAIL (`TINT_EMISSIVE is not defined` in combat/models.js), and a re-run seconds later passed.
**Root cause:** the gate ran while a *sibling* agent was half-way through writing a file the suite loads. The PM dispatched two workers whose own files were disjoint but whose **test inputs overlap**: the chore's `combat` check reads combat/*, which the 3D-impact agent was editing.
**Caught by:** the worker noticed the transient. It was misattributed to the parallel session; it was really our own sibling agent.
**Rule:** disjoint *edit* sets aren't enough for parallel dispatch. A worker whose verification reads files another worker is editing must verify only its own checks (`--only`), or verify after the sibling finishes. The PM runs the full gate only once every worker in the wave has returned.
**Why:** a red-then-green caused by a race is a false failure. It pollutes `verify-history.jsonl` (and so fires a spurious REFLECT-DUE), and it trains agents to ignore red.
**How to apply:** in game-pm §3, check that each parallel worker's verification inputs are disjoint from every other worker's edit set. Otherwise narrow `--only`, or run the workers in sequence.

## Casebook
- 2026-10-17: the harness chore (verify `combat`) ran in parallel with the 3D-impact feel agent (editing combat/models.js). The transient red passed on re-run.
