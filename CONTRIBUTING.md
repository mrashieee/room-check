# Contributing to Room Check

Room Check is a single-maintainer project by Muhammad Rashid K. Small, focused contributions are welcome.

## Ground rules

- Offline-first: the projector owns the slides; audience phones never get slides or video.
- No WebRTC, TURN, SFU, media servers, rooms, chat, accounts or analytics.
- Keep the QR-to-play path: scan, open, participate. No signup.
- No names or personal data unless a feature genuinely requires it.
- Ask before committing to `main`: open an issue or PR first.

## Development

Requirements: Node.js 22.9+ (see `.nvmrc`).

```bash
npm install
npm run dev:isolated   # isolated DATA_DIR on port 3100, keeps real .data untouched
npm run check          # syntax checks for every server/script/test/browser file
npm run test:unit      # fast HTTP-level tests, no browser needed
npm run test:smoke     # 15-workflow Chromium suite (needs CHROME_PATH)
npm run preflight      # event-day machine readiness check
npm run version:check  # package.json vs README badge vs CHANGELOG
```

`npm run test` runs unit + smoke.

## Pull requests

- One focused change per PR.
- Update README/CHANGELOG when behavior changes.
- Add or extend smoke/unit coverage for the changed flow.
- CI must pass on Node 22 and 24.
- Never include `.data`, `.local`, `.env`, backups or secrets.
