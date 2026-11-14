---
name: reflect-and-learn
description: The failure side of the learning loop. Run after a task when the reviewer returned NEEDS_REVISION or FAIL, when a file went through more than one fix cycle, when verify.js went red then green within the task, or when the user corrected the work. Writes a short reflection, records it under one exact lesson key in docs/FAILURE_PLAYBOOK.md, and proposes a rule at the 2nd occurrence. Silent on a clean first-pass PASS.
---

# Reflect and learn

## 0. Self-gate (decide in one line)
Run this skill only if at least one of these holds:
- the reviewer returned `NEEDS_REVISION` or `FAIL` (any round);
- a file needed more than one fix cycle;
- `verify.js` was red and then green inside this task;
- the user corrected the result or the approach;
- the playtester returned FAIL.

Otherwise say `REFLECT: not needed (clean pass)` and stop. **Never** write a lesson for a
clean pass, because noise in the playbook hides the real patterns.

## 1. Reflection (6 lines, in your reply, not a file)
```
REQUESTED: what the user asked
CHANGED:   what shipped (files)
CAUGHT:    what went wrong first, and which gate caught it (test name / reviewer issue / playtest duty / the user)
ROOT CAUSE: one checkable sentence (not "was careless")
GATE GAP:  why the earliest gate didn't catch it (or "earliest gate did catch it")
NEW RULE?: one line, or "none - covered by <existing key>"
```
If **CAUGHT** is "the user", that is the worst case. Gate gap is mandatory, and the
proposal in step 3 should be a script check.

## 2. Record it under exactly one key
1. Read `docs/FAILURE_PLAYBOOK.md`. Look for a row whose **root cause** is the same. The
   symptom may differ. Matching is on the key the row names, decided by root cause, never
   by fuzzy wording.
2. **Existing key:**
   - increment `Occurrences` in the row;
   - increment `occurrences` in `docs/lessons/<key>.md`;
   - add one casebook line (date, what was built, which brief missed it).
   - If the row is a pre-harness seed with no lesson file, create the file now.
3. **New key:**
   - pick a kebab slug that names the root cause, not the symptom;
   - write `docs/lessons/<key>.md` from the template in `docs/lessons/README.md`, with
     `applies_to` globs (required: agents use them to find the lesson);
   - append a row with `Occurrences` 1 and `Enforced by` "(none yet)".

## 3. Escalate on the 2nd occurrence
When `Occurrences` reaches **2**, propose two things, both pointing back to
`docs/lessons/<key>.md`:
- a one-line **CLAUDE.md** rule, in the section where the code lives;
- a **checklist line** in `.claude/skills/game-review-checklist/SKILL.md`, tagged
  `(lesson: <key>)`.

Show both to the user as a proposal. **Don't apply them until the user says to lock
them.** When they're locked, set the row's `Enforced by` to name them.

If the row is already locked and it recurs, the rule didn't work. Propose a **script
check** instead:
- a test in the relevant suite section;
- or a check in `.claude/scripts/verify.js`.

A check a script can do should never be an agent's job.

## 4. Memory routing
- A fact about how one agent should work (its brief was missing X) goes in that agent's
  memory (`.claude/agent-memory/<agent>/`), and the PM's brief template goes in
  `docs/templates/task-brief.md`.
- A fact about the user's preferences goes in the main session's user memory.
- A fact about the codebase that is simply missing from the docs goes to `wiki-sync`, not
  to a lesson.

## Output
End with one line: `REFLECT: <key> occurrences=N [ESCALATION PROPOSED]` or
`REFLECT: not needed (clean pass)`.
The Stop hook accepts that line, or the `LOOP:` line, as the loop being closed.
