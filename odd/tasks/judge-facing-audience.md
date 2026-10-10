# judge-facing-audience

## Objective
Let a judge say they stand facing the audience, so the scoreboard mirrors left/right to match what they see (audience left = judge right).

## Decisions (user-confirmed)
- A toggle on the judge's scoreboard, remembered on the device (not in the bout log, not synced).
- Visual only: domain sides, events, colours per fencer, spectator board stay unchanged. Only the on-screen order of the two fencers swaps (halves, cards sheet, priority picker, correction sheet columns).

## Tasks
- [ ] A1 Device preference store + toggle in the judge scoreboard, mirrored ordering in all side pairs, tests first

## Route
Delegated direct: one writer (preparation reading across web components).

## Out of scope
Spectator board, server, per-bout setting.
