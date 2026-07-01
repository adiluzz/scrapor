# Pisster — Deployment Runbook

Single-server deployment via Docker Compose. Only AWS S3 lives off-server.

## 0. Prerequisites

- A Linux server with Docker + Docker Compose plugin.
- A domain (e.g. `pisster.com`) with DNS control.
- An AWS account with a **private** S3 bucket ("Block all public access" ON) and
  an IAM user with `s3:GetObject`, `s3:PutObject`, `s3:DeleteObject` on it.
- A Google Workspace mailbox for `office@pisster.com` with an **App Password**
  (2-Step Verification enabled). A personal Gmail works only if `office@…` is a
  verified "Send mail as" alias.

## 1. Clone + configure

```bash
git clone <repo-url> pisster && cd pisster
cp .env.example .env
```

Edit `.env` and set at minimum:

- `DATABASE_URL=postgresql://pisster:<pw>@postgres:5432/pisster?schema=public`
- `POSTGRES_USER` / `POSTGRES_PASSWORD` / `POSTGRES_DB` (match `DATABASE_URL`)
- `AUTH_SECRET` and `NEXTAUTH_SECRET` — `openssl rand -base64 32`
- `CDN_SIGNING_SECRET` — `openssl rand -hex 32` (shared with nginx)
- `CDN_BASE_URL=https://cdn.pisster.com`
- `AWS_REGION`, `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`, `S3_BUCKET`
- `SMTP_USER=office@pisster.com`, `SMTP_PASS=<app password>`, `MAIL_FROM`, `ADMIN_NOTIFY_EMAIL`
- `PRIMARY_DOMAIN=pisster.com`, `ADMIN_SUBDOMAIN=admin`
- (optional) `VAST_TAG_URL=<your ad network preroll tag>`

## 2. DNS

Point these A records at the server IP:

- `pisster.com`, `www.pisster.com`
- `admin.pisster.com`
- `cdn.pisster.com`

## 3. Bring the stack up

```bash
docker compose up -d --build
```

Services: `nginx` (internal edge), `web`, `worker`, `postgres`, `redis`,
`elasticsearch`, `logstash`, `kibana`, `filebeat`.

The stack's `nginx` is **internal**: it binds only to `127.0.0.1:${EDGE_HTTP_PORT}`
(default `8080`) and does the app routing + protecting-CDN edge. Your existing
**host nginx** terminates TLS and reverse-proxies the Pisster domains to it
(see step 5). Nothing in the stack listens on 80/443, so there's no conflict.

## 4. Run migrations + seed

```bash
# Apply Prisma migrations (creates all tables + pg_trgm indexes)
docker compose run --rm migrate

# Create the first Site + ADMIN user
docker compose exec \
  -e ADMIN_EMAIL=you@example.com -e ADMIN_PASSWORD='a-strong-password' \
  -e SITE_DOMAIN=pisster.com -e SITE_NAME=Pisster \
  web node scripts/seed.mjs
```

## 5. Host nginx + TLS (existing server nginx)

The server already runs nginx for other projects, so TLS + routing happen there.
A ready-made vhost is provided at `docs/host-nginx/pisster.conf`.

```bash
# 1) Install the vhost
sudo cp docs/host-nginx/pisster.conf /etc/nginx/sites-available/pisster.conf
sudo ln -s /etc/nginx/sites-available/pisster.conf /etc/nginx/sites-enabled/

# 2) Issue certs for every Pisster hostname (host certbot)
sudo certbot --nginx -d pisster.com -d www.pisster.com \
     -d admin.pisster.com -d cdn.pisster.com

# 3) Test + reload
sudo nginx -t && sudo systemctl reload nginx
```

It reverse-proxies `pisster.com`, `www`, `admin.`, and `cdn.` to
`127.0.0.1:${EDGE_HTTP_PORT}` and forwards `Host` + `X-Forwarded-For` +
`X-Forwarded-Proto`. Those headers are **required**: the internal nginx uses
`X-Forwarded-For` (via `real_ip`) to recover the true client IP so the IP-bound
`secure_link` CDN signatures validate, and the app uses `X-Forwarded-Proto` to
emit correct `https://` canonical/sitemap URLs.

> If another vhost on this nginx uses a catch-all `default_server` on 443, make
> sure these four `server_name`s resolve to this block (they will, by name match).

## 6. Verify

1. Visit `https://pisster.com` — public site loads (empty until a scrape runs).
2. Visit `https://admin.pisster.com` — log in as the admin (email 2FA code).
3. Admin → **Scrape runs** → create a run (query + source sites + min duration).
   The `worker` picks it up from Redis, downloads, uploads to S3, and fills the
   per-source breakdown + totals.
4. Open a video — the player runs the (optional) ad preroll, then streams via the
   signed, IP-bound, ad-gated CDN URL.
5. Kibana (bound to `127.0.0.1:5601`, no auth) shows app/worker/nginx logs —
   reach it via an SSH tunnel: `ssh -L 5601:127.0.0.1:5601 user@server`.

## Operations

- **Update**: `git pull && docker compose up -d --build && docker compose run --rm migrate`
- **Logs**: `docker compose logs -f web worker nginx`
- **New domain / site**: add DNS + a `Site` row (seed script with different
  `SITE_DOMAIN`), then create an admin for it. The same `web` process serves all
  domains; middleware scopes every query by the request host's Site.
- **Soft-deleting a video** instantly revokes CDN access (the authorize check
  rejects `isDeleted` rows).
