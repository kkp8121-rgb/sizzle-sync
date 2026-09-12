const assert = require('node:assert/strict');
const path = require('node:path');
const { setup, artifacts, audioEvidence, playNotes, save } = require('./browser-tools.cjs');

(async () => {
  const test = await setup(), report = [];
  try {
    const { TRACKS } = await import('../src/tracks.js');
    await test.page.goto(test.url); await test.page.waitForFunction(() => window.__sizzle?.ready);
    await test.page.locator('[data-action="song-select"]').first().click();
    assert.equal(await test.page.locator('[data-action="choose-track"]:disabled').count(), 2, 'real initial unlock gate');
    for (const [index, track] of TRACKS.entries()) {
      await test.page.locator(`[data-action="choose-track"][data-track="${track.id}"]`).click();
      await test.page.waitForFunction(() => window.__sizzle.screen === 'play');
      const input = await playNotes(test.page, track.notes, { pauseHold: index === 0, prefix: track.id });
      await test.page.waitForFunction(() => window.__sizzle.screen === 'results', { timeout: 10000 });
      const result = await test.page.evaluate(() => ({ run: window.__sizzle.run, records: window.__sizzle.records }));
      assert.ok(!/\?{2,}/.test(await test.page.locator('[data-screen="results"]').innerText()), 'result copy renders intact');
      assert.equal(result.run.status, 'won', `${track.id} clears through real keyboard input`);
      assert.equal(result.run.delivered, track.recipes.length, 'every dish delivered');
      assert.equal(result.run.judgements.miss, 0, 'all authored notes playable including holds');
      assert.ok(result.records[`${track.id}:normal`]?.status === 'won', 'winning record persists');
      await test.page.screenshot({ path: path.join(artifacts, `${track.id}-results.png`) });
      report.push({ track: track.id, seconds: track.duration, ...input, status: result.run.status, score: result.run.score, delivered: result.run.delivered, judgements: result.run.judgements, maxCombo: result.run.maxCombo });
      console.log(JSON.stringify(report.at(-1)));
      await test.page.locator('[data-screen="results"] [data-action="song-select"]').click();
      if (index < TRACKS.length - 1) assert.equal(await test.page.locator(`[data-track="${TRACKS[index + 1].id}"]`).isEnabled(), true, 'next song unlocks');
    }
    const records = await test.page.evaluate(() => window.__sizzle.records);
    await test.page.reload(); await test.page.waitForFunction(() => window.__sizzle?.ready);
    assert.deepEqual(await test.page.evaluate(() => window.__sizzle.records), records, 'records survive reload');
    await test.page.locator('[data-action="song-select"]').first().click();
    assert.equal(await test.page.locator('[data-action="choose-track"]:disabled').count(), 0);
    assert.deepEqual(test.errors, []); assert.deepEqual(test.failed, []);
    const evidence = { songs: report, totalInputs: report.reduce((sum, song) => sum + song.inputs, 0), totalSongSeconds: report.reduce((sum, song) => sum + song.seconds, 0), errors: test.errors, failed: test.failed };
    save('campaign-report.json', evidence); console.log(JSON.stringify(evidence, null, 2));
  } catch (error) { await test.page.screenshot({ path: path.join(artifacts, 'campaign-error.png') }); save('campaign-partial.json', { report, screen: await test.page.evaluate(() => window.__sizzle?.screen), run: await test.page.evaluate(() => window.__sizzle?.run), errors: test.errors, error: error.message }); throw error; }
  finally { await test.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
