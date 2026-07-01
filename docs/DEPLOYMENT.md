# Pisster — Deployment Runbook

Single-server deployment via Docker Compose. Everything runs on the server
except AWS S3 (video storage). The server already runs its own **host nginx**
for other projects — that nginx terminates TLS and reverse-proxies the Pisster
domains to the stack's internal nginx (bound to `127.0.0.1:8080`), so nothing in
the stack ever binds to ports 80/443.

```
Browser ──443──▶ HOST nginx (TLS/certbot) ──▶ 127.0.0.1:8080 internal nginx ──▶ web:3000
                                                        └──▶ CDN edge (secure_link → S3 presign)
```

---

## 0. Prerequisites

- A Linux server you can SSH into with a sudo user, running:
  - **Docker** + the **Docker Compose plugin** (`docker compose version`)
  - **nginx** (the existing host nginx)
  - **certbot** with the nginx plugin (`sudo apt install certbot python3-certbot-nginx`)
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
- `EDGE_HTTP_PORT=8080` — localhost port the internal nginx binds to. **Change it
  if 8080 is already taken** on this server (then use the same value in step 6).
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

```bash
docker compose up -d --build
```

Services: `web`, `worker`, `nginx` (internal edge), `postgres`, `redis`,
`elasticsearch`, `logstash`, `kibana`, `filebeat`.

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

## 6. Host nginx + SSL certificate

TLS + routing live on the **host nginx**. A ready-made vhost is at
`docs/host-nginx/pisster.conf`. It has a `:443` block that references
Let's Encrypt cert files — which don't exist yet — so we obtain certs **first**
with a tiny bootstrap vhost, then swap in the real one. This avoids the
"nginx won't start because the cert is missing / cert can't be issued because
nginx won't start" deadlock.

> Debian/Ubuntu use `/etc/nginx/sites-available` + `sites-enabled`. On
> RHEL/Amazon Linux, drop the `.conf` into `/etc/nginx/conf.d/` instead and skip
> the symlink step.

### 6a. Bootstrap HTTP vhost (serves the ACME challenge)

```bash
sudo mkdir -p /var/www/html
sudo tee /etc/nginx/sites-available/pisster-bootstrap.conf >/dev/null <<'EOF'
server {
    listen 80;
    listen [::]:80;
    server_name pisster.com www.pisster.com admin.pisster.com cdn.pisster.com;
    location /.well-known/acme-challenge/ { root /var/www/html; }
    location / { return 200 'pisster bootstrap ok'; }
}
EOF
sudo ln -s /etc/nginx/sites-available/pisster-bootstrap.conf /etc/nginx/sites-enabled/
sudo nginx -t && sudo systemctl reload nginx
```

### 6b. Issue the certificate (one cert, all four hostnames)

```bash
sudo certbot certonly --webroot -w /var/www/html \
  -d pisster.com -d www.pisster.com -d admin.pisster.com -d cdn.pisster.com \
  --email you@example.com --agree-tos --no-eff-email
```

This writes `/etc/letsencrypt/live/pisster.com/{fullchain,privkey}.pem`.

### 6c. Swap in the real vhost

```bash
sudo rm /etc/nginx/sites-enabled/pisster-bootstrap.conf
sudo cp docs/host-nginx/pisster.conf /etc/nginx/sites-available/pisster.conf
sudo ln -s /etc/nginx/sites-available/pisster.conf /etc/nginx/sites-enabled/
sudo nginx -t && sudo systemctl reload nginx
```

The real vhost reverse-proxies `pisster.com`, `www`, `admin.`, and `cdn.` to
`127.0.0.1:${EDGE_HTTP_PORT}` and forwards `Host`, `X-Forwarded-For`, and
`X-Forwarded-Proto`. **These headers are required:** the internal nginx uses
`X-Forwarded-For` (via `real_ip`) to recover the true client IP so the IP-bound
`secure_link` CDN signatures validate, and the app uses `X-Forwarded-Proto` to
emit correct `https://` canonical/sitemap URLs.

> If you changed `EDGE_HTTP_PORT` in `.env`, update the `upstream pisster_edge`
> port in the vhost to match.

### 6d. Auto-renewal

Certbot installs a renewal timer. The real vhost keeps the
`/.well-known/acme-challenge/` → `/var/www/html` location, so webroot renewals
keep working. Verify:

```bash
sudo certbot renew --dry-run
```

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
  docker compose up -d --build
  docker compose run --rm migrate      # apply any new migrations
  ```
- **Logs:** `docker compose logs -f web worker nginx`
- **Restart one service:** `docker compose restart web`
- **New domain / site:** add the four DNS records, re-run certbot with the new
  `-d` names, add a `Site` row (`seed.mjs` with a different `SITE_DOMAIN`), and
  create an admin for it. The same `web` process serves all domains; middleware
  scopes every query by the request host's Site.
- **Soft-deleting a video** instantly revokes CDN access (the authorize check
  rejects `isDeleted` rows).
- **Rotate the deploy key:** delete it under repo → Settings → Deploy keys,
  regenerate (step 1a), re-add, done.
