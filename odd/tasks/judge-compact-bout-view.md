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
- [x] T2 Web controller/event-factory: remove card, subtract point, reset bout, clock preset + tests
- [x] T3 Scoreboard layout: one-screen, no scroll, text removed, -1 per side, color-only toggle cards (highest severity only), reset and 3/2/1 clock controls + tests
- [x] T4 Cleanup: drop unused i18n strings/CardsSheet inline flow; svelte-check + full test run

## Acceptance
- No vertical scroll on a ~360x640 viewport during fencing.
- All checks (vitest in domain/server/web, svelte-check) pass.

## Progress / evidence
T1 done (commit `feat(domain): remove a card and revert its effects`): domain `card-removed` (scoring.removeCard, error `card-not-found`; finished bouts reopen to last regular period, clock stopped) + server zod. RED observed (8 domain + 1 server failures), then GREEN: domain 151, server 199, web 414 vitest pass, svelte-check 0 errors. web event-factory has no card-given so no change.

T2 done (commit `feat(web): compact judge actions in the scoreboard controller`): controller `subtractPoint`, `resetBout`, `setClockPreset`, `toggleCard` + pure `highestCard` helper. RED observed (5 controller failures), then GREEN: web controller+card-counts tests 29 pass. Subtract/cards need canScore; preset needs a timed phase; reset works in any phase.

T3 done (commit `feat(web): compact one-screen judge scoreboard`): ScoreboardScreen is a fixed full-viewport flex column; Scoreboard has per-side tap area, minus button, colour-only highest-card dot, three card toggles (aria-pressed), 3/2/1 presets, icon reset (top bar, dashed, away from scoring), icon undo/double/facing/correct; CorrectionSheet is a fixed overlay; CardsSheet and hint/title strings removed. RED observed (8 web screen failures), then GREEN: web vitest 425 pass, svelte-check 0 errors. Not verified on a device or browser (no headless browser installed).

T4 done (commit `chore(web): drop unused scoreboard copy`): removed `board.priority.hint`; other board.* keys are used (card and reason keys dynamically). Final checks: domain, server, web vitest and web svelte-check green (see report).

## Next step
PR / on-device check at 360x640.
