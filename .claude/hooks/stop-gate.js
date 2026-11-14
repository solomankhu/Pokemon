// Stop hook: closes the loop. If game files changed during this turn (by the
// main session or any subagent, detected by mtime), the turn may end only when:
//   1. verify.js was green AFTER the last edit            (VERIFY-REQUIRED)
//   2. game-reviewer was dispatched, or LOOP says review=skipped(FAST)  (REVIEW-DISPATCH-REQUIRED)
//   3. a red->green verify or a NEEDS_REVISION/FAIL verdict was reflected on  (REFLECT-DUE)
//   4. the reply ends with a LOOP: line                    (LOOP-LINE-MISSING)
// Blocks at most once per stop (stop_hook_active guard), so it can never loop.
'use strict';
const path = require('path');
const fs = require('fs');
const { ROOT, STATE_DIR, GAME_FILES, GAME_DIRS, mtime, readJson, norm, run, readTranscript, currentTurn } = require('./lib');
const verify = require('../scripts/verify.js');

function evaluate(input) {
  if (input.stop_hook_active) return null;
  const turn = currentTurn(readTranscript(input.transcript_path));
  if (!turn.promptTs) return null;

  const editedByTool = new Set(turn.toolUses
    .filter(t => /^(Edit|Write|MultiEdit|NotebookEdit)$/.test(t.name))
    .map(t => norm(t.input.file_path || t.input.notebook_path)));
  // mtime catches subagent edits, but also edits by other sessions or the user's editor,
  // so it only counts when this turn actually dispatched an agent.
  const dispatched = turn.toolUses.some(t => t.name === 'Agent' || t.name === 'Task');
  const edited = GAME_FILES.filter(f => editedByTool.has(f) || (dispatched && mtime(f) > turn.promptTs));

  // Game directories (e.g. combat/): any tool-edited path under one counts directly.
  // Case-insensitive, since Windows paths may differ in case from GAME_DIRS.
  const gameDirsLower = GAME_DIRS.map(d => d.toLowerCase());
  // Direct children only, mirroring verify.js's non-recursive dirMtime.
  for (const p of editedByTool) {
    const pLower = p.toLowerCase();
    if (gameDirsLower.some(d => pLower.startsWith(d) && !pLower.slice(d.length).includes('/'))) edited.push(p);
  }
  // Subagent edits inside a game directory are detected by mtime, same rule as GAME_FILES.
  if (dispatched) {
    for (const dir of GAME_DIRS) {
      let names = [];
      try { names = fs.readdirSync(path.join(ROOT, dir)); } catch (e) { names = []; }
      for (const name of names) {
        if (name === '__pycache__') continue;
        let st;
        try { st = fs.statSync(path.join(ROOT, dir, name)); } catch (e) { continue; }
        if (st.isDirectory()) continue;
        const p = dir + name;
        if (mtime(p) > turn.promptTs) edited.push(p);
      }
    }
  }

  if (!edited.length) return null;

  const reasons = [];
  const state = readJson(path.join(STATE_DIR, 'last-verify.json'));
  let unverified;
  if (state && state.checks) {
    // Per-check: a file is verified only if every check that reads it ran green after its last edit.
    unverified = edited.filter(p => {
      const names = verify.checksFor(p);
      return names.length > 0 && names.some(n => !(state.checks[n] && state.checks[n].ok && state.checks[n].startedAt >= mtime(p)));
    });
  } else {
    const lastEdit = Math.max(...edited.map(mtime));
    unverified = state && state.ok && state.inputsMtime >= lastEdit ? [] : edited;
  }
  if (unverified.length) {
    reasons.push(`VERIFY-REQUIRED: ${unverified.join(', ')} changed after the last green run of the checks that read them. Run \`node .claude/scripts/verify.js --auto\` and fix any FAIL.`);
  }

  const loop = (turn.lastText.match(/^LOOP:.*$/m) || [''])[0];
  const reviewed = turn.toolUses.some(t => (t.name === 'Agent' || t.name === 'Task') && /game-reviewer/.test(String(t.input.subagent_type || '')));
  if (!reviewed && !/review=skipped/.test(loop)) {
    reasons.push('REVIEW-DISPATCH-REQUIRED: game files changed but game-reviewer was not dispatched. Dispatch it (STANDARD/DEEP), or if this was FAST lane say `review=skipped(FAST)` on the LOOP line.');
  }

  let history = [];
  try {
    history = fs.readFileSync(path.join(STATE_DIR, 'verify-history.jsonl'), 'utf8').split(/\r?\n/).filter(Boolean)
      .map(l => { try { return JSON.parse(l); } catch (e) { return null; } })
      .filter(h => h && Date.parse(h.ts) >= turn.promptTs);
  } catch (e) { /* no history yet */ }
  const firstRed = history.findIndex(h => !h.ok);
  const redThenGreen = firstRed >= 0 && history.slice(firstRed + 1).some(h => h.ok);
  const badVerdict = /"verdict"\s*:\s*"(NEEDS_REVISION|FAIL)"/.test(turn.toolResultsText);
  const reflected = turn.toolUses.some(t => t.name === 'Skill' && /reflect-and-learn/.test(String(t.input.skill || '')))
    || /^REFLECT:/m.test(turn.lastText) || /reflect=(?!due)\S+/.test(loop);
  if ((redThenGreen || badVerdict) && !reflected) {
    reasons.push(`REFLECT-DUE: ${redThenGreen ? 'verify went red then green' : 'the reviewer returned NEEDS_REVISION/FAIL'} this turn. Run the reflect-and-learn skill (it self-gates) and record the lesson key.`);
  }

  if (!loop) {
    reasons.push('LOOP-LINE-MISSING: end the reply with one line, e.g. `LOOP: lane=STANDARD review=PASS(r1) playtest=n/a reflect=not-needed capture=not_reusable wiki=in-sync` (game-pm §6).');
  }

  if (!reasons.length) return null;
  return { decision: 'block', reason: 'Harness loop gate (.claude/hooks/stop-gate.js):\n- ' + reasons.join('\n- ') };
}

if (require.main === module) run(evaluate);
module.exports = { evaluate };
