---
name: plan-with-review
description: For DEEP-lane game work (determinism, step queue, save format, campaign.js lifecycle, shared tables across builds, new mechanic in both builds, or 3+ files) - write a short plan, have two read-only reviewer personas (Gap Hunter, Risk) attack it in parallel, fix or defer every finding, and only then dispatch implementation. Skipped for plans touching at most 2 files with no risky surface.
---

# Plan with review

Use this in the main session (the PM) before dispatching DEEP work. It is cheaper to
catch a missing JS port or a save-format break in a 40-line plan than in 5000-line files.

## Skip test
Skip the review only if the plan touches **at most 2 files** and **none** of these risky
surfaces. Otherwise run it.
- engine rng or determinism;
- the battle step queue;
- the save or load format (`load_edits`, campaign saves);
- `campaign.js` messages or lifecycle;
- MAP geometry or reachability;
- tables shared across builds;
- the Static Below SIM per-tick rates.

## 1. Plan (≤ 40 lines), in `docs/plans/YYYY-MM-DD-<slug>.md`
- **Goal and acceptance criteria:** each one is checkable.
- **Files and owner agent:** the order, and which steps run in parallel because their
  file sets are disjoint.
- **Per file:** the functions or tables touched, and the build counterpart.
- **Tests:** which suite section gets which new checks.
- **Risks:** which invariant from the checklist could break, and how you'll know.
- **Verification:** the exact `verify.js --only ...` call, plus the playtest duties.

## 2. Review: two Explore agents in parallel (read-only)
Send each one the plan path and its persona prompt.

**Gap Hunter:** "Find what this plan forgets. Check the other build, the tests, the
emit_tables coverage, the save/load path, reduced motion, touch, the PARITY constants
list, and the docs/wiki pages that will go stale. Each finding:
`SEVERITY CRITICAL|GAP|MINOR / WHERE / ISSUE / WHY / EVIDENCE (path:line) / SUGGESTION`.
Cite file:line from the repo, or downgrade the finding to MINOR and mark it unverified.
An empty list is a valid answer."

**Risk:** "Find what this plan could break. Check determinism and the rng streams,
step-queue order, the save format and old saves, reachability and the trunk road, the
640x480 layout, the per-tick rates, and the campaign message validation. Each finding:
`SEVERITY CRITICAL|RISK|MINOR / WHERE / PROBLEM / BLAST RADIUS / EVIDENCE (path:line) /
SUGGESTION`. Cite file:line, or downgrade to MINOR and mark it unverified. An empty list
is a valid answer."

## 3. Resolve
Every CRITICAL finding is fixed in the plan. Each GAP or RISK finding is fixed or
explicitly deferred with a reason. End the plan with a review log:

| # | Persona | Severity | Finding | Resolution (Fixed / Deferred: why) |
|---|---|---|---|---|

## 4. Gate
If any CRITICAL finding remains open, don't dispatch: ask the user. Otherwise dispatch per
the plan, using `docs/templates/task-brief.md`.
