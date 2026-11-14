// PreToolUse guard.
//   deny : writes into E:\SSM (a read-only reference repo) and any read/write of .env* files
//   warn : a test run piped into tail/head/grep (hides the exit code)
//   warn : Read of a big game file with no offset/limit (Grep first, then read a window)
'use strict';
const fs = require('fs');
const path = require('path');
const { ROOT, run } = require('./lib');

const deny = reason => ({ hookSpecificOutput: { hookEventName: 'PreToolUse', permissionDecision: 'deny', permissionDecisionReason: reason } });
const warn = text => ({ hookSpecificOutput: { hookEventName: 'PreToolUse', additionalContext: text } });

const isSSM = p => /^(e:)?[\\/]ssm([\\/]|$)/i.test(p) || /^\/e\/ssm(\/|$)/i.test(p);
const isEnv = p => /(^|[\\/])\.env(\.[^\\/]*)?$/i.test(String(p));

function guard(input) {
  const tool = input.tool_name || '';
  const ti = input.tool_input || {};
  const file = ti.file_path || ti.notebook_path || '';

  if (/^(Edit|Write|MultiEdit|NotebookEdit)$/.test(tool) && file) {
    if (isSSM(file)) {
      return deny('E:\\SSM is a read-only reference for this project; copy patterns into E:\\game instead of editing it.');
    }
    if (isEnv(file)) return deny('Writing .env files is not allowed by the harness.');
  }
  if (tool === 'Read' && file) {
    if (isEnv(file)) return deny('Reading .env / credential files is not allowed by the harness.');
    if (ti.offset == null && ti.limit == null) {
      try {
        const abs = path.isAbsolute(file) ? file : path.join(ROOT, file);
        const st = fs.statSync(abs);
        if (st.isFile() && st.size > 40000 && /\.(py|html|js)$/i.test(abs)) {
          const lines = fs.readFileSync(abs, 'utf8').split('\n').length;
          if (lines > 400) return warn(`Read-discipline: ${path.basename(abs)} has ${lines} lines. Grep for the symbol first, then Read with offset/limit around it.`);
        }
      } catch (e) { /* not a local file */ }
    }
  }
  if (tool === 'Bash' || tool === 'PowerShell') {
    const cmd = String(ti.command || '');
    // Judge each ;/&&/|| /newline segment on its own: only a pipe hanging off a test run masks it.
    const segments = cmd.split(/;|&&|\|\||\r?\n/);
    const masked = segments.some(s => /(test\.py|test\.js|verify\.js)/.test(s.split('|')[0]) && /\|\s*(tail|head|grep|Select-Object|Select-String)\b/.test(s));
    if (masked && !/PIPESTATUS|pipefail/.test(cmd)) {
      return warn('Exit-code masking: a test run piped into tail/head/grep reports the pipe\'s status, not the suite\'s. Use `node .claude/scripts/verify.js` (it prints a summary) or add `set -o pipefail`.');
    }
  }
  return null;
}

if (require.main === module) run(guard);
module.exports = { guard, isSSM };
