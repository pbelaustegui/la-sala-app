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
- [ ] W2 Offline engine (pure TS): clock-offset estimator, event factory, persisted local event log with optimistic state (replay + settle), storage port with in-memory and localStorage adapters
- [ ] W3 Sync + API client: typed API client (`x-piste-pin`, error mapping), batch sync queue with retry/backoff, 422 and snapshot resync, connection state
- [ ] W4 Judge entry flow: piste list, PIN entry, bout setup form (weapon, 1/2/3 periods, names, optional touch limit)
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
