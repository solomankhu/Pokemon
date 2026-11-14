---
title: Wiki log
sources: []
synced: 2026-11-14
---
# Wiki log

Append-only record of what happened to the wiki, newest last. Never rewrite an entry.
Each entry starts `## [YYYY-MM-DD] op | title`, where `op` is `ingest`, `query`, `lint`
or `schema`, so `grep "^## \[" docs/wiki/log.md` lists the timeline. The workflows
are in the [wiki-sync skill](../../.claude/skills/wiki-sync/SKILL.md).

## [2026-10-23] schema | Adopt the LLM Wiki pattern
- Added this log, the Ingest / Query / Lint workflows to the wiki-sync skill, and an
  `ORPHAN` lint (every page must be listed in [index.md](index.md)).
- Raw sources = the code, `docs/*-spec.md`, `docs/superpowers/`, `docs/research/`,
  playtest runs (read, never edited). Wiki = `docs/wiki/`. Schema = CLAUDE.md + the skill.
- Open at the time: `harness.md` and `story.md` STALE.

## [2026-10-23] ingest | Three 2026-10-18 feature specs + continuation playtest
- [monster-trail.md](monster-trail.md): new "Feature specs" section links loot/shop, battle
  conditions and webcam specs; specs and playtest runs added to `sources:`.
- Contradiction: `docs/handoffs/PROGRESS.md` still said conditions were paused at Chunk 3
  and the shop unbuilt. The code and the continuation/release-readiness runs show both
  shipped, so the code wins and PROGRESS was rewritten.
- Webcam spec Layer 1 is superseded by its own v2 addendum. CLAUDE.md already said so.

## [2026-10-23] lint | Clear STALE pages
- [harness.md](harness.md): the verify line listed 5 of 8 checks, now all 8; log.md added
  to the docs spine.
- [story.md](story.md): every quote is still present and phase 2 has not landed. The
  14-line table was re-anchored (lines had shifted by ~430-850). Later `:NNNN` refs are flagged as 10-17.
- [testing.md](testing.md): hooks count 70 to 73.

## 2026-10-24 webcam gesture set
- [testing.md](testing.md): combat 16 to 17 suites (webcam-clips); gesture coverage in webcam, clips and integration entries.
- [monster-trail.md](monster-trail.md): webcam row names the menu gestures and the getPhase/battleAction seam.
- Also updated: playtests MT-16 gesture steps, webcam spec Test gestures/gesture set, CLAUDE.md webcam paragraph.

## 2026-10-31 webcam throw retune
- [testing.md](testing.md): clip recall bars apply only from 3 clips per gesture; scenes crosses/overhand.

## [2026-11-14] lint | wiki-sync drift pass
- story.md: re-anchored the 14-line table and inventory ranges (all lines still present; no WREN text yet).
- index.md: testing row now names the six suites. harness.md: re-read, no change (emit_tables only gained icon emitters).
- CLAUDE.md: py count ~5700, js count ~4000, emitted list adds ICON_PALETTE/ICON_SHADOW/ICONS.

## [2026-11-14] ingest | Visual crafting + Part B docs
- monster-trail.md: replaced "Part B not designed yet" with a Crafting section (AXE, glades, CRAFT grid, `Game.found`, `fx_craft`, icons).
- CLAUDE.md: emitted list, CRAFT/found/fx_craft/icons bullet, counts 5849/4071. add-monster SKILL.md: icon tables. playtests: MT-18 icon expectations.
