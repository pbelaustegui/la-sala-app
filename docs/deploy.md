# Deploying La Sala on an ephemeral VPS

Goal: bring up an HTTPS instance for one event on a rented VPS, then destroy it. The stack is two containers: the app (Node 24, SQLite on a volume) and Caddy (automatic HTTPS, SSE passed through unbuffered).

Read this first:

- **Single instance only.** The SSE hub is in-memory; never run two copies against one database.
- **`/admin` is public on the internet** while the VPS runs. Use a long random `ADMIN_PIN` (16+ random characters). It is never rate-limited.
- **Destroy the VPS when the event ends.** Hourly billing only helps if you actually delete the server.

## 1. Create the VPS

Use any provider with hourly billing (Hetzner, DigitalOcean, Vultr, ...). A small shared-CPU instance with Ubuntu 24.04 is enough. Allow inbound TCP 22, 80 and 443 only. Provider prices, regions and plans change: check them yourself before you pick one.

Note the server's public IPv4 address.

Example only (Hetzner `hcloud` CLI; adjust type, location and SSH key name to what your account offers):

```sh
hcloud server create --name la-sala --type cx22 --image ubuntu-24.04 \
  --location nbg1 --ssh-key my-key
```

## 2. Install Docker

```sh
ssh root@<server-ip>
curl -fsSL https://get.docker.com | sh
docker compose version      # must print a version
```

## 3. Copy the repository

Either `git clone` it on the server, or from your machine:

```sh
rsync -a --exclude node_modules --exclude .git ./ root@<server-ip>:/opt/la-sala/
```

## 4. Choose the host name

- With a domain: create an `A` record pointing to the server IP and use that name.
- Without a domain: use [sslip.io](https://sslip.io). The IP with dashes plus `.sslip.io` resolves to that IP, for example `203.0.113.10` becomes `203-0-113-10.sslip.io`. Caddy can get a real certificate for it.

## 5. Create `.env`

In the repository folder on the server (`.env` is git-ignored and never baked into the image):

```sh
cd /opt/la-sala
cat > .env <<EOF
ADMIN_PIN=$(openssl rand -base64 24)
SITE_ADDRESS=203-0-113-10.sslip.io
EOF
chmod 600 .env
```

Replace `SITE_ADDRESS` with your host name. Read the generated PIN with `bat .env` (or `cat .env`) and store it somewhere safe; you need it for `/admin`.

## 6. Start

```sh
docker compose up -d --build
docker compose ps           # app should become "healthy"
docker compose logs -f caddy   # wait for the certificate to be obtained
```

Only ports 80 and 443 are published; the app port 3000 stays internal.

## 7. Verify

```sh
curl -i https://<host>/health
```

It must answer `200` over a valid certificate. Then run the phone checks: the "Manual device checklist" in the [README](../README.md#manual-device-checklist), over this HTTPS address. Include the live-board step (start a bout on one phone and watch it appear on another without reloading): that confirms SSE passes through Caddy.

## 8. Create the pistes

Open `https://<host>/#/admin` (type it by hand), enter the admin PIN and use "Crear pistas". Creating pistes replaces all existing ones and resets the board. Share the judge PINs and the spectator link with the screen's copy buttons.

## 9. Back up the database before destroying

The SQLite file may be mid-write while the app runs, so stop the app container first (Caddy can stay up):

```sh
docker compose stop app
docker run --rm -v la-sala_app-data:/data -v "$PWD":/backup alpine \
  cp /data/la-sala.sqlite /backup/la-sala.sqlite
```

The volume name is `<folder name>_app-data` (`la-sala_app-data` when the repository folder is `la-sala`, as tested); confirm it with `docker volume ls`. If the file is missing, also copy `la-sala.sqlite-wal` and `la-sala.sqlite-shm` if present. Then download it:

```sh
scp root@<server-ip>:/opt/la-sala/la-sala.sqlite .
```

Check that the downloaded file is a healthy database before you destroy the server. Node 24 (already required by the project) ships `node:sqlite`, so no `sqlite3` install is needed:

```sh
node -e "const {DatabaseSync}=require('node:sqlite');const db=new DatabaseSync('la-sala.sqlite',{readOnly:true});console.log(db.prepare('select name from sqlite_master').all())"
```

A healthy backup lists the tables `pistes`, `bouts` and `events` (plus their indexes and `sqlite_sequence`). An error or an empty list means the backup is not usable: do not destroy the server yet. The `ExperimentalWarning` printed by Node is harmless.

To resume the event after a backup: `docker compose start app`.

## 10. Destroy

Delete the server from the provider (this also removes the volumes and the certificates). Example only:

```sh
hcloud server delete la-sala
```

Check in the provider console that no server, volume or floating IP is left, otherwise you keep paying.
