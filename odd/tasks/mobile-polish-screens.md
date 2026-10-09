# mobile-polish-screens

## Objective
Apply the admin screen's mobile pattern (PR #39) to the remaining screens of `packages/web`: cards and stacked full-width `.btn` actions inside `.actions`, consistent notices, safe-area gutters.

## Problem
Audit at ~360px found lone or inline buttons, bare links, a non-wrapping shell header, banners touching the screen edges and no safe-area padding. The judge scoring screen, CardsSheet, PisteCard/PisteDetail/PisteFace are already fine and stay untouched.

## Scope (authorized)
`packages/web/src/**` styling and markup only. No behavior, route, i18n key or API changes. Visible text stays identical.

## Tasks
- [x] T1 App shell header: flex-wrap row, `.admin` pushed right, safe-area gutters on `.shell` and `.spectator` (App.svelte, app.css, SpectatorScreen.svelte)
- [x] T2 UpdateBanner and ConnectionBar: side margin, `.notice` + `.actions` pattern (UpdateBanner.svelte, ConnectionBar.svelte)
- [x] T3 Entry flow lone buttons into `.actions`: PinStep, SetupStep, JudgeScreen offline retry, PisteListScreen refresh + board link as `.btn`
- [x] T4 Footer links as `.btn` in `.actions`: ScoreboardScreen, SpectatorScreen
- [x] T5 app.css input selector covers textarea and other text-like types

## Out of scope
Scoreboard `.row` button padding (audit item 9): needs a real render to judge, skipped.

## Acceptance
- `npx vitest run` in packages/web passes (327 tests), no test edits needed beyond selectors that legitimately changed.
- `npm run build -w packages/web` succeeds.

## Checks / test-first
Pure CSS/markup restructuring: no meaningful RED. Exception: functional check via existing component tests + build.

## Route
Delegated direct: one writer (5 tasks, 8+ files), trigger = writer rule (2+ non-trivial files).

## Progress
Branch `feat/mobile-polish-screens`. T1-T5 implemented (markup/CSS only). Verified: vitest run 327 passed, vite build OK, svelte-check run. Uncommitted, awaiting parent commit.
