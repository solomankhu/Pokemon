---
title: AI harness - agents, skills, hooks, loop
sources: [".claude/agents", ".claude/skills", ".claude/hooks", ".claude/scripts", ".claude/commands", ".claude/settings.json"]
synced: 2026-11-14
---
# AI harness

This is how game work gets done here. It was adapted on 2026-10-17 from the TMI-Modern
(E:\SSM) AI operating system and trimmed to fit a single-developer game repo with no git.

## The loop
```
prompt ─▶ pm-route hook ─▶ game-pm (main session): triage + lane
            FAST ─────────────────────────────▶ do it ─▶ verify --auto ─▶ report ─┐
            STANDARD ─▶ brief ─▶ worker ─▶ verify ─▶ game-reviewer ─▶ playtester ─┤
            DEEP ─▶ plan-with-review ─▶ (STANDARD per step) ─▶ playtester full ───┤
                         ▲    NEEDS_REVISION (round 2, retry budget 2)  │         │
                         └──────────────────────────────────────────────┘         ▼
   learn: reflect-and-learn (failures) · capture-knowledge (successes) · wiki-sync (docs)
   ─▶ LOOP: line ─▶ Stop hook gate ─▶ next session's SessionStart injects the state
```

Principles:
- The PM orchestrates and doesn't write feature code. **Workers never judge their own
  output.**
- **Scripts run before agents.** A check a script can perform is never an agent's job.
- The **retry budget is 2**, then the lane escalates, then the user decides.
- **Link, never copy:** each fact has one canonical home (see [wiki-sync](../../.claude/skills/wiki-sync/SKILL.md)).

## Agents (`.claude/agents/`)
| Agent | Role | Writes code? |
|---|---|---|
| creature-designer | RPG data and engine, balance (both builds) | yes |
| sandbox-designer | mining, crafting, placement, terrain, the edits overlay | yes |
| game-feel-engineer | shell: juice, audio, loop, perf, HUD, touch | yes |
| narrative-designer | story arc, NPC and sign text in both builds, the dialogue-parity test | yes |
| game-chore | mechanical, fully specified edits; escalates judgment | yes |
| game-reviewer | read-only JSON verdict; Step 0 runs verify | **no** (no Write/Edit, no memory) |
| playtester | duty-spec browser sign-off (`game:`/`mode:`) | **no** (no Write/Edit, no memory; the PM saves its report to `docs/playtests/runs/`) |

The shared rules are in [agent-contract.md](agent-contract.md). Each worker (not the two judges) has
`memory: project` (`.claude/agent-memory/<agent>/`).

## Skills (`.claude/skills/`)
- **Orchestration:** game-pm, plan-with-review.
- **Quality:** game-review-checklist, browser-playtest.
- **Learning:** reflect-and-learn, capture-knowledge, skill-evolution, wiki-sync.
- **Domain:**
  - add-monster (`emit_tables.py`);
  - balance-report (`balance_report.py`);
  - juice-pass, fixed-timestep, game-ui, sandbox-prototype.

## Scripts (`.claude/scripts/`)
- `verify.js`: the one gate.
  - It runs py / js / gemini / campaign / combat / combatpy / hooks / tables (8 checks).
  - `--auto` runs only the checks whose inputs changed since the last green run.
  - It writes `.claude/state/last-verify.json` and `verify-history.jsonl`.
- `wiki-sync.js`: the drift report: STALE, UNDOCUMENTED, COUNT-DRIFT, BROKEN-LINK, MISSING-SOURCE, ORPHAN.

## Hooks (`.claude/settings.json`; all fail open)
| Event | Hook | Does |
|---|---|---|
| UserPromptSubmit | `pm-route.js` | on a game-ish prompt, injects the game-pm lanes and roster |
| SessionStart | `session-start.js` | injects PROGRESS `## Next`, verify freshness, pending rule proposals and learned entries, the drift summary |
| PreToolUse | `pre-tool-guard.js` | **denies** writes into E:\SSM and any `.env*` access; warns on exit-code-masking pipes and on whole-file reads of big game files |
| PostToolUse | `post-edit-check.js` | ASCII check on `gemini's code.html`; emit_tables reminder for Python table edits; a one-time PARITY reminder per build |
| Stop | `stop-gate.js` | if game files changed this turn, blocks once until: verify is green after the last edit, game-reviewer was dispatched (or `review=skipped(FAST)`), a red→green run or a bad verdict was reflected on, and the reply ends with a `LOOP:` line |

The tests are in `node .claude/hooks/hooks.test.js`. They use fake payloads and
transcripts.

## Commands (`.claude/commands/`)
- `/verify [--auto|--only …]`
- `/playtest <game> [mode] [IDs]`
- `/review`
- `/route <request>`: a dry-run triage
- `/status`

The skills are also slash-invocable, for example `/wiki-sync` and `/reflect-and-learn`.

## State and docs spine
| What | Where |
|---|---|
| failure counter (the reflect loop) | [../FAILURE_PLAYBOOK.md](../FAILURE_PLAYBOOK.md), with lessons in [../lessons/](../lessons/) |
| success patterns (the reuse loop) | [../SOLUTIONS.md](../SOLUTIONS.md), feeding `skills/<s>/learned/` |
| briefs and handoffs | [../templates/](../templates/), [../handoffs/PROGRESS.md](../handoffs/PROGRESS.md) |
| what to check in a browser | [../playtests/](../playtests/README.md) |
| plans from plan-with-review | `docs/plans/` |
| wiki timeline (ingest / query / lint) | [log.md](log.md) |

## Adopted from SSM, and what was dropped
**Adopted:**
- router lanes;
- PM-never-codes and worker-never-judges;
- the reviewer's Step 0 precondition and JSON verdict;
- the retry budget;
- the normative agent template (Owns / Does NOT own / return format);
- briefs and handoffs;
- the parameterised test agent with data-file duty specs;
- the self-gating reflect loop with an exact-key playbook and escalate-at-2;
- the success-side capture and skill evolution;
- plan review with two personas;
- the Stop-hook transcript walker;
- SessionStart injectors;
- the read-discipline and exit-code-masking warnings.

**Dropped (no git / no DB / not needed):**
- blast-radius tooling, task-quality packets, the approvals ledger and hash binding;
- git- and PR-based wiki sync (replaced by mtime);
- the DB, audit and UX-testing skills;
- the GRAPH lane;
- cost-policy notes.
