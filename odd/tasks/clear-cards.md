# clear-cards

## Objective
Let a judge clear the cards of both fencers from the correction sheet, next to "reset clock" and "reset scores".

## Problem
`state-set` deliberately leaves cards untouched (`packages/domain/src/state-set.ts`), so a card given by mistake can only be undone as the last event.

## Decisions (user-confirmed)
- One extra quick button "Clear cards" that removes the cards of BOTH fencers (no per-card or per-fencer removal).
- Implemented by extending the `state-set` patch with a `clearCards?: true` field (clear only; the final shape chosen by the writer), so it stays a normal log event: undoable, idempotent, replayed identically on client, server and FakeServer.
- The server zod variant in `packages/server/src/adapters/http/schemas.ts` must accept the new field or the sync queue stops.

## Scope
- Domain + server: `packages/domain/src/state-set.ts`, `apply.ts`, tests, `schemas.ts`, server tests, README events docs.
- Web: event factory / controller `setState`, `CorrectionSheet.svelte`, `es.ts`, tests.

## Tasks
- [x] A1 Domain + server: `cards` in the state-set patch, tests first, schema, README
- [x] B1 Web: "Clear cards" quick button, i18n, tests

## Route
Delegated direct: one writer (2+ non-trivial files across domain, server, web).

## Out of scope
Removing a single card, per-fencer clearing, a total reset button.

## Decisions made by the writer
- Patch field is `clearCards?: true` (flat, like the other fields); the server zod uses `z.literal(true).optional()`, so `false` or other values answer 400. It counts as a field for `state-set-empty`.
- Derived effects: `scoring.ts giveCard` consequences are applied once, when the card is given (red adds a touch to the opponent, black finishes the bout); nothing recomputes from `cards` afterwards (the only readers are the views). So clearing cards does not need to touch anything else. A red card's touch is NOT reverted (the judge fixes the score separately with `score`); documented in the domain doc comment, README and a test. A black-card exclusion is reopened like any other state-set on a finished bout (fencing, stopped clock, period = last regular one).
- UI: "Quitar tarjetas" quick button next to the other two; it goes straight to the confirmation ("Se va a cambiar quitar las tarjetas de los dos tiradores."). The pending flag is dropped on Back, on a blocked form and on a refused correction.
- The button is always enabled (the sheet does not know the card list); clearing with no cards is a harmless no-op event.

## Verification evidence
- RED (before implementation): domain 5 failed / 137 passed, server 3 failed, web 3 failed.
- GREEN: `npx vitest run` in packages/domain (142), packages/server (174), packages/web (376) all pass; `npm run typecheck` clean in all three; `npm run check` in packages/web: 0 errors, 0 warnings. No lint script exists.
