# MONSTER TRAIL → THE STATIC BELOW finale handoff — approved spec (2026-10-17)

User-approved choices:
- the **story handoff**;
- Gemini improvements: **bugs & physics, smoothness & perf, feel & polish, mobile/touch**;
- the pygame build **opens the browser** at the handoff.

## Flow
1. Beating the gym (LEADER VOLT) still shows MONSTER TRAIL's victory scene, after the normal victory dialogue.
2. A **new epilogue scene**:
   - A strange signal leads the player to a hatch.
   - Short dialogue mentions the lead monster by name.
   - The screen fills with static (the TV-static motif of THE STATIC BELOW, using reduced-motion-safe static).
   - Confirm to descend.
   - The player can also decline, staying in MONSTER TRAIL (free roam) and taking the hatch later. Never force it.
3. **HTML build:** write the handoff record (below), fade to static, then `location.href = "gemini's%20code.html?from=trail"`. Both files are served from the same folder.
4. **pygame build:**
   - write the same record to `monster-trail-handoff.json` beside the save;
   - `webbrowser.open(<absolute file URI of gemini's code.html>?from=trail)`;
   - show a closing scene ("The signal continues below... (opened in your browser)").
   - If opening the browser fails, show the file path to open.
5. **THE STATIC BELOW on arrival** with `?from=trail`, or a fresh handoff record:
   - the overlay shows a static-to-clear intro and an opening line referencing the journey, e.g. "The signal that pulled you off the trail... <LEAD> isn't here to help you now.";
   - then the normal game starts.
   - Without a handoff it behaves as a standalone game, exactly as before.
   - The record is read once and marked consumed.

## Handoff record (the contract, used by both)
- `localStorage` key `"monsterTrail.handoff"`.
- pygame build: the JSON file above, which is informational. The browser can't read it, so the URL param is the browser signal.

```json
{ "v": 1, "lead": { "name": "PYRELASH", "species": "pyrelash", "level": 31 },
  "party": 4, "dex": 14, "ts": 1760000000000, "consumed": false }
```
- Gemini must tolerate a missing, garbage or old-version record and fall back to the standalone start.
- **Never trust the content as HTML.** Render it as text only, never `innerHTML`.

## Smoothness
- There are no hard cuts: MONSTER TRAIL fades out into static, and Gemini fades in from static.
- Gemini shows a styled loading state while three.js loads from the CDN.
- If the CDN fails, it shows a clear message, not a black page.

## Ownership
- **Gemini track:** game-feel-engineer, `gemini's code.html` only. Arrival handling, plus all improvements.
- **MONSTER TRAIL track:** sequential after the interactive-battle work. The epilogue scene, the record write and the navigation or browser open, in both builds, with tests.
