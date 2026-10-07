# Feature: judge-pwa

## Objective
Offline-first PWA (`packages/web`, Svelte + Vite) that a judge uses on a phone to run a bout on one piste: enter the piste PIN, set up the bout, score touches, run the clock, give cards, undo, and sync with the server when the connection allows.

## Problem / why
Judges score on phones over unreliable mobile data. The scoreboard must never block on the network; the server (`packages/server`) is the source of truth and fans out to spectators. See Engram `la-sala-app/product-definition`.

## Scope
- Judge screens only: piste list + PIN, bout setup, live scoreboard. Spectator and organizer screens are OUT of scope (organizer pistes are created with `curl` meanwhile).
- UI language: Spanish (all copy in `src/i18n/es.ts`). Code, identifiers, comments and commits stay in English.
- Server change limited to serving the built PWA from the same origin (W6).

## Constraints
- Reuse `@la-sala/domain` on the client: optimistic local state = `replay` + `settle` over the local event log; never reimplement rules.
- The core (API client, clock offset, event log, sync queue) is plain TypeScript with injected ports (`fetch`, `now`, `newId`, storage); no Svelte inside it. Components stay thin.
- Clock skew: events carry `at`; the client estimates `serverTime - clientTime` from API responses and stamps events with corrected time. Document the estimator and its error bound.
- Event ids are client-generated and stable across retries (server dedupes by id). A batch is sent in order; on 422 the client resyncs from the server snapshot and tells the judge.
- Single device per piste is assumed (one writer). A server snapshot that disagrees with local state after sync wins; local history (undo) is dropped and the judge is told.
- No external CDN or fonts; everything is bundled so it works offline after the first load.
- Large tap targets (>= 48 px), high contrast, screen kept awake while a bout is running (Wake Lock when available).
- Priority draw is picked manually by the judge (physical coin toss), no randomness in the app.
- Artifacts in English except UI copy; conventional commits; no AI attribution. ~400 authored lines per task is a planning heuristic only.

## Tasks
- [x] W1 Scaffold `packages/web`: Vite + Svelte 5 + TS, Vitest (+ component testing), `vite-plugin-pwa` dependency, dev proxy to the server, `es.ts` copy module, minimal hash router, typecheck script
- [x] W2 Offline engine (pure TS): clock-offset estimator, event factory, persisted local event log with optimistic state (replay + settle), storage port with in-memory and localStorage adapters
- [x] W3 Sync + API client: typed API client (`x-piste-pin`, error mapping), batch sync queue with retry/backoff, 422 and snapshot resync, connection state
- [x] W4 Judge entry flow: piste list, PIN entry, bout setup form (weapon, 1/2/3 periods, names, optional touch limit)
- [ ] W5 Scoreboard screen: scores, clock, period/break/priority states, touch buttons, epee double touch, cards, priority pick, undo, pending/offline indicator, wake lock
- [ ] W6 PWA + hosting: manifest, icons, offline app shell, installability; the server serves `packages/web/dist` from the same origin when configured; README section (run, install on phone, iOS notes)

## Acceptance
- `npm test --workspaces` green, `npx tsc --noEmit` (and `svelte-check`) clean for `packages/web`; `npm run build -w packages/web` succeeds.
- RED observed before implementation per task (Vitest); core logic tested without a DOM; components tested for the main flows.
- Offline behavior proven by tests: events queue while the fake network is down, flush in order on reconnect, duplicates are not double-applied.
- NOT verified in this environment: real iPhone/Android behavior (install, wake lock, storage eviction). Manual checklist goes in the README.

## Delivery
- Branch `feat/web` from `main`. Strategy: stacked-to-main, one PR per task. LESSON from the first chain: set each PR base to `main` for the first and to the previous PR branch for the rest, and retarget to `main` BEFORE merging the parent (or enable "delete branch on merge"), otherwise children merge into parent branches.
- Forecast ~1800 authored lines. Route per task: delegated direct (one writer). RDD on: assess each work-unit commit with `--base-ref main --committed-only` and record the tier/outcome below.

## Progress / evidence
- Branch `feat/web` created from `main` (includes domain + server).
- Next step: delegate writer for W1-W6.
- W1 done (delegated writer). RED: router/i18n tests failed on missing modules; GREEN: web 13 tests. Verification: `npm test --workspaces` 89 domain + 124 server + 13 web pass; `npx tsc --noEmit -p packages/web` clean; `npm run check -w packages/web` 0 errors 0 warnings; `npm run build -w packages/web` ok. `@la-sala/domain` resolves via the workspace with no alias. jsdom 30 warns EBADENGINE on node 24.12 but works. Component tests opt in per file with `// @vitest-environment jsdom`. vite-plugin-pwa installed, configured in W6.
- W2 done. W1 commit: fefa4b9. RED: 4 core test files failed on missing modules; GREEN: web 41 tests (core tested without a DOM). Verification: `npm test --workspaces` 89 domain + 124 server + 41 web pass; `npx tsc --noEmit -p packages/web` clean; `npm run check -w packages/web` 0 errors; build ok. Core in `packages/web/src/core/`: `ClockOffset` (offset = serverTime - rtt midpoint, smallest-rtt sample kept, error bound = rtt/2, documented in the class), `EventFactory` (injected `newId`/`now`), `LocalBout` (log + optional server base snapshot + `syncedCount`; append validated through domain `replay`, undo via domain event, `resetTo(snapshot)` for server-wins), `KeyValueStorage` with `MemoryStorage` and guarded `LocalStorageAdapter`, keyed by `boutKey({pisteId, boutId})`. The boutId is client-chosen (the server has no bout id).
- W3 done. W2 commit: 4942d9a. RED: api-client, connection-store and sync-queue tests failed on missing modules; GREEN: web 70 tests. Verification: `npm test --workspaces` 89 domain + 124 server + 70 web pass; `npx tsc --noEmit -p packages/web` clean; `npm run check -w packages/web` 0 errors; build ok. `core/testing/fake-server.ts` speaks the server wire contract on top of the real domain `replay`. Offline proofs: events queue while down and flush in order on reconnect; a lost response is retried without double-applying; a 60 s skewed phone clock is corrected after the first response; 401/429 stop the queue and surface why; 422 resyncs from the snapshot (server wins, history dropped). Judge-flow note for W4/W5: wire the queue with `queue.kick()` after each `LocalBout.append`, `queue.retryNow()` on the browser `online` event, and `queue.resync()` when opening a piste.
- Parent verification (W1-W3): `npm test --workspaces` 89 + 124 + 70 passed; `tsc --noEmit -p packages/web` clean; `svelte-check` 0 errors; core has no `Date.now`/`Math.random`. Commits: W1 fefa4b9, W2 4942d9a, W3 f336abb (382 / 638 / 1049 authored lines, W3 mostly tests).
- Native review (medium, one reliability lens) on `main..f336abb`: granted by the user, APPROVED and acknowledged (lineage review-370620883931874b). Reviewed boundary is now f336abb; next assessments use `--base-ref f336abb --committed-only`.
- W4 done. W3 commit: f336abb. RED: entry-flow, pin-store, current-bout, setup-form tests failed on missing modules (observed); piste-list controller and the screen tests in `App.test.ts` were written test-first but no separate RED run was recorded (components and their tests landed together). GREEN: web 116 tests. Verification: `npm test --workspaces` 89 domain + 124 server + 116 web pass; `npx tsc --noEmit -p packages/web` and `-p packages/server` clean; `npm run check -w packages/web` 0 errors 0 warnings; build ok. Design: `EntryFlow` (controllers/, plain TS state machine with injected ports) drives PIN -> choose/setup -> ready. The server has no "check PIN" endpoint, so the PIN is verified with an empty event batch (`POST /events {events: []}`: 401 wrong, 429 locked, 409 correct without bout, 200 correct with bout); the PIN is remembered per piste in sessionStorage (guarded adapter) only after the server accepted it. A remembered PIN plus no network opens the local bout offline (or an "offline" screen when the device holds nothing). Resume uses this device's log only when it has unsynced events, otherwise it rebuilds from the server snapshot (so a stale local log can never be pushed into a bout another device started). `AppEnv` (src/env.ts) injects fetch/now/ids/timers/storage/online events; component tests use `testing/memory-env.ts` plus the core `FakeServer`. The `ready` step renders a placeholder until W5. Not verified: real-keypad behavior on phones (`inputmode="numeric"` on a password input).
