const { chromium } = require('C:/Users/ADMIN/AppData/Local/npm-cache/_npx/e41f203b7505f1fb/node_modules/playwright');
(async () => {
  const b = await chromium.launch(); const p = await b.newPage();
  await p.goto("http://127.0.0.1:8765/claude's%20monsters.html"); await p.waitForTimeout(400);
  const r = await p.evaluate(async () => {
    const src = await (await fetch(location.href)).text();
    const g = __GAME__, c = document.createElement('canvas').getContext('2d');
    const lines = (s, size, maxW) => { c.font = 'bold ' + size + 'px "Courier New", monospace'; let n = 1, line = ''; for (const w of String(s).split(' ')) { const t = line ? line + ' ' + w : w; if (c.measureText(t).width > maxW && line) { n++; line = w; } else line = t; } return n; };
    const width = (s, size) => { c.font = 'bold ' + size + 'px "Courier New", monospace'; return Math.round(c.measureText(s).width); };
    const dlg = [];
    for (const n of g.NPCS) { for (const k of ['lines', 'after', 'backstop']) if (Array.isArray(n[k])) n[k].forEach((l, i) => dlg.push((i === 0 ? n.name + ': ' : '') + l)); for (const k of ['intro', 'defeat', 'after']) if (typeof n[k] === 'string') dlg.push(n.name + ': ' + n[k]); }
    dlg.push(g.GYM_LEADER.name + ': ' + g.GYM_LEADER.intro);
    for (const k in g.SIGNS) g.SIGNS[k].forEach(l => dlg.push(l));
    // literal strings in say([...]) / qMsg(b, '...')
    for (const m of src.matchAll(/(?:say\(\[|qMsg\(b, )((?:'[^']*'(?:,\s*)?|"[^"]*"(?:,\s*)?)+)/g)) for (const s of m[1].matchAll(/'([^']*)'|"([^"]*)"/g)) dlg.push(s[1] || s[2]);
    const toasts = [...new Set([...src.matchAll(/toast = \{ s: '([^']*)'/g)].map(m => m[1]))];
    toasts.push('You can only build in ROCKY PASS.', 'That would wall off part of the trail.', 'Too close to something you need.', 'Someone is standing there.');
    const bad = dlg.map(s => [lines(s, 15, 640 - 76), s]).filter(x => x[0] >= 4);
    const tbad = toasts.map(s => [width(s, 13), s]).filter(x => x[0] > 260 - 12);
    return { nDlg: dlg.length, dlgOver: bad, nToast: toasts.length, toastOver: tbad };
  });
  console.log(JSON.stringify(r, null, 1)); await b.close();
})();
