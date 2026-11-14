// Tests for the harness hooks: fake payloads and fake transcripts, run in a
// throwaway project dir so real state and game files are never touched.
//   node .claude/hooks/hooks.test.js
'use strict';
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');

const HOOKS = __dirname;
let pass = 0, fail = 0;
function ok(cond, name) { if (cond) pass++; else { fail++; console.log('FAIL ' + name); } }

// Sandbox project: a temp dir with the hook files plus fake game files.
const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'hooks-test-'));
fs.mkdirSync(path.join(TMP, '.claude', 'state'), { recursive: true });
fs.mkdirSync(path.join(TMP, 'docs', 'handoffs'), { recursive: true });
fs.mkdirSync(path.join(TMP, '.claude', 'scripts'), { recursive: true });
fs.copyFileSync(path.join(HOOKS, '..', 'scripts', 'wiki-sync.js'), path.join(TMP, '.claude', 'scripts', 'wiki-sync.js'));
const PY = "claude's monsters.py";
const GEM = "gemini's code.html";
fs.writeFileSync(path.join(TMP, PY), 'MOVES = {}\n');
fs.writeFileSync(path.join(TMP, "claude's monsters.html"), '<html></html>\n');
fs.writeFileSync(path.join(TMP, GEM), 'ascii only\n');

function hook(name, input) {
  const r = spawnSync(process.execPath, [path.join(HOOKS, name)], {
    input: typeof input === 'string' ? input : JSON.stringify(input),
    env: { ...process.env, CLAUDE_PROJECT_DIR: TMP }, encoding: 'utf8', timeout: 10000,
  });
  let json = null;
  try { json = r.stdout ? JSON.parse(r.stdout) : null; } catch (e) { /* non-json */ }
  return { code: r.status, out: r.stdout, json };
}
const setMtime = (rel, ms) => fs.utimesSync(path.join(TMP, rel), ms / 1000, ms / 1000);

function transcript(entries) {
  const p = path.join(TMP, 'transcript-' + Math.random().toString(36).slice(2) + '.jsonl');
  fs.writeFileSync(p, entries.map(e => JSON.stringify(e)).join('\n'));
  return p;
}
const T0 = Date.now() - 60e3;
const iso = ms => new Date(ms).toISOString();
const userPrompt = (text, ms) => ({ type: 'user', timestamp: iso(ms), message: { role: 'user', content: text } });
const toolUse = (name, input, ms) => ({ type: 'assistant', timestamp: iso(ms), message: { role: 'assistant', content: [{ type: 'tool_use', id: 'x', name, input }] } });
const toolResult = (text, ms) => ({ type: 'user', timestamp: iso(ms), message: { role: 'user', content: [{ type: 'tool_result', tool_use_id: 'x', content: text }] } });
const say = (text, ms) => ({ type: 'assistant', timestamp: iso(ms), message: { role: 'assistant', content: [{ type: 'text', text }] } });
const writeVerify = (okFlag, inputsMtime) => fs.writeFileSync(path.join(TMP, '.claude/state/last-verify.json'),
  JSON.stringify({ ts: iso(Date.now()), ok: okFlag, inputsMtime, results: [{ name: 'py', ok: okFlag, summary: '4876 checks passed' }] }));
const clearHistory = () => { try { fs.unlinkSync(path.join(TMP, '.claude/state/verify-history.jsonl')); } catch (e) { /* none */ } };

// ---------------- fail-open ----------------
for (const h of ['stop-gate.js', 'session-start.js', 'pre-tool-guard.js', 'post-edit-check.js', 'pm-route.js']) {
  ok(hook(h, 'not json{').code === 0, `${h}: garbage stdin exits 0`);
  ok(hook(h, '').code === 0, `${h}: empty stdin exits 0`);
}

// ---------------- stop-gate ----------------
// all game files older than the prompt -> silent
for (const f of [PY, "claude's monsters.html", GEM]) setMtime(f, T0 - 120e3);
let tp = transcript([userPrompt('what is the catch formula?', T0), say('It is Gen III.', T0 + 1000)]);
ok(hook('stop-gate.js', { transcript_path: tp }).out === '', 'stop: no game edits -> silent');

// edited after the prompt, no verify -> block with VERIFY + REVIEW + LOOP
setMtime(PY, T0 + 5000);
writeVerify(true, T0 - 100e3); clearHistory();
tp = transcript([userPrompt('buff EMBERLING', T0), toolUse('Edit', { file_path: path.join(TMP, PY) }, T0 + 4000), say('Done.', T0 + 6000)]);
let r = hook('stop-gate.js', { transcript_path: tp });
ok(r.json && r.json.decision === 'block', 'stop: edit without verify blocks');
ok(r.json && /VERIFY-REQUIRED/.test(r.json.reason), 'stop: names VERIFY-REQUIRED');
ok(r.json && /REVIEW-DISPATCH-REQUIRED/.test(r.json.reason), 'stop: names REVIEW-DISPATCH-REQUIRED');
ok(r.json && /LOOP-LINE-MISSING/.test(r.json.reason), 'stop: names LOOP-LINE-MISSING');

// stop_hook_active guard -> never blocks twice
r = hook('stop-gate.js', { transcript_path: tp, stop_hook_active: true });
ok(r.out === '' && r.code === 0, 'stop: stop_hook_active -> silent');

// verified after edit + FAST LOOP line -> silent
writeVerify(true, T0 + 5000);
tp = transcript([userPrompt('set EMBERLING catch to 120', T0), toolUse('Edit', { file_path: path.join(TMP, PY) }, T0 + 4000),
  say('Done.\nLOOP: lane=FAST review=skipped(FAST) reflect=not-needed', T0 + 7000)]);
ok(hook('stop-gate.js', { transcript_path: tp }).out === '', 'stop: verified + FAST loop line -> silent');

// verify state older than the edit -> VERIFY-REQUIRED even with a LOOP line
writeVerify(true, T0 + 1000);
r = hook('stop-gate.js', { transcript_path: tp });
ok(r.json && /VERIFY-REQUIRED/.test(r.json.reason) && !/REVIEW-DISPATCH/.test(r.json.reason), 'stop: stale verify only');

// red verify state -> VERIFY-REQUIRED
writeVerify(false, T0 + 9000);
r = hook('stop-gate.js', { transcript_path: tp });
ok(r.json && /VERIFY-REQUIRED/.test(r.json.reason), 'stop: red verify blocks');

// subagent edit (no Edit tool_use in main transcript) still detected by mtime
writeVerify(true, T0 - 100e3);
tp = transcript([userPrompt('add a species', T0), toolUse('Agent', { subagent_type: 'creature-designer', prompt: '...' }, T0 + 1000),
  toolResult('CHANGED (2 files)', T0 + 4500), say('ok', T0 + 6000)]);
r = hook('stop-gate.js', { transcript_path: tp });
ok(r.json && /VERIFY-REQUIRED/.test(r.json.reason), 'stop: subagent edit detected via mtime');

// game file changed by someone else (no Edit, no agent dispatch this turn) -> not this turn's work
setMtime(PY, T0 + 5000);
tp = transcript([userPrompt('build the harness', T0), toolUse('Edit', { file_path: path.join(TMP, 'docs/x.md') }, T0 + 1000), say('ok', T0 + 6000)]);
ok(hook('stop-gate.js', { transcript_path: tp }).out === '', 'stop: foreign mtime change without dispatch ignored');

// reviewer dispatched + verified, but verdict NEEDS_REVISION and no reflection -> REFLECT-DUE
writeVerify(true, T0 + 5000);
tp = transcript([userPrompt('add a species', T0), toolUse('Agent', { subagent_type: 'game-reviewer', prompt: '...' }, T0 + 5500),
  toolResult('{"verdict":"NEEDS_REVISION","issues":[]}', T0 + 5600), say('Fixed.\nLOOP: lane=STANDARD review=PASS(r2)', T0 + 8000)]);
r = hook('stop-gate.js', { transcript_path: tp });
ok(r.json && /REFLECT-DUE/.test(r.json.reason) && !/REVIEW-DISPATCH/.test(r.json.reason), 'stop: bad verdict -> REFLECT-DUE only');

// same, with reflect recorded -> silent
tp = transcript([userPrompt('add a species', T0), toolUse('Agent', { subagent_type: 'game-reviewer', prompt: '...' }, T0 + 5500),
  toolResult('{"verdict":"NEEDS_REVISION","issues":[]}', T0 + 5600),
  say('Fixed.\nREFLECT: def-key-mismatch occurrences=1\nLOOP: lane=STANDARD review=PASS(r2) reflect=def-key-mismatch', T0 + 8000)]);
ok(hook('stop-gate.js', { transcript_path: tp }).out === '', 'stop: reflected -> silent');

// red-then-green verify history inside the turn -> REFLECT-DUE
fs.writeFileSync(path.join(TMP, '.claude/state/verify-history.jsonl'),
  [{ ts: iso(T0 + 2000), ok: false }, { ts: iso(T0 + 5200), ok: true }].map(x => JSON.stringify(x)).join('\n') + '\n');
tp = transcript([userPrompt('add a species', T0), toolUse('Agent', { subagent_type: 'game-reviewer' }, T0 + 5500),
  toolResult('{"verdict":"PASS"}', T0 + 5600), say('Done.\nLOOP: lane=STANDARD review=PASS(r1)', T0 + 8000)]);
r = hook('stop-gate.js', { transcript_path: tp });
ok(r.json && /REFLECT-DUE/.test(r.json.reason) && /red then green/.test(r.json.reason), 'stop: red->green history -> REFLECT-DUE');
clearHistory();

// the prompt boundary skips tool_result "user" entries and an older prompt's edits
setMtime(PY, T0 - 50e3);
tp = transcript([userPrompt('old task', T0 - 60e3), toolUse('Edit', { file_path: path.join(TMP, 'docs/x.md') }, T0 - 55e3),
  userPrompt('new question', T0), toolUse('Read', { file_path: 'a' }, T0 + 100), toolResult('file text', T0 + 200), say('answer', T0 + 300)]);
ok(hook('stop-gate.js', { transcript_path: tp }).out === '', 'stop: tool_result is not a prompt boundary; old edits ignored');

// a file under combat/ edited by the Edit tool, no verify -> VERIFY-REQUIRED
fs.mkdirSync(path.join(TMP, 'combat'), { recursive: true });
fs.writeFileSync(path.join(TMP, 'combat', 'x.js'), 'module.exports = {};\n');
writeVerify(true, T0 - 100e3); clearHistory();
tp = transcript([userPrompt('touch combat', T0), toolUse('Edit', { file_path: path.join(TMP, 'combat', 'x.js') }, T0 + 4000), say('Done.', T0 + 6000)]);
r = hook('stop-gate.js', { transcript_path: tp });
ok(r.json && r.json.decision === 'block' && /VERIFY-REQUIRED/.test(r.json.reason), 'stop: combat/ edit without verify blocks');

// combat/ file with a fresh mtime but no Edit tool_use and no agent dispatch -> ignored
setMtime('combat/x.js', T0 + 5000);
tp = transcript([userPrompt('ask about combat', T0), toolUse('Read', { file_path: path.join(TMP, 'combat', 'x.js') }, T0 + 1000), say('ok', T0 + 6000)]);
ok(hook('stop-gate.js', { transcript_path: tp }).out === '', 'stop: combat/ mtime without edit/dispatch ignored');

// a subagent dispatch (no Edit tool_use) touches combat/x.js (mtime T0+5000, set above); stale verify -> blocks, names combat/x.js
writeVerify(true, T0 - 100e3); clearHistory();
tp = transcript([userPrompt('work on combat', T0), toolUse('Agent', { subagent_type: 'game-feel-engineer', prompt: '...' }, T0 + 1000),
  toolResult('CHANGED (1 files)', T0 + 4500), say('ok', T0 + 6000)]);
r = hook('stop-gate.js', { transcript_path: tp });
ok(r.json && r.json.decision === 'block', 'stop: combat/ subagent edit (dispatch+mtime, no Edit) blocks');
ok(r.json && /VERIFY-REQUIRED/.test(r.json.reason) && /combat\/x\.js/.test(r.json.reason), 'stop: VERIFY-REQUIRED names combat/x.js');

// combat/x.js Edit-ed and fully covered by a verify >= its mtime, plus a FAST loop line -> silent
// (proves the gate's per-file mtime agrees with verify's directory-aware inputsMtime)
writeVerify(true, T0 + 5000);
tp = transcript([userPrompt('touch combat again', T0), toolUse('Edit', { file_path: path.join(TMP, 'combat', 'x.js') }, T0 + 4000),
  say('Done.\nLOOP: lane=FAST review=skipped(FAST) reflect=not-needed', T0 + 7000)]);
ok(hook('stop-gate.js', { transcript_path: tp }).out === '', 'stop: combat/ edit verified (mtime agreement) + FAST loop line -> silent');

// ---------------- pre-tool-guard ----------------
const deny = x => x.json && x.json.hookSpecificOutput && x.json.hookSpecificOutput.permissionDecision === 'deny';
const ctx = x => x.json && x.json.hookSpecificOutput && x.json.hookSpecificOutput.additionalContext || '';
ok(deny(hook('pre-tool-guard.js', { tool_name: 'Edit', tool_input: { file_path: 'E:\\SSM\\TMI-Modern\\AGENTS.md' } })), 'guard: Edit E:\\SSM denied');
ok(deny(hook('pre-tool-guard.js', { tool_name: 'Write', tool_input: { file_path: 'e:/ssm/x.md' } })), 'guard: Write e:/ssm denied');
ok(deny(hook('pre-tool-guard.js', { tool_name: 'Write', tool_input: { file_path: '/e/SSM/x.md' } })), 'guard: Write /e/SSM denied');
ok(hook('pre-tool-guard.js', { tool_name: 'Read', tool_input: { file_path: 'E:\\SSM\\TMI-Modern\\AGENTS.md' } }).out === '', 'guard: Read E:\\SSM allowed');
ok(hook('pre-tool-guard.js', { tool_name: 'Edit', tool_input: { file_path: 'E:\\game\\SSMnotes.md' } }).out === '', 'guard: non-SSM path allowed');
ok(deny(hook('pre-tool-guard.js', { tool_name: 'Read', tool_input: { file_path: 'E:\\SSM\\TMI-Modern\\.env.local' } })), 'guard: Read .env denied');
ok(!deny(hook('pre-tool-guard.js', { tool_name: 'Read', tool_input: { file_path: 'E:\\game\\docs\\environment.md' } })), 'guard: env-ish name allowed');
ok(/Exit-code masking/.test(ctx(hook('pre-tool-guard.js', { tool_name: 'Bash', tool_input: { command: `node "claude's monsters.test.js" | tail -3` } }))), 'guard: piped test warns');
ok(hook('pre-tool-guard.js', { tool_name: 'Bash', tool_input: { command: 'node .claude/scripts/verify.js' } }).out === '', 'guard: plain verify silent');
ok(hook('pre-tool-guard.js', { tool_name: 'Bash', tool_input: { command: 'node .claude/scripts/verify.js; python balance_report.py | tail -2' } }).out === '', 'guard: pipe on another segment silent');
ok(hook('pre-tool-guard.js', { tool_name: 'Bash', tool_input: { command: 'set -o pipefail; node x.test.js | tail' } }).out === '', 'guard: pipefail silent');
const big = path.join(TMP, 'big.py');
fs.writeFileSync(big, ('x = 1  # padding padding padding padding padding padding padding padding\n').repeat(900));
ok(/Read-discipline/.test(ctx(hook('pre-tool-guard.js', { tool_name: 'Read', tool_input: { file_path: big } }))), 'guard: big whole-file read warns');
ok(hook('pre-tool-guard.js', { tool_name: 'Read', tool_input: { file_path: big, offset: 10, limit: 50 } }).out === '', 'guard: windowed read silent');

// ---------------- post-edit-check ----------------
fs.writeFileSync(path.join(TMP, GEM), 'ok\nbad \u2014 dash\n');
ok(/ASCII-VIOLATION.*line\(s\) 2/.test(ctx(hook('post-edit-check.js', { tool_name: 'Edit', tool_input: { file_path: path.join(TMP, GEM), new_string: 'x' } }))), 'post: non-ASCII in gemini flagged');
fs.writeFileSync(path.join(TMP, GEM), 'ascii only\n');
ok(!/ASCII/.test(ctx(hook('post-edit-check.js', { tool_name: 'Edit', tool_input: { file_path: path.join(TMP, GEM), new_string: 'x' } }))), 'post: ascii gemini clean');
setMtime("claude's monsters.html", Date.now() - 3600e3);
r = hook('post-edit-check.js', { session_id: 's1', tool_name: 'Edit', tool_input: { file_path: path.join(TMP, PY), new_string: 'SPECIES["x"] = 1' } });
ok(/TABLES/.test(ctx(r)) && /PARITY/.test(ctx(r)), 'post: py table edit -> TABLES + PARITY');
r = hook('post-edit-check.js', { session_id: 's1', tool_name: 'Edit', tool_input: { file_path: path.join(TMP, PY), new_string: 'def f(): pass' } });
ok(!/PARITY/.test(ctx(r)), 'post: PARITY reminder only once per session+file');

// ---------------- session-start ----------------
fs.writeFileSync(path.join(TMP, 'docs/handoffs/PROGRESS.md'), '# Progress\n\n## Next\n- finish GLOOMSTALK lunge tuning\n\n## Recently done\n- x\n');
writeVerify(true, Date.now() - 3600e3);
setMtime(PY, Date.now());
r = hook('session-start.js', { source: 'startup' });
const sctx = r.json && r.json.hookSpecificOutput && r.json.hookSpecificOutput.additionalContext || '';
ok(r.json && r.json.hookSpecificOutput.hookEventName === 'SessionStart', 'session: emits SessionStart context');
ok(/GLOOMSTALK lunge/.test(sctx) && !/Recently done/.test(sctx), 'session: injects only ## Next');
ok(/changed since: .*claude's monsters\.py/.test(sctx), 'session: flags stale verify');
ok(sctx.length <= 3000, 'session: within budget');

// ---------------- pm-route ----------------
ok(/game-pm/.test(ctx(hook('pm-route.js', { prompt: 'make the gym harder' }))), 'route: game prompt routed');
ok(hook('pm-route.js', { prompt: '/status' }).out === '', 'route: slash command silent');
ok(hook('pm-route.js', { prompt: 'what is the weather' }).out === '', 'route: non-game silent');

// ---------------- verify.js dirMtime (direct unit check) ----------------
const verify = require(path.join(HOOKS, '..', 'scripts', 'verify.js'));
ok(typeof verify.dirMtime === 'function', 'verify: dirMtime exported, main() did not auto-run on require');
const DMT = fs.mkdtempSync(path.join(os.tmpdir(), 'dirmtime-test-'));
fs.writeFileSync(path.join(DMT, 'a.txt'), 'a');
fs.mkdirSync(path.join(DMT, '__pycache__'));
fs.writeFileSync(path.join(DMT, '__pycache__', 'cache.pyc'), 'x');
fs.mkdirSync(path.join(DMT, 'sub'));
fs.writeFileSync(path.join(DMT, 'sub', 'deep.txt'), 'x');
const touch = (rel, ms) => fs.utimesSync(path.join(DMT, rel), ms / 1000, ms / 1000);
const DT0 = Date.now() - 100e3;
// newer mtimes on the ignored entries (pycache file, subdir and its file) must not win
touch(path.join('__pycache__', 'cache.pyc'), DT0 + 40e3);
touch('sub', DT0 + 40e3);
touch(path.join('sub', 'deep.txt'), DT0 + 40e3);
touch('a.txt', DT0);
touch('.', DT0); // the directory's own mtime, set last so the writes above don't clobber it
ok(verify.dirMtime(DMT) === DT0, 'verify.dirMtime: newest direct child, ignoring __pycache__ and subdirectories');
const DT1 = DT0 + 90e3;
touch('.', DT1); // simulate a deletion: the dir's own mtime moves past every remaining child
ok(verify.dirMtime(DMT) === DT1, 'verify.dirMtime: folds in the directory\'s own mtime');
fs.rmSync(DMT, { recursive: true, force: true });

// ---------------- per-check verify state ----------------
ok(Array.isArray(verify.CHECKS.combat.inputs) && verify.CHECKS.combat.inputs.includes('combat'), 'verify: combat check reads the combat/ dir');
ok(/^Ran 1 test$/.test(('Ran 1 test'.match(verify.CHECKS.combatpy.count) || [''])[0]), 'verify: combatpy count accepts singular "Ran 1 test"');
ok(verify.checksFor('combat/x.js').includes('combat') && verify.checksFor('Combat/X.js').includes('combat'), 'verify.checksFor: direct combat child, case-insensitive');
ok(verify.checksFor('combat/sub/a.js').length === 0, 'verify.checksFor: nested combat path is not covered');
ok(verify.checksFor("claude's monsters.html").includes('js') && verify.checksFor("claude's monsters.html").includes('py'), 'verify.checksFor: html is read by js and py');
ok(verify.isStale('js', null) && verify.isStale('js', { checks: { js: { ok: false, startedAt: Date.now() } } }), 'verify.isStale: never-run or red is stale');

const writeChecks = map => fs.writeFileSync(path.join(TMP, '.claude/state/last-verify.json'),
  JSON.stringify({ ts: iso(Date.now()), ok: true, inputsMtime: 0, checks: map }));
const LOOPFAST = 'Done.\nLOOP: lane=FAST review=skipped(FAST) reflect=not-needed';
setMtime('combat/x.js', T0 + 5000);
setMtime("claude's monsters.html", T0 + 5000);
const fresh = { ok: true, startedAt: T0 + 6000 }, stale = { ok: true, startedAt: T0 + 1000 };
// every check that reads the html is fresh (combatpy, which doesn't read it, is stale) -> html edit silent
writeChecks({ js: fresh, py: fresh, tables: fresh, campaign: fresh, combat: fresh, combatpy: stale });
tp = transcript([userPrompt('window tweak', T0), toolUse('Edit', { file_path: path.join(TMP, "claude's monsters.html") }, T0 + 4000), say(LOOPFAST, T0 + 7000)]);
ok(hook('stop-gate.js', { transcript_path: tp }).out === '', 'stop/per-check: html edit covered by every check that reads it -> silent');
// combat also reads the html: a stale combat check blocks an html edit even when js/py are fresh
writeChecks({ js: fresh, py: fresh, tables: fresh, campaign: fresh, combat: stale, combatpy: stale });
r = hook('stop-gate.js', { transcript_path: tp });
ok(r.json && /VERIFY-REQUIRED: claude's monsters\.html/.test(r.json.reason), 'stop/per-check: stale combat (reads html) blocks an html edit');
tp = transcript([userPrompt('combat tweak', T0), toolUse('Edit', { file_path: path.join(TMP, 'combat', 'x.js') }, T0 + 4000), say(LOOPFAST, T0 + 7000)]);
r = hook('stop-gate.js', { transcript_path: tp });
ok(r.json && /VERIFY-REQUIRED: combat\/x\.js/.test(r.json.reason), 'stop/per-check: a partial run never vouches for the combat check');
// a red check that reads the file -> blocks even if it ran after the edit
writeChecks({ js: { ok: false, startedAt: T0 + 6000 }, py: fresh, tables: fresh, campaign: fresh, combat: fresh, combatpy: fresh });
tp = transcript([userPrompt('window tweak', T0), toolUse('Edit', { file_path: path.join(TMP, "claude's monsters.html") }, T0 + 4000), say(LOOPFAST, T0 + 7000)]);
r = hook('stop-gate.js', { transcript_path: tp });
ok(r.json && /VERIFY-REQUIRED/.test(r.json.reason), 'stop/per-check: red js check blocks the html edit');
// case-insensitive Edit path under combat/
writeChecks({ combat: stale, combatpy: stale });
tp = transcript([userPrompt('combat tweak', T0), toolUse('Edit', { file_path: path.join(TMP, 'Combat', 'x.js') }, T0 + 4000), say(LOOPFAST, T0 + 7000)]);
r = hook('stop-gate.js', { transcript_path: tp });
ok(r.json && /VERIFY-REQUIRED/.test(r.json.reason), 'stop: uppercase Combat/ path still detected');
// subdirectory under combat/ with a fresh mtime is skipped by the dispatch branch; nested Edit is ignored
fs.mkdirSync(path.join(TMP, 'combat', 'sub'), { recursive: true });
fs.writeFileSync(path.join(TMP, 'combat', 'sub', 'a.js'), 'x');
setMtime('combat/sub', T0 + 5000);
setMtime('combat/x.js', T0 - 50e3);
writeChecks({ combat: stale, combatpy: stale });
tp = transcript([userPrompt('work', T0), toolUse('Agent', { subagent_type: 'game-feel-engineer' }, T0 + 1000), say(LOOPFAST, T0 + 7000)]);
r = hook('stop-gate.js', { transcript_path: tp });
ok(!(r.json && /combat\/sub/.test(r.json.reason)), 'stop: dispatch branch skips combat/ subdirectories');
tp = transcript([userPrompt('work', T0), toolUse('Edit', { file_path: path.join(TMP, 'combat', 'sub', 'a.js') }, T0 + 4000), say(LOOPFAST, T0 + 7000)]);
ok(hook('stop-gate.js', { transcript_path: tp }).out === '', 'stop: nested combat/sub edit is not a gated path (no check reads it)');

// wiki-sync: a wiki page the index does not link is an ORPHAN; listing it clears the finding
fs.mkdirSync(path.join(TMP, 'docs', 'wiki'), { recursive: true });
const wikiPage = (name, body) => fs.writeFileSync(path.join(TMP, 'docs', 'wiki', name), `---\ntitle: x\nsources: []\nsynced: 2099-01-01\n---\n${body}\n`);
const wikiFindings = () => JSON.parse(spawnSync(process.execPath, [path.join(TMP, '.claude', 'scripts', 'wiki-sync.js'), '--json'], { encoding: 'utf8' }).stdout).findings;
wikiPage('index.md', '| [a.md](a.md) | a |');
wikiPage('a.md', 'a');
wikiPage('b.md', 'b');
ok(wikiFindings().some(f => f.kind === 'ORPHAN' && /b\.md/.test(f.detail)), 'wiki-sync: unlisted page is ORPHAN');
ok(!wikiFindings().some(f => f.kind === 'ORPHAN' && /a\.md/.test(f.detail)), 'wiki-sync: listed page is not ORPHAN');
wikiPage('index.md', '| [a.md](a.md) | a |\n| [b.md](b.md) | b |');
ok(!wikiFindings().some(f => f.kind === 'ORPHAN'), 'wiki-sync: listing the page clears ORPHAN');

fs.rmSync(TMP, { recursive: true, force: true });
console.log(`\n${pass} hook checks passed, ${fail} failed.`);
process.exit(fail ? 1 : 0);
