# Room Check tests

## Unit tests (no browser)

```bash
npm run test:unit
```

Fast HTTP-level tests against a temporary server with a throwaway `DATA_DIR`:

- backup rotation keeps the newest N backups with safe permissions
- host setup, login and stale-cookie rejection
- strict input validation rejects non-numeric timers
- tie-break winner hidden from public state until done
- vote rate limiting trips after a burst (429)
- logo responses are not immutably cached
- closing a presentation invalidates the controller token
- reopening keeps slides and the controller token
- empty-deck navigation stays in range
- controller interactions honor the write-in toggle
- survey questions keep their own write-in flags
- resuming a live deck reopens the room
- host logout requires an authenticated session

## Smoke test (browser)

Run the full browser smoke test:

```bash
npm install
npm run test:smoke
```

The test starts a temporary Room Check server on a free local port with a throwaway `DATA_DIR`, then uses Chromium to exercise:

- protected landing and host setup
- landing and host theme customiser open/save/close
- image and PDF slide upload
- projector next/previous, fit, rotate, deck/resume, End presentation and display-bar end
- controller token pairing, password pairing, fit, rotate, slide jump and slide controls
- poll add/remove, vote, vote change, write-in and write-in disable toggle
- per-question write-in flags through the host survey builder
- reveal, Live Hands, survey back/next and results
- End interaction from the host console and projector, with the audience returning to the presentation screen
- share-card copy, PNG export and routes
- public slide access restrictions
- fullscreen toggles on landing, host and projector
- no-slide controller session with QR and no-slide display
- end session from controller, home, host and projector, including host End presentation and `/thanks-host`
- `/thanks` audience content and return to `/join` standby; `/thanks-host` Start another session returns home

## Browser requirement

The test uses `playwright-core`, so it needs an installed Chromium/Chrome executable. It checks common Linux paths and `CHROME_PATH`.

```bash
CHROME_PATH=/path/to/chromium npm run test:smoke
```

No browser is downloaded by `npm install`.

## CI

`.github/workflows/check.yml` runs `npm run check`, `npm run version:check`, `npm run test:unit` and `npm run test:smoke` on pushes and pull requests (Node 22 and 24 matrix). GitHub-hosted Ubuntu provides `/usr/bin/google-chrome`.

## Notes

- The test does not use the production `.data` directory.
- The temporary server disables the update check.
- The tunnel is not tested here because it requires network access and a temporary public URL.
- Keep fixtures in `tests/fixtures/` in sync if the upload flow changes.
- Set `SMOKE_ARTIFACTS=/path/to/dir` to save a failure report (stack, page errors, server log and a screenshot per page) when a run fails. CI uploads these automatically.
