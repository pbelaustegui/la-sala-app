# Feature: deploy-packaging

## Objective
Package the server and the web app so the organizer can bring up an ephemeral, HTTPS-enabled instance on any VPS for a single event and destroy it afterwards.

## Problem / why
The server needs a single Node 24 process, a persistent SQLite file, long-lived SSE connections and HTTPS (PWA, offline, wake lock). Quick tunnels (Cloudflare) do not support SSE; HostGator VPS has no hourly billing. Decision: an ephemeral VPS from an hourly-billed provider (Hetzner, DigitalOcean or Vultr), provider-agnostic packaging.

## Scope
- `Dockerfile` (+ `.dockerignore`): Node 24, builds the web app, runs the server as a non-root user, DB on a volume, healthcheck on `/health`.
- `compose.yaml` + `Caddyfile`: app + Caddy with automatic HTTPS; domain from an env var (a `<ip-dashed>.sslip.io` host works without owning a domain).
- `docs/deploy.md` runbook: create the VPS, install Docker, deploy, run the pre-event checklist, back up the SQLite file, destroy the VPS. Provider-agnostic, with one Hetzner example.
- README: short pointer to the runbook.
- OUT of scope: CI/CD, image registry, Terraform/cloud-init automation, multi-instance, server code changes.

## Constraints
- Single instance only (in-memory SSE hub; see README).
- `ADMIN_PIN` comes from an env file that is never committed; it must not appear in images, logs or the compose file.
- Docker is not installed on the dev machine: the image cannot be built here. Verify with static checks (`caddy validate` / `docker compose config` if available, otherwise manual review) and say so honestly.
- Artifacts in English; conventional commits; no AI attribution. ~400 authored lines per task is a planning heuristic only.

## Tasks
- [x] D1 Dockerfile + .dockerignore
- [x] D2 compose.yaml + Caddyfile + env example (the example is `env.example`: writes to `.env*` paths are denied by permission settings, so the user chose another name)
- [x] D3 Runbook `docs/deploy.md` + README pointer

## Route declaration
D1-D3: delegated direct, one writer (3+ non-trivial new files; trigger: writer rule).

## Delivery
Forecast ~200 authored lines; single PR. Branch: `feat/deploy-packaging`.

## Acceptance
- Dockerfile follows the README's run instructions (`WEB_DIST`, `DB_PATH`, `PORT`, Node 24) and persists the DB on a volume.
- Compose + Caddy expose only 80/443; the app port stays internal.
- Runbook covers: create, deploy, verify over HTTPS from a phone, back up, destroy.
- Existing checks still pass (`npm test` in all packages untouched).

## Progress
- Branch created, plan written.
- D1-D3 files written. The image build, `docker compose config` and `caddy validate` are UNVERIFIED: Docker and Caddy are not installed here. Only `npm run build -w packages/web` was run (succeeds).
- Work unit committed as b5530b2. `env.example` added afterwards (see the follow-up commit).

## Next step
Push and open the PR (user decision). First real validation happens on a rehearsal VPS.
