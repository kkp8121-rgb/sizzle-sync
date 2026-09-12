const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require('playwright');
const { createServer } = require('../tools/server.cjs');
const root = path.resolve(__dirname, '..');
const artifacts = path.join(root, 'artifacts');
fs.mkdirSync(artifacts, { recursive: true });

async function setup(options = {}) {
  const server = createServer(); await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, ...options });
  const page = await context.newPage(), errors = [], failed = [], requests = [];
  page.on('pageerror', error => errors.push(error.message));
  page.on('response', response => { if (response.status() >= 400) failed.push([response.status(), response.url()]); });
  page.on('requestfailed', request => failed.push([request.failure()?.errorText, request.url()]));
  page.on('request', request => requests.push(request.url()));
  await page.addInitScript(() => {
    const Native = window.AudioContext || window.webkitAudioContext;
    window.__audioEvidence = { contexts: [], sources: 0, peak: 0, energy: 0, samples: 0, frames: [] };
    let previous;
    function frame(time) { if (previous && window.__sizzle?.screen === 'play') window.__audioEvidence.frames.push(time - previous); previous = time; requestAnimationFrame(frame); }
    requestAnimationFrame(frame);
    if (Native) window.AudioContext = class extends Native {
      constructor(...args) {
        super(...args); window.__audioEvidence.contexts.push(this);
        this.__meter = this.createAnalyser(); this.__meter.fftSize = 512;
        const createGain = this.createGain.bind(this);
        this.createGain = () => { const gain = createGain(), connect = gain.connect.bind(gain); gain.connect = (destination, ...args) => { if (destination === this.destination) connect(this.__meter); return connect(destination, ...args); }; return gain; };
        for (const name of ['createOscillator', 'createBufferSource']) {
          const create = this[name].bind(this); this[name] = (...args) => { const source = create(...args), start = source.start.bind(source); source.start = (...args) => { window.__audioEvidence.sources++; return start(...args); }; return source; };
        }
        const values = new Float32Array(512);
        setInterval(() => { this.__meter.getFloatTimeDomainData(values); const out = window.__audioEvidence; for (const value of values) { out.peak = Math.max(out.peak, Math.abs(value)); out.energy += value * value; out.samples++; } }, 20);
      }
    };
  });
  const url = process.env.SIZZLE_URL || `http://127.0.0.1:${server.address().port}/sizzle-sync/`;
  return { page, context, browser, url, errors, failed, requests, close: async () => { await browser.close(); await new Promise(resolve => server.close(resolve)); } };
}

async function audioEvidence(page) {
  return page.evaluate(() => { const out = window.__audioEvidence, frames = [...out.frames].sort((a, b) => a - b); return { states: out.contexts.map(c => c.state), sources: out.sources, peak: out.peak, rms: Math.sqrt(out.energy / Math.max(1, out.samples)), frameCount: frames.length, averageMs: frames.reduce((a, b) => a + b, 0) / Math.max(1, frames.length), p95Ms: frames[Math.floor(frames.length * .95)] || 0 }; });
}

async function waitForAudio(page, at) {
  await page.evaluate(at => new Promise((resolve, reject) => {
    const start = performance.now();
    function poll() { if (window.__sizzle.screen !== 'play') return reject(new Error(`Unexpected ${window.__sizzle.screen} before audio ${at}`)); if (window.__sizzle.audioTime + window.__sizzle.settings.offset / 1000 >= at) return resolve(); if (performance.now() - start > 10000) return reject(new Error(`Audio clock stalled at ${window.__sizzle.audioTime}`)); setTimeout(poll, 4); }
    poll();
  }), at);
}

// Actual Playwright keyboard events follow the live AudioContext. No scoring,
// run time, chart, HP, progression or record state is injected by this driver.
async function playNotes(page, notes, { pauseHold = false, prefix = 'song', screenshot = true } = {}) {
  const keys = ['d', 'f', 'j', 'k', 'Space'];
  const actions = notes.flatMap(note => [
    { at: note.at, kind: 'down', note },
    { at: note.at + (note.type === 'hold' ? note.duration + .025 : .045), kind: 'up', note }
  ]).sort((a, b) => a.at - b.at || (a.kind === 'up' ? -1 : 1));
  let paused = false, snaps = 0;
  const timings = [];
  for (const action of actions) {
    await waitForAudio(page, action.at);
    if (action.kind === 'down') {
      await page.keyboard.down(keys[action.note.lane]);
      timings.push({ id: action.note.id, error: await page.evaluate(at => window.__sizzle.audioTime + window.__sizzle.settings.offset / 1000 - at, action.at) });
      if (screenshot && action.note.type === 'serve' && snaps++ % 6 === 0) await page.screenshot({ path: path.join(artifacts, `${prefix}-dish-${snaps}.png`) });
      if (pauseHold && !paused && action.note.type === 'hold') {
        await page.waitForTimeout(150); await page.keyboard.press('Escape');
        await page.waitForFunction(() => window.__sizzle.screen === 'pause');
        const frozen = await page.evaluate(() => ({ time: window.__sizzle.audioTime, run: window.__sizzle.run }));
        await page.keyboard.up(keys[action.note.lane]); await page.waitForTimeout(250);
        assert.equal(await page.evaluate(() => window.__sizzle.audioTime), frozen.time, 'pause freezes audio clock');
        assert.deepEqual(await page.evaluate(() => window.__sizzle.run), frozen.run, 'paused release preserves hold');
        await page.keyboard.press('Escape'); await page.waitForFunction(() => window.__sizzle.screen === 'play'); paused = true;
      }
    } else await page.keyboard.up(keys[action.note.lane]);
  }
  return { inputs: notes.length, pausedHold: paused, meanInputMs: timings.reduce((n, x) => n + x.error * 1000, 0) / timings.length, maxInputMs: Math.max(...timings.map(x => x.error * 1000)) };
}

function save(name, report) { fs.writeFileSync(path.join(artifacts, name), JSON.stringify(report, null, 2)); }
module.exports = { setup, root, artifacts, audioEvidence, waitForAudio, playNotes, save };
