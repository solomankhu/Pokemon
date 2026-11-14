#!/usr/bin/env node
// Deterministic doc-drift report. The wiki-sync skill acts on its findings and
// the SessionStart hook shows the one-line summary. Report-only: exit 0 unless --strict.
//
//   node .claude/scripts/wiki-sync.js            # human report
//   node .claude/scripts/wiki-sync.js --json
//   node .claude/scripts/wiki-sync.js --summary  # one line
//   node .claude/scripts/wiki-sync.js --touch docs/wiki/x.md   # mark a page synced today
'use strict';
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..', '..');
const rel = p => path.relative(ROOT, p).split(path.sep).join('/');
const read = p => { try { return fs.readFileSync(path.join(ROOT, p), 'utf8'); } catch (e) { return null; } };
const exists = p => fs.existsSync(path.join(ROOT, p));

function newestMtime(p, depth = 2) {
  const abs = path.join(ROOT, p);
  let st;
  try { st = fs.statSync(abs); } catch (e) { return 0; }
  if (!st.isDirectory()) return st.mtimeMs;
  if (depth === 0) return 0;
  let m = 0;
  for (const name of fs.readdirSync(abs)) {
    if (name === 'learned' || name.startsWith('.') || name === '__pycache__') continue;
    m = Math.max(m, newestMtime(path.join(p, name), depth - 1));
  }
  return m;
}

function frontmatter(text) {
  const m = text && text.match(/^---\r?\n([\s\S]*?)\r?\n---/);
  if (!m) return null;
  const fm = {};
  for (const line of m[1].split(/\r?\n/)) {
    const kv = line.match(/^(\w+):\s*(.*)$/);
    if (!kv) continue;
    let v = kv[2].trim();
    if (v.startsWith('[')) { try { v = JSON.parse(v); } catch (e) { v = v.slice(1, -1).split(',').map(s => s.trim().replace(/^["']|["']$/g, '')); } }
    fm[kv[1]] = v;
  }
  return fm;
}

function wikiPages() {
  const dir = path.join(ROOT, 'docs', 'wiki');
  try { return fs.readdirSync(dir).filter(f => f.endsWith('.md')).map(f => 'docs/wiki/' + f); } catch (e) { return []; }
}

function check() {
  const findings = [];
  // 1. Stale pages: a listed source changed after the page's `synced` date.
  for (const page of wikiPages()) {
    const fm = frontmatter(read(page));
    if (!fm) { findings.push({ kind: 'NO-FRONTMATTER', where: page, detail: 'needs title/sources/synced' }); continue; }
    const synced = Date.parse(fm.synced || '') + 24 * 3600e3; // the whole synced day counts as synced
    for (const src of [].concat(fm.sources || [])) {
      if (!exists(src)) { findings.push({ kind: 'MISSING-SOURCE', where: page, detail: src }); continue; }
      if (!(newestMtime(src) <= synced)) findings.push({ kind: 'STALE', where: page, detail: `${src} changed after synced ${fm.synced}` });
    }
  }
  // 2. Harness inventory: every agent and skill on disk is named in CLAUDE.md and the harness page.
  const claude = read('CLAUDE.md') || '';
  const harness = read('docs/wiki/harness.md') || '';
  const agents = (fs.existsSync(path.join(ROOT, '.claude/agents')) ? fs.readdirSync(path.join(ROOT, '.claude/agents')) : [])
    .filter(f => f.endsWith('.md')).map(f => f.slice(0, -3));
  const skills = (fs.existsSync(path.join(ROOT, '.claude/skills')) ? fs.readdirSync(path.join(ROOT, '.claude/skills')) : [])
    .filter(f => exists(`.claude/skills/${f}/SKILL.md`));
  for (const [kind, names] of [['agent', agents], ['skill', skills]]) {
    for (const n of names) {
      if (!claude.includes(n)) findings.push({ kind: 'UNDOCUMENTED', where: 'CLAUDE.md', detail: `${kind} ${n}` });
      if (harness && !harness.includes(n)) findings.push({ kind: 'UNDOCUMENTED', where: 'docs/wiki/harness.md', detail: `${kind} ${n}` });
    }
  }
  // 3. Test-count claims in CLAUDE.md vs the last green verify run (more than 3% off = drift).
  let state = null;
  try { state = JSON.parse(read('.claude/state/last-verify.json')); } catch (e) { /* no state yet */ }
  if (state && state.results) {
    const actual = {};
    for (const r of state.results) { const m = String(r.summary).match(/(\d+)/); if (r.ok && m) actual[r.name] = +m[1]; }
    const claims = [
      ['py', /monsters\.test\.py"\s*#\s*~?(\d[\d,]*) checks/],
      ['js', /monsters\.test\.js"\s*#[^\n]*?~(\d[\d,]*)/],
      ['gemini', /code\.test\.js"`? runs (\d[\d,]*) checks/],
    ];
    for (const [name, re] of claims) {
      const m = claude.match(re);
      if (!m || !actual[name]) continue;
      const claim = +m[1].replace(/,/g, '');
      if (Math.abs(claim - actual[name]) / actual[name] > 0.03) {
        findings.push({ kind: 'COUNT-DRIFT', where: 'CLAUDE.md', detail: `${name} claims ${claim}, last verify ${actual[name]}` });
      }
    }
  }
  // 4. Broken relative links in CLAUDE.md, the wiki and the harness docs.
  const linkDocs = ['CLAUDE.md', ...wikiPages(), 'docs/FAILURE_PLAYBOOK.md', 'docs/SOLUTIONS.md', 'docs/playtests/README.md'];
  for (const doc of linkDocs) {
    const text = read(doc);
    if (!text) continue;
    const base = path.dirname(path.join(ROOT, doc));
    for (const m of text.matchAll(/\]\(([^)#\s]+)(?:#[^)]*)?\)/g)) {
      const target = m[1];
      if (/^[a-z]+:/i.test(target)) continue;
      const abs = path.resolve(base, decodeURIComponent(target));
      if (!fs.existsSync(abs)) findings.push({ kind: 'BROKEN-LINK', where: doc, detail: target });
    }
  }
  // 5. Orphans: every wiki page is reachable from index.md, the catalog queries start from.
  const index = read('docs/wiki/index.md');
  if (index) {
    for (const page of wikiPages()) {
      const name = path.basename(page);
      if (name !== 'index.md' && !index.includes(`](${name}`)) findings.push({ kind: 'ORPHAN', where: 'docs/wiki/index.md', detail: `${name} is not listed` });
    }
  }
  return findings;
}

function touch(page) {
  const text = read(page);
  if (!text) { console.error('no such page: ' + page); process.exit(1); }
  const today = new Date().toISOString().slice(0, 10);
  const out = /\nsynced:.*\n/.test(text) ? text.replace(/\nsynced:.*\n/, `\nsynced: ${today}\n`) : text;
  fs.writeFileSync(path.join(ROOT, page), out);
  console.log(`${page}: synced ${today}`);
}

const args = process.argv.slice(2);
if (args[0] === '--touch') { for (const p of args.slice(1)) touch(p); process.exit(0); }
const findings = check();
if (args.includes('--json')) {
  process.stdout.write(JSON.stringify({ ok: findings.length === 0, findings }, null, 2) + '\n');
} else if (args.includes('--summary')) {
  const by = {};
  for (const f of findings) by[f.kind] = (by[f.kind] || 0) + 1;
  console.log(findings.length ? 'wiki-sync: ' + Object.entries(by).map(([k, n]) => `${n} ${k}`).join(', ') + ' (run /wiki-sync)' : 'wiki-sync: docs in sync');
} else {
  if (!findings.length) console.log('wiki-sync: docs in sync');
  for (const f of findings) console.log(`${f.kind.padEnd(15)} ${f.where}  ${f.detail}`);
}
process.exit(args.includes('--strict') && findings.length ? 1 : 0);
