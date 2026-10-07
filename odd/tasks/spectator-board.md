# Feature: spectator-board

## Objective
Public, read-only live board in the web app: one card per piste (fencers, score, clock, period/phase), updating in real time, tap a card for a large detail view. Same page works on a spectator's phone and on a TV (responsive grid).

## Problem / why
This is the original problem: spectators cannot see the judge's phone. Mobile data only, so the board must be light: ONE connection for all pistes, small messages, no polling. See Engram `la-sala-app/product-definition`.

## Scope
- Server: one SSE endpoint for all pistes.
- Web core: spectator store (stream port, reconnect, clock offset, derived view model).
- Web UI: board at `#/`, detail at `#/piste/:id`; the judge flow moves to `#/judge` and `#/judge/:pisteId`; PWA `start_url` becomes the judge entry. UI in Spanish.
- OUT of scope: organizer screen, authentication for spectators (none), history/results, push notifications.

## Constraints
- Reuse `@la-sala/domain` on the client: the displayed state is `settle(snapshot.bout, serverNow)`; never reimplement rules or clock logic.
- Clock: `serverNow = clientNow + (snapshot.serverTime - clientNow at receipt)`; a running clock is rendered from timestamps with a UI-only tick; the stream does not send clock ticks. Document the error bound (one-way latency).
- One `EventSource`-like connection through an injected port (testable without sockets); automatic reconnect with backoff; on reconnect the server resends a snapshot per piste. While disconnected show the last known state marked as stale plus a "sin conexión" banner.
- Endpoint path must stay under an already API-reserved prefix so static hosting never shadows it: `GET /pistes/stream` (no PIN, read-only). Existing `GET /pistes/:id/stream` keeps working.
- Service worker never caches API/stream; no external CDN or fonts; high contrast, large numerals, readable from a distance; no hover-only interactions.
- Judge routes move, behavior unchanged: update router, links, tests, README and the PWA manifest `start_url`.
- Artifacts in English except UI copy (Spanish, `src/i18n/es.ts`); conventional commits; no AI attribution. ~400 authored lines per task is a planning heuristic only.

## Tasks
- [x] V1 Server: `GET /pistes/stream` (one SSE for all pistes): initial snapshot per piste, then a message per change, heartbeat; hub gets an all-pistes subscription; tests
- [x] V2 Web core: spectator store over an injected stream port, reconnect/backoff, stale state, per-message clock offset, view model via domain `settle`; no UI
- [x] V3 Web UI: board and detail screens, route changes (judge to `#/judge`), manifest `start_url`, i18n, README
- [x] V4 Connection watchdog: the board stream sends a real `ping` event instead of only a comment heartbeat; the store treats 45 s without any message as a dead connection (stale + reconnect); tests with fake timers

## Acceptance
- `npm test --workspaces` green; `tsc --noEmit` for server and web, `svelte-check` and `npm run build -w packages/web` clean.
- RED observed before implementation per task; stream behavior tested with a fake port; one real-socket SSE test for the new endpoint.
- NOT verified here: real phones/TV, real mobile-data cost. Message size is measured and reported.

## Delivery
- Branch `feat/spectator` from `main`. Stacked-to-main, one PR per task. LESSON (twice): children merged into parent branches. Plan: open PR 1 only; open each next PR (targeting `main`) after the previous is merged, or ask the user to enable delete-branch-on-merge.
- Forecast ~1200 authored lines. Route per task: delegated direct (one writer). RDD on: assess each work-unit commit with `--base-ref main --committed-only`; keep review candidates small (a candidate above ~4k lines exceeds the reviewers' context budget).

## Progress / evidence
- Branch `feat/spectator` created from `main` (835b989).
- V1 done (route: delegated, writer). `GET /pistes/stream` wire format: `event: pistes` `{pisteIds}` (authoritative set, first on connect and after `POST /admin/pistes`; subscribers drop other ids) and `event: snapshot` `{pisteId, snapshot:{serverTime,bout,fencers}}` (per piste on connect, then per change); heartbeat comment every 15 s. Hub: `subscribeAll`/`publishPistes`. RED: 10 failing tests before code; GREEN after. Observed: server 156 tests, web 200, domain 89 pass; tsc server/web and svelte-check clean. Message size for a sabre bout in progress (1 touch): 504 bytes per snapshot frame (rules block is ~45% of it; could be trimmed later if needed). Commit hash: 67bb03f.
- V2 done (delegated, same writer). Added `core/spectator-store.ts` (store + `BoardStreamPort`), `core/piste-view.ts` (`toPisteView`), `core/board-event-source.ts` (EventSource adapter, tested through a fake). Offset is per message (`serverTime - receivedAt`), error bound = one-way latency (documented in code); stale entries are frozen at their snapshot's server time and never `running`; backoff `min(30s, 1s*2^n)` x jitter [0.5,1], reset when data arrives. RED: both new test files failed on missing modules; GREEN: web 222 tests pass (23 -> 27 files), tsc server/web and svelte-check clean. Commit hash: see next note.
- V2 commit hash: c38f572.
- Parent verification (V1-V2): `npm test --workspaces` 89 + 156 + 222 passed; `tsc --noEmit` server and web clean; `svelte-check` 0 errors; spectator core has no `Date.now`/`Math.random`. Authored lines: V1 359, V2 619.
- Native review (medium, one reliability lens) on `main..c38f572` (972 lines): granted by the user, APPROVED and acknowledged (lineage review-c3aaaca3f6f88061). Reviewed boundary is now c38f572; later assessments use `--base-ref c38f572 --committed-only`.
- Gap found at verification: a silently dead connection is not detected because browsers do not expose SSE comment heartbeats. Added V4 (ping event + client watchdog).
- V3 done (delegated, same writer). Routes: `#/` board, `#/piste/:id` detail, `#/judge` list, `#/judge/:pisteId`; router names `board|piste|judge-list|judge`. `AppEnv.boardStream` (real `EventSourceBoardStream` only in `createBrowserEnv`; `FakeBoardStream` in memory env). `SpectatorScreen` owns store start/stop (mount/unmount, one instance across board and detail) and a 250 ms UI tick via `env.timers`, paused on `visibilitychange`. Shared markup `PisteFace` for card and detail (`--numeral` clamp sizes). Manifest `start_url` is `/#/judge`, scope `/`. RED: router tests 5 failed, SpectatorScreen tests 14/15 failed before code, pwa start_url test failed; GREEN: web 246 tests, server 156, domain 89; tsc server/web and svelte-check clean; `npm run build -w packages/web` ok. Exception: CSS (responsive grid, numeral sizes, contrast) has no RED; checked structurally only (grid declaration present, tap targets >= 48 px from global `a`/`button` min sizes), not visually. Known gap: between the `pistes` message and the first snapshots the board may flash the empty state for one frame.
- V3 commit hash: 7589edd.
- V4 done (delegated, same writer). Server: `GET /pistes/stream` sends `event: ping` `{serverTime}` (from the injected clock) every `heartbeatMs`; the per-piste stream keeps its comment heartbeat. Web: `BoardMessage` gains `ping`; `SpectatorStore` watchdog (`WATCHDOG_MS` 45 s, injectable `watchdogMs`) armed on every connection attempt and message, cancelled on drop/stop, drives the same `drop()` path as an error; a ping refreshes `offsetMs` of non-stale entries only (snapshots and `receivedAt` untouched); `EventSourceBoardStream` subscribes to `ping`. RED: 2 server tests and 9 web tests failed before code; GREEN: see Verification below. Commit hashes: server and web, see git log (`feat(server)` then `feat(web)`).
- Next step: user decides on pushing and PRs (stacked-to-main, one per task: V1, V2, V3, V4 plus the V4 server commit).
- Parent verification (V3-V4): `npm test --workspaces` 89 + 157 + 257 passed; `tsc --noEmit` server and web clean; `svelte-check` 0 errors; `npm run build -w packages/web` ok (20 precache entries). Commits: V3 7589edd (939 authored lines), V4 server 324f9df (30), V4 web 3acea5f (223).
- Native review (medium, one reliability lens) on `c38f572..3acea5f` (1179 lines): granted by the user, APPROVED and acknowledged (lineage review-8beb6949f3eaa0a4). Whole feature (V1-V4) is now natively reviewed in two approved candidates.
- Known gaps: the board can flash the empty state for one frame between the `pistes` message and the first snapshots; CSS (grid, numerals, contrast) was only checked structurally, never rendered; not verified on real phones/TV (layout, tap comfort, real EventSource reconnect, a real silent network drop against the 45 s watchdog, battery and data cost of the 250 ms tick, installed PWA opening at `/#/judge`).
