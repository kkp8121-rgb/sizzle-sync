import assert from 'node:assert/strict';
import test from 'node:test';
import { TRACKS } from '../src/tracks.js';
import { advance, createRun, press, release, summary } from '../src/rhythm.js';

function chart(notes, recipes = [], duration = 6) {
  return { id: 'test-kitchen', duration, notes, recipes };
}

function tap(id, lane, at, recipe) {
  return { id, lane, at, type: 'tap', ...(recipe == null ? {} : { recipe }) };
}

function serve(id, lane, at, recipe) {
  return { id, lane, at, type: 'serve', recipe };
}

function playAuthoredTrack(track, { jitter = false, skipEvery = 0 } = {}) {
  const run = createRun(track, 'normal');
  const inputs = [];
  let ingredientIndex = 0;
  track.notes.forEach((note, index) => {
    const ingredient = note.type !== 'serve';
    const skip = skipEvery > 0 && ingredient && ingredientIndex++ % skipEvery === 0;
    if (skip) return;
    const offset = jitter ? ((index % 3) - 1) * 0.06 : 0;
    inputs.push({ time: note.at + offset, kind: 0, note });
    inputs.push({
      time: note.type === 'hold' ? note.at + (note.duration || 0) + offset + 0.001 : note.at + offset + 0.001,
      kind: 1,
      note
    });
  });
  inputs.sort((a, b) => a.time - b.time || a.kind - b.kind);
  for (const input of inputs) {
    if (input.time < run.time) continue;
    if (input.kind === 0) press(run, input.note.lane, input.time);
    else release(run, input.note.lane, input.time);
  }
  advance(run, track.duration + 1);
  return run;
}

test('createRun clones chart data and exact judgement edges stay inclusive', () => {
  const source = chart([tap('tomato', 0, 1)], [], 2);
  const run = createRun(source);
  assert.deepEqual(run.notes[0].status, 'pending');
  press(run, 0, 1 + 0.14);
  assert.equal(run.notes[0].judgement, 'ok');
  assert.equal(run.judgements.ok, 1);
  assert.equal(source.notes[0].status, undefined);
  assert.equal(source.notes[0].judgement, undefined);
});

test('repeated keydown is ignored and a held key cannot score a future tap', () => {
  const run = createRun(chart([tap('a', 0, 1), tap('b', 0, 2)], [], 3));
  assert.equal(press(run, 0, 1).filter((event) => event.type === 'hit').length, 1);
  assert.deepEqual(press(run, 0, 1.1).filter((event) => event.type === 'hit'), []);
  release(run, 0, 1.1);
  assert.equal(press(run, 0, 2).filter((event) => event.type === 'hit').length, 1);
  assert.equal(run.judgements.perfect, 2);
});

test('holds complete once, while early release breaks them once', () => {
  const good = createRun(chart([{ id: 'hold', lane: 1, at: 1, type: 'hold', duration: 1 }], [], 3));
  press(good, 1, 1);
  assert.equal(advance(good, 2).filter((event) => event.type === 'hold-end').length, 1);
  release(good, 1, 2.2);
  assert.equal(good.judgements.miss, 0);
  assert.equal(summary(good).perfect, 1);

  const broken = createRun(chart([{ id: 'hold', lane: 1, at: 1, type: 'hold', duration: 1 }], [], 3));
  press(broken, 1, 1);
  assert.equal(release(broken, 1, 1.2).filter((event) => event.type === 'hold').length, 1);
  assert.deepEqual(release(broken, 1, 1.25).filter((event) => event.type === 'hold'), []);
  advance(broken, 3);
  assert.equal(broken.judgements.miss, 1);
  assert.equal(broken.status, 'won');
});

test('recipe serves and burns are settled exactly once', () => {
  const recipe = { id: 0, name: 'Soup', noteIds: ['onion'], serveId: 'plate' };
  const run = createRun(chart([tap('onion', 0, 1, 0), serve('plate', 1, 2, 0)], [recipe], 4));
  press(run, 0, 1);
  release(run, 0, 1.01);
  press(run, 1, 2);
  release(run, 1, 2.01);
  const dishes = run.events.filter((event) => event.type === 'dish');
  assert.equal(dishes.length, 1);
  assert.equal(dishes[0].served, true);
  assert.equal(run.delivered, 1);
  advance(run, 4);
  assert.equal(run.events.filter((event) => event.type === 'dish').length, 1);
  assert.equal(run.status, 'won');
});

test('count-in input is free, ghost presses are throttled per lane', () => {
  const run = createRun(chart([tap('first', 0, 10)], [], 12));
  press(run, 2, 0.1);
  press(run, 2, 0.2);
  assert.equal(run.patience, 100);
  press(run, 2, 9.9);
  press(run, 2, 9.95);
  assert.equal(run.patience, 99);
  assert.equal(run.events.filter((event) => event.type === 'ghost').length, 1);
  press(run, 2, 10.02);
  assert.equal(run.patience, 98);
});

test('relaxed difficulty uses the gentler miss cost and wider windows', () => {
  const run = createRun(chart([tap('a', 0, 2)], [], 4), 'relaxed');
  advance(run, 2.19);
  assert.equal(run.patience, 98);
  const wide = createRun(chart([tap('a', 0, 2)], [], 4), 'relaxed');
  press(wide, 0, 2 + 0.18);
  assert.equal(wide.judgements.miss, 0);
  assert.equal(wide.judgements.ok, 1);
});

test('sudden frame jumps settle holds, misses and recipes chronologically', () => {
  const recipe = { id: 0, noteIds: ['ingredient'], serveId: 'serve' };
  const run = createRun(chart([
    { id: 'hold', lane: 0, at: 1, type: 'hold', duration: 0.5 },
    tap('ingredient', 1, 2, 0),
    serve('serve', 2, 3, 0)
  ], [recipe], 5));
  press(run, 0, 1);
  const events = advance(run, 5);
  const meaningful = events.filter((event) => ['hold-end', 'miss', 'dish', 'end'].includes(event.type));
  assert.deepEqual(meaningful.map((event) => event.type), ['hold-end', 'miss', 'miss', 'dish', 'end']);
  assert.equal(run.judgements.miss, 2);
  assert.equal(run.burned, 1);
  assert.equal(run.status, 'lost');
  assert.equal(summary(run).accuracy, 1 / 3);
});

test('backward time and frozen audio time are ignored without state changes', () => {
  const run = createRun(chart([tap('a', 0, 2)], [], 4));
  advance(run, 1.5);
  const snapshot = JSON.stringify(run);
  assert.deepEqual(advance(run, 1.5), []);
  assert.equal(run.time, 1.5);
  assert.deepEqual(press(run, 0, 1.4), []);
  assert.equal(JSON.stringify(run), snapshot);
});

test('mid-run state remains useful after a JSON round trip', () => {
  const original = createRun(chart([tap('a', 0, 1)], [], 3));
  const restored = JSON.parse(JSON.stringify(original));
  press(restored, 1, 0.9);
  assert.equal(restored.patience, 99);
  assert.equal(restored.events.filter((event) => event.type === 'ghost').length, 1);
});

test('failed accuracy keeps every chart note in the denominator', () => {
  const run = createRun(chart([tap('a', 0, 1), tap('b', 1, 2), tap('c', 2, 3), tap('d', 3, 4)], [], 5));
  press(run, 0, 1);
  release(run, 0, 1.01);
  advance(run, 5);
  assert.equal(run.judgements.perfect, 1);
  assert.equal(run.judgements.miss, 3);
  assert.equal(summary(run).accuracy, 0.25);
});

test('patience failure and completion make subsequent input inert', () => {
  const run = createRun(chart([], [], 1));
  run.patience = 1;
  press(run, 0, 0.5);
  assert.equal(run.status, 'lost');
  const events = run.events.length;
  assert.deepEqual(press(run, 0, 0.8), []);
  assert.equal(run.events.length, events);
});

test('every authored track clears through legal exact and human-like jittered inputs', () => {
  for (const track of TRACKS) {
    const exact = summary(playAuthoredTrack(track));
    assert.equal(exact.status, 'won', `${track.id} exact route`);
    assert.equal(exact.delivered, exact.total, `${track.id} exact dishes`);
    assert.equal(exact.miss, 0, `${track.id} exact misses`);

    const jitteredRun = playAuthoredTrack(track, { jitter: true });
    const jittered = summary(jitteredRun);
    assert.equal(jittered.status, 'won', `${track.id} jitter route`);
    assert.equal(jittered.delivered, jittered.total, `${track.id} jitter dishes`);
    assert.equal(jittered.miss, 0, `${track.id} jitter misses`);
    assert.ok(jittered.good > 0, `${track.id} should record good judgements`);
  }
});

test('missing one in five ingredients still clears the normal required ratio when serves land', () => {
  for (const track of TRACKS) {
    const result = summary(playAuthoredTrack(track, { skipEvery: 5 }));
    assert.equal(result.status, 'won', `${track.id} skipped ingredient route`);
    assert.equal(result.delivered, result.total, `${track.id} all serves remain valid`);
    assert.ok(result.miss > 0, `${track.id} should record the deliberate misses`);
  }
});

test('two simultaneous keys and a hold produce one final hold score', () => {
  const run = createRun(chart([
    tap('left', 0, 1),
    tap('right', 1, 1),
    { id: 'hold', lane: 2, at: 2, type: 'hold', duration: 0.6 }
  ], [], 4));
  press(run, 0, 1);
  press(run, 1, 1);
  release(run, 0, 1.01);
  release(run, 1, 1.01);
  press(run, 2, 2);
  advance(run, 2.6);
  const scoreAfterHold = run.score;
  advance(run, 3);
  release(run, 2, 3.1);
  assert.equal(run.judgements.perfect, 3);
  assert.equal(run.events.filter((event) => event.type === 'hold-end').length, 1);
  assert.equal(run.score, scoreAfterHold);
});

test('both positive and negative ok-window edges are accepted', () => {
  const run = createRun(chart([tap('early', 0, 1), tap('late', 1, 2)], [], 3));
  press(run, 0, 1 - 0.14);
  release(run, 0, 1 - 0.13);
  press(run, 1, 2 + 0.14);
  release(run, 1, 2 + 0.15);
  assert.equal(run.judgements.ok, 2);
  assert.equal(run.judgements.miss, 0);
});
