#!/usr/bin/env bash
# Create .env from .env.example and fill in all machine-generatable secrets.
#
# Generates: AUTH_SECRET, NEXTAUTH_SECRET, CDN_SIGNING_SECRET, a Postgres
# password, and a DATABASE_URL kept in lockstep with the POSTGRES_* vars.
#
# Safe to re-run: it only fills values that are empty / placeholder / the insecure
# default, so real secrets and your manual edits (AWS/SMTP/domains) are preserved.
set -euo pipefail

# Run from the repo root regardless of where it's invoked from.
cd "$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

ENV=".env"
EXAMPLE=".env.example"

[ -f "$EXAMPLE" ] || { echo "✖ $EXAMPLE not found — is this the repo root?" >&2; exit 1; }
if [ ! -f "$ENV" ]; then
  cp "$EXAMPLE" "$ENV"
  echo "• created $ENV from $EXAMPLE"
fi

# Current value of KEY in .env (strips surrounding quotes).
cur() { sed -n -E "s/^$1=\"?([^\"]*)\"?.*/\1/p" "$ENV" | head -n1; }

# Set KEY="VAL" (replace the line, or append if missing). Value passed via env var
# so base64 characters (+ / =) never break the awk program.
setkv() {
  KEY="$1" VAL="$2" awk '
    BEGIN { k=ENVIRON["KEY"]; v=ENVIRON["VAL"]; done=0 }
    $0 ~ "^"k"=" { print k"=\""v"\""; done=1; next }
    { print }
    END { if (!done) print k"=\""v"\"" }
  ' "$ENV" > "$ENV.tmp" && mv "$ENV.tmp" "$ENV"
}

# True when the current value should be (re)generated.
needs() {
  case "$(cur "$1")" in
    ""|change-me-in-production|pisster|your-google-app-password) return 0 ;;
    *) return 1 ;;
  esac
}

if needs AUTH_SECRET;        then setkv AUTH_SECRET        "$(openssl rand -base64 32)"; echo "• AUTH_SECRET generated"; fi
if needs NEXTAUTH_SECRET;    then setkv NEXTAUTH_SECRET    "$(openssl rand -base64 32)"; echo "• NEXTAUTH_SECRET generated"; fi
if needs CDN_SIGNING_SECRET; then setkv CDN_SIGNING_SECRET "$(openssl rand -hex 32)";    echo "• CDN_SIGNING_SECRET generated"; fi

# Postgres: keep DATABASE_URL and POSTGRES_PASSWORD consistent. Use hex so the
# password needs no URL-encoding inside DATABASE_URL.
PG_USER="$(cur POSTGRES_USER)"; PG_USER="${PG_USER:-pisster}"
PG_DB="$(cur POSTGRES_DB)";     PG_DB="${PG_DB:-pisster}"
PG_PW="$(cur POSTGRES_PASSWORD)"
if [ -z "$PG_PW" ] || [ "$PG_PW" = "pisster" ]; then
  PG_PW="$(openssl rand -hex 24)"
  echo "• POSTGRES_PASSWORD generated"
fi
setkv POSTGRES_USER "$PG_USER"
setkv POSTGRES_PASSWORD "$PG_PW"
setkv POSTGRES_DB "$PG_DB"
setkv DATABASE_URL "postgresql://${PG_USER}:${PG_PW}@postgres:5432/${PG_DB}?schema=public"
echo "• DATABASE_URL aligned to POSTGRES_*"

chmod 600 "$ENV"

cat <<'NOTE'

✔ Generated secrets written to .env (permissions 600).

  Still fill in manually before `docker compose up`:
    • AWS_REGION / AWS_ACCESS_KEY_ID / AWS_SECRET_ACCESS_KEY / S3_BUCKET
    • SMTP_USER / SMTP_PASS / MAIL_FROM / ADMIN_NOTIFY_EMAIL
    • PRIMARY_DOMAIN / ADMIN_SUBDOMAIN / CDN_BASE_URL  (default to pisster.com)
NOTE
