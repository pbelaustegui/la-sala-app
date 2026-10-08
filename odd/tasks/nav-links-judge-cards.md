# Feature: nav-links-judge-cards

## Objective
Easy navigation between the admin, judge and spectator views, and cards visible on the judge's own bout screen.

## Problem / why
Found while testing on a real deployment:
1. Admin has no links to the spectator or judge views.
2. A judge cannot reach the spectator board without typing the URL.
3. When a judge gives a card it shows on the spectator view but not on the judge's own scoreboard: `Scoreboard.svelte` never reads `model.cards` (data already reaches the model at `core/scoreboard-view.ts:96`).

## Scope
- N1 (bugfix): per-side card chips on the judge scoreboard (yellow/red/black counts), reusing the spectator label logic where possible via a small adapter for `CardRecord[]`.
- N2 (navigation): links to the spectator board from the judge screens (judge list and scoreboard, next to the existing "leave" link) and from the admin screen; on the admin screen, per piste a link to open the judge screen (`#/judge/:pisteId`) and a link to the spectator piste detail (`#/piste/:id`).
- OUT of scope: new-tab behavior, leave-confirmation dialogs, PIN in URLs, server changes, router changes.

## Decisions
- Judge to spectator opens in the SAME tab (user decision). Leaving the scoreboard runs `session.dispose()` (stops sync queue, wake lock and redraw tick); the bout clock is derived from events so a running clock keeps counting; events stay in `LocalBout` and the session resumes on return. Expected use is outside a running bout, so no guard.
- The PIN never goes in a URL (it travels in the `x-piste-pin` header).

## Constraints
- Layering: DOM-free logic in `core/`, controllers, presentational components; all UI copy in Spanish via `i18n/es.ts`.
- Artifacts in English except UI copy; conventional commits; no AI attribution or Co-Authored-By. ~400 authored lines per task is a planning heuristic only.

## Tasks
- [x] N1 Card chips on the judge scoreboard; RED test first (judge screen shows a card after giving one)
- [x] N2 Navigation links (judge screens to board; admin to board, and per piste to judge and spectator detail); tests

## Route declaration
N1-N2: delegated direct, one writer (2+ non-trivial files across components, routes, i18n and tests; trigger: writer rule). Mapping done by a read-only explorer (trigger: mapping rule).

## Delivery
Forecast ~250 authored lines; single PR, two work-unit commits. Branch: `feat/nav-links-judge-cards`.

## Acceptance
- After a judge gives a card, the judge's scoreboard shows it for the right side, and it survives a reload of the resumed bout.
- Admin shows a spectator-board link and, per piste, judge and spectator-detail links; judge list and scoreboard show a link to the board.
- `npm test -w packages/web`, `npx tsc --noEmit -p packages/web`, `npm run check -w packages/web`, `npm run build -w packages/web` pass.

## Progress
- Branch created, plan written, explorer mapped the code.
- N1 done (commit a4ad853). RED: new ScoreboardScreen tests (chip on right side; resumed bout) failed with no `.chip` found, card-counts test failed on missing module. GREEN: new `core/card-counts.ts` (`countCards`, shared with `piste-view.ts`), `cardChips` in `piste-labels.ts`, chips rendered in `Scoreboard.svelte`. Checks: vitest 313 passed, tsc clean, svelte-check 0 errors.
- N2 done (commit fb1a95d). RED: 3 new link tests (judge list, scoreboard, admin) failed before implementation. GREEN: `nav.board` link on `PisteListScreen`/`ScoreboardScreen`/`AdminPistes`, per-piste judge and spectator-detail links in `AdminPistes`, copy in `i18n/es.ts`, README updated. Checks: vitest 316 passed, tsc clean, svelte-check 0 errors, vite build ok.

## Next step
Push and open the PR (user decision).
