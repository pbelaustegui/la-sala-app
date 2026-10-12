# Editable fencer names

## Objective
The judge can edit both fencer names from the correction sheet; judge screen and spectators update.

## Design (explorer findings)
- Names live only in server `BoutSetup` (ports.ts, sqlite `bouts.setup`), immutable, not replayed; snapshotOf reads `record.setup`.
- Chosen: new domain event `names-set {left,right}` stored in BoutState (replayed, undoable), NOT part of `state-set`, so a names-only edit never stops the clock or reopens a finished bout. Valid in any phase.
- Validation matches setup: trim, 1..100 chars. Server snapshot `fencers` come from replayed state (seeded from setup). Web `names` becomes reactive; local reload rebuilds names from events/base.

## Tasks
- [ ] N1 Domain + server: `names-set` event, BoutState names seeded from setup, zod schema, snapshotOf from state, tests
- [ ] N2 Web: controller `setNames`, reactive names in ScoreboardScreen, CorrectionSheet name inputs (own apply flow, validation, i18n), local-bout reload path, tests

## Acceptance
- vitest domain/server/web + svelte-check pass; names edit does not stop clock; spectators see new names; undo reverts.

## Progress / evidence
(none yet)

## Next step
N1
