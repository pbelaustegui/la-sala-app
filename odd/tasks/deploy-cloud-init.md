# Feature: deploy-cloud-init

## Objective
Bring up a working La Sala server on a fresh DigitalOcean Droplet with one paste (cloud-init user data) instead of six manual steps.

## Problem / why
The runbook needs: create VPS, install Docker, copy repo, compute host name, write `.env`, start. After the first real deployment these steps are repetitive and slow. The repository is public, so the Droplet can clone it without credentials.

## Scope
- C1 `deploy/cloud-init.yaml`: `#cloud-config` that installs Docker and git, clones the public repo into `/opt/la-sala`, derives `SITE_ADDRESS` from the Droplet public IPv4 (`<ip-with-dashes>.sslip.io`, DO metadata service with a fallback), generates `ADMIN_PIN` ON the Droplet into a `chmod 600` `.env`, runs `docker compose up -d --build`, logs to a file and leaves a ready marker.
- C2 Runbook: a fast path in `docs/deploy.md` (create Droplet with user data, wait with `cloud-init status --wait`, read the PIN over SSH, verify), keeping the manual path as the alternative; README pointer updated if needed.
- OUT of scope: `doctl` automation, registry/prebuilt image, firewall setup, other providers' metadata endpoints beyond a simple fallback.

## Decisions
- The ADMIN_PIN is generated on the Droplet and never passed through user data: user data is visible in the provider panel and readable from the metadata service by any process on the server.
- Pin the clone to a configurable ref (default `main`) at the top of the file.

## Constraints
- Single instance only; Docker and cloud-init cannot be run on the dev machine, so the file is validated statically and the first real run happens on a Droplet. Say so honestly.
- Artifacts in English; conventional commits; no AI attribution or Co-Authored-By. ~400 authored lines per task is a planning heuristic only.

## Tasks
- [x] C1 `deploy/cloud-init.yaml`
- [x] C2 Runbook fast path + README pointer

## Route declaration
C1-C2: delegated direct, one writer (new config file plus runbook rewrite; preparation trigger: it must read the existing runbook, compose and env.example).

## Delivery
Forecast ~150 authored lines; single PR. Branch: `feat/deploy-cloud-init`.

## Acceptance
- YAML parses and is valid cloud-config structure; shell parts have no obvious errors (shellcheck if available).
- PIN never appears in the file, in user data or in logs; `.env` is `chmod 600`.
- Runbook fast path reads end to end and states what was and was not verified.

## Progress
- Branch created, plan written.
- C1 and C2 written. Verified: YAML parses (PyYAML), `cloud-init schema` reports valid, `bash -n` on the embedded script passes, ADMIN_PIN is only written to `.env` (never echoed) and no shell tracing is used. NOT verified: shellcheck (not installed), real cloud-init/Docker run and the DO metadata path (first run is on a Droplet). Commit hash: see final report.

## Next step
Delegate the writer for C1-C2.
