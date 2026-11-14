---
name: wiki-sync
description: Keep CLAUDE.md, docs/wiki/ and the agent/skill files true to the code. Runs the deterministic drift report (.claude/scripts/wiki-sync.js - stale pages by mtime, undocumented agents/skills, test-count drift, broken links), then fixes each finding at its canonical home. Use after any task that changed a mechanic, a table layout, a test section or the harness itself, or when SessionStart reports drift.
---

# Wiki sync

There is no git here, so freshness is tracked by file mtimes. Each `docs/wiki/*.md` page
lists its `sources:` and the date it was `synced:`. The script does the detection; this
skill does the judgment.

## 1. Detect
```bash
node .claude/scripts/wiki-sync.js
```

| Kind | Meaning | Fix |
|---|---|---|
| `STALE` | a source changed after the page's synced date | re-read the changed code region, update the page, then `--touch` it |
| `UNDOCUMENTED` | an agent or skill on disk isn't named in CLAUDE.md or `docs/wiki/harness.md` | add it to the expert-team section and the harness page |
| `COUNT-DRIFT` | CLAUDE.md's check count is >3% off the last green verify | update the number (round with `~`) |
| `BROKEN-LINK` | a relative link points at nothing | fix the path, or drop the link |
| `MISSING-SOURCE` | a page lists a source that no longer exists | update `sources:`, then check whether the page is obsolete |
| `ORPHAN` | a wiki page is not listed in `docs/wiki/index.md` | add a row to the index, or delete the page if it is obsolete |

## 2. Fix at the canonical home ("link, never copy")
| Fact | Canonical home |
|---|---|
| architecture, invariants, run commands | `CLAUDE.md` |
| concept pages, how things fit, where to look | `docs/wiki/*.md` (these link to CLAUDE.md sections instead of restating them) |
| an agent's scope and return format | `.claude/agents/<name>.md` |
| the shared agent rules | `docs/wiki/agent-contract.md` |
| a procedure | the skill's `SKILL.md` |
| a failure mode | `docs/lessons/<key>.md`, indexed by `docs/FAILURE_PLAYBOOK.md` |
| a reusable success | `docs/SOLUTIONS.md` |
| what to check in the browser | `docs/playtests/<game>.md` |

If two homes say different things, the code wins. Fix the doc, and if the code itself
looks wrong, raise it as a finding instead of "fixing" the doc to match the bug.

## 3. Mark synced
Only after you've actually re-read the source:
```bash
node .claude/scripts/wiki-sync.js --touch docs/wiki/<page>.md
```

## Wiki operations (the LLM Wiki pattern)
Three layers:
- **Raw sources** are the code, dated specs, `docs/superpowers/`, `docs/research/` and
  playtest runs. Read them, never edit them.
- **The wiki** is `docs/wiki/`, which the agent writes.
- **The schema** is CLAUDE.md plus this skill.

Every operation ends with one entry appended to `docs/wiki/log.md`:
`## [YYYY-MM-DD] op | title` plus 1-4 bullets naming the pages touched.

- **Ingest** (a new spec, research note, playtest run or shipped feature):
  1. Read it.
  2. Update every concept page it affects. Note contradictions with older claims on the page,
     and say which source wins.
  3. Add the source to those pages' `sources:` and `--touch` them.
  4. Add any new page to `index.md`.
  5. Log it as `ingest`.
- **Query** (a question about how the project works):
  1. Read `index.md` first, then the pages, then the sources only if the pages fall short.
  2. Cite pages and `file:line`.
  3. If the answer is a synthesis worth keeping (a comparison, a "where does X live" map),
     file it as a new page with frontmatter, list it in the index, and log it as `query`.
- **Lint** is steps 1-3 above, plus the judgment the script can't make:
  - contradictions between pages;
  - concepts mentioned in several pages but with no page of their own;
  - missing cross-links.

  Log it as `lint` with what was fixed and what was left.

## 4. Done when
`node .claude/scripts/wiki-sync.js` prints `docs in sync`, or every remaining finding is
listed in your reply with the reason it was left.

Don't edit specs dated in the past (`docs/*-spec.md`, `docs/superpowers/`). They are
historical records. Add a "superseded by" link instead.
