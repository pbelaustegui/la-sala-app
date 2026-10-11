# Judge compact bout view

## Objective
Judge bout view fits one phone screen with no scroll, minimal text, one-tap controls.

## Decisions (user-confirmed)
- Removing a card reverts its effects: red removes the opponent touch it granted, black reopens the bout (exclusion undone).
- Card indicator is color-only (no text); if yellow+red coexist show only red; with black show only black.

## Defaults assumed (not yet confirmed)
- Clock presets 3/2/1 min set remaining time via `state-set` (period length stays 3 min max, so no setup change).
- Reset bout = `state-set` composite (score 0-0, full clock, period 1, clear cards); priority and midBoutBreakTaken untouched.
- Subtract point = `state-set` score-1 (clamped at 0), clock stops as a side effect.

## Tasks
- [x] T1 Domain: `card-removed` event (apply + scoring, reverts red touch / black exclusion) + server zod schema + tests
- [ ] T2 Web controller/event-factory: remove card, subtract point, reset bout, clock preset + tests
- [ ] T3 Scoreboard layout: one-screen, no scroll, text removed, -1 per side, color-only toggle cards (highest severity only), reset and 3/2/1 clock controls + tests
- [ ] T4 Cleanup: drop unused i18n strings/CardsSheet inline flow; svelte-check + full test run

## Acceptance
- No vertical scroll on a ~360x640 viewport during fencing.
- All checks (vitest in domain/server/web, svelte-check) pass.

## Progress / evidence
T1 done (commit `feat(domain): remove a card and revert its effects`): domain `card-removed` (scoring.removeCard, error `card-not-found`; finished bouts reopen to last regular period, clock stopped) + server zod. RED observed (8 domain + 1 server failures), then GREEN: domain 151, server 199, web 414 vitest pass, svelte-check 0 errors. web event-factory has no card-given so no change.

## Next step
T2
