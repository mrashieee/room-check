---
name: Event rehearsal
about: Real-device and projector validation for a release
title: "Rehearsal: vX.Y.Z"
labels: qa
---

## Environment

- Release/commit:
- Projector (model/resolution):
- iPhone model + iOS + Safari version:
- Android model + browser:
- Network: LAN / tunnel / cellular carrier:

## Gate A — real devices

- [ ] iPhone Safari joins via tunnel on cellular data
- [ ] Android Chrome joins via tunnel on cellular data
- [ ] QR scans from the projected share card
- [ ] Vote, change vote, write-in on both phones
- [ ] Survey Next/Back/review/Finish on both phones
- [ ] Raise/lower hand, live count updates
- [ ] Controller works while projector is full screen

## Gate B — real projector

- [ ] Slides, polls, results, Hands readable at 1080p
- [ ] Fit width and fit page usable
- [ ] Tall-slide scroll sync smooth
- [ ] 40+ page PDF imports and starts reliably

## Gate C — full rehearsal

- [ ] No-slide session: poll, survey, Hands
- [ ] Write-ins on and off
- [ ] Every end-session path, then Start another session
- [ ] Discard deck keeps controller paired
- [ ] Server restart mid-event, then resume
- [ ] Tunnel failure falls back to LAN

## Issues found

<!-- Link issues or describe blocks inline. -->
