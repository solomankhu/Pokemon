// Shared helpers for the harness hooks. Every hook must fail OPEN: any crash
// exits 0 with no output, because exit 2 would block the user's session.
'use strict';
const fs = require('fs');
const path = require('path');

const ROOT = process.env.CLAUDE_PROJECT_DIR || path.resolve(__dirname, '..', '..');
const STATE_DIR = path.join(ROOT, '.claude', 'state');

// Files whose change means "game work happened" (same set verify.js checks).
const GAME_FILES = [
  "claude's monsters.py", "claude's monsters.html", "claude's monsters.test.py", "claude's monsters.test.js",
  "gemini's code.html", "gemini's code.test.js", 'campaign.js', 'campaign.test.js',
];

// Directories whose contents count as "game work happened" too (checked by path prefix).
const GAME_DIRS = ['combat/'];

function mtime(rel) { try { return fs.statSync(path.join(ROOT, rel)).mtimeMs; } catch (e) { return 0; } }

function readJson(p) { try { return JSON.parse(fs.readFileSync(p, 'utf8')); } catch (e) { return null; } }

function norm(p) {
  if (!p) return '';
  let r = String(p).replace(/\\/g, '/');
  const root = ROOT.replace(/\\/g, '/');
  if (r.toLowerCase().startsWith(root.toLowerCase() + '/')) r = r.slice(root.length + 1);
  return r;
}

function run(handler) {
  let raw = '';
  process.stdin.on('data', c => (raw += c));
  process.stdin.on('end', () => {
    try {
      const input = raw ? JSON.parse(raw) : {};
      const out = handler(input);
      if (out) process.stdout.write(typeof out === 'string' ? out : JSON.stringify(out));
    } catch (e) {
      // fail open
    }
    process.exit(0);
  });
  process.stdin.on('error', () => process.exit(0));
}

// --- transcript walking (Stop hook) ---------------------------------------
function readTranscript(p) {
  try {
    return fs.readFileSync(p, 'utf8').split(/\r?\n/).filter(Boolean).map(l => {
      try { return JSON.parse(l); } catch (e) { return null; }
    }).filter(Boolean);
  } catch (e) { return []; }
}

function contentBlocks(entry) {
  const c = entry && entry.message && entry.message.content;
  if (typeof c === 'string') return [{ type: 'text', text: c }];
  return Array.isArray(c) ? c : [];
}

// A real user prompt: a user entry that isn't a tool result, a meta or hook injection.
function isRealPrompt(entry) {
  if (!entry || entry.type !== 'user' || entry.isMeta || entry.isSidechain) return false;
  const blocks = contentBlocks(entry);
  if (!blocks.length || blocks.some(b => b.type === 'tool_result')) return false;
  return blocks.some(b => b.type === 'text' && b.text && !/^<(local-command|command-name|system-reminder)/.test(b.text.trim()));
}

// Everything since the last real prompt: {promptTs, toolUses[], toolResultsText, lastText}.
function currentTurn(entries) {
  let i = entries.length - 1;
  while (i >= 0 && !isRealPrompt(entries[i])) i--;
  const start = i < 0 ? 0 : i;
  const promptTs = i < 0 ? 0 : (Date.parse(entries[i].timestamp) || 0);
  const toolUses = [];
  let toolResultsText = '';
  let lastText = '';
  for (const e of entries.slice(start + 1)) {
    for (const b of contentBlocks(e)) {
      if (e.type === 'assistant' && b.type === 'tool_use') toolUses.push({ name: b.name, input: b.input || {} });
      if (e.type === 'assistant' && b.type === 'text' && b.text && b.text.trim()) lastText = b.text;
      if (b.type === 'tool_result') {
        const c = b.content;
        toolResultsText += '\n' + (typeof c === 'string' ? c : Array.isArray(c) ? c.map(x => x.text || '').join('\n') : '');
      }
    }
  }
  return { promptTs, toolUses, toolResultsText, lastText };
}

module.exports = { ROOT, STATE_DIR, GAME_FILES, GAME_DIRS, mtime, readJson, norm, run, readTranscript, currentTurn, isRealPrompt };
