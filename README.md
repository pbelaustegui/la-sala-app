# la-sala-app

Fencing bout scoring. Monorepo with npm workspaces:

- `packages/domain` (`@la-sala/domain`): pure bout rules and reducer (`apply`, `settle`, `replay`).
- `packages/server` (`@la-sala/server`): Hono HTTP server. Judges post events per piste, spectators follow live over SSE.

## Running the server

Requires Node 24 (uses the built-in `node:sqlite`, which prints an `ExperimentalWarning` on start; it works without flags).

```sh
npm install
ADMIN_PIN=choose-a-long-secret npm start -w @la-sala/server
```

| Variable    | Required | Default           | Meaning                                  |
| ----------- | -------- | ----------------- | ---------------------------------------- |
| `ADMIN_PIN` | yes      | none              | Organizer secret, at least 12 characters; the server refuses to start without it. |
| `PORT`      | no       | `3000`            | HTTP port.                               |
| `DB_PATH`   | no       | `la-sala.sqlite`  | SQLite file (created if missing).        |

The server runs as a single process: the SSE hub is in-memory, so do not run several instances against one database.

## HTTP API

Headers: `x-admin-pin` (organizer) and `x-piste-pin` (judge of that piste). Wrong or missing PIN answers 401.

| Method and path               | Auth        | Purpose                                                             |
| ----------------------------- | ----------- | ------------------------------------------------------------------- |
| `GET /health`                 | none        | Liveness.                                                           |
| `POST /admin/pistes`          | admin       | `{count}` (1-100). Creates pistes, returns `[{id, pin}]`.           |
| `GET /admin/pistes`           | admin       | Lists `[{id, pin}]`.                                                |
| `GET /pistes`                 | none        | `[{id, status}]`; `idle` or the current phase. No PINs.             |
| `POST /pistes/:id/bout`       | piste       | `{weapon, options?, left, right}`. Starts a bout, archiving the previous one. |
| `POST /pistes/:id/events`     | piste       | `{events: [{id, type, at, ...}]}`. Applied in order; see below.     |
| `GET /pistes/:id/state`       | none        | `{serverTime, bout, fencers}`; `bout` is the domain state settled at `serverTime`. |
| `GET /pistes/:id/stream`      | none        | Server-sent events: `snapshot` on connect, then one per change, `: heartbeat` comment every 15 s. |

Events:

- Each event carries a client-generated `id`. An id already applied to the current bout is skipped, so offline clients can resend a batch safely.
- A batch is atomic. On the first domain error the response is `422 {index, error}` (index within the submitted batch) and nothing from the batch is stored.
- Starting a bout is required first (`409` otherwise). Unknown piste: `404`. Invalid body: `400`.
- Spectators compute their clock offset as `serverTime - Date.now()` at receipt and derive the running clock from the state timestamps.

**Warning:** `POST /admin/pistes` replaces all pistes. Existing pistes, their PINs, current bouts and archived bouts are discarded, and live streams receive an empty snapshot.

PINs are compared in constant time, are never logged and only appear in admin responses.

**Judge PIN throttling:** 5 consecutive wrong PINs for a piste lock that piste's judge PIN out with `429` and a `Retry-After` header (seconds). The first lockout lasts 30 s and doubles on every further lockout up to 15 min. While locked out even the correct PIN gets `429`, so the response never reveals whether a guess was right. A correct PIN resets the piste's history, but only when it is not locked out. State is in memory (per process, cleared on restart). Tradeoff: piste ids are public, so anyone can deliberately lock a piste's judge out of scoring (denial of service) by sending wrong PINs; the organizer can recover by restarting the server or recreating the pistes.

**Admin PIN policy:** `ADMIN_PIN` must be at least 12 characters (after trimming) or the server refuses to start. The admin PIN is never throttled or locked out: a lockout would let any unauthenticated client keep the organizer out of `/admin` for the whole event, so a long PIN is the defense against guessing instead. The PIN is compared in constant time and never logged.

**Residual risk (accepted):** because there is no throttle, `/admin` can be guessed online without any rate limit. Use a long random value (for example 16+ random characters), not a memorable phrase, and stop the server when the event ends. A per-IP failure limit was considered and left out because client IPs behind a proxy come from spoofable headers.

## Development

```sh
npm test --workspaces
npx tsc --noEmit -p packages/server
```

The server is hexagonal: `src/application` holds use cases and ports, `src/adapters` holds HTTP (Hono), memory, SQLite and system (crypto, clock) adapters. Repository contract tests run against both the memory and SQLite adapters.
