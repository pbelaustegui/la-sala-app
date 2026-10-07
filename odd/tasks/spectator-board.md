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
- [ ] V2 Web core: spectator store over an injected stream port, reconnect/backoff, stale state, per-message clock offset, view model via domain `settle`; no UI
- [ ] V3 Web UI: board and detail screens, route changes (judge to `#/judge`), manifest `start_url`, i18n, README

## Acceptance
- `npm test --workspaces` green; `tsc --noEmit` for server and web, `svelte-check` and `npm run build -w packages/web` clean.
- RED observed before implementation per task; stream behavior tested with a fake port; one real-socket SSE test for the new endpoint.
- NOT verified here: real phones/TV, real mobile-data cost. Message size is measured and reported.

## Delivery
- Branch `feat/spectator` from `main`. Stacked-to-main, one PR per task. LESSON (twice): children merged into parent branches. Plan: open PR 1 only; open each next PR (targeting `main`) after the previous is merged, or ask the user to enable delete-branch-on-merge.
- Forecast ~1200 authored lines. Route per task: delegated direct (one writer). RDD on: assess each work-unit commit with `--base-ref main --committed-only`; keep review candidates small (a candidate above ~4k lines exceeds the reviewers' context budget).

## Progress / evidence
- Branch `feat/spectator` created from `main` (835b989).
- V1 done (route: delegated, writer). `GET /pistes/stream` wire format: `event: pistes` `{pisteIds}` (authoritative set, first on connect and after `POST /admin/pistes`; subscribers drop other ids) and `event: snapshot` `{pisteId, snapshot:{serverTime,bout,fencers}}` (per piste on connect, then per change); heartbeat comment every 15 s. Hub: `subscribeAll`/`publishPistes`. RED: 10 failing tests before code; GREEN after. Observed: server 156 tests, web 200, domain 89 pass; tsc server/web and svelte-check clean. Message size for a sabre bout in progress (1 touch): 504 bytes per snapshot frame (rules block is ~45% of it; could be trimmed later if needed). Commit hash: see next note.
- Next step: V2 (web core), then V3.
