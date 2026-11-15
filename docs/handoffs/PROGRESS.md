# Progress

The SessionStart hook injects the `## Next` list below into every new session, so keep it
short (at most 8 lines) and current. Long-form state goes in a dated handoff file in this
folder.

## Next
- Part B (AXE, glades, crafting from loot): Chunks 0-4 done (reviews PASS r1, playtest MT-07/10/11 PASS; py 5555, js 3854). Chunk 5 (docs, MT-19, final gates) waits until the visual crafting redesign lands, so the docs describe the new screen. Plan docs/superpowers/plans/2026-10-23-axe-glades-loot-crafting.md.
- Visual crafting + item icons: plan docs/superpowers/plans/2026-10-23-visual-crafting.md. ALL CHUNKS DONE 2026-11-14 (whole-feature review PASS r1, MINOR tidy PASS r2; playtests MT-07/10/11/12/18 PASS; docs + wiki synced; py 5849, js 4078). Part B Chunk 5 (docs, MT-19, final gates) is now unblocked.
- Webcam gesture set: 2026-11-14 chest-height cancel recognized (cancel-2 x@1800); all 6 action clips plus sweep hit, zero unexpected keys on 11 recordings. Old cancel-1 still misses. Added hold feedback and strict unexpected-key gate. Validation/handoff: docs/handoffs/2026-10-23-webcam-gestures.md.
- Story phase 2 (docs/wiki/story.md): the outline is approved for review; no game text has landed yet. 2026-11-14 additions approved (all recommended options): WREN as field recordist, lore in item descriptions, WREN's tune leitmotif + tape effect, carrier hum, Signal Core rising tone. Research: docs/research/2026-11-14-lore-and-sound.md.
- Crafted weapons ("gear": WOOD CLUB / IRON SPEAR, struck from the battle BAG, never KOs): design approved 2026-11-14, not started. Spec docs/superpowers/specs/2026-11-14-crafted-weapons-design.md. Plan drafted: docs/superpowers/plans/2026-11-14-crafted-weapons.md (Chunks 1-6). plan-with-review done 2026-11-14 (3 CRITICAL fixed, 0 open). Next: Chunk 1 (Part A Python + Part B port, one gate) once visual crafting Chunk 6 and Part B Chunk 5 are done (Chunk 5 text also needs the story dialogue-parity test).
- XP + drops + crafting from every drop: design drafted 2026-11-14 (1.5x XP; every wild win drops 1-2 + 10% rare; recipes for all 13 unused drops: buffs/utility/blocks/gear). Spec docs/superpowers/specs/2026-11-14-drops-xp-crafting-design.md approved. Phase A (1.5x XP + every wild win drops 1-2 + 10% rare) DONE 2026-11-14: review PASS r1, playtest MT-18 PASS, py 5865 / js 4094, committed d1d6496. Changed xp_from_faint, loot_roll (+loot_rare), the battle-end loot block, constants near BAG_MAX. Gym rebalance +2 (user chose +2 after the +4 sim was too hard: VOLT 30/31/32/32/34, t7 NOX 25/25/26, t8 ILVA 29/29/30; verify green py 5881 / js 4109) DONE 2026-11-15: review PASS r1 (new PARITY key `trainers` covers all 9 teams). Next: Phase B (consumable/utility recipes), then C (blocks).
- Manual only: real-webcam feel, and a visible launcher/fullscreen check on the user's hardware.

## Recently done
- 2026-10-18: battle conditions (all 5 chunks) and loot/shop/items Part A shipped. Release-readiness passed. See docs/playtests/runs/2026-10-18-continuation.md and 2026-10-18-release-readiness.md.
- 2026-10-17: AI harness added (review / playtest / learn loop, verify script, hooks). See docs/wiki/harness.md.
- 2026-10-17: unified campaign (MONSTER TRAIL + THE STATIC BELOW) shipped. See docs/unified-game-playtest.md.
