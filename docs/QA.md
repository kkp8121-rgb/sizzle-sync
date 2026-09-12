# Release verification

Measured on Windows with headless Chromium / Playwright 1.63.0 on 2026-09-13 KST. No visible browser was opened. These are functional and performance measurements, not a claim of human playtesting, universal device compatibility or game-jam ranking.

## Completed checks

- `npm test`: 21 passed. Inclusive timing edges, monotonic time, simultaneous keys, hold completion/break, ghost throttling, chronological stalls, recipe settlement, loss/win, JSON-safe state and chart/music alignment. All three real charts clear with exact inputs, deterministic ±60 ms jitter, and one in five ingredients intentionally missed while serving correctly.
- `npm run test:campaign`: three complete songs through actual Playwright keyboard down/up events timed against the live AudioContext. 492 notes, 52 dishes, zero misses, all three records saved and next songs unlocked; records and unlocks survived reload. A hold was paused, its physical key released while paused, then resumed without losing the following note. No score, progress, run-time or chart injection.
- Actual chart durations: First Service 66.111 seconds / 112 notes; Neon Wok 71.250 seconds / 180 notes; Midnight Rush 69.041 seconds / 200 notes. Total 206.402 seconds of song time. The first chart teaches four ingredient keys and serving before introducing holds and pairs.
- `npm run test:browser`: direct `file://` and `/sizzle-sync/` HTTP mount both work; original illustrations decode at their source dimensions. First two recipes completed on each path. JavaScript errors, failed requests, 404s and external runtime requests: zero. Live audio context starts from a gesture; sampled peaks were 0.42813 and 0.19258, below clipping. Pause freezes the audio clock; mute persists.
- `npm run test:interaction`: 390×844 portrait and 844×390 landscape completed a recipe using real touch events. All five pads remain inside the viewport; no horizontal overflow. Pause/retry, zero volume, +125 ms offset, relaxed difficulty persistence, four malformed-storage fixtures, no-input defeat and clean retry passed. Fixture storage is separate from the campaign route.
- `npm run test:performance`: first three recipes completed with no misses at normal and 4× CPU throttling. Average frame intervals 16.721 ms / 22.639 ms; p95 16.7 ms / 33.4 ms. Mute attenuated sampled output below 0.000004 while the audio clock continued. This was a headless Chromium measurement, not a physical phone benchmark.
- `npm run pack` and `node tests/package.cjs`: 897,577-byte ZIP, seven runtime entries, portable forward-slash relative paths. Each decompressed entry's SHA-256 matched its built source. No source artwork, development packages, credentials or test artifacts are in the playable ZIP.
- Root visually inspected title, active play, mobile portrait/landscape, intermediate dish cues, failure and final results. Report files and screenshots are under ignored `artifacts/`.

## Polish from testing

- Fixed held-input state after pausing mid-hold, which previously blocked the next same-lane note.
- Aligned authored musical cues with every chart note; replaced irregular subdivisions with playable eighth-note patterns, added true kick/snare/hat synthesis and key-correct serving stings.
- Added two distinct musical breakdown phrases and removed excess silent tails.
- Made holds visibly shrink toward a stationary judgement head, added beat guide lines and held-key highlights, and cleared effects/judgement on retry.
- Moved recipe and completion counters out of the note highway, preserved artwork proportions, corrected mobile cue width and landscape touch controls, and repaired corrupted result strings.

## Deployment verification

The repository targets `kkp8121-rgb/sizzle-sync`. Each push requires the user's approval. After an approved GitHub Pages deployment, run `SIZZLE_URL=https://kkp8121-rgb.github.io/sizzle-sync/ npm run test:browser` (set the environment variable using the host shell) to verify the actual hosted URL, relative assets, classic script loading, audio and HTTP errors.
