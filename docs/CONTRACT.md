# SIZZLE SYNC · 심야식당의 비트

## Design decision

Compared a 3D physics rally (steer/throttle/brake, continuous time trials), a merchant deckbuilder (draft cards, discrete trips/economy), and rhythm cooking (two-hand timing, charted live performances). Rhythm cooking gives the strongest contrast to AFTERLIGHT's rewind platforming and SKYCHORD's 3D party RPG, with a directly playable first thirty seconds and an expressive audio/visual payoff.

Theme: taste is timing. Hook: perform chopping, frying, flipping and seasoning in time, then hit the serving beat to turn your rhythm into finished dishes.
Fantasy: run an impossible late-night kitchen as a virtuoso chef. Original bright food-comic identity: tomato red, butter cream, charcoal, copper; no sky railway, fantasy party, silence/restoration narrative or borrowed franchise imagery.

Deliverable: a complete keyboard/touch rhythm game with three authored original songs/charts, progression, practice/help, calibration, results, failure, retry and saved records. A standard run has several minutes of content; accurate play and higher scores reward replay. No mouse-only default.

## Ownership

- Simulation executor: src/rhythm.js, tests/rhythm.test.mjs.
- Music/chart executor: src/audio.js, src/tracks.js, tests/tracks.test.mjs.
- Presentation executor: index.html, style.css, src/app.js, src/render.js.
- Root: build/server/pack tools, assets/art-source, documentation, browser/full-track/performance tests, integration, commits, release.

No worker commits, pushes, launches a visible browser, creates descendants or changes another worker's files. All public game strings are Korean except title and conventional score ranks.

## Files / runtime

ES module source bundled by esbuild to a classic IIFE game.js. Canvas 2D and Web Audio; no runtime npm/CDN/fonts/network calls. index.html must work through file:// and /sizzle-sync/. Dev dependencies pinned esbuild0.28.2 and Playwright1.63.0. Root creates tools and art. Use relative assets/chef.webp and assets/kitchen.webp when present; graceful code-drawn fallback while art is being produced, no remote placeholders.

## Track data: src/tracks.js

Export TRACKS (3 entries), getTrack(id), DIFFICULTIES. Each track is serializable:
{id,name,subtitle,bpm,key,description,colors:[...],duration,countIn:4,approachSeconds,notes,recipes,music}
duration is seconds from the scheduled audio start, including four count-in beats and a short tail.
notes: {id,lane:0..4,at:seconds,type:'tap'|'hold'|'serve',duration?:seconds,recipe:number} sorted by at, then lane.
recipes: {id:0..N-1,name,start:seconds,serveAt:seconds,noteIds:[ingredient IDs],serveId:string}.
Lane0 D = 칼질; lane1 F = 볶기; lane2 J = 뒤집기; lane3 K = 간하기. Lane4 Space = 서빙, rendered as a distinct wide golden cue.
Ingredient notes occur during each 8-beat recipe. Its last beat is a serve cue. No ingredient within 0.28sec of serve. Holds are ~0.5–1.5sec, finish before serving, never overlap another note on the same lane, and require sustained input (automatic completion at hold end, not a separate release hit). Max two simultaneous ingredients. Releasing early breaks the hold. Two-key sequences must be human playable, not random density.

Three authored arrangements, ~70–90sec each:
1. First Service / 첫 주문,108BPM: welcoming syncopated funk,14 recipes,112 cooking beats +4 count-in +4 outro. First recipe teaches four lane keys individually followed by Space. Sparse beginning, no holds in first two recipes; progressively introduces holds and occasional pairs.
2. Neon Wok / 불꽃 웍,128BPM: energetic electro-swing,18 recipes,144 cooking beats +4 count-in +4 outro; alternating hands, controlled syncopation, two quiet breakdown phrases.
3. Midnight Rush / 마지막 러시,146BPM: bright breakbeat finale,20 recipes,160 cooking beats +4 count-in +4 outro; changing sections, deliberate repeated motifs, challenging holds/pairs but no impossible overlap.
Use distinct harmony/bass/melody/sections per song, with actual musical composition. Avoid one short loop repeated for the entire song. No existing melodies or samples. music contains serializable beat-based arrangement events or authored patterns understood by SkyAudio-equivalent class below.
DIFFICULTIES = {normal:{name:'셰프',perfect:.045,good:.09,ok:.14,requiredRatio:.65},relaxed:{name:'느긋하게',perfect:.07,good:.12,ok:.18,requiredRatio:.5}}. Chart stays the same; timing and completion requirement change. Scores kept separately.

## Pure simulation: src/rhythm.js

Exports createRun(track,difficulty='normal'), press(run,lane,time), release(run,lane,time), advance(run,time), summary(run).
Time is seconds on the audio timeline. No performance.now, Date, browser APIs, timers or random. createRun deep clones notes and recipes; never mutate TRACKS. Fields:
{trackId,difficulty,status:'playing'|'won'|'lost',time,notes,recipes,held:[false×5],combo,maxCombo,score,patience:100,delivered:0,burned:0,judgements:{perfect:0,good:0,ok:0,miss:0},events:[],lastJudgement:null}.
Each note also has status:'pending'|'holding'|'hit'|'miss', judgement?,error?,pressedAt?. Recipes status:'pending'|'served'|'burned',quality?.
Every public operation returns an event array and also stores run.events. advance processes overdue notes/holds/serves and ends the track deterministically. Time is monotonic; ignore backward input times rather than resetting. Ignore input after win/loss. All meaningful state remains serializable/readable.
Nearest pending note on the pressed lane within ok window is judged perfect/good/ok by absolute error. Repeated keydown while held does not score twice. Ghost press outside any window costs one patience and breaks combo, throttled per lane to once/.12sec; count-in presses earlier than first chart action are ignored without penalty. Notes beyond the late window miss automatically. A hold's initial timing determines its grade; record its final judgement on completion; early release before end-.08sec misses it. No double miss or reward on repeated calls.
Weights perfect1,good.8,ok.5,miss0. Note score 1000×weight plus modest combo bonus. Miss/hold break costs4 patience in normal and2 in relaxed; successful ingredient earns no free patience. A serve press settles the recipe using ingredient weights / ingredient count and the serving grade. At least .55 ingredient quality and a successful serve produces one dish; otherwise burned. Good dish +4 patience (max100), burned dish -10. A missed serve automatically settles burned. Recipe rewards exactly once. A run loses at patience0 or at track end if delivered<ceil(recipeCount×requiredRatio). At track end otherwise won.
summary returns {status,score,accuracy:0..1,rank:'S'|'A'|'B'|'C'|'D',delivered,total,perfect,good,ok,miss,maxCombo}; accuracy denominator includes all chart notes (unjudged remain zero at failed completion); S>=.97 and all dishes, A>=.9,B>=.75,C>=.6 elseD.
Event shapes: {type:'hit'|'miss'|'hold'|'hold-end'|'ghost'|'dish'|'end',lane?,noteId?,judgement?,error?,quality?,recipe?,served?,text?}. Useful exact amounts may be added without breaking fields. Dish events trigger cooking/serving feedback. Mid-hold pause: audio clock stops, engine stops advancing; don't punish release events while paused. After resume preserve in-progress hold until its end (no pause penalty).

## Audio: src/audio.js

Export KitchenAudio class. Constructor does not autoplay/create sound. async unlock() creates/resumes AudioContext after user gesture. Public context, muted, volume properties.
async start(track): awaitunlock, stop previous schedule, set new anchor=context.currentTime+.15, schedule a four-beat count-in and arrangement. now(): seconds since anchor (can be briefly negative). update(): schedule <=.25sec ahead using AudioContext.currentTime, never frame accumulation; can be called every RAF. Long stalls must skip stale events rather than dump a burst.
async pause(): suspend context. async resume(): resume context. stop(): cancel/disconnect outstanding sources, reset scheduler; no stale notes on retry. setMuted(bool): master gain ramp and keep clock running. setVolume(0..1): master gain clamp/ramp. hit(lane,judgement='perfect'): brief cooking/percussive acknowledgement. dish(served,quality): a satisfying original sting. dispose(): close context and nodes.
Music: original synthesized chords, bass, melody and percussion; stereo placement, gentle envelopes, bounded master gain/no clipping. Cooking sounds may use synthesized filtered noise, never downloaded samples. Shared pitch/note constants allowed. No reliance on network or audio files.

## App / rendering

App owns clock, localStorage, screen state and DOM inputs. Engine owns scoring. Audio clock + saved timing offset ms/1000 is the sole input/advance time. Renderer gets same run.time. On keydown map d/f/j/k/Space to0..4, ignore repeat, prevent page scroll only in play; keyup releases except while paused. Escape pause, Enter start/continue/retry, M mute. Pointerdown/up on real lane pads for touch with pointer capture/cancel handling; reset physical keys on blur, pause automatically.
Screens: title, song-select, play, pause, results, help/settings. New player first song unlocked; clearing unlocks next. Record best score/accuracy/rank per track and difficulty, with corruption-safe localStorage. Save volume, muted, offset(-200..200ms). Calibration is a small metronome/tap utility or clearly labeled adjustment for next run; no complex settings maze. All songs selectable for practice even if progression locked only if clearly marked practice/no records; default unlock route must be real.
Canvas kitchen and note highway: warm graphic restaurant setting, animated knife/pan/flame/plating, food pieces reacting to hits, smoke on misses, plate launch and customer response on recipe results. The music and player gestures should visibly cook dishes, not merely move a progress bar. A large original chef artwork can anchor title and compact in-game cast panel. Lane highway and Space serving cue have clear approach/target timing and color/shape distinctions; key labels stay visible. Hit flashes, judgement text/error ms, combo, score, dishes required, remaining time and patience. Heavy motion can be reduced through prefers-reduced-motion. Scalable canvas & pointer coordinates, no horizontal overflow on phones. Portrait can use a compact kitchen above a four-lane highway; playable keys/pads always reachable. DOM overlays for semantic buttons/help/records; gameplay is keyboard/touch timing, not clicking UI commands.

Expose read-only window.__sizzle getters: screen,run(copy),trackId,settings(copy),records(copy),audioTime,renderStats. No teleport/score/edit debug APIs. Root may instrument AudioContext in tests. Use window.__sizzle.ready to signal initialization if useful.

## Verification / scope

Root tests real keyboard events at chart times against actual AudioContext, tests three complete songs and saved unlocks, retry/fail/pause/calibration/mobile, file:// and /sizzle-sync/ paths, actual non-clipping audio output and frame performance. Separate fixture tests can seed state to exercise failure paths but must not be presented as real completion. Deterministic unit tests cover exact window edges, holds, duplicate inputs, ghost spam, recipe settlement, time jumps, failure/end and chart feasibility.
Finish a small complete game with strong musical feel. Polish chart fairness, input latency, cues, music and the first thirty seconds before adding features.
