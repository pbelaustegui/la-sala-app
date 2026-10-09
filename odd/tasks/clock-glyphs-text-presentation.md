# clock-glyphs-text-presentation

## Objective
The clock's play/pause glyphs (`▶`/`⏸`) must render as the monochrome text glyph on every platform, not as a colourful emoji, so they keep respecting the button's `color` CSS and look consistent between phone and desktop.

## Problem
`▶` (U+25B6) and `⏸` (U+23F8) are both emoji-presentation-capable characters. Phones (iOS, Android) default to drawing the colour emoji glyph for them regardless of CSS `color`; desktop browsers default to the monochrome text glyph. The result observed by the user: the pause button looks dark on desktop (as styled) but white-with-amber-border on a phone (the platform's emoji artwork for "Pause Button").

## Decisions (user-confirmed)
- Fix with the Unicode text-presentation selector `U+FE0E` right after each glyph, in both places that show the characters: the clock button (`Scoreboard.svelte`) and the "Pulsa ▶ para empezar." hint (`es.ts`). User chose "fix both" over "button only".
- `ScoreboardScreen.test.ts` asserts the exact button text content; its two expectations must carry the same `\uFE0E` suffix so they keep testing the real rendered string instead of breaking on an unrelated character.

## Scope
- `packages/web/src/components/Scoreboard.svelte` (the button's `▶`/`⏸` span)
- `packages/web/src/i18n/es.ts` (`board.hint.start`)
- `packages/web/src/routes/ScoreboardScreen.test.ts` (the two literal-character assertions)

## Tasks
- [x] T1 Add `\uFE0E` after both glyphs in `Scoreboard.svelte` and in the `es.ts` hint string
- [x] T2 Update the two assertions in `ScoreboardScreen.test.ts` to the same literal with `\uFE0E`
- [x] T3 Verification: full web suite + typecheck + svelte-check (delegated)
- [ ] T4 Native review (RDD) and delivery (commit, PR)

## Out of scope
Any other emoji/symbol in the app; this fixes only the two characters the user reported.

## Acceptance
`npx vitest run` passes with the updated literals; `svelte-check`/`typecheck` clean. The fix cannot be verified visually in this environment (no browser, no phone) — the user's own eyes on the phone are the actual acceptance test.

## Checks / test-first
The two existing test assertions are the only automatable check and they must be updated in the same commit as the source change (not a separate RED, since this is a one-character Unicode addition with a deterministic, already-known expected string).

## Route
Delegated direct, one writer. Trigger: multi-file write rule (3 files).

## Progress
Created from a user-reported visual inconsistency (pause button white-with-amber-border on phone, dark on desktop), root-caused to emoji vs. text Unicode presentation.

T1/T2 done directly (byte-exact edits, 3 files, +4/-4): verified every `▶`/`⏸` in `packages/web/src` is now followed by `U+FE0E`, with zero bare occurrences left. T3 verified independently: `ScoreboardScreen.test.ts` 25/25, full web suite 373 passed, `svelte-check` 0/0, `typecheck` clean, `npm run build` succeeded.

Cannot be visually verified in this environment (no browser, no phone): the user's own eyes on the phone are the real acceptance test, pending after delivery.
