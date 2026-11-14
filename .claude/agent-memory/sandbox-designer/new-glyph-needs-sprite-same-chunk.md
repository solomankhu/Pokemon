---
name: new-glyph-needs-sprite-same-chunk
description: Authoring a new glyph into MAP (e.g. T) immediately fails the py RENDER "glyph has its own art, not the fallback square" check until draw_tile has a branch
metadata:
  type: feedback
---

The py RENDER pass loops over every glyph present in MAP (`for ch in sorted(set("".join(mt.MAP)))`) and fails any non-`.` glyph that draws as the fallback green square. A block can sit in `BLOCKS`/`SOLID`/legend with no sprite and stay green, but the moment the MAP holds it, RENDER goes red.

**Why:** Part B Chunk 3 (2026-10-23) put `T` into MAP while the `T` sprite was planned for Chunk 4 (game-feel-engineer), so Chunk 3 could not end green as the plan required.

**How to apply:** When a plan puts a new glyph into MAP, check that a `draw_tile` branch lands in the same chunk (or earlier); flag it at brief time, never weaken the RENDER check. Related: [[recipe-loops-in-tests]].
