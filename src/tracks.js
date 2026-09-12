export const DIFFICULTIES = {
  normal: { name: '셰프', perfect: .045, good: .09, ok: .14, requiredRatio: .65 },
  relaxed: { name: '느긋하게', perfect: .07, good: .12, ok: .18, requiredRatio: .5 }
};

const melodies = [
  { chords: [261.63, 329.63, 392, 523.25], voicings: [[261.63, 329.63, 392], [329.63, 392, 523.25], [392, 523.25, 659.25], [523.25, 659.25, 783.99]], bass: [130.81, 164.81, 196, 130.81], melody: [[392, 440, 523.25, 587.33, 523.25, 440, 392, 329.63], [523.25, 587.33, 659.25, 587.33, 523.25, 440, 392, 440], [659.25, 587.33, 523.25, 440, 392, 440, 523.25, 659.25], [392, 440, 523.25, 392]] },
  { chords: [220, 261.63, 329.63, 246.94], voicings: [[220, 261.63, 329.63], [261.63, 329.63, 392], [329.63, 392, 493.88], [246.94, 329.63, 392]], bass: [110, 130.81, 164.81, 123.47], melody: [[440, 523.25, 659.25, 523.25, 440, 523.25, 659.25, 698.46], [659.25, 698.46, 783.99, 698.46, 659.25, 523.25, 440, 523.25], [880, 783.99, 698.46, 659.25, 523.25, 659.25, 698.46, 783.99], [440, 523.25, 659.25, 440]] },
  { chords: [293.66, 369.99, 440, 329.63], voicings: [[293.66, 369.99, 440], [369.99, 440, 554.37], [440, 554.37, 659.25], [329.63, 440, 554.37]], bass: [146.83, 184.995, 220, 164.815], melody: [[440, 493.88, 587.33, 659.25, 587.33, 493.88, 440, 369.99], [659.25, 739.99, 880, 739.99, 659.25, 587.33, 493.88, 587.33], [880, 987.77, 880, 739.99, 659.25, 587.33, 493.88, 440], [440, 493.88, 587.33, 440]] }
];

function addNote(notes, recipe, index, lane, at, type = 'tap', duration = 0) {
  notes.push({ id: `${recipe.id}-ingredient-${index}`, lane, at, type, ...(duration ? { duration } : {}), recipe: recipe.id });
}

function makeChart(id, bpm, recipeCount, ingredientCount, pattern, holdEvery) {
  const beat = 60 / bpm, countIn = 4, notes = [], recipes = [];
  const dishName = { 'first-service': '첫 주문', 'neon-wok': '불꽃 웍', 'midnight-rush': '마지막 러시' }[id] || id;
  for (let r = 0; r < recipeCount; r++) {
    const startBeat = countIn + r * 8;
    const recipe = { id: r, name: `${dishName} ${r + 1}접시`, start: startBeat * beat, serveAt: (startBeat + 7) * beat, noteIds: [], serveId: `${id}-serve-${r}` };
    const entries = pattern(r, ingredientCount);
    entries.forEach((entry, index) => {
      const noteType = entry.hold && r >= holdEvery ? 'hold' : 'tap';
      const duration = noteType === 'hold' ? (id === 'first-service' ? 1.05 : id === 'neon-wok' ? .78 : .92) : 0;
      addNote(notes, recipe, index, entry.lane, (startBeat + entry.beat) * beat, noteType, duration);
      recipe.noteIds.push(`${recipe.id}-ingredient-${index}`);
    });
    notes.push({ id: recipe.serveId, lane: 4, at: recipe.serveAt, type: 'serve', recipe: recipe.id });
    recipes.push(recipe);
  }
  notes.sort((a, b) => a.at - b.at || a.lane - b.lane);
  return { notes, recipes, beat };
}

function firstPattern(recipe, count) {
  if (recipe === 0) return [0, 1, 2, 3, 0, 1, 2].map((lane, i) => ({ lane, beat: i }));
  if (recipe === 1) return [3, 2, 1, 0, 3, 2, 1].map((lane, i) => ({ lane, beat: i }));
  const beats = recipe % 3 === 0 ? [0, 1, 2, 2, 3, 5, 6] : [0, 1, 2, 3, 4, 5, 6];
  return Array.from({ length: count }, (_, i) => ({ beat: beats[i], lane: (recipe + i * 2 + (i === 3 ? 1 : 0)) % 4, hold: i === 1 && recipe % 2 === 0 }));
}

function wokPattern(recipe, count) {
  const beats = [0, .5, 1, 1.5, 2.5, 3.5, 4.5, 5.5, 6];
  return Array.from({ length: count }, (_, i) => ({ beat: beats[i], lane: (recipe * 3 + i + (i >= 4 ? 1 : 0)) % 4, hold: i === 3 && recipe > 1 && recipe % 3 === 1 }));
}

function rushPattern(recipe, count) {
  const beats = [0, .5, 1, 1.5, 2.5, 3.5, 4.5, 5.5, 6];
  return Array.from({ length: count }, (_, i) => ({ beat: beats[i], lane: (recipe + i * 3 + (recipe % 2 ? 1 : 0)) % 4, hold: (i === 1 || i === 5) && recipe > 1 && recipe % 3 !== 0 }));
}

function makeMusic(trackIndex, bpm, totalBeats, chartNotes) {
  const theme = melodies[trackIndex], events = [];
  for (let beat = 0; beat < 4; beat++) events.push({ type: 'count', beat, value: 880, duration: .06, velocity: .18, pan: 0 });
  for (let beat = 4; beat < totalBeats - 4; beat++) {
    const section = beat < totalBeats * .28 ? 0 : beat < totalBeats * .56 ? 1 : beat < totalBeats * .8 ? 2 : 3;
    const chord = theme.chords[(Math.floor((beat - 4) / 8) + section + trackIndex) % theme.chords.length];
    if ((beat - 4) % 8 === 0) events.push({ type: 'chord', beat, value: chord, tones: theme.voicings[(Math.floor((beat - 4) / 8) + section + trackIndex) % theme.voicings.length], duration: 3.5, velocity: .16, pan: 0 });
    const bar = Math.floor((beat - 4) / 4), breakdown = trackIndex === 1 && (bar === 12 || bar === 13 || bar === 24 || bar === 25);
    if (!breakdown && beat % (trackIndex === 0 ? 4 : 2) === 0) events.push({ type: 'bass', beat, value: theme.bass[(Math.floor((beat - 4) / 4) + section) % theme.bass.length], duration: .42, velocity: trackIndex === 2 ? .13 : .11, pan: -.18 });
    if ((beat - 4) % 2 === 0) {
      const phrase = theme.melody[section % theme.melody.length];
      events.push({ type: 'melody', beat: beat, value: phrase[Math.floor((beat - 4) / 2) % phrase.length], duration: .28, velocity: .085, pan: .22 });
    }
    const pulse = (beat - 4) % 4;
    if (!(breakdown && pulse === 0)) events.push({ type: pulse === 0 ? 'kick' : pulse === 2 ? 'snare' : 'hat', beat, value: pulse === 0 ? 86 : pulse === 2 ? 190 : 3200, duration: pulse === 0 ? .12 : .08, velocity: pulse === 0 ? .15 : pulse === 2 ? .11 : .045, pan: pulse === 2 ? .12 : -.08 });
    if (trackIndex > 0) events.push({ type: 'hat', beat: beat + .5, value: 3600, duration: .055, velocity: .035, pan: .16 });
  }
  const cuePitches = [[261.63, 392, 440, 493.88, 261.63], [220, 261.63, 329.63, 392, 220], [293.66, 369.99, 440, 493.88, 293.66]][trackIndex];
  for (const note of chartNotes || []) events.push({ type: 'cue', beat: note.at / (60 / bpm), value: cuePitches[note.lane] || cuePitches[0], duration: note.type === 'hold' ? Math.min(.14, note.duration) : .08, velocity: note.type === 'serve' ? .1 : .035, pan: note.lane === 4 ? 0 : (note.lane - 1.5) / 3, lane: note.lane });
  events.sort((a, b) => a.beat - b.beat || a.type.localeCompare(b.type));
  return { countIn: 4, tonic: theme.chords[0], events, sections: [
    { name: '도입', startBeat: 0, endBeat: Math.floor(totalBeats * .28), character: '따뜻함' },
    { name: '서비스', startBeat: Math.floor(totalBeats * .28), endBeat: Math.floor(totalBeats * .56), character: '밝음' },
    { name: '러시', startBeat: Math.floor(totalBeats * .56), endBeat: Math.floor(totalBeats * .8), character: '분주함' },
    { name: '여운', startBeat: Math.floor(totalBeats * .8), endBeat: totalBeats, character: '귀가' }
  ] };
}

const first = makeChart('first-service', 108, 14, 7, firstPattern, 2);
const wok = makeChart('neon-wok', 128, 18, 9, wokPattern, 2);
const rush = makeChart('midnight-rush', 146, 20, 9, rushPattern, 2);

export const TRACKS = [
  { id: 'first-service', name: 'First Service', subtitle: '첫 주문', bpm: 108, key: 'C major', description: '첫 손님을 맞는 따뜻하고 경쾌한 싱코페이션 그루브입니다.', colors: ['#e85d4a', '#f7c873', '#253348'], duration: 119 * 60 / 108, countIn: 4, approachSeconds: 1.8, notes: first.notes, recipes: first.recipes, music: makeMusic(0, 108, 119, first.notes) },
  { id: 'neon-wok', name: 'Neon Wok', subtitle: '불꽃 웍', bpm: 128, key: 'A minor', description: '양손을 번갈아 쓰며 뜨거운 팬을 다루는 일렉트로 스윙입니다.', colors: ['#ff5d67', '#48d6c1', '#121b35'], duration: 152 * 60 / 128, countIn: 4, approachSeconds: 1.6, notes: wok.notes, recipes: wok.recipes, music: makeMusic(1, 128, 152, wok.notes) },
  { id: 'midnight-rush', name: 'Midnight Rush', subtitle: '마지막 러시', bpm: 146, key: 'D major', description: '반복과 변주가 교차하는 마지막 주문의 밝은 브레이크비트입니다.', colors: ['#ffc857', '#67a8ff', '#1a1830'], duration: 168 * 60 / 146, countIn: 4, approachSeconds: 1.4, notes: rush.notes, recipes: rush.recipes, music: makeMusic(2, 146, 168, rush.notes) }
];

export function getTrack(id) { return TRACKS.find((track) => track.id === id) || null; }
