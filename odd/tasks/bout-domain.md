# Feature: bout-domain

## Objective
Pure TypeScript domain model for a fencing bout (foil, epee, sabre), usable offline on the judge's phone and on the server. Event-sourced, deterministic, no I/O, no `Date.now()`.

## Problem / why
La Sala = live scoreboard for a fencing school's internal tournaments (3-4 simultaneous pistes, mobile data only). The domain is the differentiator; UI and server plug in later. See Engram `la-sala-app/product-definition`.

## Scope
- Monorepo skeleton (npm workspaces) with `packages/domain` only. Svelte PWA and Hono server are OUT of scope here.
- Bout rules per weapon, configurable: 1, 2 or 3 periods; touch limit; period/break durations.
- Pure reducer over timestamped events; replay with undo.

## Constraints
- Stack: TypeScript strict, Vitest, npm workspaces (pnpm not installed). Hexagonal: domain imports nothing from outside.
- Time is always passed in (`at: number`, ms epoch). Clock expiry is derived from timestamps (`settle`), never from a timer.
- Artifacts (code, comments, tests, commits) in English; conventional commits; no AI attribution.
- ~400 authored changed lines per task is a planning heuristic only.

## Rules model (assumptions to verify against the FIE rulebook)
- Defaults: 3 periods x 3 min, 1 min break, 15 touches. Pool-style bouts are expressed via options (e.g. 1 period, 5 touches).
- Sabre: 1 min break when a fencer first reaches 8 touches, only when touch limit is 15.
- Epee: double touch scores for both sides. Foil/sabre have no double touch event.
- A scored touch stops the clock.
- Time expires: leader wins; if tied, priority is drawn, then 1 min sudden-death extra period; no touch -> priority side wins.
- Cards: yellow = recorded only; red = touch to opponent; black = exclusion, opponent wins.
- OPEN: double touch bringing both sides to the limit; double touch during sudden death. Simplified: both score, tie persists, extra period continues.

## Tasks
- [x] T1 Scaffold + rules: repo skeleton, tsconfig, vitest, `createRules(weapon, options)` with tests
- [x] T2 Bout state + clock: `createBout`, clock start/stop, `settle(state, at)`, period end and breaks
- [x] T3 Scoring: touches, double touch (epee), touch limit win, sabre mid-bout break, cards
- [x] T4 Tie-break: priority draw, sudden-death extra period, exclusion win reasons
- [x] T5 Replay + undo: `replay(initial, events)` with `undo` event

## Layout (planned)
`packages/domain/src/`: `rules.ts`, `bout.ts` (types, createBout), `clock.ts`, `apply.ts` (reducer, Result type), `replay.ts`, `index.ts`, plus `*.test.ts` next to each.

## Acceptance
- All tests green, `tsc --noEmit` clean.
- Each task: RED observed before implementation (Vitest is the runner), then GREEN.
- No import of Node/DOM APIs in `packages/domain/src`.

## Delivery
- Forecast: ~900 authored changed lines (code + tests). Strategy: ask-on-risk; chain strategy pending user choice.
- Route per task: delegated direct (one writer, 2+ non-trivial files; trigger = Writer trigger).
- RDD: on (global). Assess after each work-unit commit; record tier/outcome below.

## Progress / evidence
- Branch `feat/bout-domain` created (no `main` yet, no remote).
- T1 done. RED: rules.test.ts failed (module `./rules` missing). GREEN: `npm test --workspaces` 8/8 passed; `npx tsc --noEmit -p packages/domain` clean. Commit: a50f741.
  - Assumption: `createRules` throws RangeError on invalid options (config is a programmer error, not a runtime domain error). `Rules` also exposes `extraPeriodDurationMs` (60 s) and `doubleTouchAllowed`.
- T2 done. RED: apply/bout/clock tests failed (modules missing). GREEN: `npm test --workspaces` 36/36 passed; `npx tsc --noEmit -p packages/domain` clean. Commit: 17138a5.
  - Design: `Phase.break` carries `endsAt` and `resumeRemainingMs` (mid-bout); `settle` starts a period break at the clock's expiry instant (not the settle time), and breaks end into a stopped clock (judge must restart). `apply` rejects time going backwards, settles first, then reduces. Events after a time-driven finish fail with `bout-finished`.
  - Assumption: no break before the sudden-death period (last-period tie goes straight to priority draw).
- T3 done. RED: scoring.test.ts 25 tests failed (events unhandled). GREEN: `npm test --workspaces` 62/62 passed; `npx tsc --noEmit -p packages/domain` clean. Commit: 4a82b6c.
  - Design: `scoring.ts` holds pure transitions (`scoreTouch`, `scoreDoubleTouch`, `giveCard`); touch-limit win needs the leader at/above the limit and strictly ahead, so a tied limit (double touch) keeps the bout going (OPEN item, tests named `OPEN simplification`).
  - Assumptions: touches/cards are accepted in `fencing` with the clock running or stopped (judge may stop first, then award); sabre mid-bout break ends at `at + breakDurationMs` and resumes with a stopped clock; yellow card does not touch the clock; a black card stops the clock and finishes immediately.
- T4 done. RED: 10 of 12 new tiebreak tests failed (`priority-drawn` unhandled, extra-period touches rejected); 2 characterization tests (draw reached, black card on trailing side) and 1 break-card test already passed against T2/T3 code. GREEN: `npm test --workspaces` 76/76 passed; `npx tsc --noEmit -p packages/domain` clean. Commit: f4d40ed.
  - Assumptions: a sudden-death touch finishes the bout with reason `time` (reason union kept as specified); touches/cards are valid in `fencing` and `extra-period`; cards in `priority-draw` or breaks are rejected. Time-driven finishes (expiry) are only observable via `settle(state, now)`, since `apply` rejects events on a finished bout.
- T5 done. RED: replay.test.ts failed (module `./replay` missing). GREEN: `npm test --workspaces` 89/89 passed; `npx tsc --noEmit -p packages/domain` clean; purity scan of non-test sources (Date.now, Math.random, node:, process, document, window) found nothing. Commit: fa94142.
  - Design: `replay(initial, events)` keeps a state stack; `undo` pops (no redo, error `nothing-to-undo` on a pristine bout, time-monotonic check applies); failures return `{index, error}`. `apply` alone rejects `undo` with `undo-requires-replay`.
