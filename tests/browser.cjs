const assert = require('node:assert/strict');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const { setup, root, artifacts, playNotes, audioEvidence, save } = require('./browser-tools.cjs');

(async () => {
  const report = [], { TRACKS } = await import('../src/tracks.js');
  for (const mode of process.env.SIZZLE_URL ? ['deployed'] : ['file', 'subpath']) {
    const test = await setup();
    try {
      const url = mode === 'file' ? pathToFileURL(path.join(root, 'index.html')).href : test.url;
      await test.page.goto(url); await test.page.waitForFunction(() => window.__sizzle?.ready);
      const images = await test.page.evaluate(async () => Promise.all(['chef', 'kitchen'].map(async name => { const image = new Image(); image.src = `assets/${name}.webp`; await image.decode(); return { name, width: image.naturalWidth, height: image.naturalHeight }; })));
      assert.equal(images.length, 2);
      await test.page.screenshot({ path: path.join(artifacts, `title-${mode}.png`) });
      await test.page.keyboard.press('Enter'); await test.page.waitForFunction(() => window.__sizzle.screen === 'play');
      const input = await playNotes(test.page, TRACKS[0].notes.filter(note => note.recipe < 2), { prefix: mode });
      assert.equal(await test.page.evaluate(() => window.__sizzle.run.delivered), 2);
      const audio = await audioEvidence(test.page);
      assert.ok(audio.states.includes('running') && audio.sources > 10);
      assert.ok(audio.peak > .001 && audio.peak < .95, `non-clipping live audio: ${audio.peak}`);
      await test.page.keyboard.press('Escape'); await test.page.waitForFunction(() => window.__sizzle.screen === 'pause');
      const time = await test.page.evaluate(() => window.__sizzle.audioTime);
      await test.page.waitForTimeout(200); assert.equal(await test.page.evaluate(() => window.__sizzle.audioTime), time);
      await test.page.keyboard.press('m'); assert.equal(await test.page.evaluate(() => window.__sizzle.settings.muted), true);
      await test.page.keyboard.press('m'); assert.equal(await test.page.evaluate(() => window.__sizzle.settings.muted), false);
      await test.page.locator('[data-action="title"]').click();
      const external = test.requests.filter(request => request.startsWith('http') && new URL(request).origin !== new URL(url).origin);
      assert.deepEqual(test.errors, []); assert.deepEqual(test.failed, []); assert.deepEqual(external, []);
      report.push({ mode, url, images, input, audio, errors: test.errors, failed: test.failed, external });
    } finally { await test.close(); }
  }
  save('browser-report.json', report); console.log(JSON.stringify(report, null, 2));
})().catch(error => { console.error(error); process.exitCode = 1; });
