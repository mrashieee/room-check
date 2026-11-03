# Changelog

All notable changes to Room Check are documented here.

## 3.1.0 — 2026-11-03

### Fixed

- Multi-question poll sessions no longer switch the projector to the survey view
- Controller tie-break responses no longer reveal the winner before the wheel finishes
- Hands toggles now require an explicit raise (`true`/`false` strings count as lowering)
- Slide files validate presentation/slide IDs, blocking path traversal from stored state
- Theme logos are no longer cached immutably, so logo changes apply immediately
- Host question drafts preserve the per-question write-in toggle across reloads
- Poll and survey write-in settings now respect per-question overrides
- Resetting a Live Hands round no longer sticks the host on the hands stage
- Landing End session no longer closes a live deck; it ends the session like every other surface
- End confirmations now say what actually happens while a presentation is live
- Projector setup no longer flashes the auth screen on load; the reconnect poller no longer re-fires redirects on 401
- Thanks-host retry after sign-out goes back to interactions instead of bouncing through home
- Host question drafts and JSON imports accept per-question write-in flags
- JSON import/export buttons share one style and live with the question set
- Voter rate limits respect the configured proxy trust instead of a spoofable header
- WebSocket origin and secure-cookie checks only honor forwarding headers from loopback peers
- Vote throttle map can no longer grow without bound
- State saves fsync the file and directory on both write paths
- Unusable state files are backed up before starting fresh
- Invalid update-check URLs fail fast instead of hiding behind the cache
- Leading/trailing spaces no longer create a different password at setup vs login

### Changed

- Host mutation endpoints consistently include live vote counts; tie-break spin pool size is included
- Poll and survey percentages share one largest-remainder helper so totals sum to 100
- Strict validation: non-numeric timers and non-boolean tie/write-in flags return 400
- Controller token comparison is timing-safe; `SESSION_SECRET` requires 32+ characters
- Public vote/hand/survey endpoints are rate-limited (60/min per IP + player); rounds cap at 5,000 respondents
- Signing out closes host WebSocket sessions; reset-password also rotates the session secret
- Corrupt `state.json` is backed up before starting fresh; state saves fsync the file and directory
- State sync uses a server revision counter instead of wall-clock time
- `npm run check` covers every JS file via glob; new `test:unit`, `preflight`, `version:check` and `release:check` commands
- The `/host` page is now `/interactions` (`/host` redirects, query preserved); present and interactions headers share the same order and styling

## 3.0.0 — 2026-11-02

### Added

- Offline-first presenter assistant with projector slides, phone controller and a silent audience screen
- Landing page with **Presentation** and **Poll, survey or hands** entries, without numbering
- `/present` projector setup and full-screen display with image/PDF slide uploads
- `/controller` phone controller with QR-token pairing, host-password fallback, fit width/page and tall-slide scrolling
- Remote scroll sync: scrolling the controller preview scrolls the projector
- Audience attention screen on `/join` while slides are presented
- Controller tabs for Slides, Poll and Hands
- Quick polls with 2–10 answers, timers, tie-breaker spins, result highlighting and private write-ins
- Multi-question surveys with audience-driven progression, review screens, QR joining and post-survey graphs
- Live Hands with a raised-hand count on the projector
- End session from the controller, projector header or full-screen display bar
- Host end screen and matching audience thank-you screen
- `/share` audience QR/link card with a downloadable 1920×1080 PNG
- Tunnel-aware share link: `npm run share` sets `PUBLIC_URL` so the QR and share card use the public address
- Desktop shell keeps the header and footer visible while the middle content scrolls; phones keep normal page scrolling
- Landing cards use the same neutral card style, with Presentation matching Poll, survey or hands
- Landing header uses Home; the host and presenter headers also expose Share
- Presentation header End session uses the same muted treatment as the host header
- Desktop landing fills the viewport, aligns content to the top-left and hides the scrollbar
- Landing page is protected by host login and returns there after login
- Landing header exposes customise, fullscreen and End session
- Landing customise opens the theme customiser in place instead of navigating to `/host`
- Host-facing Room Check brands return to `/`
- End session opens `/thanks-host` from projector, host, home and controller; the audience opens `/thanks`
- `/thanks` and `/thanks-host` carry support copy, an accented GitHub star action and GitHub QR; only the host version has Start another session
- Start another session resets the ended state, returns the host to `/` and the audience to `/join` standby
- Host header exposes End presentation while live; the interaction button becomes End interaction and stays hidden when no poll/survey is active
- Presenter setup exposes Stop presentation and a link to laptop host controls
- Host and controller can toggle audience write-in answers per poll or survey
- Controller QR is available before start and supports no-slide polls, hands and surveys
- Presenter starts an empty session with Start session instead of requiring a slide
- Smoke coverage now includes fullscreen, customiser save, controller password pairing, presenter controls, share copy and every end-session path
- Survey results still stay on `/join` after a survey closes
- Presenter preflight audience link, LAN/tunnel label and copy action
- Inactive presentation retention and backup rotation
- WebSocket origin checks, QR rate limiting and controller-link rotation
- Customiser background inerting and reduced-motion accessibility
- GitHub Actions syntax and browser smoke workflow
- Projector connection feedback and live-session close/reload warning
- Automated Chromium smoke test covering setup, slides, controller, polls, hands, surveys, share card, slide access and end session
- Slide images now require the host cookie or controller token; public state no longer exposes slide URLs
- Controller state endpoint scoped to the active controller token
- Host theme customiser, named palettes, custom logo, backups and update page remain available

### Changed

- The app is now offline-first and tunnel-based. The projector owns the slides; the audience screen handles interactions only.
- The audience link is a normal web page delivered by the tunnel. The tunnel is not a media relay.
- `/present` always opens the offline projector.
- `/join` is the only audience route. The old online room and live audience routes are gone.
- The share card now shows the audience join link and presentation title, not a room code.
- Documentation rewritten for the offline/tunnel workflow.

### Removed

- Online presentation mode, online rooms and room codes
- WebRTC screen/camera sharing, microphone mixing, STUN/TURN configuration and ICE endpoints
- Online host page, live audience page and online-only styles
- Chat, emoji reactions, custom stickers and online pause controls
- Online room lifecycle and signaling code

### Fixed

- Audience logos no longer navigate back to the landing page; host-facing brands return home
- Divider alignment and projector clarity improvements at 1080p
- Updating a vote flashes the audience confirmation seal
- End session remains reachable while the projector is full-screen
- Custom write-in labels capitalize the first letter and merge spelling/typo variants
- Result lists can contain more than 10 options

## 2.5.1 — 2026-10-31

Bug-fix release for the live survey flow.

### Survey flow

- Questions no longer advance automatically. Voters choose **Next question** when they are ready.
- **Back** returns to the previous question, and the final question shows **Finish**.
- Answers can be changed from the review screen with **Save answer**.
- When a survey closes, the audience sees the survey results instead of the thank-you screen.
- Audience results show each question with answer bars and percentages.
- The host still sees live respondent counts and can view answer graphs after finishing.
- Version updated to 2.5.1.

### Unchanged

- Single polls and Live Hands keep their existing flows.
- Survey QR joining and the overall survey timer remain available.

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
