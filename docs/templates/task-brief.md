# Task brief (PM to worker)

Every Agent dispatch uses this shape, because the worker starts cold. A brief another
agent couldn't start from is incomplete.

```markdown
## Context
Why this task exists, in 2-4 lines. Link the spec or issue.
Lane: FAST | STANDARD | DEEP   (from game-pm §1)

## Deliverable
What exists afterwards: the mechanic, table rows, tests, a screenshot.

## Acceptance criteria
- [ ] each criterion is checkable by a test, a number or a screenshot
- [ ] lands in BOTH MONSTER TRAIL builds (if it touches the RPG)
- [ ] `node .claude/scripts/verify.js` is green
- [ ] no existing assertion removed: diff each edited test file's removed lines against the backup / `git diff` (lesson: edit-anchor-drops-assertion)

## Files you own (edit only these)
- path ... (no other agent is editing these right now)

## References
- CLAUDE.md sections that bite here
- docs/wiki/<page>.md, docs/lessons/<key>.md (from the FAILURE_PLAYBOOK rows whose applies_to matches)
- docs/SOLUTIONS.md #N, if it's a reuse candidate

## Constraints
`def_` · layers 1-3 import-safe · no assets · no global random for gameplay or cosmetics ·
step queue via q_* helpers · MAP never mutated · ASCII-only gemini file · 640x480 layout

## Verification command
node .claude/scripts/verify.js --only <py,js,gemini,campaign,tables>

## Return format
CHANGED (n files): path - one line each
TESTS: added/changed checks
VERIFY: paste the verify summary lines
ESCALATE: <a decision you were not entitled to make>, or "none"
HANDOFF / WORKFLOW FEEDBACK: what this brief was missing, or "none"
```
