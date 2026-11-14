// SessionStart hook: injects the harness state the next session needs, so
// nothing depends on remembering it - PROGRESS "## Next", verify freshness,
// pending rule proposals, proposed learned entries, and the doc-drift summary.
'use strict';
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');
const { ROOT, STATE_DIR, GAME_FILES, mtime, readJson, run } = require('./lib');

const BUDGET = 3000;

function section(text, heading) {
  const m = text && text.match(new RegExp(`^## ${heading}\\s*\\n([\\s\\S]*?)(?=^## |$(?![\\s\\S]))`, 'm'));
  return m ? m[1].trim() : '';
}

function build() {
  const lines = ['Game harness active. Game work goes through the `game-pm` skill (lanes FAST/STANDARD/DEEP; gates: `node .claude/scripts/verify.js`, then game-reviewer, then playtester; end with a LOOP: line).'];

  let progress = '';
  try { progress = fs.readFileSync(path.join(ROOT, 'docs', 'handoffs', 'PROGRESS.md'), 'utf8'); } catch (e) { /* none */ }
  const next = section(progress, 'Next');
  if (next && !/^-\s*\(empty/.test(next)) lines.push('PROGRESS ## Next (docs/handoffs/PROGRESS.md):\n' + next.split('\n').slice(0, 8).join('\n'));

  const state = readJson(path.join(STATE_DIR, 'last-verify.json'));
  if (!state) {
    lines.push('Verify: no recorded run yet - run `node .claude/scripts/verify.js` before trusting the suites are green.');
  } else {
    const changed = GAME_FILES.filter(f => mtime(f) > state.inputsMtime);
    const counts = (state.results || []).map(r => `${r.name} ${r.ok ? r.summary : 'FAIL'}`).join(' | ');
    lines.push(`Verify: last run ${state.ts} ${state.ok ? 'GREEN' : 'RED'}${counts ? ' (' + counts + ')' : ''}` +
      (changed.length ? `; changed since: ${changed.join(', ')} -> run verify.js --auto` : '; nothing changed since'));
  }

  try {
    const playbook = fs.readFileSync(path.join(ROOT, 'docs', 'FAILURE_PLAYBOOK.md'), 'utf8');
    const pending = playbook.split('\n').filter(l => /^\|\s*\d+/.test(l) && /PROPOSED/i.test(l))
      .map(l => (l.split('|')[2] || '').trim());
    if (pending.length) lines.push(`Rule proposals awaiting the user's lock: ${pending.join(', ')} (docs/FAILURE_PLAYBOOK.md).`);
  } catch (e) { /* none */ }

  try {
    const proposed = [];
    for (const skill of fs.readdirSync(path.join(ROOT, '.claude', 'skills'))) {
      const idx = path.join(ROOT, '.claude', 'skills', skill, 'learned', 'INDEX.md');
      if (fs.existsSync(idx) && /\(proposed\)/.test(fs.readFileSync(idx, 'utf8'))) proposed.push(skill);
    }
    if (proposed.length) lines.push(`Learned entries awaiting approval in: ${proposed.join(', ')}.`);
  } catch (e) { /* none */ }

  try {
    const drift = execFileSync(process.execPath, [path.join(ROOT, '.claude', 'scripts', 'wiki-sync.js'), '--summary'],
      { cwd: ROOT, timeout: 5000, encoding: 'utf8' }).trim();
    if (drift && !/in sync/.test(drift)) lines.push(drift);
  } catch (e) { /* drift report is optional */ }

  let ctx = lines.join('\n');
  if (ctx.length > BUDGET) ctx = ctx.slice(0, BUDGET - 20) + '\n...(truncated)';
  return { hookSpecificOutput: { hookEventName: 'SessionStart', additionalContext: ctx } };
}

if (require.main === module) run(build);
module.exports = { build };
