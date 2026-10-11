# Compact spectator cards, admin and setup

## Objective
Spectator shows cards like the judge view (color-only dot, highest card only); admin and judge setup screens are more compact. Scrolling is acceptable on admin/setup.

## Defaults assumed (not yet confirmed)
- Spectator: one dot per fencer next to the name/score, reusing `highestCard`; accessible name via existing `spectator.card.*` i18n; no text chips, no reserved empty row.
- Shared `CardDot` component used by judge and spectator (keep `.card-dot` class + `data-card`).
- Admin/setup: tighter spacing and smaller controls scoped to those screens; global `--tap` untouched (Scoreboard uses it); accessible names preserved.

## Tasks
- [x] S1 Shared CardDot + spectator uses it (update spectator/piste-labels tests) - commit aeceb02; web vitest 39 files/423 tests pass; chips and cardChips/cardLabels removed
- [x] S2 Admin screen compact (per-piste row, short-label buttons keeping aria-labels) - commit 3e06d71; web vitest 39 files/423 tests pass
- [x] S3 Judge setup flow compact (SetupStep, ConfirmNew, Choose, Pin spacing) - commit 626cc27; vitest 423 pass, svelte-check 0 errors

## Acceptance
- vitest (domain/server/web) + svelte-check pass; aria names and `.card-dot` selectors stable.
- Manual device check of spectator, admin, setup.

## Progress / evidence
(none yet)

## Next step
S1
