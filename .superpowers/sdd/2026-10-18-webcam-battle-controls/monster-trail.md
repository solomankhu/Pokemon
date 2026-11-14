# Duty spec: MONSTER TRAIL (`claude's monsters.html`)

URL: `http://127.0.0.1:8765/claude's%20monsters.html`. Start fresh with
`localStorage.clear()` and then a reload. State lives in `__GAME__.G`.

**Battles render through the 3D presenter by default** (`combat/`). Its state is
`battleHost.is3D()` and `battleHost.presenter.diagnostics` (`projected`, `effects`).
"Basic presentation (2D)" in the battle SETTINGS restores the 2D arena.

**Input timing:** a key tap pressed while `G.player.moving` is true is dropped. Wait about
100 ms after each press before polling or pressing again.

| ID | Tag | Duty | How | Assert |
|---|---|---|---|---|
| MT-01 | [smoke] | Boot to title | load | `G.mode === 'title'`; the canvas is 640x480; console is empty |
| MT-02 | [smoke] | Start a new game and pick a starter | input: Z through the intro (ends in `overworld` at (43,107) with an empty party); walk ArrowDown, then ArrowRight ×18 to (61,108); ArrowUp to face PROF. CEDAR; Z ×3 → `starter`; Z ×3 | `G.mode` returns to `overworld`; party length is 1 |
| MT-03 | [smoke] | Walk | input: 4 arrow presses, 100 ms apart | `G.player` moved 4 tiles; no error |
| MT-04 | | 3D wild battle and a hit | seam: `startBattle(...)`, `takeTurn(...)`; poll `G.battle.trauma > 0` or `presenter.diagnostics.effects`, then screenshot | `is3D()`; `projected.foe.y < 248` (HP box clear); **visible** on contact: a camera shake, a hit flash on the target, and a contact burst in front of the target. The attacker's shadow follows the lunge |
| MT-05 | | Catch flow | seam: battle, then BALL | the ball count drops by 1; party or box grows on success; the 3D ball throw and shakes are visible |
| MT-06 | | Save round-trip | seam: `saveGame()`, reload, CONTINUE | party, balls, materials and picked items are equal before and after |
| MT-07 | | Sandbox mine and build | seam: give a PICK, face a pass boulder, mine; CRAFT; BUILD | `G.materials` changes as `mineDrop` predicts; a wall places only where `placementOk` says |
| MT-08 | | DARK CAVE feel | seam: teleport into `CAVE_BAND` | the lantern cut-out is visible and the 4 neighbour tiles are lit; the vignette shows at tension ≥ 50 |
| MT-09 | | Hunt battle | seam: `startHunt(...)` | the scare queue runs dark → reveal → settled; BALL is refused without using a turn |
| MT-10 | | Touch layout | `browser_resize` to 390x844, then 844x390 | the D-pad, A, B and RUN don't overlap the canvas; `fitCanvas` keeps the 4:3 ratio |
| MT-11 | | Reduced motion | test both: `browser_emulate_media` reducedMotion=reduce, **and** the 3D presenter's own Reduced motion checkbox (`combat/host.js`) | no shake, flash or hit-stop in 2D or 3D; the meters and HP drain are still drawn |
| MT-12 | | 2D fallback battle | SETTINGS → Basic presentation (2D); then the MT-04 steps | the 2D arena draws; shake, flash and particles are visible; HP box at y=248 clears the platform at y=240 |
| MT-13 | | Battle SETTINGS | open SETTINGS in battle; cycle Action commands ON/ASSIST/AUTO and quality HIGH/STANDARD/LOW | each setting persists across a reload; no console error |
| MT-14 | | Timed command | a move that has a `cmd` step; press and release Z inside, then outside, the window | the result label differs (e.g. GOOD vs MISS); the damage follows the timing |
| MT-15 | | Game window | open through `Play Monster Trail.vbs`, or check in page | no right-click menu, no text selection, no Ctrl+wheel or Ctrl± zoom, no F5/Ctrl+R reload mid-game; the fullscreen toggle works; the cursor hides when idle in fullscreen |

**pygame build:** you can't play it in a browser. Run the suite with
`MT_FRAME_DIR=<scratch>` and inspect about 40 dumped PNGs instead. They count as the
screenshots for any duty above that names a frame.
