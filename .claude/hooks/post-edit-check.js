// PostToolUse (Edit|Write|MultiEdit): deterministic checks right after an edit.
//   - gemini's code.html must stay pure ASCII (some tools decode \u / \x escapes)
//   - a MONSTER TRAIL table edited in Python must be re-emitted to the HTML build
//   - a MONSTER TRAIL build edited while its twin is untouched gets a one-time parity reminder
'use strict';
const fs = require('fs');
const path = require('path');
const { ROOT, STATE_DIR, mtime, readJson, norm, run } = require('./lib');

const EMITTED = /\b(MOVES|SPECIES|STARTERS|MAP|ZONES|MATERIALS|BLOCKS|RECIPES)\b/;
const TWIN = { "claude's monsters.py": "claude's monsters.html", "claude's monsters.html": "claude's monsters.py" };

function seenOnce(key) {
  const p = path.join(STATE_DIR, 'post-edit-seen.json');
  const seen = readJson(p) || {};
  if (seen[key]) return true;
  seen[key] = Date.now();
  try { fs.mkdirSync(STATE_DIR, { recursive: true }); fs.writeFileSync(p, JSON.stringify(seen)); } catch (e) { /* ignore */ }
  return false;
}

function check(input) {
  const ti = input.tool_input || {};
  const file = norm(ti.file_path);
  if (!file) return null;
  const notes = [];

  if (file === "gemini's code.html") {
    try {
      const lines = fs.readFileSync(path.join(ROOT, file), 'utf8').split('\n');
      const bad = [];
      lines.forEach((l, i) => { if (/[^\x00-\x7F]/.test(l) && bad.length < 5) bad.push(i + 1); });
      if (bad.length) notes.push(`ASCII-VIOLATION: gemini's code.html has non-ASCII characters on line(s) ${bad.join(', ')}. The file must stay pure ASCII (see CLAUDE.md, NAME_STRIP).`);
    } catch (e) { /* ignore */ }
  }

  const edited = String(ti.new_string || ti.content || '') + (ti.edits ? ti.edits.map(e => e.new_string).join('\n') : '');
  if (file === "claude's monsters.py" && EMITTED.test(edited)) {
    notes.push('TABLES: this edit touches an emitted table. Re-emit with `.venv/Scripts/python.exe .claude/skills/add-monster/emit_tables.py --write`, never hand-edit the HTML copy.');
  }

  if (TWIN[file]) {
    const twinAge = Date.now() - mtime(TWIN[file]);
    if (twinAge > 30 * 60e3 && !seenOnce(`${input.session_id || ''}:${file}`)) {
      notes.push(`PARITY: you edited ${file} but ${TWIN[file]} has not changed in this session. A mechanic or shell change belongs in both builds (PARITY checks tables, computed engine output and shell constants, not drawing code).`);
    }
  }

  if (!notes.length) return null;
  return { hookSpecificOutput: { hookEventName: 'PostToolUse', additionalContext: notes.join('\n') } };
}

if (require.main === module) run(check);
module.exports = { check };
