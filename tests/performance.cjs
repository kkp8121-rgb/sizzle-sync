const assert = require('node:assert/strict');
const { setup, playNotes, audioEvidence, save } = require('./browser-tools.cjs');

(async () => {
  const { TRACKS } = await import('../src/tracks.js'), report = [];
  for (const rate of [1, 4]) {
    const test = await setup();
    try {
      const client = await test.context.newCDPSession(test.page); await client.send('Emulation.setCPUThrottlingRate', { rate });
      await test.page.goto(test.url); await test.page.waitForFunction(() => window.__sizzle?.ready);
      await test.page.keyboard.press('Enter'); await test.page.waitForFunction(() => window.__sizzle.screen === 'play');
      const inputs = await playNotes(test.page, TRACKS[0].notes.filter(note => note.recipe < 3), { screenshot: false });
      const audio = await audioEvidence(test.page), run = await test.page.evaluate(() => window.__sizzle.run);
      assert.equal(run.delivered, 3); assert.equal(run.judgements.miss, 0);
      assert.ok(audio.averageMs < 34, `responsive under ${rate}x CPU throttle: ${audio.averageMs}`);
      assert.ok(audio.peak > .001 && audio.peak < .95, 'real non-clipping synthesized audio');
      await test.page.keyboard.press('m'); await test.page.waitForTimeout(200);
      const mute = await test.page.evaluate(() => { const data = new Float32Array(512); window.__audioEvidence.contexts[0].__meter.getFloatTimeDomainData(data); return { peak: Math.max(...data.map(Math.abs)), time: window.__sizzle.audioTime }; });
      assert.ok(mute.peak < .002, `mute attenuates output: ${mute.peak}`);
      await test.page.waitForTimeout(100); assert.ok(await test.page.evaluate(() => window.__sizzle.audioTime) > mute.time, 'mute leaves audio clock running');
      assert.deepEqual(test.errors, []); assert.deepEqual(test.failed, []);
      report.push({ rate, ...inputs, audio, mutePeak: mute.peak }); console.log(JSON.stringify(report.at(-1)));
    } finally { await test.close(); }
  }
  save('performance-report.json', report);
})().catch(error => { console.error(error); process.exitCode = 1; });
