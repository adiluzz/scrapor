# Pisster — Deployment Runbook

Single-server deployment via Docker Compose. Everything runs on the server
except AWS S3 (video storage). This server's public edge is an **existing
dockerized Caddy** (the `chiro` stack) that already owns ports 80/443 and does
**automatic HTTPS**. Caddy reverse-proxies the Pisster domains, over a shared
Docker network, to the stack's internal edge nginx — so nothing in the Pisster
stack binds to 80/443 and there is **no host nginx / no certbot** to manage.

```
Browser ──443──▶ Caddy (dockerized, auto-TLS) ──▶ pisster-edge nginx ──▶ web:3000
                                                          └──▶ CDN edge (secure_link → S3 presign)
```

> **Alternative — host nginx:** if your server uses a host-level nginx instead
> of Caddy, the repo also ships `docs/host-nginx/pisster.conf` plus a certbot
> flow (see the note at the end of §6). This runbook documents the Caddy path,
> which is what this server uses.

---

## 0. Prerequisites

- A Linux server you can SSH into with a sudo user, running:
  - **Docker** + the **Docker Compose plugin** (`docker compose version`)
  - An **existing dockerized Caddy** edge that owns host `:80`/`:443` and does
    automatic HTTPS (verify: `docker ps` shows a `caddy` container publishing
    `0.0.0.0:80` and `0.0.0.0:443`, and note its Docker network name —
    e.g. `chiro_default`). No host nginx or certbot is needed.
- A domain (e.g. `pisster.com`) with DNS control.
- An AWS account with a **private** S3 bucket ("Block all public access" ON) and
  an IAM user holding `s3:GetObject`, `s3:PutObject`, `s3:DeleteObject` on it.
- A mailbox for `office@pisster.com` with a Google **App Password** (2-Step
  Verification enabled).
- Push access to `github.com/adiluzz/scrapor` so you can add a **deploy key**.

---

## 1. Create + use a GitHub deploy key (clone the private repo)

A **deploy key** is an SSH key registered on the repo that grants this one server
read-only clone/pull access — no personal credentials on the box.

### 1a. Generate a dedicated key on the server

```bash
ssh-keygen -t ed25519 -f ~/.ssh/pisster_deploy -C "pisster-deploy@$(hostname)" -N ""
cat ~/.ssh/pisster_deploy.pub          # copy this entire line
```

`-N ""` = no passphrase, so `git pull` works non-interactively.

### 1b. Register it on GitHub

Repo → **Settings → Deploy keys → Add deploy key** → paste the `.pub` contents →
title it (e.g. `prod-server`) → leave **"Allow write access" unchecked** (we only
pull on the server) → **Add key**.

### 1c. Tell SSH to use this key for the repo

Because the server may already have a GitHub key for other projects, use a
**host alias** so there's never a conflict. Add to `~/.ssh/config`:

```sshconfig
Host github-pisster
    HostName github.com
    User git
    IdentityFile ~/.ssh/pisster_deploy
    IdentitiesOnly yes
```

```bash
chmod 600 ~/.ssh/config
ssh -T git@github-pisster      # expect: "Hi adiluzz/scrapor! You've successfully authenticated..."
```

> If this server has **no** other GitHub repos, you can skip the alias and put
> the same `IdentityFile`/`IdentitiesOnly` lines under `Host github.com`, then
> use the normal `git@github.com:...` URL below.

### 1d. Clone

```bash
git clone git@github-pisster:adiluzz/scrapor.git pisster
cd pisster
```

(For later updates it's just `git pull` from inside this directory.)

---

## 2. Configure `.env`

```bash
cp .env.example .env
```

Edit `.env` and set at minimum:

- `DATABASE_URL=postgresql://pisster:<pw>@postgres:5432/pisster?schema=public`
- `POSTGRES_USER` / `POSTGRES_PASSWORD` / `POSTGRES_DB` — must match `DATABASE_URL`
- `AUTH_SECRET` and `NEXTAUTH_SECRET` — each `openssl rand -base64 32`
- `CDN_SIGNING_SECRET` — `openssl rand -hex 32` (shared HMAC between app + nginx)
- `CDN_BASE_URL=https://cdn.pisster.com`
- `AWS_REGION`, `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`, `S3_BUCKET`
- `SMTP_USER=office@pisster.com`, `SMTP_PASS=<app password>`, `MAIL_FROM`, `ADMIN_NOTIFY_EMAIL`
- `PRIMARY_DOMAIN=pisster.com`, `ADMIN_SUBDOMAIN=admin`
- `EDGE_HTTP_PORT=8080` — localhost-only port the internal nginx publishes for
  debugging (`curl` from the host). Caddy reaches the edge over the shared Docker
  network (`pisster-edge:80`), not this port. Change it only if 8080 is taken.
- (optional) `VAST_TAG_URL=<your ad network preroll tag>` — leave blank to disable ads.

`.env` is gitignored and must never be committed.

---

## 3. DNS

Point these **A records** at the server's public IP (all four are required):

- `pisster.com`, `www.pisster.com`
- `admin.pisster.com`
- `cdn.pisster.com`

Confirm before requesting certs: `dig +short pisster.com` etc. should return the
server IP.

---

## 4. Bring the stack up

The compose file joins the edge `nginx` to Caddy's **external** network
(`chiro_default`), so that network must already exist — it does whenever the
Caddy/chiro stack is up (`docker network ls | grep chiro_default`).

```bash
docker compose up -d --build web worker video-analyzer nginx postgres redis
```

Services: `web`, `worker`, `video-analyzer`, `nginx` (internal edge), `postgres`, `redis`.

The ELK stack (`elasticsearch`, `logstash`, `kibana`, `filebeat`) lives in
`docker-compose.elk.yml` and is **not** started by the command above. Only
enable it explicitly if you need centralized logs:

```bash
docker compose -f docker-compose.yml -f docker-compose.elk.yml up -d elasticsearch logstash kibana filebeat
```

Check they're healthy and the edge is answering locally:

```bash
docker compose ps
curl -I -H 'Host: pisster.com' http://127.0.0.1:8080/    # expect 200/3xx from the app
```

---

## 5. Migrate + seed the database

```bash
# Apply Prisma migrations (creates all tables + pg_trgm indexes)
docker compose run --rm migrate

# Create the first Site + ADMIN user. Run it in the `migrate` (builder) image,
# which contains the full source + scripts/ (the slim `web` image does not).
docker compose run --rm \
  -e ADMIN_EMAIL=you@example.com \
  -e ADMIN_PASSWORD='a-strong-password' \
  -e SITE_DOMAIN=pisster.com \
  -e SITE_NAME=Pisster \
  migrate node scripts/seed.mjs
```

---

## 6. Public routing + TLS via the dockerized Caddy edge

The public edge is the existing **Caddy** container. It already owns `:80`/`:443`
and does automatic HTTPS, so all we do is: (a) put the Pisster edge nginx on
Caddy's Docker network, and (b) add one site block to Caddy's Caddyfile pointing
at it. Caddy then obtains + auto-renews the certs — no certbot, no host nginx.

`docker-compose.yml` already attaches the `nginx` service to an **external**
network named `chiro_default` with the alias **`pisster-edge`**. If your Caddy's
network has a different name, change `chiro_default` in `docker-compose.yml`
(both under the `nginx` service and the top-level `networks:` block) to match.

Find Caddy's details (network + where its Caddyfile is bind-mounted):

```bash
docker inspect chiro-caddy-1 --format '{{range $k,$v := .NetworkSettings.Networks}}{{$k}} {{end}}'
docker inspect chiro-caddy-1 --format '{{json .Mounts}}' | python3 -m json.tool
```

### 6a. Join the edge nginx to Caddy's network

Bringing the stack up (§4) with the current compose already puts `nginx` on
`chiro_default`. Confirm it's on both networks:

```bash
docker inspect pisster-nginx-1 \
  --format '{{range $k,$v := .NetworkSettings.Networks}}{{$k}} {{end}}'
# expect: <project>_default chiro_default
```

### 6b. Add the Pisster site block to Caddy

Append the block from `docs/host-caddy/pisster.Caddyfile` to Caddy's Caddyfile
(bind-mounted on the host, e.g. `/opt/chiro/Caddyfile`):

```caddyfile
pisster.com, www.pisster.com, admin.pisster.com, cdn.pisster.com {
	reverse_proxy pisster-edge:80
}
```

Caddy preserves the original `Host` header and sets `X-Forwarded-For` /
`X-Forwarded-Proto` by default. **These are required:** the internal nginx uses
`X-Forwarded-For` (via `real_ip`) to recover the true client IP so the IP-bound
`secure_link` CDN signatures validate, and the app uses `X-Forwarded-Proto` to
emit correct `https://` canonical/sitemap URLs.

### 6c. Validate + reload Caddy (zero downtime)

```bash
docker exec chiro-caddy-1 caddy validate --config /etc/caddy/Caddyfile
docker exec chiro-caddy-1 caddy reload   --config /etc/caddy/Caddyfile
```

Caddy issues the Let's Encrypt cert on the first request to each hostname
(needs the DNS from §3 + reachable 80/443, which Caddy owns). Renewal is
automatic — nothing else to configure.

> **Host-nginx alternative:** if this server used a host nginx instead of Caddy,
> use `docs/host-nginx/pisster.conf` with a certbot webroot flow: create a
> bootstrap `:80` vhost serving `/.well-known/acme-challenge/` from
> `/var/www/html`, run `certbot certonly --webroot -w /var/www/html -d pisster.com
> -d www.pisster.com -d admin.pisster.com -d cdn.pisster.com`, then install
> `pisster.conf` (Debian: `sites-available`+`sites-enabled`; RHEL/Amazon Linux:
> `/etc/nginx/conf.d/`). On Amazon Linux 2023, certbot isn't packaged — install
> it via `python3 -m venv /opt/certbot && /opt/certbot/bin/pip install certbot`.

---

## 7. Verify

1. `https://pisster.com` — public site loads (empty until a scrape runs).
2. `https://admin.pisster.com` — log in as the admin (email 2FA code).
3. Admin → **Scrape runs** → create a run (query + source sites + min duration).
   The `worker` picks it up from Redis, downloads, uploads to S3, and fills the
   per-source breakdown + totals.
4. Open a video — the player runs the optional ad preroll, then streams via the
   signed, IP-bound, ad-gated CDN URL.
5. Kibana (bound to `127.0.0.1:5601`, no auth) — reach it via SSH tunnel:
   `ssh -L 5601:127.0.0.1:5601 user@server`, then open `http://localhost:5601`.

---

## 8. Operations

- **Update to latest code:**
  ```bash
  cd pisster
  git pull
  docker compose up -d --build web worker video-analyzer nginx postgres redis
  docker compose run --rm migrate      # apply any new migrations
  ```
- **Logs:** `docker compose logs -f web worker nginx`
- **Restart one service:** `docker compose restart web`
- **New domain / site:** add the DNS records, add the new hostnames to the Caddy
  site block (or a new block) and `caddy reload` — Caddy auto-issues the cert —
  then add a `Site` row (`seed.mjs` with a different `SITE_DOMAIN`) and create an
  admin for it. The same `web` process serves all domains; middleware scopes
  every query by the request host's Site.
- **Soft-deleting a video** instantly revokes CDN access (the authorize check
  rejects `isDeleted` rows).
- **Rotate the deploy key:** delete it under repo → Settings → Deploy keys,
  regenerate (step 1a), re-add, done.
