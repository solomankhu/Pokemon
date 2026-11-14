# Solutions index

> The **success side** of the learning loop. Failures go to
> [FAILURE_PLAYBOOK.md](FAILURE_PLAYBOOK.md). This file records approaches that worked and
> are worth reusing.
> [`capture-knowledge`](../.claude/skills/capture-knowledge/SKILL.md) appends rows. When a
> later task reuses a row, it bumps `Reuses` and cites the row (`--reuse-of #N` in its
> report). At **2 reuses**, [`skill-evolution`](../.claude/skills/skill-evolution/SKILL.md)
> promotes the pattern into the owning skill's `learned/` folder.
>
> Each row needs three prose fields:
> - **why it worked**;
> - **reusable logic**;
> - **what would have broken it**.
>
> If a solution is one-off, write `not_reusable` and skip the row. Leaving a row out is a
> valid outcome.

| # | Pattern | Why it worked | Reusable logic | What would have broken it | Owner skill | Reuses |
|---|---|---|---|---|---|---|
| 1 | Generate the HTML tables from the Python tables | parity is enforced by the generator, not by discipline | one source of truth plus a dry-run diff (`emit_tables.py`) | hand-transcribing "just this once" | add-monster | 0 |
| 2 | Pure, seeded helper per mechanic, then PARITY-compare traces | the same seed gives the same trace in both builds, so drift shows up as a test diff | own `mulberry32` per subsystem; never the engine `random` | sharing the global rng with cosmetics | sandbox-prototype | 0 |
| 3 | Diff overlay (`Game.edits`) instead of mutating `MAP` | saves and validation see only the change set | `tile_at(x,y,edits)` everywhere; `load_edits` re-validates | any code path that reads `MAP` directly | sandbox-prototype | 0 |
| 4 | Gated-reachability set equality (`seen_mined - seen == GEODE`) | it proves every optional gate is bounded | flood fill twice, then assert the exact difference | a new mineable tile outside its own bounded region | sandbox-prototype | 0 |
| 5 | A new input device as a pure intent producer feeding the existing input seams | the engine, step queue and judging never learn a new device exists, so keys, touch and webcam share one judged path and a key-vs-webcam parity test is possible | pure `classifyMotion` → `stepTracker` emits `arm/press/release/key` intents → shell dispatches to `commandInput`/`press`/`release` (`combat/webcam.js`); one `webcamActive()` predicate polled by `sync()` each frame (`claude's monsters.html` frame loop) | relying on the frame loop alone (rAF pauses in hidden tabs, so blur/visibilitychange must stop it directly), and a dispatcher that keeps a pressed key after stop (stuck `keys[k]`) | game-ui | 0 |
