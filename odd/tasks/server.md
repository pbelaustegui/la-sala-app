# Feature: server

## Objective
Hono HTTP server (`packages/server`) that lets judges drive a bout per piste and lets spectators follow it live via SSE. It validates every judge event with `@la-sala/domain` (apply / settle / replay).

## Problem / why
Judges score on phones (offline-first, mobile data), the public cannot see them. The server is the single source of truth and fan-out point. See Engram `la-sala-app/product-definition` and `la-sala-app/server-pistes`.

## Scope
- Organizer creates N pistes from the app; server generates one PIN per piste. Organizer is identified by `ADMIN_PIN`, read at startup (server refuses to boot without it).
- Judge (piste PIN) starts a bout and posts events; idempotent, batched, in order (offline sync).
- Public read: piste list, current snapshot, SSE stream.
- Persistence behind a port: in-memory adapter (tests) and SQLite adapter (`node:sqlite`, no native dependency).
- OUT of scope: Svelte PWA, deployment, tournament management, spectator UI.

## Constraints
- Hexagonal: application/use cases depend on ports only; Hono and SQLite live in adapters. Domain package is not modified here (open a separate task if a change is needed).
- Randomness (PINs) and clocks (`now`) are injected ports; no direct `Date.now`/`crypto` calls in use cases.
- PIN checks are constant-time. PINs never appear in public responses. Admin PIN never logged.
- Input validated at the HTTP boundary (zod). Domain errors map to 422, auth to 401, unknown piste to 404.
- Artifacts in English; conventional commits; no AI attribution. ~400 authored lines per task is a planning heuristic only.

## HTTP API (target)
- `GET /health`
- `POST /admin/pistes` `{count}` header `x-admin-pin` -> replaces all pistes, returns `[{id, pin}]`
- `GET /admin/pistes` header `x-admin-pin` -> `[{id, pin}]`
- `GET /pistes` -> `[{id, status}]` (no PINs)
- `POST /pistes/:id/bout` header `x-piste-pin` `{weapon, options?, left, right}` -> starts a new bout (previous one archived)
- `POST /pistes/:id/events` header `x-piste-pin` `{events: [{id, ...BoutEvent}]}` -> applied in order, events whose `id` was already applied are skipped; returns snapshot or `{index, error}` with 422
- `GET /pistes/:id/state` -> snapshot `{serverTime, bout}` where bout is the domain state passed through `settle(state, now)`
- `GET /pistes/:id/stream` -> SSE: snapshot on connect, then one message per change, heartbeat comment every 15 s

## Tasks
- [x] S1 Scaffold `packages/server`, ports (`PisteRepository`, `PinGenerator`, `Clock`), in-memory adapter, `createApp(deps)`, `/health`, admin auth + create/list pistes
- [x] S2 Judge endpoints: start bout, idempotent batched events, state snapshot, public pistes list
- [x] S3 SSE stream with an in-process hub (publish on every applied change), heartbeat
- [x] S4 SQLite adapter with repository contract tests shared with in-memory; `main.ts` (env: ADMIN_PIN required, PORT, DB_PATH); short README section on running it

## Acceptance
- `npm test --workspaces` green, `npx tsc --noEmit -p packages/server` clean.
- RED observed before implementation per task; HTTP tested through `app.request()` (no real sockets) except one SSE test.
- Repository contract tests run against both adapters.

## Delivery
- Branch `feat/server` stacked on `feat/bout-domain` (strategy: stacked-to-main, chosen by user). Forecast ~1000 authored lines.
- Route per task: delegated direct (one writer; Writer trigger).
- RDD: on (global). Assess each work-unit commit with `--base-ref feat/bout-domain --committed-only`.

## Progress / evidence
- Branch `feat/server` created from `feat/bout-domain`.
- S1 done. RED: vitest failed on missing modules (3 files, no tests). GREEN: `npm test --workspaces` domain 89 + server 22 tests pass; `npx tsc --noEmit -p packages/server` clean. Route: delegated direct (writer). Commit: 32df62e. RDD assessment: see range assessment below.
- S2 done. RED: 41 failing tests + 1 failing file (missing keyed-queue, ports unimplemented). GREEN: server 69 tests pass (memory contract incl. bout contract, KeyedQueue, judge endpoints); tsc clean. Design notes: per-piste KeyedQueue serializes read-modify-write; batch validated via domain `replay` before persisting (atomic); 422 index is relative to the submitted batch; snapshot adds `fencers` (names) beside `{serverTime, bout}`; `bout` is null before a bout starts; no bout -> 409; unknown piste -> 404 before PIN check. Commit: b91702c.
- S3 done. RED: stream.test.ts and in-process-hub.test.ts failed on missing modules. GREEN: server 81 tests pass (stable over 3 runs), domain 89; tsc clean. Design notes: `ChangeHub` port (+ `Snapshot` moved to ports) with `InProcessHub`; subscribe-before-snapshot on connect; publish only on started bout, applied (non-skipped) batch and pistes reset (null-bout snapshot); heartbeat is an SSE comment `: heartbeat` every `heartbeatMs` (default 15000); one real-socket test via @hono/node-server `serve({port:0})`. Commit: dbb4de8.
- S4 done. RED: 4 test files failed on missing modules (sqlite repo, config, system adapters, compose). GREEN: `npm test --workspaces` domain 89 + server 108 tests pass; `npx tsc --noEmit -p packages/server` clean. Contract tests run on memory and sqlite (`:memory:`; reopen test uses a temp file removed afterwards). Manual: `npm start` without ADMIN_PIN exits 1 with a clear message; with ADMIN_PIN, /health and POST /admin/pistes answer over a real port. `node:sqlite` works on Node 24.12 without flags but prints an ExperimentalWarning. README.md added at the repo root. Commit: 70d9694.
- Next step: parent RDD assessment of the work-unit commits (`--base-ref feat/bout-domain --committed-only`), then PR decisions. Note: `.gitignore` does not cover `*.sqlite` (default DB file is created in the cwd of `npm start -w`).
- Parent verification: `npm test --workspaces` domain 89 + server 108 passed; `tsc --noEmit -p packages/server` clean; application layer free of hono/node:sqlite/crypto imports. Writer's earlier 'domain 67' was a miscount.
- `.gitignore` now covers `*.sqlite*`.
- Review correction R1 (CRITICAL, risk): judge/admin PIN guesses were unthrottled. Added `AttemptLimiter` port, `MemoryAttemptLimiter` (5 consecutive failures -> 429 + `Retry-After`; 30 s doubling to 15 min; correct PIN also 429 while locked; success resets only when not locked), keys `piste:<id>` and `admin`, wired in `createApp` (defaults to memory limiter on the injected clock) and `compose.ts`. README documents behavior and the DoS tradeoff. RED: limiter test file failed on missing module and 5 new HTTP throttling tests failed. GREEN: domain 89 + server 123 pass; `tsc --noEmit -p packages/server` clean.
- Review correction R4-001 (CRITICAL, resilience): the global admin lockout let any client lock the organizer out of /admin. Per user decision: removed the admin limiter (`requireAdmin(adminPin)` is constant-time, never 429), `loadConfig` rejects ADMIN_PIN shorter than 12 trimmed chars (message does not echo it), README documents the admin PIN policy and throttling now covers piste PINs only. Judge lockout unchanged. RED: config 12-char test and admin never-locked test failed. GREEN: domain 89 + server 124 pass; `tsc --noEmit -p packages/server` clean.
- Review (native, high risk, 4 lenses): R1 piste PIN brute force -> fixed in a29eb2a; successor lineage found R4-001 (admin lockout DoS) -> fixed in cb6cc9f (no admin lockout, ADMIN_PIN >= 12 chars). Targeted validator ESCALATED: original criteria passed, but unthrottled admin PIN guessing counts as a regression. User decision: accept and document the residual risk (README). No review approval receipt exists for this range; delivery follows ordinary repository policy. 11 non-blocking warnings/suggestions from the first pass remain open follow-ups.
