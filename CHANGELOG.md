# Changelog

All notable changes to Room Check are documented here.

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
