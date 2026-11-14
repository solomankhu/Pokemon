# Progress

The SessionStart hook injects the `## Next` list below into every new session, so keep it
short (at most 8 lines) and current. Long-form state goes in a dated handoff file in this
folder.

## Next
- Part B (AXE, glades, crafting from loot): Chunks 0-4 done (reviews PASS r1, playtest MT-07/10/11 PASS; py 5555, js 3854). Chunk 5 (docs, MT-19, final gates) waits until the visual crafting redesign lands, so the docs describe the new screen. Plan docs/superpowers/plans/2026-10-23-axe-glades-loot-crafting.md.
- Visual crafting + item icons: plan docs/superpowers/plans/2026-10-23-visual-crafting.md. Chunks 0-3 done (Chunk 3 2026-11-14: icons emitted, rules + found/save ported to JS, PARITY keys icons/craftCells/gridMove/cleanFound/blurbs; review PASS r1). Next: Chunk 4 (CRAFT grid screen, input, CRFX animation, both builds; drop craftRows from PARITY). Carry-over MINOR: add a __GAME__ seam for campaignBusy/combatModal and test that update()'s early return still runs noteFound.
- Webcam gesture set: 2026-11-14 chest-height cancel recognized (cancel-2 x@1800); all 6 action clips plus sweep hit, zero unexpected keys on 11 recordings. Old cancel-1 still misses. Added hold feedback and strict unexpected-key gate. Validation/handoff: docs/handoffs/2026-10-23-webcam-gestures.md.
- Story phase 2 (docs/wiki/story.md): the outline is approved for review; no game text has landed yet.
- Manual only: real-webcam feel, and a visible launcher/fullscreen check on the user's hardware.

## Recently done
- 2026-10-18: battle conditions (all 5 chunks) and loot/shop/items Part A shipped. Release-readiness passed. See docs/playtests/runs/2026-10-18-continuation.md and 2026-10-18-release-readiness.md.
- 2026-10-17: AI harness added (review / playtest / learn loop, verify script, hooks). See docs/wiki/harness.md.
- 2026-10-17: unified campaign (MONSTER TRAIL + THE STATIC BELOW) shipped. See docs/unified-game-playtest.md.
