---
description: Triage a game request into a lane and show the dispatch plan without executing it
argument-hint: "<request>"
---
Apply the `game-pm` skill's §1 triage and §2 routing to: `$ARGUMENTS`.

Output only:
- **Game(s)** and **lane** (FAST / STANDARD / DEEP), and which risky surface forced DEEP;
- **Steps**: owner agent, files it owns, whether it can run in parallel (disjoint files only);
- **Gates**: the exact `verify.js --only ...`, the reviewer, and the playtester `game`/`mode`/duty IDs;
- **Relevant lessons**: the FAILURE_PLAYBOOK rows whose `applies_to` matches.

Don't dispatch anything. Ask "go?" at the end.
