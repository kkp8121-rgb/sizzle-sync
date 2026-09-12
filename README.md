# SIZZLE SYNC · 심야식당의 비트

A complete original rhythm cooking game for keyboard and touch. Chop, fry, flip and season on the beat, then land the serving cue to turn a phrase into a finished dish.

Open `index.html` directly, or run `npm ci` and `npm run serve` and visit the printed local port. The runtime has no CDN, external fonts, network services or downloaded audio. Everything needed to play is bundled locally.

## Play

| Input | Action |
| --- | --- |
| D / F / J / K | Chop / fry / flip / season |
| Space | Serve the finished dish |
| Hold a long note | Sustain until its tail reaches the judgement line |
| Escape | Pause / resume |
| Enter | Start / retry |
| M | Mute |
| Touch pads | Same five actions on phones and tablets |

Three original songs increase from 108 to 128 to 146 BPM. Clear one service to unlock the next. Each eight-beat recipe ends with a serving cue. Prepare at least 55% ingredient quality and hit the serving cue to deliver a dish. Misses reduce customer patience; successful dishes restore some patience. Complete enough dishes before the song ends without losing all patience. Difficulty, volume, timing offset, unlocks and best records are saved in the browser.

The normal difficulty requires 65% of dishes and allows 140 ms for a successful hit. Relaxed difficulty allows 180 ms, halves the ingredient-miss penalty and requires 50% of dishes. Timing offset in the menu applies to the next run; positive values compensate inputs that arrive early relative to the chart. Scores are stored separately for each difficulty.

## Development and verification

```
npm ci
npx playwright install chromium
npm run build
npm test
npm run test:browser
npm run test:campaign
npm run test:interaction
npm run pack
node tests/package.cjs
```

All browser tests run headless. The campaign driver uses real keyboard events against the live AudioContext; it does not write game progression or score. `SIZZLE_URL` can point the browser smoke test at an actual deployed subpath. Build output is a classic script so `file://` works as well as a GitHub Pages project directory. The ZIP in `dist/` can be uploaded as an HTML game with `index.html` at its root.

## Credits

Original game design, implementation, procedural music and synthesis produced with Codex. Original chef and kitchen illustrations produced with the built-in ImageGen tool; full prompts and preserved source files are documented in [docs/ART.md](docs/ART.md). No franchise characters, existing melodies or downloaded samples were used. Canvas 2D and Web Audio are browser APIs. esbuild and Playwright are development tools only.

See [docs/QA.md](docs/QA.md) for measured release checks and their limits.
