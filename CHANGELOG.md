# Changelog

All notable changes to Room Check are documented here.

## 2.5.0 — 2026-10-31

This release adds QR joining and post-survey graphs.

### Added

- QR code and audience URL on the live survey host screen
- Late joiners can scan the survey QR while it is open
- **View results** action after the host finishes a survey
- Answer graphs shown one question at a time
- Previous and next controls for survey graphs
- Back to counts action from the graph view
- Answer breakdowns are exposed to the host only after the survey closes

### Changed

- Live survey remains count-only until the host finishes
- The QR panel hides once the survey closes
- Version updated to 2.5.0

## 2.4.0 — 2026-10-31

This release turns multi-question sets into live surveys.

### Added

- Audience-driven question progression; voters answer each question in order automatically
- Back navigation and a review screen for changing answers
- Host live dashboard with each question name and respondent count
- Overall survey timer options: Manual, 1, 2, 5, 10, 15 or 30 minutes
- Host-controlled **Finish survey** action
- Final response counts retained after the survey closes
- Survey state and responses persist across server restarts

### Changed

- Multi-question mode no longer uses host **Next question** progression
- Survey hosts see respondent counts only, not answer breakdowns
- Per-question timers and tie-breakers apply only to single polls
- Single-question polls and Live Hands keep their existing flows
- Version updated to 2.4.0

## 2.3.0 — 2026-10-31

This release makes question sets easier to prepare and import.

### Added

- Multiple-questions toggle; single-question mode remains the default
- JSON import for question sets using `question` and `answers` attributes
- Support for a top-level array, a `questions` array, or a single question object
- Import validation for question text, answer count, duplicate answers, timer values and file size
- Ready-to-import example at `examples/questions.json`
- Import replaces the current set after confirmation when more than one question is present

### Changed

- The question-set builder is hidden when multiple questions are turned off
- Start button and helper copy adapt to single or multi-question mode
- Version updated to 2.3.0

## 2.2.0 — 2026-10-31

This release adds multi-question poll sessions.

### Added

- Prepare an ordered set of up to 20 poll questions before starting
- Per-question answers, voting window and tie-breaker setting
- Host-controlled progression from one revealed question to the next
- Audience progress indicators for the current question and total
- Final “Finish session” action after the last question
- Session and question-set persistence across server restarts
- Host question cards with add, edit and remove controls
- Multi-question session progress on the host stage and results screen

### Changed

- Live Hands remains a separate single-round mode, not part of a poll set
- Single-question polls keep the existing replay and new-question flow
- Version updated to 2.2.0

## 2.1.0 — 2026-10-30

This release adds update awareness and lets voters change their answer until voting closes.

### Added

- Public `/updates` page with current and latest version
- Host setup notification when a newer GitHub Release is available
- GitHub Releases check with a six-hour cache
- Release notes and a direct link to the GitHub Release
- Install-specific update instructions for git checkouts and archive installs
- Step-by-step update commands with per-command copy buttons and a “Copy all commands” action
- Cross-platform `npm run backup-data` command instead of requiring `tar`
- Voters can change their answer until voting closes; rejected changes keep the previous vote
- Looping waiting progress bars on the audience waiting and voted screens
- Timestamped progress and elapsed time in `npm run share`
- Release notes rendered as Markdown instead of raw text
- Release notes panel matches the How to update height and scrolls long notes internally
- `GET /api/update` endpoint with a forced-check option
- Config controls: `UPDATE_CHECK`, `UPDATE_REPO`, `UPDATE_API_URL`
- Update page and host notification documentation

### Changed

- GitHub CTA mark now sits directly in the button instead of inside a white tile
- Thank-you support label now reads simply “Open source”
- Mobile footer tagline is centred above the built-by credit
- Version updated to 2.1.0

### Security

- Updates are never applied automatically
- The page shows instructions only; the host must run the update
- The check uses GitHub Releases, not branch heads
- The response is cached to respect GitHub rate limits

### Fixed

- Update page works without host login
- Host update notice can be dismissed and stays dismissed for that release
- Update page and notification handle offline/error states

## 2.0.0 — 2026-10-30

This is the customisation release: a full visual refresh, a host theme customiser, and a more capable local theme system.

### Added

- Host-only theme customiser, opened from the palette icon in the host header
- Six pre-packed palettes:
  - Ocean — deep current, tidal teal and foam
  - Noir — black paper, bone ink, amber and vermilion
  - Tokyo Night — ink-black navy, neon violet and ice cyan
  - Shore — morning sand, seagrass and sea glass (default)
  - Studio — bone paper, charcoal and vermilion
  - Candy — blush paper, berry and gold
- Five theme colour roles: Background, Surface, Ink, Primary and Accent
- Flat and gradient page backgrounds
- Dedicated gradient Start and End colours with an angle control and live preview
- Sharp, soft and round corner styles
- Solid, outline and minimal button styles
- Six answer-colour palettes: Print, Bright, Cool, Warm, Mono and Garden
- Custom logo upload for PNG, JPG, WebP and SVG
- Named custom palettes saved in `.data/palettes.json`
- Live theme updates for the audience over WebSocket
- Theme API endpoints for theme, logo and custom palettes
- Sample theme migration for `carnival` → Shore and `orchard` → Candy
- Changelog and private workflow documentation

### Changed

- Full visual refresh to a paper-and-ink design system
- Big Shoulders Display headlines and Golos Text body text
- New waiting screen with stacked paper cards and a pulsing core
- QR previews now share a centre line across frame, URL, note and timer
- QR image frame is borderless; the surrounding card keeps its edge
- Connection status uses universal green, yellow and red colours
- GitHub CTA uses the black-and-white GitHub mark
- Room Check brand mark remains theme-coloured and replaceable
- Version updated to 2.0.0

### Fixed

- Tie-setting toggle geometry and checked travel
- Corner and button option labels now centre vertically
- Gradient Start/End controls now apply to the actual page background
- Theme selection state now persists correctly across reloads
- Palette selection indicator updates correctly after server restart
- Starting over from a live round now restores the saved answer labels

### Data and compatibility

- `state.json` now stores the active theme
- `.data/palettes.json` stores named custom palettes
- `.data/theme-logo.<ext>` stores uploaded logos
- Existing `carnival` palettes migrate to Shore; existing `orchard` palettes migrate to Candy
- Preset palettes use their current preset colours; custom themes keep their saved colours

## 1.1.0 — 2026-10-29

- End-session thank-you flow for host and audience
- GitHub star CTA and repository QR
- Optional tie-breaker wheel with winner and loser states
- Live Hands mode with a single raise/lower toggle
- Timer reveal and manual reveal
- Responsive mobile/desktop layouts
- Improved waiting and results states
- Password setup, reset helper, session handling and JSON persistence

Earlier history is available in the Git log.
