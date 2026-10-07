# Feature: admin-copy-share

## Objective
On the organizer screen (`#/admin`): copy each piste PIN to the clipboard, and copy the spectator board link.

## Problem / why
The organizer has to hand out PINs and the spectator link by hand; retyping a PIN or the URL (often a tunnel URL) is error-prone. Follow-up idea from the admin-view feature.

## Scope
- Copy button per piste PIN.
- "Copy spectator link" button: the link is the app origin plus `/#/` (the public board), built from the current location so it works behind a tunnel.
- Clipboard access through an injected port in `env.ts` (testable, degrades silently when unavailable); visible "copied" / "could not copy" feedback; Spanish copy.
- OUT of scope: per-piste judge links, Web Share API, QR codes, server changes.

## Constraints
- Same layering as admin-view: DOM-free logic and ports outside Svelte, presentational component, copy in `i18n/es.ts`.
- `navigator.clipboard` is only available in secure contexts (HTTPS or localhost); when it fails, say so instead of pretending it worked. PINs are never logged.
- Artifacts in English except UI copy (Spanish); conventional commits; no AI attribution. ~400 authored lines per task is a planning heuristic only.

## Tasks
- [x] C1 Clipboard port in `env.ts` (+ memory env fake) and spectator link builder; tests
- [x] C2 UI: copy PIN buttons and copy-spectator-link button on the admin screen with feedback, i18n, tests, README line

## Delivery
Forecast ~150 authored lines; single PR. Branch: `feat/admin-copy-share`.

## Acceptance
- Clicking copy on a piste writes that PIN to the clipboard and shows confirmation; a failing clipboard shows an error message.
- The spectator link button copies `<origin>/#/`.
- `npm test -w packages/web`, `npx tsc --noEmit -p packages/web`, `npm run check -w packages/web`, `npm run build -w packages/web` pass.

## Progress
- Branch created, plan written.
- C1 done: `ClipboardPort` + `origin` in `AppEnv`, `FakeClipboard`, `spectatorLink`; RED (missing module) then 2 tests green.
- C2 done: copy buttons + status feedback on the admin screen; RED (3 new AdminScreen tests failing) then green.

## Next step
Open the PR.
