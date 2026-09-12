const assert = require('node:assert/strict');
const path = require('node:path');
const { setup, artifacts, waitForAudio, save } = require('./browser-tools.cjs');

(async () => {
  const report = [], { TRACKS } = await import('../src/tracks.js');
  for (const [label, viewport] of [['portrait', { width: 390, height: 844 }], ['landscape', { width: 844, height: 390 }]]) {
    const test = await setup({ viewport, hasTouch: true, isMobile: true });
    try {
      await test.page.goto(test.url); await test.page.waitForFunction(() => window.__sizzle?.ready);
      await test.page.locator('[data-action="help"]').click();
      await test.page.screenshot({ path: path.join(artifacts, `${label}-help.png`), fullPage: true });
      await test.page.locator('.help-card .primary').click();
      if (await test.page.evaluate(() => window.__sizzle.screen) !== 'title') await test.page.goto(test.url);
      await test.page.locator('[data-action="start"]').click(); await test.page.waitForFunction(() => window.__sizzle.screen === 'play');
      const boxes = await test.page.locator('.touch-controls button').evaluateAll(nodes => nodes.map(node => { const r = node.getBoundingClientRect(); return { x: r.x, y: r.y, width: r.width, height: r.height }; }));
      assert.equal(boxes.length, 5);
      assert.ok(boxes.every(box => box.width >= 40 && box.height >= 36 && box.x >= 0 && box.y >= 0 && box.x + box.width <= viewport.width + 1 && box.y + box.height <= viewport.height + 1), `all touch pads reachable: ${JSON.stringify(boxes)}`);
      for (const note of TRACKS[0].notes.filter(note => note.recipe === 0)) {
        await waitForAudio(test.page, note.at);
        const box = boxes[note.lane]; await test.page.touchscreen.tap(box.x + box.width / 2, box.y + box.height / 2);
      }
      assert.equal(await test.page.evaluate(() => window.__sizzle.run.delivered), 1, 'touch recipe completed');
      assert.equal(await test.page.evaluate(() => window.__sizzle.run.judgements.miss), 0);
      await test.page.screenshot({ path: path.join(artifacts, `${label}-play.png`) });
      assert.ok(await test.page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), 'no horizontal overflow');
      await test.page.locator('[data-action="pause"]').click(); await test.page.waitForFunction(() => window.__sizzle.screen === 'pause');
      await test.page.locator('[data-action="restart"]').click(); await test.page.waitForFunction(() => window.__sizzle.screen === 'play');
      assert.equal(await test.page.evaluate(() => window.__sizzle.run.score), 0, 'retry starts clean');
      assert.deepEqual(test.errors, []); assert.deepEqual(test.failed, []);
      report.push({ label, viewport, boxes, touchDish: 1, errors: test.errors });
    } catch (error) { await test.page.screenshot({ path: path.join(artifacts, `${label}-error.png`) }); throw error; }
    finally { await test.close(); }
  }
  const test = await setup();
  try {
    await test.page.goto(test.url); await test.page.waitForFunction(() => window.__sizzle?.ready);
    await test.page.locator('[data-action="song-select"]').first().click();
    await test.page.locator('#volume').fill('0'); await test.page.locator('#volume').dispatchEvent('input');
    await test.page.locator('#offset').fill('125'); await test.page.locator('#offset').dispatchEvent('change');
    await test.page.locator('#difficulty').selectOption('relaxed');
    await test.page.reload(); await test.page.waitForFunction(() => window.__sizzle?.ready);
    const settings = await test.page.evaluate(() => window.__sizzle.settings);
    assert.equal(settings.volume, 0); assert.equal(settings.offset, 125); assert.equal(settings.difficulty, 'relaxed');
    // Deliberately malformed storage is a fixture, separate from real completion.
    for (const value of ['null', '[]', '{"x":null}', 'invalid-json']) {
      await test.page.evaluate(value => { localStorage.setItem('sizzle-sync.settings.v1', value); localStorage.setItem('sizzle-sync.records.v1', value); }, value);
      await test.page.reload(); await test.page.waitForFunction(() => window.__sizzle?.ready);
      await test.page.locator('[data-action="song-select"]').first().click();
      assert.equal(await test.page.locator('[data-action="choose-track"]:disabled').count(), 2, 'corrupt records do not unlock songs');
    }
    await test.page.locator('[data-track="first-service"]').click(); await test.page.waitForFunction(() => window.__sizzle.screen === 'play');
    await test.page.waitForFunction(() => window.__sizzle.screen === 'results', { timeout: 30000 });
    assert.equal(await test.page.evaluate(() => window.__sizzle.run.status), 'lost', 'no-input run fails');
    await test.page.screenshot({ path: path.join(artifacts, 'failure-results.png') });
    await test.page.locator('[data-action="retry"]').click(); await test.page.waitForFunction(() => window.__sizzle.screen === 'play');
    assert.equal(await test.page.evaluate(() => window.__sizzle.run.patience), 100);
    assert.equal(await test.page.evaluate(() => window.__sizzle.run.score), 0);
    assert.deepEqual(test.errors, []); assert.deepEqual(test.failed, []);
    report.push({ settingsReload: settings, corruptStorageCases: 4, idleFailure: true, retry: true });
  } finally { await test.close(); }
  save('interaction-report.json', report); console.log(JSON.stringify(report, null, 2));
})().catch(error => { console.error(error); process.exitCode = 1; });
