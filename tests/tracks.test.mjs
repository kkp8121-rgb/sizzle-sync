import test from 'node:test';
import assert from 'node:assert/strict';
import { TRACKS, getTrack, DIFFICULTIES } from '../src/tracks.js';

test('three tracks have playable duration, authored recipes and independent arrangements', () => {
  assert.equal(TRACKS.length, 3);
  const arrangements = new Set();
  for (const track of TRACKS) {
    const totalBeats = track.music.sections.at(-1).endBeat;
    assert.equal(track.duration, totalBeats * 60 / track.bpm, `${track.id} duration follows audio beats`);
    assert.ok(track.notes.length >= 90 && track.notes.length <= 240, `${track.id} note count`);
    assert.equal(track.recipes.length, track.id === 'first-service' ? 14 : track.id === 'neon-wok' ? 18 : 20);
    assert.equal(track.music.sections.length, 4);
    arrangements.add(track.music.events.map((event) => `${event.type}:${event.value}`).join('|'));
    assert.ok(track.music.events.some((event) => event.type === 'melody'));
    assert.ok(track.music.events.some((event) => event.type === 'bass'));
    assert.ok(track.music.events.some((event) => ['drum', 'kick', 'snare', 'hat'].includes(event.type)));
    assert.ok(Number.isFinite(track.music.tonic));
  }
  assert.equal(arrangements.size, TRACKS.length);
});

test('recipes contain exactly one serve cue and feasible ingredient timing', () => {
  for (const track of TRACKS) {
    const byId = new Map(track.notes.map((note) => [note.id, note]));
    const simultaneous = new Map();
    for (const recipe of track.recipes) {
      const recipeNotes = track.notes.filter((note) => note.recipe === recipe.id);
      assert.equal(recipeNotes.filter((note) => note.type === 'serve' && note.lane === 4).length, 1);
      assert.equal(recipe.noteIds.length, recipeNotes.filter((note) => note.type !== 'serve').length);
      assert.ok(byId.has(recipe.serveId));
      for (const note of recipeNotes.filter((item) => item.type !== 'serve')) {
        assert.ok(note.lane >= 0 && note.lane <= 3);
        assert.ok(Math.abs(note.at - recipe.serveAt) >= .28, `${track.id} note too close to serve`);
        if (note.type === 'hold') assert.ok(note.duration >= .5 && note.duration <= 1.5 && note.at + note.duration < recipe.serveAt);
        const key = note.at.toFixed(5); simultaneous.set(key, (simultaneous.get(key) || 0) + 1);
      }
    }
    assert.ok([...simultaneous.values()].every((count) => count <= 2), `${track.id} has >2 simultaneous ingredients`);
  }
});

test('same-lane notes and holds never overlap', () => {
  for (const track of TRACKS) {
    for (let lane = 0; lane < 4; lane++) {
      const notes = track.notes.filter((note) => note.lane === lane && note.type !== 'serve').sort((a, b) => a.at - b.at);
      for (let i = 0; i < notes.length - 1; i++) {
        assert.ok(notes[i].at < notes[i + 1].at, `${track.id} duplicate onset lane ${lane}`);
        if (notes[i].type === 'hold') assert.ok(notes[i].at + notes[i].duration <= notes[i + 1].at, `${track.id} overlapping hold lane ${lane}`);
      }
    }
  }
});

test('music arrangement events are serializable and varied by section', () => {
  for (const track of TRACKS) {
    const sectionTypes = track.music.sections.map((section) => section.character);
    assert.ok(new Set(sectionTypes).size >= 3);
    for (const event of track.music.events) {
      assert.ok(['count', 'chord', 'bass', 'melody', 'drum', 'kick', 'snare', 'hat', 'cue'].includes(event.type));
      assert.ok(Number.isFinite(event.beat) && event.beat >= 0);
      assert.ok(Number.isFinite(event.value) && Number.isFinite(event.velocity));
      assert.ok(event.pan >= -1 && event.pan <= 1);
    }
    assert.doesNotThrow(() => JSON.stringify(track));
  }
});

test('every chart note has an exact-beat musical cue and a short musical tail', () => {
  for (const track of TRACKS) {
    const beat = 60 / track.bpm, cues = new Set(track.music.events.filter((event) => event.type === 'cue').map((event) => event.beat.toFixed(6)));
    for (const note of track.notes) assert.ok(cues.has((note.at / beat).toFixed(6)), `${track.id} missing cue at ${note.at}`);
    for (const event of track.music.events.filter((item) => item.type === 'cue' && item.lane === 4)) assert.equal(event.value, track.music.tonic, `${track.id} serve cue tonic`);
    const lastServe = Math.max(...track.notes.filter((note) => note.type === 'serve').map((note) => note.at));
    assert.ok(track.duration - lastServe <= 2.5, `${track.id} has an overly long tail`);
  }
});

test('public track and difficulty lookup contract', () => {
  assert.equal(getTrack('first-service'), TRACKS[0]);
  assert.equal(getTrack('missing'), null);
  assert.deepEqual(Object.keys(DIFFICULTIES), ['normal', 'relaxed']);
});
