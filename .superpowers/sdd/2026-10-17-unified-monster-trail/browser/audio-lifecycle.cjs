const { chromium, launchOptions } = require('./runtime.cjs');
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
(async () => {
  const browser = await chromium.launch(launchOptions);
  const events = [], errors = [], cycles = [];
  const live = new Map();
  const page = await browser.newPage();
  page.on('pageerror', e => errors.push(e.message));
  const cdp = await page.context().newCDPSession(page);
  for (const event of ['contextCreated', 'contextChanged', 'contextDestroyed']) cdp.on('WebAudio.' + event, data => {
    events.push({ event, ...data });
    if (event === 'contextDestroyed') live.delete(data.contextId);
    else live.set(data.context.contextId, data.context);
  });
  await cdp.send('WebAudio.enable');
  try {
    await page.goto("http://127.0.0.1:8765/claude's%20monsters.html");
    await page.keyboard.press('Enter');
    await page.evaluate(() => {
      const g = __GAME__; g.G.party = [g.makeMon(g.STARTERS[0], 15)];
      g.G.flags.starter = true; g.G.flags.gym = true; g.G.mode = 'overworld';
    });
    await page.waitForTimeout(150);
    const parentContexts = [...live.keys()];
    for (const method of ['parent-bar', 'child-pause']) {
      const before = new Set(live.keys());
      assert.equal(await page.evaluate(() => __GAME__.campaignHost.enterChapter(1)), true);
      await page.waitForSelector('iframe');
      const frame = page.frames().find(f => f !== page.mainFrame());
      await frame.waitForFunction(() => globalThis.__STATIC__?.debug.state.ready);
      await frame.evaluate(() => __STATIC__.debug.play());
      await page.waitForTimeout(350);
      const audioBeforeReturn = await frame.evaluate(() => __STATIC__.debug.audio);
      assert.equal(audioBeforeReturn, 'running');
      const childIds = [...live.keys()].filter(id => !before.has(id));
      assert.equal(childIds.length, 1, 'Exactly one child audio context created');
      if (method === 'parent-bar') await page.locator('.campaign-return').click();
      else {
        await frame.evaluate(() => __STATIC__.debug.pause());
        await page.waitForTimeout(550);
        await frame.getByRole('button', { name: 'RETURN TO TRAIL', exact: true }).click();
      }
      await page.waitForFunction(() => !document.querySelector('iframe'));
      await cdp.send('HeapProfiler.collectGarbage');
      for (let n = 0; n < 20 && childIds.some(id => live.has(id) && live.get(id).contextState !== 'closed'); n++) await page.waitForTimeout(100);
      const survivingChildIds = childIds.filter(id => live.has(id) && live.get(id).contextState !== 'closed');
      for (let n = 0; n < 50 && parentContexts.some(id => live.get(id)?.contextState !== 'running'); n++) await page.waitForTimeout(100);
      const parentStatesAfterReturn = parentContexts.map(id => ({ contextId: id, state: live.get(id)?.contextState }));
      cycles.push({ method, audioBeforeReturn, childIds, survivingChildIds,
        parentStatesAfterReturn,
        destroyed: events.filter(e => e.event === 'contextDestroyed' && childIds.includes(e.contextId)),
        closed: childIds.filter(id => live.get(id)?.contextState === 'closed'),
        remainingContexts: [...live.values()] });
      console.log(JSON.stringify(cycles[cycles.length - 1], null, 2));
      assert.ok(parentStatesAfterReturn.every(c => c.state === 'running'), 'Parent audio resumes after return');
    }
    assert.deepEqual(errors, []);
    const report = { pass: cycles.every(c => !c.survivingChildIds.length), parentContexts, cycles, pageerrors: errors, events };
    fs.writeFileSync(path.join(__dirname, 'audio-lifecycle-results.json'), JSON.stringify(report, null, 2));
    console.log(JSON.stringify(report, null, 2));
    assert.equal(report.pass, true, 'No open child AudioContext survives iframe removal');
  } finally { await browser.close(); }
})().catch(e => { console.error(e); process.exitCode = 1; });
