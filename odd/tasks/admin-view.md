# Feature: admin-view

## Objective
Organizer screen in the web app: enter the admin PIN, see the pistes with their PINs, and create or replace the pistes by choosing a count.

## Problem / why
The server already exposes `GET /admin/pistes` and `POST /admin/pistes {count}` (header `x-admin-pin`), but the only way to use them is curl. The organizer needs to set up a tournament from a phone or laptop.

## Scope
- Web: `#/admin` route, `AdminScreen`, an admin controller, `ApiClient` admin methods, Spanish copy, README route table.
- OUT of scope: live bouts overview, spectator link sharing, server changes, renaming "piste".

## Constraints
- Hash route `#/admin`: a path `/admin` is an API prefix (`static-web.ts`, `vite.config.ts`, `pwa.config.ts`) and would never get the SPA shell.
- Follow existing layering: `core/api-client.ts` (never throws, `ApiResult`), `controllers/` (DOM-free `Observable` state machine with injected ports), `routes/` container screen, `components/` presentational, copy in `i18n/es.ts`.
- Admin PIN is kept in `sessionStorage` only (cleared when the tab closes), never in localStorage, never logged or rendered after entry. A 401 forgets it.
- `POST` replaces everything (pins, current and archived bouts) and resets the live board: the UI must ask for confirmation before calling it. `count` is an integer 1-100.
- Admin is not throttled server-side, so no 429 handling is needed beyond the generic mapping.
- Artifacts in English except UI copy (Spanish); conventional commits; no AI attribution. ~400 authored lines per task is a planning heuristic only.

## Tasks
- [x] A1 `ApiClient`: `listAdminPistes` and `createAdminPistes(count)` with the `x-admin-pin` header; tests (200/201, 400, 401, network)
- [x] A2 Admin controller + admin PIN store: PIN entry, load list, create with explicit confirmation, 401 returns to PIN entry; DOM-free tests
- [x] A3 UI: `#/admin` route (`router.ts`, `App.svelte`), `AdminScreen`, i18n copy, App/component tests
- [x] A4 README: route table and admin screen notes

## Delivery
Forecast ~350 authored lines; single PR (`ask-on-risk`, under the budget). Branch: `feat/admin-view`.

## Route declaration
Explorer (read-only) mapped the web package: mapping trigger, done. Writers: decided per task.

## Acceptance
- With a correct admin PIN the screen lists pistes and PINs; creating N pistes asks for confirmation, then shows the new list.
- Wrong PIN shows an error and keeps the user on PIN entry.
- `npm test --workspaces`, `npx tsc --noEmit -p packages/web`, `npm run check -w packages/web` and `npm run build -w packages/web` pass.

## Progress
- Branch created, plan written.
- A1 done: RED (3 new admin tests failing, methods missing) then GREEN; api-client tests pass (e5a0347).
- A2 done: RED (controller module missing), GREEN 17 tests (store + controller); tsc clean (9b1235b).
- A3 done: RED (7 failing across router, screen, component tests), GREEN 19 tests; tsc and svelte-check run (0c4c2eb).
- A4 done: README route table row and organizer screen section (docs, structural readback).

## Next step
Final verification, then PR (human decision).
