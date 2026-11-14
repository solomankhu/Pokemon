---
name: sandbox-prototype
description: Scaffold a Minecraft/Terraria-style mechanic (mining/placing, crafting, seeded noise terrain, chunks, day/night) as data tables plus pure, seeded, tested engine functions before any rendering. Use when adding sandbox mechanics to MONSTER TRAIL or Gemini's game, or starting a new sandbox prototype in this repo.
---

# Sandbox prototype

Build it the way MONSTER TRAIL is built: **DATA → ENGINE (pure, seeded) → STATE → SHELL**, with a headless test file. A sandbox you can't test regresses the first time someone tweaks the terrain noise.

## 1. Choose the host
| Host | How sandbox goes in | Don't |
|---|---|---|
| MONSTER TRAIL (both builds) | An **edit overlay**: `Game.edits = {(x,y): tile}`, consulted by `tile_at`/`blocked_for`, saved and loaded like `Game.picked`. Or a **new procedurally generated band or region** with its own rules. | Never mutate `MAP` at runtime. The suite's connectivity, reachability and trunk-road checks assume the authored map. A mineable tile must never be the only route to an NPC or door: whitelist mineable glyphs and the regions where mining is allowed. |
| gemini's code.html | A voxel grid → InstancedMesh per block type, and a voxel AABB feeding the existing wall collision | Don't build per-block `Mesh` objects (draw-call explosion) |
| New file | `<name>.html` (Canvas, no libraries, like MONSTER TRAIL's port) with a `__GAME__` export for node tests | Don't add a bundler or package.json. The repo has neither. |

## 2. Data tables
```python
BLOCKS  = {"dirt": dict(hard=1, tool=None, drops="dirt"), "stone": dict(hard=3, tool="wood_pick", drops="cobble"),
           "ore":  dict(hard=5, tool="stone_pick", drops="ore")}
TOOLS   = {"wood_pick": 1, "stone_pick": 2}            # tier
RECIPES = [dict(out="wood_pick", n=1, needs={"plank": 3, "stick": 2}),
           dict(out="stone_pick", n=1, needs={"cobble": 3, "stick": 2}, station="bench")]
BIOMES  = [dict(name="meadow", temp=(0.4, 0.8), wet=(0.3, 0.7), surface="grass")]
```

## 3. Pure engine (injectable seed/rng, no display, no globals)
- `noise2(x, y, seed)`: value or simplex noise, plus `fbm(x, y, seed, octaves)` (frequency ×2, amplitude ×½).
- `gen_chunk(cx, cy, seed)` → a 16×16 grid. Height = blend(*continentalness*, *erosion*, *peaks*). Biome from temperature and wetness noise. Caves where the 3D (or 2D) density falls below a threshold. Ores as a rarer noise band below a depth.
- `can_mine(block, tool)`, `mine(world, x, y, tool)` → drops, `place(world, x, y, block, player_pos)`
- `craft(inventory, recipe, near_station)` → a new inventory or `None`. Must conserve items exactly.
- `light_at(t)` for day/night, as a pure function of the clock.

## 4. Tests to write first
- The same seed gives an identical chunk, and a different seed gives a different one. Chunk borders are continuous (no seams in height across `cx` edges).
- Tool tiers are enforced; crafting conserves items and fails cleanly without ingredients or a station.
- `place` refuses the player's own tile. Mining or placing can't make a required tile unreachable (reuse the suite's BFS, which models `v` ledges).
- Edits round-trip through save and load.
- **Gated reachability**, for any mineable tile that opens new ground (MONSTER TRAIL's `K` seam and GEODE are the worked example):
  1. Keep the plain flood fill `seen` (nothing mined) unchanged. Every *required* target (NPC, door, sign, trainer, gym path) must be in it. That is the proof that nothing the game needs sits behind mining.
  2. Add `seen_mined`, the same ledge-aware fill run over an edits overlay with every gate tile mined. Check that the fill with `{}` equals `seen`, so the two fills can't drift apart.
  3. Give every gate a bounded region constant (`GEODE = (x1, y1, x2, y2)`). Assert `seen_mined - seen` equals *exactly* that region's open tiles plus the gate tiles. Anything extra means a gate leaks into the authored world. Anything missing means a sealed pocket.
  4. Optional content (items, encounter zones) is "gated" when it is reachable only in `seen_mined`. Accept it only inside the region, and count it, so a typo can't silently gate something.
  5. Make gate tiles `authored_only` (mineable only where `MAP` has the glyph). Accept them in `load_edits` only as authored tile → `leaves`. Add a parity probe of `can_mine(gate, x, y, tier)` at non-authored tiles, because the map alone never exercises that rule.
  6. If the gate's cost is a finite resource, add a one-off pure backstop (`quarry_backstop`) for when the resource is truly exhausted, and test that it pays exactly once and only under its conditions.
- For MONSTER TRAIL, add the checks to `claude's monsters.test.py` and `.test.js` in their own section, and keep both suites green.

## 5. Vertical slice, then widen
One small area, dirt and stone, one ore, a bench, one pickaxe recipe. Hand the shell (cursor highlight, crack stages, particles, sounds) to the **game-feel-engineer** and the `juice-pass` skill.
