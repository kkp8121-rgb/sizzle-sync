# SIZZLE SYNC

Standalone original rhythm cooking game. Never edit sibling repositories.
No visible browser launch. Playwright must be headless. No external runtime dependencies.
Root owns design, integration, tests, Git commits and release. Workers edit only assigned files and never revert each other.
Git stage explicit paths only. Each git push requires the user's explicit approval for that push.
Read docs/CONTRACT.md before implementation. Runtime is bundled to classic game.js so file:// works.
Write Korean through apply_patch or explicit UTF-8 APIs. Never log ImageGen base64 or credential data.
After changing localized UI strings, inspect the actual saved literals and a fresh rendered screen. Replacement question marks or broken glyphs mean the change has failed, even if JavaScript parses.
Use apply_patch for scripts containing nested quotes; do not embed them in PowerShell node -e command strings.
Use exact AudioContext time for rhythm judgement. Rendering frame time must never determine scoring.
Compute reported aggregate counts from test reports. Fresh measurement is required before claiming a pass.
