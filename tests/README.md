# Room Check smoke tests

Run the full browser smoke test:

```bash
npm install
npm run test:smoke
```

The test starts a temporary Room Check server on a free local port with a throwaway `DATA_DIR`, then uses Chromium to exercise:

- protected landing and host setup
- landing and host theme customiser open/save/close
- image and PDF slide upload
- projector next/previous, fit, rotate, deck/resume, Stop presentation and display-bar end
- controller token pairing, password pairing, fit, rotate, slide jump and slide controls
- poll add/remove, vote, vote change, write-in and write-in disable toggle
- reveal, Live Hands, survey back/next and results
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

`.github/workflows/check.yml` runs `npm run check` and `npm run test:smoke` on pushes and pull requests. GitHub-hosted Ubuntu provides `/usr/bin/google-chrome`.

## Notes

- The test does not use the production `.data` directory.
- The temporary server disables the update check.
- The tunnel is not tested here because it requires network access and a temporary public URL.
- Keep fixtures in `tests/fixtures/` in sync if the upload flow changes.
