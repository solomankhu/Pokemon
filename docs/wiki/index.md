---
title: Wiki index
sources: ["docs/wiki"]
synced: 2026-11-14
---
# Wiki

Concept pages that explain how the pieces fit and where to look. **CLAUDE.md** is the
canonical home for architecture and invariants. These pages link to it rather than repeat
it. Freshness is tracked by `sources:`/`synced:` frontmatter, which
`node .claude/scripts/wiki-sync.js` checks.

| Page | What it covers |
|---|---|
| [monster-trail.md](monster-trail.md) | the RPG in two builds: layers, parity, where each kind of change goes |
| [static-below.md](static-below.md) | the three.js chapter: SIM/SHELL, floors, fixed timestep |
| [campaign.md](campaign.md) | how the two games join: `campaign.js`, saves, the frame protocol |
| [story.md](story.md) | the narrative: premise, 3 acts, beat table, clue → payoff map (DEEP plan, under review) |
| [testing.md](testing.md) | the six suites (py, js, gemini, campaign, combat, combatpy), what each proves, `verify.js`, browser playtests |
| [harness.md](harness.md) | the AI loop: agents, skills, hooks, commands, learning |
| [agent-contract.md](agent-contract.md) | the rules every worker agent follows |
| [log.md](log.md) | append-only timeline of ingests, filed queries, lint passes and schema changes |

**Queries start here:** read this table, then drill into the pages. An answer worth keeping
becomes a new page listed above (see the Query workflow in the
[wiki-sync skill](../../.claude/skills/wiki-sync/SKILL.md)).

Other docs:
- specs and history: `docs/*-spec.md` and `docs/superpowers/` (dated, historical);
- the shipped campaign record: [../unified-game-playtest.md](../unified-game-playtest.md).
