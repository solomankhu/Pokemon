---
name: capture-knowledge
description: The success side of the learning loop. Run after a STANDARD or DEEP task the reviewer PASSed, to record a reusable approach in docs/SOLUTIONS.md - or to bump the reuse count of an existing row the task built on. Three prose fields, one row, or an explicit not_reusable. Hands off to skill-evolution at 2 reuses.
---

# Capture knowledge

Run this when a non-trivial task passed review. The question is: **would the next similar
task go faster or safer if it knew how this one was done?**

## 1. Was a row reused?
If the worker's return or your brief cited `reuse-of #N` (or you can see the task
followed a row's reusable logic), increment that row's `Reuses` in `docs/SOLUTIONS.md`. If
`Reuses` is now **2**, run the `skill-evolution` skill for that row and its owner skill.

## 2. Is there a new pattern?
Write the three fields. If you can't fill all three with something specific, the answer
is `not_reusable`. Say so and stop.
- **Why it worked:** the mechanism, not "it was tested".
- **Reusable logic:** the shape another task could copy: the function seam, the test
  shape, the table layout.
- **What would have broken it:** the trap a future agent would fall into.

Then:
- **Owner skill:** the skill whose `learned/` folder it would eventually go in.
- Append the row with `Reuses` 0. Keep each field to one line and link the file:line
  instead of quoting code.

## 3. Don't duplicate
- If it's already in CLAUDE.md, a skill or a wiki page, don't add a row. At most, link to it.
- A failure-avoidance insight belongs in `reflect-and-learn`, not here.

## Output
End with one line: `CAPTURE: #N added` | `CAPTURE: #N reuses=K` | `CAPTURE: not_reusable`.
