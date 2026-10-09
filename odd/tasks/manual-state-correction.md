# manual-state-correction

## Objective
Let a judge correct a bout manually: reset the clock, reset the scores, or set arbitrary values (scores, remaining time, period) to rebuild a state after a mistake or a lost device. This includes reopening a bout that already finished.

## Problem
The bout is an event-sourced log replayed by the domain (`packages/domain/src/replay.ts`). There is only `undo`, which pops history and cannot set arbitrary values, and `apply()` rejects every event once the phase is `finished` (`apply.ts:87`).

## Decisions (user-confirmed unless noted)
- One new event `state-set` with a partial patch: `score` (left/right), `remainingMs`, `period`. "Reset clock" = set `remainingMs` to the period duration; "reset scores" = 0-0.
- It is a normal log event: idempotent by id, append-only, undoable through the existing history stack, validated by the same `replay` on client, server and FakeServer.
- It also works on a finished bout (reopens it). User confirmed: "también reabrirlo".
- After it applies, the clock is stopped. Cards, priority and the tiebreak are untouched. If the resulting score/clock is terminal under the existing rules (touch limit reached while ahead, time expired), the existing settle/afterScoreChange logic finishes the bout again; this is documented and tested, not a special case. (Assumption, not asked: keep unless it proves wrong.)
- Validation: scores are non-negative integers, `remainingMs` is an integer within the phase duration, `period` is within the rules, `at` is monotonic (>= lastAt) as for every event.
- The server zod union in `packages/server/src/adapters/http/schemas.ts` is hand-copied from the domain union and MUST get the new variant, or the server answers 400 and the sync queue stops in needs-attention.

## Scope
- Unit A (domain + server): `packages/domain/src/**`, `packages/server/src/adapters/http/schemas.ts`, server tests, README API/events docs.
- Unit B (web): event factory/controller method, correction sheet in the scoreboard (numeric inputs, reset buttons, confirmation), `es.ts` keys, tests.

## Tasks
- [x] A1 Domain: `state-set` event type, apply/replay semantics (incl. finished bypass), validation errors, domain tests written first
- [x] A2 Server: zod variant + toStoredEvents, http tests (accepts/rejects, finished bout), README events/API/sync docs
- [x] B1 Web: `ScoreboardController.setState` via EventFactory, undo of a correction, tests
- [x] B2 Web: correction sheet UI (reset clock, reset scores, set values, reopen), i18n keys, component/route tests
- [x] B3a README feature mention
- [ ] B3b Manual check by the user on a phone

## Out of scope
Audit marker or reason shown to spectators, editing cards/priority directly, correcting archived bouts.

## Acceptance
`npx vitest run` passes in packages/domain, packages/server and packages/web; `npm run check` in packages/web clean; build OK.

## Checks / test-first
Domain and server behavior: RED first with deterministic tests. UI: component/route tests first where a runnable test exists.

## Route
Delegated direct, one writer per work unit (A then B), sequential. Trigger: writer rule (2+ non-trivial files per unit).

## Progress
Branch `feat/manual-state-correction`. A1 and A2 done (uncommitted, parent commits). Domain RED observed (42 failing) before implementing; server tests were added together with the zod variant (no separate RED). Verified: domain 134 tests + typecheck, server 171 tests + typecheck, web vitest + `npm run check`.

## Decisions made by the writer
- `state-set` fields are flat on the event (`score?`, `remainingMs?`, `period?`), implemented in `packages/domain/src/state-set.ts`; `apply` bypasses the `bout-finished` guard only for this event.
- `state-set-needs-time` applies whenever `remainingMs` is omitted and the settled clock is 0 (finished by time, break, priority draw), not only when finished; scheduled keeps the full period time.
- Terminal checks after the patch: touch limit while strictly ahead (new exported `finishedByTouchLimit`, shared with `afterScoreChange`), then an empty clock goes through `onClockExpired` (now exported). The sabre mid-bout break is NOT triggered by a correction, so it always lands in fencing.
- Current period when omitted: fencing/break use their period, scheduled uses 1, finished/priority-draw use `rules.periods`, extra-period stays in extra-period. Omitted `remainingMs` is clamped to the target maximum (relevant only when leaving the extra period).
- Validation order: empty, score, period, remainingMs. Errors: `state-set-empty`, `state-set-invalid-score`, `state-set-invalid-remaining {maxMs}`, `state-set-invalid-period {periods}`, `state-set-needs-time`.
- zod schema checks integers and non-negatives (400); period upper bound, remainingMs upper bound and the empty patch stay with the domain (422).
- B1/B2 (web): `ScoreboardController.setState(patch)` returns whether the domain accepted it; the model gains `errorParams` (`maxMs`, `periods` of the last refusal) and the view gains `correction` (period, periods, remaining time, durations) so the form can prefill and bound itself. Tests were written together with the implementation (no separate RED run for the web part).
- The correction sheet (`CorrectionSheet.svelte`) opens from a "Corregir marcador y reloj" button at the bottom of the scoreboard (below the row of actions, away from the scoring halves, enabled in every phase, also when finished). Inputs are `type="text" inputmode="numeric"` so an empty or invalid entry reaches the domain (as NaN) and gets its specific error instead of being silently dropped. Only changed groups (score, clock, period) are sent; an empty change shows "No has cambiado nada" and sends nothing.
- Quick actions ("Reiniciar reloj", "Marcador a 0-0") fill the form and go straight to the confirmation step. A refused correction returns to the form with a specific `.error` role="alert"; the generic `board.error` alert is hidden for `state-set-*` errors so they do not show twice. Period field only appears when the rules have more than one period; in the extra period an unchanged period keeps it, and "Reiniciar reloj" uses the extra-period duration.
- Prefill after a break/priority draw/time-out is 0:00, so a score-only correction there gets `state-set-needs-time` and the judge must give the time.
- B0: added domain tests for state-set from the extra period (expiry gives a priority win) and from the priority draw (needs time; works when given); no bug found in `state-set.ts`.
