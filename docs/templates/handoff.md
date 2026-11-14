# Handoff

Write a handoff to `docs/handoffs/YYYY-MM-DD-<slug>.md` whenever work stops part-way: a
context limit, a blocked decision, or the end of a session. It is incomplete if another
agent couldn't continue from it alone. Then update the `## Next` list in
[`../handoffs/PROGRESS.md`](../handoffs/PROGRESS.md). The SessionStart hook injects that
list into every new session.

```markdown
# <slug> - handoff YYYY-MM-DD

## Goal
The user's ask, verbatim if short.

## Done
- file - what changed (verified? paste the verify line)

## In progress / not done
- exact next step, with file and function names

## Decisions made (and by whom)
- decision - user / PM / agent, and why

## Open decisions for the user
- question - the options

## Verify state
Paste the last `node .claude/scripts/verify.js` summary.

## Traps
Anything the next agent will trip on: a half-edited file, a failing test you saw, a stale doc.
```
