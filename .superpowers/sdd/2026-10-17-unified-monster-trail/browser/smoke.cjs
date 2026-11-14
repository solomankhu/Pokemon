const { chromium, launchOptions, ROOT } = require('./runtime.cjs');
const fs = require('node:fs');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
(async () => {
  const browser = await chromium.launch(launchOptions);
  const reports = [];
  try {
    for (const [name, url] of [
      ['http', "http://127.0.0.1:8765/claude's%20monsters.html"],
      ['file', pathToFileURL(path.join(ROOT, "claude's monsters.html")).href],
    ]) {
      const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
      const errors = [];
      page.on('pageerror', e => errors.push(e.message));
      page.on('console', msg => { if (msg.type() === 'error') errors.push(msg.text()); });
      await page.goto(url);
      await page.waitForTimeout(600);
      const state = await page.evaluate(() => ({ title: document.title, canvas: [...document.querySelectorAll('canvas')].map(c => ({ width: c.width, height: c.height })), gameMode: globalThis.__GAME__?.G?.mode }));
      await page.screenshot({ path: path.join(__dirname, `smoke-${name}.png`) });
      reports.push({ name, url, ...state, errors });
      await page.close();
    }
  } finally { await browser.close(); }
  fs.writeFileSync(path.join(__dirname, 'smoke-results.json'), JSON.stringify(reports, null, 2));
  console.log(JSON.stringify(reports, null, 2));
})().catch(e => { console.error(e); process.exitCode = 1; });
