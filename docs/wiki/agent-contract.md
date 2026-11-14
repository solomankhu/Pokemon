---
title: Agent contract
sources: [".claude/agents/", ".claude/skills/game-pm/SKILL.md"]
synced: 2026-10-17
---
# Agent contract (shared by every worker agent)

Each agent file states its own **Owns / Does NOT own** and **Return format**. Everything
else is shared and lives here, so it is written once.

## Source-of-truth order
1. The code and the tests. The four suites, through `node .claude/scripts/verify.js`, are what is true.
2. `CLAUDE.md`.
3. `docs/wiki/`.
4. Specs in `docs/*.md` and `docs/superpowers/`. Specs dated before the code may be historical.

When two of them disagree, report it in `HANDOFF / WORKFLOW FEEDBACK` and don't pick one
silently. Drift goes to [wiki-sync](../../.claude/skills/wiki-sync/SKILL.md).

## Before the first edit
- Read the [FAILURE_PLAYBOOK](../FAILURE_PLAYBOOK.md) rows whose lesson `applies_to`
  matches your files. Read those lessons.
- Read `learned/INDEX.md` in each skill you use, if it exists.
- Check [SOLUTIONS](../SOLUTIONS.md) for a reusable pattern, and cite `reuse-of #N` if you
  use one.
- Agent memory is injected automatically. Verify a remembered fact against the code
  before you rely on it, because memory can be stale.

## While working
- Edit only the files in the brief's "Files you own". This folder is not a git repo, so
  there is no undo and another agent may be editing other files right now.
- Use Grep first, then Read with offset/limit. The game files are 2000-5600 lines.
- Run the brief's verification command. Paste its PASS/FAIL lines. Never pipe a test run
  through `tail`/`head`/`grep`, because that hides its exit code. `verify.js` already
  prints a summary.
- A worker never judges its own work. The PM sends it to **game-reviewer**.

## Stop and escalate (don't guess)
- The change needs a file outside your brief.
- A test would have to be weakened, skipped or deleted.
- A design or taste call isn't settled by the brief.
- The same fix failed verification twice. The **retry budget is 2**; after that the PM
  escalates a lane, then asks the user.

Write `ESCALATE: <decision> - options` and stop on that item.

## Memory hygiene (`memory: project`)
Save durable, non-obvious facts the next run would otherwise rediscover: one fact per file,
with **Why:** and **How to apply:**. No task logs and no verdicts. Failures belong to
reflect-and-learn, and successes to capture-knowledge.
