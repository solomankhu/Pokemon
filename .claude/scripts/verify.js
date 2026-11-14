#!/usr/bin/env node
// One verification gate for the whole repo. Every agent, the reviewer's
// Step 0 and the Stop hook use this instead of remembering four commands.
//
//   node .claude/scripts/verify.js            # every check
//   node .claude/scripts/verify.js --auto     # only checks whose inputs changed since the last green run
//   node .claude/scripts/verify.js --only py,tables
//   node .claude/scripts/verify.js --json     # machine-readable summary on stdout
//
// Writes .claude/state/last-verify.json: {ts, ok, results[], inputsMtime}.
// Exit code is non-zero if any selected check fails ("any FAIL = run FAIL").
'use strict';
const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..', '..');
const STATE = path.join(ROOT, '.claude', 'state', 'last-verify.json');
const PY = process.platform === 'win32'
  ? path.join(ROOT, '.venv', 'Scripts', 'python.exe')
  : path.join(ROOT, '.venv', 'bin', 'python');

// name -> command, the files whose change makes it necessary, and how to read its count.
const CHECKS = {
  py: {
    label: 'MONSTER TRAIL python suite (incl. RENDER + PARITY)',
    cmd: [PY, ["claude's monsters.test.py"]],
    inputs: ["claude's monsters.py", "claude's monsters.test.py", "claude's monsters.html"],
    count: /(\d+) checks passed/,
  },
  js: {
    label: 'MONSTER TRAIL html suite',
    cmd: ['node', ["claude's monsters.test.js"]],
    inputs: ["claude's monsters.html", "claude's monsters.test.js"],
    count: /(\d+) checks passed/,
  },
  gemini: {
    label: 'THE STATIC BELOW suite',
    cmd: ['node', ["gemini's code.test.js"]],
    inputs: ["gemini's code.html", "gemini's code.test.js"],
    count: /(\d+) passed, 0 failed/,
  },
  campaign: {
    label: 'campaign handoff suite',
    cmd: ['node', ['campaign.test.js']],
    inputs: ['campaign.js', 'campaign.test.js', "claude's monsters.html", "gemini's code.html"],
    count: /(\d+) campaign tests passed/,
  },
  combat: {
    label: 'combat/ JS suites (3D battle)',
    cmd: ['node', [path.join('combat', 'verify.cjs')]],
    inputs: ['combat', "claude's monsters.html", 'vendor/three-r128.min.js'],
    count: null,
    pass: out => !/\bFAIL\b/.test(out),
  },
  combatpy: {
    label: 'combat/ Python command tests',
    cmd: [PY, [path.join('combat', 'commands_py_test.py')]],
    inputs: ['combat', "claude's monsters.py"],
    count: /Ran (\d+) tests?/,
    pass: out => /\nOK\s*$/.test(out.trim() ? '\n' + out.trim() : ''),
  },
  hooks: {
    label: 'harness hook tests',
    cmd: ['node', [path.join('.claude', 'hooks', 'hooks.test.js')]],
    inputs: ['.claude/hooks/lib.js', '.claude/hooks/stop-gate.js', '.claude/hooks/session-start.js',
      '.claude/hooks/pre-tool-guard.js', '.claude/hooks/post-edit-check.js', '.claude/hooks/pm-route.js', '.claude/hooks/hooks.test.js', '.claude/scripts/verify.js'],
    count: /(\d+) hook checks passed/,
  },
  tables: {
    label: 'emit_tables parity (dry run)',
    cmd: [PY, [path.join('.claude', 'skills', 'add-monster', 'emit_tables.py')]],
    inputs: ["claude's monsters.py", "claude's monsters.html"],
    count: null,
    pass: out => /already match/.test(out),
  },
};

const GAME_FILES = [...new Set(Object.values(CHECKS).flatMap(c => c.inputs))];

// Newest mtime of a directory's direct children (files only, skipping __pycache__
// and subdirectories - non-recursive), folded with the directory's own mtime so a
// deletion inside it (which bumps the dir's mtime but leaves no newer file) still
// counts as a change for --auto.
function dirMtime(abs) {
  let m = 0;
  try { m = fs.statSync(abs).mtimeMs; } catch (e) { return 0; }
  try {
    for (const name of fs.readdirSync(abs)) {
      if (name === '__pycache__') continue;
      let cst;
      try { cst = fs.statSync(path.join(abs, name)); } catch (e) { continue; }
      if (cst.isDirectory()) continue;
      m = Math.max(m, cst.mtimeMs);
    }
  } catch (e) { /* unreadable dir: fall back to its own mtime */ }
  return m;
}
function mtime(f) {
  try {
    const abs = path.join(ROOT, f);
    const st = fs.statSync(abs);
    if (!st.isDirectory()) return st.mtimeMs;
    return dirMtime(abs);
  } catch (e) { return 0; }
}
// A check is stale if it never ran green, or any of its inputs changed after its last run started.
function isStale(name, state) {
  const c = state && state.checks && state.checks[name];
  if (!c || !c.ok) return true;
  return CHECKS[name].inputs.some(f => mtime(f) > c.startedAt);
}
// Which checks read a repo-relative path (a file input, or a direct child of a directory input).
function checksFor(rel) {
  const p = String(rel).replace(/\\/g, '/').toLowerCase();
  return Object.keys(CHECKS).filter(n => CHECKS[n].inputs.some(i => {
    const inp = i.toLowerCase();
    if (inp === p) return true;
    return p.startsWith(inp + '/') && !p.slice(inp.length + 1).includes('/');
  }));
}
function readState() {
  try { return JSON.parse(fs.readFileSync(STATE, 'utf8')); } catch (e) { return null; }
}

function run(name) {
  const c = CHECKS[name];
  const t0 = Date.now();
  return new Promise(resolve => {
    let out = '';
    let child;
    try {
      child = spawn(c.cmd[0], c.cmd[1], { cwd: ROOT, env: { ...process.env, PYTHONIOENCODING: 'utf-8' } });
    } catch (e) {
      return resolve({ name, label: c.label, ok: false, code: -1, ms: 0, summary: 'spawn failed: ' + e.message, tail: '' });
    }
    child.stdout.on('data', d => (out += d));
    child.stderr.on('data', d => (out += d));
    child.on('error', e => (out += '\nspawn error: ' + e.message));
    child.on('close', code => {
      // An input edited while the suite ran makes the result meaningless either way:
      // report RACED (re-run later) instead of a false FAIL or a false PASS.
      if (c.inputs.some(f => mtime(f) > t0)) {
        return resolve({ name, label: c.label, ok: false, raced: true, code, ms: Date.now() - t0,
          summary: 'RACED (inputs changed mid-run)', failures: [], tail: 'An input changed while this check ran (another agent editing?). Re-run when edits settle.' });
      }
      const ok = code === 0 && (c.pass ? c.pass(out) : true);
      const m = c.count && out.match(c.count);
      const lines = out.trim().split(/\r?\n/);
      const fails = lines.filter(l => /\bFAIL\b|Traceback|Error:/.test(l)).slice(0, 15);
      resolve({
        name, label: c.label, ok, code, ms: Date.now() - t0,
        summary: m ? m[0] : (ok ? 'ok' : 'FAILED (exit ' + code + ')'),
        failures: ok ? [] : fails,
        tail: ok ? '' : lines.slice(-25).join('\n'),
      });
    });
  });
}

async function main() {
  const args = process.argv.slice(2);
  const json = args.includes('--json');
  const onlyArg = args.find(a => a.startsWith('--only'));
  let names = Object.keys(CHECKS);
  if (onlyArg) {
    const v = onlyArg.includes('=') ? onlyArg.split('=')[1] : args[args.indexOf(onlyArg) + 1];
    names = String(v || '').split(',').filter(n => CHECKS[n]);
  } else if (args.includes('--auto')) {
    names = names.filter(n => isStale(n, readState()));
  }

  // Each check is stamped with the time its run STARTED: an input edited after that is
  // unverified, and a partial run (--only) never vouches for checks it did not run.
  const startedAt = Date.now();
  const results = names.length ? await Promise.all(names.map(run)) : [];
  const ok = results.every(r => r.ok);
  const prev = readState();
  const checks = { ...((prev && prev.checks) || {}) };
  for (const r of results) checks[r.name] = { ok: r.ok, startedAt, summary: r.summary };
  const allOk = Object.keys(CHECKS).every(n => checks[n] && checks[n].ok);
  // inputsMtime is kept for older readers: it is only trustworthy after a full green run.
  const full = names.length === Object.keys(CHECKS).length;
  const inputsMtime = full && ok ? startedAt : Math.min(...Object.keys(CHECKS).map(n => (checks[n] && checks[n].ok ? checks[n].startedAt : 0)));
  const report = { ts: new Date().toISOString(), ok, allOk, ran: names, results, checks, inputsMtime };

  try {
    fs.mkdirSync(path.dirname(STATE), { recursive: true });
    fs.writeFileSync(STATE, JSON.stringify(report, null, 2));
    // History feeds the Stop hook's learn-loop check (red then green inside one task = reflect).
    if (names.length) {
      fs.appendFileSync(path.join(path.dirname(STATE), 'verify-history.jsonl'),
        // A raced check is not a real failure, so it must not trigger the red->green reflect rule.
        JSON.stringify({ ts: report.ts, ok: results.every(r => r.ok || r.raced), ran: names,
          failed: results.filter(r => !r.ok && !r.raced).map(r => r.name), raced: results.filter(r => r.raced).map(r => r.name) }) + '\n');
    }
  } catch (e) { /* state is a convenience, never a reason to fail */ }

  if (json) {
    process.stdout.write(JSON.stringify(report, null, 2) + '\n');
  } else {
    if (!names.length) console.log('verify: nothing changed since the last green run.');
    for (const r of results) {
      console.log(`${r.ok ? 'PASS' : 'FAIL'}  ${r.name.padEnd(9)} ${r.summary.padEnd(28)} ${(r.ms / 1000).toFixed(1)}s  ${r.label}`);
      if (!r.ok) console.log(r.tail.replace(/^/gm, '      | '));
    }
    console.log(ok ? `\nVERIFY: PASS (${results.length} checks)` : '\nVERIFY: FAIL');
  }
  process.exit(ok ? 0 : 1);
}

if (require.main === module) {
  main().catch(e => { console.error('verify crashed:', e); process.exit(2); });
}

module.exports = { CHECKS, mtime, dirMtime, isStale, checksFor };
