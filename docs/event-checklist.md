# Room Check — event-day card

Print this. Keep it with the laptop.

## Start

```bash
cd /path/to/room-check
npm run preflight
npm run share   # remote audience, or: npm start (same Wi-Fi)
```

- Keep this terminal open. The tunnel URL changes on every restart.
- Laptop plugged in, sleep disabled, projector at 1920×1080.

## Links

- Projector: `/present`
- Interactions: `/interactions`
- Audience: `/join` (or the printed tunnel URL + `/join`)
- Share card + PNG: `/share`

## Preflight (5 min)

- [ ] `/present` shows the right LAN or tunnel link
- [ ] Phone on venue Wi-Fi opens `/join`
- [ ] Phone on cellular opens the tunnel `/join` (when using `npm run share`)
- [ ] Test vote + test hand update the projector
- [ ] `/share` QR scans from the projector
- [ ] Deck + exported PDF backup on disk; host password known

## During

- One action per screen; reveal before moving on.
- End presentation from `/interactions`, `/present` setup, or the display bar — no phone needed.
- **End interaction** clears the open poll/hands round and returns the audience to the presentation screen; a survey closes with results on `/join`. **End presentation** closes the deck.
- Start another session from `/thanks-host` returns the audience to `/join`.

## If it breaks

```bash
curl -fsS http://localhost:3000/healthz   # expect {"ok":true,...}
ss -ltnp | grep ':3000'                    # who holds the port
```

- Tunnel dead → `npm start`, use the LAN link, project the exported deck.
- Audience stuck → reload `/join`; controller expired → rescan `/present` QR.
- Lost password → `npm run reset-password`, restart, use the terminal setup code.
- Stop everything: `Ctrl+C` in the server terminal.
