# clock-glyphs-text-presentation

## Objective
The clock's play/pause glyphs (`▶`/`⏸`) must render as the monochrome text glyph on every platform, not as a colourful emoji, so they keep respecting the button's `color` CSS and look consistent between phone and desktop.

## Problem
`▶` (U+25B6) and `⏸` (U+23F8) are both emoji-presentation-capable characters. Phones (iOS, Android) default to drawing the colour emoji glyph for them regardless of CSS `color`; desktop browsers default to the monochrome text glyph. The result observed by the user: the pause button looks dark on desktop (as styled) but white-with-amber-border on a phone (the platform's emoji artwork for "Pause Button").

## Decisions
- **First attempt (insufficient):** `U+FE0E` (text-presentation selector) appended to both characters, in `Scoreboard.svelte` and in the `es.ts` hint, with the two test literals updated to match. Shipped in PR #49 and merged (`8447df2`).
- **The selector did not hold on the user's device.** After the fix was served (verified by fetching the running server's JS and finding `U+FE0E` in it), the user's Android still drew the colour emoji on the pause button while desktop Chrome drew the monochrome glyph from the *same* served files. Conclusion: `U+23F8` is emoji-presentation by default, and `U+FE0E` is only a request — when the platform's text font has no glyph for the character it falls back to the colour emoji regardless. Retroactively: the PR #49 fix was correct in principle and inert in practice on Android.
- **Final approach (user-confirmed by doing it):** stop depending on the character at all. The button now renders inline `<svg>` icons **drawn by the app** — a triangle for play, two rounded rects for pause — with `fill="currentColor"`, so they inherit the button's `color: #0b1020` and no font stack, emoji set or platform default can override them.
- The `es.ts` hint no longer embeds a symbol: it is now "Pulsa el botón verde para empezar.", which is unambiguous when shown (the hint only appears in the `scheduled` phase, where the green start button is the only green control). Bonus: the reworded copy doubles as a **build marker** — if the judge still reads the old sentence, they are looking at a cached build, not at a rendering difference.
- An audit was run over the whole `packages/web/src` tree for characters above U+2000: only these two were emoji-capable. The em dash and ellipsis found are typographic punctuation and cannot be substituted by an emoji.

## Scope
- `packages/web/src/components/Scoreboard.svelte` (the button's icon span + its scoped size rule)
- `packages/web/src/i18n/es.ts` (`board.hint.start`)
- `packages/web/src/routes/ScoreboardScreen.test.ts` (the icon assertions, which replaced the character comparisons)

## Tasks
- [x] T1 Add `\uFE0E` after both glyphs in `Scoreboard.svelte` and in the `es.ts` hint string
- [x] T2 Update the two assertions in `ScoreboardScreen.test.ts` to the same literal with `\uFE0E`
- [x] T3 Verification: full web suite + typecheck + svelte-check (delegated)
- [x] T4 Native review (RDD) and delivery (commit, PR #49, merged) — six capture attempts were needed, the reviewer relay returned an incomplete payload five times
- [ ] T5 Replace both characters with app-drawn inline SVG icons (`fill="currentColor"`, `data-icon="play|pause"`) and reword the `es.ts` hint
- [ ] T6 Update the clock test to assert the icons; re-verify the whole tree carries no emoji-capable glyph
- [ ] T7 Verification, native review and delivery of the second attempt

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

**Second attempt (T5-T7), after the first one failed on the device:** the characters are gone; the button draws its own SVG. T5/T6 done directly. A code-point scan over `.svelte`/`.ts` returns zero hits for 0x25B6, 0x23F8, 0xFE0E and 0xFE0F, so nothing emoji-capable is left in the UI. The explanatory comment names the code points instead of drawing them, precisely so that audit stays clean. Independent verification is running before review and delivery.

The old caveat now applies twice over: the drawn icons still cannot be confirmed here, and — unlike a text change — the user must ensure the phone is running the new build before judging (the reworded hint is the marker).
