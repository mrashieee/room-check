# Security policy

## Supported versions

| Version | Supported |
| --- | --- |
| 3.x | Yes |
| < 3.0 | No (online mode removed) |

## Reporting a vulnerability

Email the maintainer via the address on the [GitHub profile](https://github.com/mrashieee) with:

- A description of the issue and its impact.
- Steps to reproduce (routes, payloads, config).
- Whether it needs LAN access, the host password, or a controller link.

Do not open a public issue for an unpatched vulnerability. You will get a response within 7 days.

## Known limitations (by design)

- The controller token in `/controller?token=...` is a bearer capability. Anyone with the link can control the live presentation. Treat controller links as private and rotate them after each event.
- Signing out clears the browser cookie and closes host WebSockets. A copied cookie remains valid until it expires or the session secret is rotated; run `npm run reset-password` or clear the data directory if a host device is lost.
- Audience identity is a client-chosen `playerId`. One person can vote multiple times by clearing storage. Voter endpoints are rate-limited (60/min per IP + player), but this is casual-room protection, not election security.
- Presentation data, passwords and session secrets live in `.data` on the host laptop (mode 0600). Encrypt the disk and keep backups offline.
- First-run setup binds `0.0.0.0` by default. On untrusted LANs, set `BIND_ADDRESS=127.0.0.1` until the password is configured, or set the password immediately.
