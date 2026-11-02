# Room Check smoke tests

Run the full browser smoke test:

```bash
npm install
npm run test:smoke
```

The test starts a temporary Room Check server on a free local port with a throwaway `DATA_DIR`, then uses Chromium to exercise:

- fresh host setup
- landing and removed routes
- image and PDF slide upload
- projector and controller pairing
- public slide access restrictions
- quick poll, Live Hands and survey
- share-card PNG export
- end session and audience thank-you screen

## Browser requirement

The test uses `playwright-core`, so it needs an installed Chromium/Chrome executable. It checks common Linux paths and `CHROME_PATH`.

```bash
CHROME_PATH=/path/to/chromium npm run test:smoke
```

No browser is downloaded by `npm install`.

## Notes

- The test does not use the production `.data` directory.
- The temporary server disables the update check.
- The tunnel is not tested here because it requires network access and a temporary public URL.
- Keep fixtures in `tests/fixtures/` in sync if the upload flow changes.
