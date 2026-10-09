# correction-sheet-ux

## Objective
The correction sheet must never offer a confirmation for a change it cannot express, and a quick reset that changes nothing must say what already holds instead of "No has cambiado nada."

## Problem
Two non-blocking notes from the native review of PR #41 (`state-set`):
- `CorrectionSheet.svelte:63` builds the confirmation text as `` `${fields.minutes.trim()}:${fields.seconds...}` ``. With the minutes field emptied, the preview says "Se va a cambiar el reloj a :07" and only after confirming does the domain refuse with `state-set-invalid-remaining`. The preview promises something inapplicable.
- `resetClock()` / `resetScores()` call `review()`; when the state already matches, `buildPatch()` is empty, so the sheet answers with the generic "No has cambiado nada." although the judge did tap an action.

## Decisions (user-confirmed unless noted)
- Approach: **block before confirming** (user choice). When a changed group has a blank or non-numeric field, "Revisar cambios" keeps the form and shows the specific message the domain would give, instead of moving to the confirmation step. The user's chosen preview for the empty-minutes case is exactly "El tiempo debe estar entre 0:00 y 3:00.", i.e. the existing `board.correct.error.remaining` copy with `max = formatClock(fullDurationMs)`.
- Boundary (assumption, not asked): the client blocks only what it cannot even express — a blank or non-numeric field, tested with `/^\d+$/` on the trimmed value. Range violations that are still expressible (`9:99`, a period outside `1..periods`) reach the domain exactly as today, because the domain stays the single authority on ranges; the pre-check is not a second copy of the rules. Correction found by the writer: a negative entry such as `-1` is NOT expressible under `/^\d+$/`, so it is blocked client-side with the same copy the domain would have shown — the first draft of this document listed `-1` on the domain side.
- A quick reset that changes nothing shows a specific message instead of "No has cambiado nada.": `board.correct.clockCurrent` = "El reloj ya está en {time}." (the user's wording) and `board.correct.scoreCurrent` = "El marcador ya está {score}." (copy proposed here).
- Pressing "Revisar cambios" with nothing changed keeps "No has cambiado nada.". The message is informational (`hint`), the blocked one is an error (`role="alert"`), and a blocked message must never linger after the form becomes valid again.

## Scope
- `packages/web/src/components/CorrectionSheet.svelte`
- `packages/web/src/components/CorrectionSheet.test.ts`
- `packages/web/src/i18n/es.ts`

No domain or server change: `state-set` keeps rejecting bad input, the sheet just stops walking into that refusal. No README change: the README describes the confirmation step, which stays true.

## Tasks
- [x] T1 RED: `CorrectionSheet.test.ts` covers the blocked cases (blank minutes, blank seconds, blank period, non-numeric score) and the two quick-reset messages; run it and observe the failures
- [x] T2 GREEN: `CorrectionSheet.svelte` pre-check + notices, `es.ts` keys, until the suite passes
- [x] T3 Verification: full web suite, `svelte-check`, `typecheck` (delegated to `gentle-ai-verify`)
- [x] T4 Native review (RDD) and delivery (commit, PR)

## Out of scope
Copy of the domain range errors, any change to `state-set` validation, spectator-visible text, the confirmation step wording.

## Acceptance
`npx vitest run` in `packages/web` passes; `npm run check` and `npm run typecheck` clean. A valid change still reaches the confirmation step and still posts only the changed groups. No blank-field path can reach the confirmation step.

## Checks / test-first
Runnable deterministic component tests exist → tests first, RED observed before the implementation.

## Route
One writer (`gentle-ai-worker`), one work unit: tests, component and copy together. Trigger: multi-file write rule (3 files).

## Progress
Feature doc created from the PR #41 review notes.

T1/T2 done by `gentle-ai-worker` (one work unit, 3 files, +115/-3), uncommitted, parent commits. RED first: `npx vitest run src/components/CorrectionSheet.test.ts` → 7 failed | 15 passed, exactly the seven new tests. GREEN: 22 passed. Writer also ran the full web suite (371 passed), `npm run check` (0 errors / 0 warnings) and `npm run typecheck` (clean) — T3 re-runs all of that independently.

Implementation notes: `blockedField()` checks score → period → clock (the domain's order) with `/^\d+$/` only; `review()` clears `blocked` on both other paths and sets it with `notice = 'none'`, so the blocked alert takes precedence over the domain refusal and can never render in the confirm step (it is only in the form branch). The quick resets clear `attempted` and `blocked` before showing their hint, so a stale refusal does not linger. One pre-existing test changed: the `it.each` refusal-path test now types `4` instead of `x`, because `x` is blocked client-side by the new pre-check; the test still proves the domain-refusal alert path (the input passes the pre-check and the stubbed domain refuses).

T3 done: two independent verification rounds by `gentle-ai-verify` (second one on the final bytes, after the test input below changed).Both: focused 22 passed, full web suite 371 passed, `svelte-check` 0 errors / 0 warnings, `typecheck` clean, only the three files modified. The first round also ran six throwaway adversarial probes (throwaway files deleted, `git status` re-checked): blank minutes together with a valid score change does not reach the confirm step and submits nothing; the blocked alert displaces a domain `error` prop; the alert clears after fixing the field; `9:99` is still sent to the domain instead of being swallowed; `' 3 '` counts as a change; a stale quick-reset hint is gone once the confirmation is reached. Verifier found the test `blocks the review while a score is not a number` typed `''`; fixed to type `x`, and it re-verified the final bytes afterwards. Known weak assertion left on purpose: `expect(onsubmit).not.toHaveBeenCalled()` in the blocked tests cannot fail in that click sequence, but it keeps the `queryByRole(...) === null` proxy from going vacuous if the apply button is ever renamed. Honest gap: RED was observed by the writer only; the verifier did not reproduce it because reverting the files was out of its read-only scope.

Work unit commit: `ded6e8e fix(web): refuse an unexpressible correction before the confirmation` (3 files, +115/-3). Native review approved it: lineage `review-9d44ba0e507fe400`, target `sha256:eeb473796edcad96b9a625e9133a0e7e7bad3b177ec53a4aa89eb717188e04de`, tier medium, lens `review-reliability`, 118 changed lines, correction budget 59 untouched, no findings, authority burned. The feature doc was deliberately left OUT of the review candidate (`--untracked-scope=exclude`): it keeps changing after the review (this very line), so including it would guarantee a candidate that no longer matches what is delivered. Consequence: `assess` over the uncommitted change returned `risk: "unassessable"` because native refuses an undeclared untracked file — treated exactly like high risk (writer self-verification + independent verifier), both already satisfied; it is re-run over the committed range for a real reading.

Delivery: branch `fix/correction-sheet-feedback`, commits `ded6e8e` (the work unit) and `3d4da4c` (this doc), PR #43 against `main`. `assess` over the committed range reads risk medium, 4 paths / 169 lines, `reviewDue: false` (`under_budget`), plan = writer self-verification with no separate verifier required (the two independent rounds already exceed that). Manual check done: the user tested the new copy on a phone and reported it working, so PR #43 is ready to merge.
