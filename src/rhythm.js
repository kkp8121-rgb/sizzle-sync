const LANES = 5;
const EPSILON = 1e-9;
const DEFAULT_DIFFICULTY = Object.freeze({ perfect: 0.045, good: 0.09, ok: 0.14, requiredRatio: 0.65 });
const RELAXED_DIFFICULTY = Object.freeze({ perfect: 0.07, good: 0.12, ok: 0.18, requiredRatio: 0.5 });
const WEIGHTS = Object.freeze({ perfect: 1, good: 0.8, ok: 0.5, miss: 0 });

function clone(value) {
  return value == null ? value : JSON.parse(JSON.stringify(value));
}

function configFor(difficulty) {
  const source = difficulty === 'relaxed' ? RELAXED_DIFFICULTY : DEFAULT_DIFFICULTY;
  return { ...source, missCost: difficulty === 'relaxed' ? 2 : 4 };
}

function clamp(value, low, high) {
  return Math.max(low, Math.min(high, value));
}

function noteOrder(run, note) {
  return run.notes.indexOf(note);
}

function emit(run, events, event) {
  const stamped = { ...event, time: run.time };
  run.events.push(stamped);
  events.push(stamped);
}

function setPatience(run, amount) {
  run.patience = clamp(Math.round(run.patience + amount), 0, 100);
}

function finishLost(run, events, text = '인내심이 다했습니다.') {
  if (run.status !== 'playing') return;
  run.status = 'lost';
  emit(run, events, { type: 'end', status: 'lost', text });
}

function finishTrack(run, events) {
  if (run.status !== 'playing') return;
  const required = Math.ceil(run.recipes.length * run.requiredRatio);
  run.status = run.delivered >= required ? 'won' : 'lost';
  emit(run, events, {
    type: 'end',
    status: run.status,
    text: run.status === 'won' ? '서비스 완료!' : '서비스 목표에 도달하지 못했습니다.'
  });
}

function updateAfterPatience(run, events) {
  if (run.patience <= 0) finishLost(run, events);
}

function judgementFor(error, cfg) {
  const distance = Math.abs(error);
  if (distance <= cfg.perfect + EPSILON) return 'perfect';
  if (distance <= cfg.good + EPSILON) return 'good';
  if (distance <= cfg.ok + EPSILON) return 'ok';
  return null;
}

function addJudgement(run, judgement) {
  run.judgements[judgement] += 1;
  run.lastJudgement = judgement;
}

function scoreHit(run, judgement) {
  const weight = WEIGHTS[judgement] ?? 0;
  run.score += Math.round(1000 * weight + Math.min(250, run.combo * 10) * weight);
}

function resetCombo(run) {
  run.combo = 0;
}

function advanceCombo(run) {
  run.combo += 1;
  run.maxCombo = Math.max(run.maxCombo, run.combo);
}

function recipeFor(run, note) {
  if (Number.isInteger(note.recipe) && run.recipes[note.recipe]) return run.recipes[note.recipe];
  return run.recipes.find((recipe) => recipe.noteIds?.includes(note.id) || recipe.serveId === note.id);
}

function ingredientQuality(run, recipe) {
  const ids = Array.isArray(recipe.noteIds) ? recipe.noteIds : [];
  if (!ids.length) return 1;
  let total = 0;
  for (const id of ids) {
    const note = run.notes.find((candidate) => candidate.id === id);
    total += note?.status === 'hit' ? WEIGHTS[note.judgement] ?? 0 : 0;
  }
  return total / ids.length;
}

function settleRecipe(run, events, recipe, served) {
  if (!recipe || recipe.status !== 'pending') return;
  const quality = served ? ingredientQuality(run, recipe) : 0;
  const goodDish = served && quality >= 0.55;
  recipe.status = goodDish ? 'served' : 'burned';
  recipe.quality = quality;
  if (goodDish) {
    run.delivered += 1;
    setPatience(run, 4);
  } else {
    run.burned += 1;
    setPatience(run, -10);
  }
  emit(run, events, {
    type: 'dish',
    recipe: recipe.id,
    served: goodDish,
    quality,
    text: goodDish ? '접시 완성!' : '접시가 타버렸습니다.'
  });
  updateAfterPatience(run, events);
}

function missNote(run, events, note, at, reason = 'late') {
  if (note.status !== 'pending' && note.status !== 'holding') return;
  note.status = 'miss';
  note.judgement = 'miss';
  note.error = at - note.at;
  addJudgement(run, 'miss');
  resetCombo(run);
  setPatience(run, -run.config.missCost);
  emit(run, events, { type: 'miss', lane: note.lane, noteId: note.id, judgement: 'miss', error: note.error, reason });
  if (note.type === 'serve') settleRecipe(run, events, recipeFor(run, note), false);
  updateAfterPatience(run, events);
}

function completeHold(run, events, note) {
  if (note.status !== 'holding') return;
  note.status = 'hit';
  note.judgement = note.startJudgement;
  note.error = note.startError;
  addJudgement(run, note.judgement);
  scoreHit(run, note.judgement);
  advanceCombo(run);
  emit(run, events, {
    type: 'hold-end',
    lane: note.lane,
    noteId: note.id,
    judgement: note.judgement,
    error: note.error
  });
  if (note.type === 'serve') settleRecipe(run, events, recipeFor(run, note), true);
}

function breakHold(run, events, note, at) {
  if (note.status !== 'holding') return;
  note.status = 'miss';
  note.judgement = 'miss';
  note.error = at - note.at;
  addJudgement(run, 'miss');
  resetCombo(run);
  setPatience(run, -run.config.missCost);
  emit(run, events, { type: 'hold', lane: note.lane, noteId: note.id, judgement: 'miss', error: note.error, reason: 'early-release' });
  if (note.type === 'serve') settleRecipe(run, events, recipeFor(run, note), false);
  updateAfterPatience(run, events);
}

function pendingTimelineEvent(run, cfg, target) {
  let selected = null;
  run.notes.forEach((note, index) => {
    let at = null;
    let kind = null;
    if (note.status === 'pending') {
      at = note.at + cfg.ok;
      kind = 'miss';
    } else if (note.status === 'holding') {
      at = note.at + (Number(note.duration) || 0);
      kind = 'hold-end';
    }
    // A late edge remains pressable until the clock moves past it. Hold ends,
    // however, complete exactly at their scheduled endpoint.
    if (at == null || (kind === 'miss' ? at >= target - EPSILON : at > target + EPSILON)) return;
    const candidate = { note, at, kind, index };
    if (!selected || at < selected.at - EPSILON || (Math.abs(at - selected.at) <= EPSILON && index < selected.index)) {
      selected = candidate;
    }
  });
  return selected;
}

function settleTo(run, requestedTime, includeEnd = true) {
  if (run.status !== 'playing' || requestedTime < run.time) return [];
  const cfg = run.config;
  const target = Math.min(requestedTime, run.duration);
  const events = [];
  while (run.status === 'playing') {
    const next = pendingTimelineEvent(run, cfg, target);
    if (!next) break;
    run.time = Math.max(run.time, next.at);
    if (next.kind === 'hold-end') completeHold(run, events, next.note);
    else missNote(run, events, next.note, next.at);
  }
  if (run.status !== 'playing') return events;
  run.time = Math.max(run.time, target);
  if (includeEnd && requestedTime >= run.duration - EPSILON) {
    // The tail is a hard boundary: every remaining chart note is a miss.
    const remaining = run.notes
      .filter((note) => note.status === 'pending' || note.status === 'holding')
      .sort((a, b) => a.at - b.at || noteOrder(run, a) - noteOrder(run, b));
    for (const note of remaining) {
      if (run.status !== 'playing') break;
      missNote(run, events, note, run.duration, 'track-end');
    }
    for (const recipe of run.recipes) {
      if (run.status !== 'playing') break;
      settleRecipe(run, events, recipe, false);
    }
    if (run.status === 'playing') finishTrack(run, events);
  }
  return events;
}

function normalizeLane(lane) {
  return Number.isInteger(lane) && lane >= 0 && lane < LANES ? lane : null;
}

function timelineInput(run, time) {
  return Number.isFinite(time) && time >= run.time - EPSILON ? time : null;
}

function findCandidate(run, lane, time) {
  const cfg = run.config;
  let best = null;
  for (const note of run.notes) {
    if (note.status !== 'pending' || note.lane !== lane) continue;
    const error = time - note.at;
    const judgement = judgementFor(error, cfg);
    if (!judgement) continue;
    const distance = Math.abs(error);
    if (!best || distance < best.distance - EPSILON || (Math.abs(distance - best.distance) <= EPSILON && note.at < best.note.at)) {
      best = { note, error, judgement, distance };
    }
  }
  return best;
}

function hitNote(run, events, candidate) {
  const { note, error, judgement } = candidate;
  note.pressedAt = run.time;
  note.error = error;
  note.judgement = judgement;
  if (note.type === 'hold') {
    note.status = 'holding';
    note.startJudgement = judgement;
    note.startError = error;
    emit(run, events, { type: 'hit', lane: note.lane, noteId: note.id, judgement, error });
    emit(run, events, { type: 'hold', lane: note.lane, noteId: note.id, judgement, error });
    return;
  }
  note.status = 'hit';
  addJudgement(run, judgement);
  scoreHit(run, judgement);
  advanceCombo(run);
  emit(run, events, { type: 'hit', lane: note.lane, noteId: note.id, judgement, error });
  if (note.type === 'serve') settleRecipe(run, events, recipeFor(run, note), true);
}

export function createRun(track, difficulty = 'normal') {
  if (!track || typeof track !== 'object') throw new TypeError('track is required');
  const cfg = configFor(difficulty);
  const notes = clone(Array.isArray(track.notes) ? track.notes : [])
    .map((note, index) => ({ ...note, status: 'pending', judgement: undefined, error: undefined, pressedAt: undefined, _order: index }))
    .sort((a, b) => a.at - b.at || a.lane - b.lane || a._order - b._order);
  const recipes = clone(Array.isArray(track.recipes) ? track.recipes : [])
    .map((recipe, index) => ({ ...recipe, id: recipe.id ?? index, status: 'pending', quality: undefined }));
  const firstActionAt = notes.length ? Math.min(...notes.map((note) => note.at)) : 0;
  return {
    trackId: track.id ?? track.trackId ?? 'custom',
    difficulty,
    status: 'playing',
    time: 0,
    notes,
    recipes,
    held: Array(LANES).fill(false),
    combo: 0,
    maxCombo: 0,
    score: 0,
    patience: 100,
    delivered: 0,
    burned: 0,
    judgements: { perfect: 0, good: 0, ok: 0, miss: 0 },
    events: [],
    lastJudgement: null,
    config: cfg,
    duration: Number.isFinite(track.duration) ? Math.max(0, track.duration) : (notes.at(-1)?.at ?? 0) + 1,
    requiredRatio: cfg.requiredRatio,
    firstActionAt,
    ghostAt: Array(LANES).fill(null)
  };
}

export function advance(run, time) {
  if (!run || run.status !== 'playing') return [];
  const target = timelineInput(run, time);
  if (target == null) return [];
  return settleTo(run, target, true);
}

export function press(run, lane, time) {
  if (!run || run.status !== 'playing') return [];
  const validLane = normalizeLane(lane);
  const target = timelineInput(run, time);
  if (validLane == null || target == null) return [];
  const events = settleTo(run, target, true);
  if (run.status !== 'playing') return events;
  run.time = target;
  if (run.held[validLane]) return events;
  if (target < run.firstActionAt - run.config.ok - EPSILON) return events;
  const candidate = findCandidate(run, validLane, target);
  if (candidate) {
    hitNote(run, events, candidate);
    run.held[validLane] = true;
    return events;
  }
  const lastGhost = run.ghostAt[validLane];
  if (lastGhost == null || target - lastGhost + EPSILON >= 0.12) {
    run.ghostAt[validLane] = target;
    setPatience(run, -1);
    resetCombo(run);
    emit(run, events, { type: 'ghost', lane: validLane, text: '헛손질' });
    updateAfterPatience(run, events);
  }
  return events;
}

export function release(run, lane, time) {
  if (!run || run.status !== 'playing') return [];
  const validLane = normalizeLane(lane);
  const target = timelineInput(run, time);
  if (validLane == null || target == null) return [];
  const events = settleTo(run, target, true);
  if (run.status !== 'playing') return events;
  run.time = target;
  const activeHold = run.notes.find((note) => note.status === 'holding' && note.lane === validLane);
  if (activeHold && target < activeHold.at + (Number(activeHold.duration) || 0) - 0.08 - EPSILON) {
    breakHold(run, events, activeHold, target);
  }
  run.held[validLane] = false;
  return events;
}

export function summary(run) {
  const total = run?.notes?.length ?? 0;
  const judged = run?.judgements ?? { perfect: 0, good: 0, ok: 0, miss: 0 };
  const accuracy = total ? clamp((judged.perfect + judged.good * 0.8 + judged.ok * 0.5) / total, 0, 1) : 0;
  let rank = 'D';
  if (accuracy >= 0.97 && run.delivered === run.recipes.length) rank = 'S';
  else if (accuracy >= 0.9) rank = 'A';
  else if (accuracy >= 0.75) rank = 'B';
  else if (accuracy >= 0.6) rank = 'C';
  return {
    status: run.status,
    score: run.score,
    accuracy,
    rank,
    delivered: run.delivered,
    total: run.recipes.length,
    perfect: judged.perfect,
    good: judged.good,
    ok: judged.ok,
    miss: judged.miss,
    maxCombo: run.maxCombo
  };
}
