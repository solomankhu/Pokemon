# Failure Playbook

> **Index and occurrence counter, not a content store.** Each row points at exactly one
> lesson file in [`docs/lessons/`](lessons/), and the prose lives there, once. This file
> makes recurring failure modes visible and countable. It is the state spine of the
> [`reflect-and-learn`](../.claude/skills/reflect-and-learn/SKILL.md) loop.
>
> **Counter rules**
> - The row key is the lesson's filename slug. Match it **exactly**, never by "it looks
>   similar". A new symptom with an old root cause is still the old key.
> - Occurrence 1: write the lesson file and add the row.
> - **Occurrence 2: escalate.** Propose a one-line CLAUDE.md rule and a
>   [`game-review-checklist`](../.claude/skills/game-review-checklist/SKILL.md) line. Both
>   point back to the lesson file and never restate it. The user locks the proposal.
>   Nothing is auto-locked.
> - If a rule fails again after it is locked, propose a **script check** (a test in a suite
>   or a check in `.claude/scripts/verify.js`). A check a script can perform should never be
>   an agent's job.
> - Only reflect-and-learn edits `Occurrences`.

## Failure modes

| # | Key (`docs/lessons/<key>.md`) | Symptom (one line; the lesson file has the detail) | Occurrences | Enforced by |
|---|---|---|---|---|
| 1 | `queue-append-not-splice` | new battle code appended steps instead of splicing, so a faint was narrated before the hit | 1 (pre-harness, CLAUDE.md) | CLAUDE.md "step queue" · checklist BATTLE |
| 2 | `encounter-only-on-comma` | `try_encounter` rolled only on `,`, so every `;` zone was silently dead | 1 (pre-harness, CLAUDE.md) | CLAUDE.md terrain glyphs · checklist DATA |
| 3 | `mixer-rate-assumed` | audio assumed 22050 Hz mono, so every sound played 4x fast | 1 (pre-harness, CLAUDE.md) | RENDER pass buffer-length check |
| 4 | `picked-ball-lawn` | a collected ball drew as `.`, which painted a lawn square in the cave | 1 (pre-harness, CLAUDE.md) | PARITY shell constants |
| 5 | `tool-import-path` | `emit_tables`/`balance_report` crash on a new sibling import (`combat/`) while the suites pass | 1 | verify.js `tables` check (caught it) |
| 6 | `verify-during-concurrent-edit` | a worker's gate went red then green because a sibling agent was mid-write to a file the suite loads | 1 | (none yet) - game-pm §3 parallel-dispatch note |
| 7 | `hook-rule-untested-branch` | a new hook detection rule shipped without tests for the branch that fires in practice, or for the gate clearing | 1 | (none yet) - reviewer checklist_proposal held for the user to lock |
| 8 | `pm-message-misrouted` | a mid-task message went to a sibling agent of the same type, which then misread its own ownership | 1 | (none yet) |
| 9 | `overlay-fixed-css-px` | a DOM overlay over the canvas used fixed CSS px, so it covered the foe HP box on a scaled-down (touch-portrait) canvas | 1 | (none yet) - reviewer checklist_proposal held for the user to lock |
| 10 | `state-seed-cross-game-compare` | a new roll seeded from game state (position/steps) made an existing two-Game transcript comparison differ, and the spec's declared test-change list missed it | 1 | (none yet) |
| 11 | `port-skips-integration-test` | a cross-build port copied the unit tests but not the real-input → queue → outcome test (the JS catch keep() re-entry was untested) | 1 | (none yet) |
| 12 | `shared-fixed-temp-path` | PARITY's fixed temp script `%TEMP%\monster-trail-parity.js` was deleted by a concurrent suite run, so a false py FAIL appeared and went green on re-run | 1 | PARITY uses `tempfile.mkstemp` per run (confirmed 2026-11-14) |
| 13 | `webcam-real-vs-command-time` | a webcam back-date offset added to commandInput `at` was in real seconds, not command time (x0.55), so it was 1.8x too early | 1 | (none yet) - integration test pins `at` = hold x LAG_SCALE |

Rows 1-4 seed the table from bugs CLAUDE.md already records. They have no lesson file
yet; reflect-and-learn writes one the first time a row recurs.
