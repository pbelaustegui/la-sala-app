# la-sala-app

Fencing bout scoring. Monorepo with npm workspaces:

- `packages/domain` (`@la-sala/domain`): pure bout rules and reducer (`apply`, `settle`, `replay`).
- `packages/server` (`@la-sala/server`): Hono HTTP server. Judges post events per piste, spectators follow live over SSE.
- `packages/web` (`@la-sala/web`): offline-first PWA for the judge plus the public live board for spectators (Svelte + Vite), served by the server from the same origin.

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
| `WEB_DIST`  | no       | unset             | Folder with the built web app (`packages/web/dist`), resolved against the working directory. When set, the server serves the PWA from the same origin; if the folder or its `index.html` is missing the server refuses to start. |

The server runs as a single process: the SSE hub is in-memory, so do not run several instances against one database.

## Web app routes

| Hash route            | Audience   | Screen                                                                  |
| --------------------- | ---------- | ----------------------------------------------------------------------- |
| `#/`                  | spectators | Public live board: one card per piste.                                  |
| `#/piste/:id`         | spectators | Detail of one piste with very large numerals (for a TV).                |
| `#/judge`             | judges     | List of pistes to officiate (PIN needed to score).                      |
| `#/judge/:pisteId`    | judges     | PIN, bout setup and the scoreboard for that piste.                      |

The installed PWA opens the judge entry (`start_url` is `/#/judge`); the board link "Soy juez" at the bottom of the board leads there. Before this change the judge list lived at `#/` and the scoreboard at `#/judge/:pisteId`: bookmarks of `#/` now show the public board instead.

## Public board (spectators)

Open the site root (`https://host/`) on a phone or a TV: no login, read-only. The board shows a card per piste (fencers, score, clock, period, phase, cards, and the winner with the reason once finished) in a responsive grid; tapping a card opens the detail with much larger numerals. It uses ONE `EventSource` on `GET /pistes/stream` for all pistes (no polling) and reconnects with backoff; 45 s without any message (snapshots and pings count) is treated as a dead connection, so a phone that silently lost its network does not show stale scores as live. The running clock is drawn from timestamps (`serverTime` of each message corrected by the phone's offset), redrawn every 250 ms only while the page is visible. While the connection is down the board says "Sin conexión, mostrando el último estado" and freezes the clocks. The error bound of the clock is the one-way network latency: a board can show its clock slightly ahead of the judge's. The service worker never caches the stream.

## Judge web app (PWA)

`packages/web` is the judge's scoreboard: enter the piste PIN, set up the bout, score touches, run the clock, give cards, undo. It keeps working without a connection: every event is stored on the phone first and sent to the server in order when the network allows (see "Sync and clock" below). The UI is in Spanish.

### Build and serve it from the server

```sh
npm install
npm run build -w packages/web                  # writes packages/web/dist
ADMIN_PIN=choose-a-long-secret WEB_DIST=packages/web/dist \
  npx tsx packages/server/src/main.ts          # from the repository root
```

`WEB_DIST` is resolved against the directory the server is started from. `npm start -w @la-sala/server` runs inside `packages/server`, so with it use `WEB_DIST=../web/dist`. If the folder or its `index.html` is missing the server refuses to start and says so. The API and the app share one origin, so the app needs no extra configuration: `/pistes`, `/admin` and `/health` keep answering as before and every other `GET` path serves the app (`index.html` and the service worker are sent with `Cache-Control: no-cache`, hashed files under `/assets/` are cached for a year).

Create the pistes first (the organizer screens are not built yet), then open the app on the phone:

```sh
curl -X POST http://localhost:3000/admin/pistes -H 'x-admin-pin: choose-a-long-secret' \
  -H 'content-type: application/json' -d '{"count": 4}'     # returns [{id, pin}]
```

**HTTPS is required on the phone.** Browsers only register service workers, offer "install" and grant the Screen Wake Lock on secure origins (`https://` or `localhost`). Opening `http://192.168.x.x:3000` from a phone still shows the scoreboard, but without offline start, install or a screen that stays awake. Put the server behind HTTPS for real use (a reverse proxy such as Caddy, or a tunnel). For development, `npm run dev -w packages/web` serves the app on Vite's port and proxies the API to `localhost:3000`.

**Whatever sits in front of the server must pass Server-Sent Events (SSE) through unbuffered.** The public board and its live updates depend on `GET /pistes/stream`. If a proxy or tunnel does not support SSE, the board loads and lists the pistes but never shows a bout starting or a score changing.

- **Do not use Cloudflare Quick Tunnels** (`cloudflared tunnel --url ...`): Cloudflare documents that they do not support SSE.
- Verified to work: an SSH tunnel such as `ssh -R 80:localhost:3000 nokey@localhost.run`, which prints a temporary `https://` address (tested with a phone: the board updated live without reloading).
- Not tested here: a named Cloudflare Tunnel, Tailscale Funnel, ngrok, or a Caddy/nginx reverse proxy. For nginx-style proxies, turn response buffering off for `/pistes/stream`. Check any of them with a real phone before an event: open the board, start a bout from the judge screen, and watch it appear without reloading.
- Tunnels publish the server on the internet while they run, including `/admin`. Use a long random `ADMIN_PIN` and stop the tunnel when the event ends.

Other commands: `npm run icons -w packages/web` regenerates the PNG icons from `packages/web/public/icon.svg` (the generated PNGs are committed, builds do not need the tool). `npm run check -w packages/web` runs `svelte-check`.

### Sync and clock

- Events carry a client-generated id and are sent in order in batches; the server skips ids it already stored, so retrying after a lost response never double-applies. Retries use exponential backoff with jitter and the browser `online` event retries immediately.
- A `401` (PIN no longer accepted) or `429` (lockout) stops the queue and asks the judge to act; it never keeps hammering a locked PIN.
- A `422` means this phone and the server disagree. The server snapshot wins, the unsent events are dropped and the judge is told. Undo cannot go back past that point.
- One device per piste is assumed. A new version of the app is offered with a banner and never reloads the page by itself: it is applied when the judge taps "Actualizar ahora" or the next time the app is opened from scratch.
- Clock skew: the phone estimates `serverTime - phoneTime` from API responses (NTP-style midpoint of the round trip, keeping the sample with the smallest round trip, error bound = half of it) and stamps events with the corrected time.
- The bout is stored in `localStorage` and the piste PIN in `sessionStorage` (forgotten when the tab closes, never logged). The PIN is checked online once per session, so the app can be re-entered offline only while the tab stays open.

### Manual device checklist

Nothing below has been verified on a real device: the automated tests run against jsdom and an in-memory fake of the server. Run this list on at least one iPhone and one Android phone before an event, over HTTPS.

1. Open the HTTPS address in Safari (iPhone) or Chrome (Android). The public board loads; open `/#/judge` (or tap "Soy juez") for the piste list.
2. Install it: iPhone Share > "Add to Home Screen"; Android menu > "Install app". Launch it from the icon: it opens full screen on the judge piste list (`#/judge`) with the "La Sala" icon (not a screenshot of the page) and in portrait.
3. Enter a piste PIN, set up a bout and score a few touches. Check the connection badge shows "En línea" and "Todo sincronizado".
4. Turn on airplane mode, force-close the app and reopen it from the icon: the shell must load offline. Open the piste (the PIN stays remembered only while the tab/app session lives; if it asks again offline, that is the documented limit).
5. In airplane mode keep scoring, give a card, undo. The badge must say "Sin conexión" and count the pending events. Turn airplane mode off: the count must drop to 0 by itself and a second phone watching `/pistes/:id/state` must show the same score.
6. Start the clock and leave the phone untouched for longer than its auto-lock time: the screen must stay on while a bout is running and may turn off after it finishes.
7. Clock skew: set one phone's clock wrong by a minute (turn off "set automatically"), score with it, then compare the state shown by the server with a second phone with the right time. Event times must agree with the server, not with the wrong phone clock.
8. Publish a new build while the app is open: the "Hay una versión nueva" banner must appear and nothing must reload until you tap "Actualizar ahora" (or reopen the app).
9. Board: open `/` on a second phone and on a TV browser while the first phone scores. Cards must update within a second or two, the clock must keep ticking, and switching the second phone to airplane mode must show the "Sin conexión" banner with a frozen clock. Check the numerals are readable from a distance on the TV and on the detail screen.
10. Rotate the phone and use a small screen (iPhone SE size): the two score halves and the buttons must stay reachable with one thumb.

Known caveats to check on the devices:

- **iOS storage eviction.** Safari can delete a site's data (the stored bout and its unsent events, the installed app's cache) after about seven days without use if the site is not installed on the Home Screen, and under storage pressure. Installing to the Home Screen reduces this, but it is not a guarantee. Do not rely on a phone that has been idle for days holding an unsent bout: open the app and let it sync before the event.
- **Wake Lock** support depends on the OS and browser version (on iOS notably for apps installed to the Home Screen, which only recent versions allow); when it is missing or denied the app shows a warning while a bout is running and the judge must raise the phone's auto-lock time instead.
- **Private browsing** can make `localStorage` fail: the app then warns that the bout cannot be saved on this device.

### What was NOT verified on real devices

Install on iOS and Android, offline start from the installed icon, the real Wake Lock behavior, storage eviction, the iOS status bar and safe areas, and one-handed tap comfort. What is covered by automated tests: the sync queue and offline behavior (events queue while the fake network is down, flush in order, duplicates are not double-applied), clock correction with a skewed clock, the screens' main flows in jsdom, the manifest and icon files, the service worker policy (no runtime caching, no automatic reload) and the static hosting rules. The real service worker file was inspected in the build output but never executed in a browser.

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
| `GET /pistes/stream`          | none        | Public board feed for ALL pistes (see below).                       |

Board feed (`GET /pistes/stream`, registered before `/pistes/:id/...`): `event: pistes` `{pisteIds}` is the authoritative piste set (first on connect and after `POST /admin/pistes`; drop any other id) and `event: snapshot` `{pisteId, snapshot: {serverTime, bout, fencers}}` is sent per piste on connect and then per change. `event: ping` `{serverTime}` is sent every 15 s (a real event, because browsers do not expose SSE comments) so the client can tell a quiet connection from a dead one. The per-piste stream keeps its `: heartbeat` comment.

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
npx tsc --noEmit -p packages/web
npm run check -w packages/web
npm run build -w packages/web
```

The server is hexagonal: `src/application` holds use cases and ports, `src/adapters` holds HTTP (Hono), memory, SQLite and system (crypto, clock) adapters. Repository contract tests run against both the memory and SQLite adapters.
