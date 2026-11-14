---
description: Dispatch game-reviewer on the current change and act on its JSON verdict
argument-hint: "[what changed / brief, optional] [round 1|2]"
---
Dispatch **game-reviewer** (`subagent_type: game-reviewer`). Give it:
- the change under review: `$ARGUMENTS`, or what this conversation changed, with the
  file list;
- the original acceptance criteria;
- the worker's CHANGED/TESTS/VERIFY return, if there was one;
- `round: 1` unless stated.

Then follow game-pm §4 for the verdict:

| Verdict | Action |
|---|---|
| `PASS` | report it |
| `NEEDS_REVISION` | list the issues and send them to the owning agent (round 2) |
| `FAIL`, or a second round that still doesn't pass | escalate one lane, or ask the user with the reviewer's `escalate` decision |

If the verdict was not a first-round PASS, run `reflect-and-learn` afterwards.
