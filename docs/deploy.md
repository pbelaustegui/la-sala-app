# Deploying La Sala on an ephemeral VPS

Goal: bring up an HTTPS instance for one event on a rented VPS, then destroy it. The stack is two containers: the app (Node 24, SQLite on a volume) and Caddy (automatic HTTPS, SSE passed through unbuffered).

Read this first:

- **Single instance only.** The SSE hub is in-memory; never run two copies against one database.
- **`/admin` is public on the internet** while the VPS runs. Use a long random `ADMIN_PIN` (16+ random characters). It is never rate-limited.
- **Destroy the VPS when the event ends.** Hourly billing only helps if you actually delete the server.
- **Download the database first.** Destroying the VPS deletes every bout and its event log, the only record of what happened on each piste. Back it up as in ["When the event ends"](#when-the-event-ends) (fast path) or section 9 (manual path).

## Fast path (cloud-init)

On DigitalOcean you can skip sections 1 to 6: one paste of [`deploy/cloud-init.yaml`](../deploy/cloud-init.yaml) installs Docker, clones this public repository into `/opt/la-sala`, writes `.env` and starts the stack.

1. Create a Droplet with Ubuntu 24.04, at least 1 GB RAM (2 GB preferred, see troubleshooting) and your SSH key. Before you click create, open the advanced section above "Finalize Details" (called "Advanced Options" with an "Add Initialization scripts" box, or "Additional Options" with "Startup scripts", depending on the panel version) and paste the whole file, starting with the `#cloud-config` line, into the text box. User data can only be set while creating the Droplet: if you create it with the field empty you must destroy it and start again. To deploy a branch or tag other than `main`, change `REPO_REF` in the script first.
2. Save the Droplet's IP in a variable so you only type it once (reuse the same terminal for the next steps):

   ```sh
   export DROPLET_IP=<droplet-ip>
   ```

   Wait for the setup to finish (a few minutes, the image build is the slow part):

   ```sh
   ssh root@$DROPLET_IP cloud-init status --wait
   ```

   If it ends in `error`, read `/var/log/la-sala-bootstrap.log` on the server.
3. Read the admin PIN:

   ```sh
   ssh root@$DROPLET_IP "grep ADMIN_PIN /opt/la-sala/.env"
   ```

4. Verify (the host name is the IP with dashes plus `.sslip.io`; `/root/la-sala-ready` on the server holds the exact URL):

   ```sh
   curl -i https://${DROPLET_IP//./-}.sslip.io/health
   ```

5. Continue at "8. Create the pistes". For the phone checks in section 7, use the same HTTPS address. When the event is over, come back to ["When the event ends"](#when-the-event-ends) below instead of sections 9 and 10.

### When the event ends

Run these from your own machine, in a terminal with `DROPLET_IP` set (step 2). Do not destroy the Droplet until step 3 passes.

1. Stop the app (the server closes the database cleanly on stop) and copy the database out of its volume into `/opt/la-sala`:

   ```sh
   ssh root@$DROPLET_IP 'cd /opt/la-sala && docker compose stop app && docker run --rm -v la-sala_app-data:/data -v /opt/la-sala:/backup alpine sh -c "cp /data/la-sala.sqlite* /backup/" && ls -l /opt/la-sala/la-sala.sqlite*'
   ```

   The listing must show `la-sala.sqlite` with a non-zero size. If `cp` says no such file, check the volume name with `ssh root@$DROPLET_IP docker volume ls` (cloud-init clones into `/opt/la-sala`, so it is `la-sala_app-data`).

2. Download it into a dated folder:

   ```sh
   mkdir -p "la-sala-backup-$(date +%F)" && scp "root@$DROPLET_IP:/opt/la-sala/la-sala.sqlite*" "la-sala-backup-$(date +%F)/"
   ```

3. Check that the copy is a healthy database (Node 24 ships `node:sqlite`; the `ExperimentalWarning` is harmless):

   ```sh
   node -e "const {DatabaseSync}=require('node:sqlite');const db=new DatabaseSync(process.argv[1],{readOnly:true});console.log(db.prepare('select (select count(*) from bouts) bouts, (select count(*) from events) events').get())" "la-sala-backup-$(date +%F)/la-sala.sqlite"
   ```

   It must print the number of bouts and events, both above zero after a real event. An error means the backup is not usable: do not destroy the Droplet; to keep serving meanwhile, `ssh root@$DROPLET_IP 'cd /opt/la-sala && docker compose start app'`.

4. Destroy the Droplet from the DigitalOcean panel and check that no Droplet, volume or reserved IP is left.

Keep the folder: each bout's event log, with its timestamps, is what lets you reconstruct afterwards what a judge did (for example an undo that seemed not to work).

Why the PIN is generated on the server: user data is visible in the provider panel and any process on the server can read it from the metadata service, so a secret placed there is not secret. The script creates `.env` (mode 600) only if it does not exist, so a re-run never changes the PIN.

For a custom domain, point an `A` record to the Droplet, edit `SITE_ADDRESS` in `/opt/la-sala/.env` and run `docker compose up -d` in `/opt/la-sala`.

### Verification status

Verified on a real DigitalOcean Droplet (Ubuntu 24.04, 2 GB RAM, nyc1): `cloud-init status --wait` ended in `done`, `/root/la-sala-ready` and the generated PIN were present, and `https://<ip-with-dashes>.sslip.io/health` answered over a valid certificate. The file was also checked statically (YAML parse, `cloud-init schema`, `bash -n` on the script).

Not verified: whether the public IP came from the DigitalOcean metadata path (`/metadata/v1/interfaces/public/0/ipv4/address`) or from the `https://api.ipify.org` fallback (the log does not say which); other providers; and Droplets smaller than 2 GB.

### Troubleshooting

- **`.env` does not exist, `/var/log/la-sala-bootstrap.log` is missing and `cloud-init status` says `done`:** the script never ran because the User data field was empty at creation. Check with `ls /usr/local/bin/la-sala-bootstrap.sh` (missing) and `head -n 3 /var/lib/cloud/instance/user-data.txt` (empty). `DataSourceConfigDrive` in `cloud-init status --long` is normal on DigitalOcean. Destroy the Droplet and create a new one with the field filled in.
- **Certificate not issued yet:** wait a minute or two, then check `docker compose logs caddy` in `/opt/la-sala`. Ports 80 and 443 must be reachable.
- **`cloud-init status` shows `error`:** read `/var/log/la-sala-bootstrap.log`. After fixing the cause, re-run `/usr/local/bin/la-sala-bootstrap.sh` (it skips what is already done).
- **512 MB Droplet runs out of memory during the build:** use at least 1 GB, preferably 2 GB.

## Manual path

Sections 1 to 6 are the manual alternative to the fast path. Use them on other providers or if you prefer to see each step.

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
