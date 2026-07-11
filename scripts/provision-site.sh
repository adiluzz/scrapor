#!/usr/bin/env bash
# Provision a new public site domain on the host edge (Caddy + nginx env).
# Site row should already exist in the DB (admin Websites UI or create-site.mjs).
#
# Usage:
#   ./scripts/provision-site.sh example.com
#   ADMIN_BASE_DOMAIN=sharlila.com CDN_DOMAIN=cdn.pisster.com ./scripts/provision-site.sh example.com
#
set -euo pipefail

DOMAIN="${1:-}"
if [[ -z "$DOMAIN" ]]; then
  echo "Usage: $0 <domain>" >&2
  exit 1
fi

ADMIN_BASE_DOMAIN="${ADMIN_BASE_DOMAIN:-sharlila.com}"
CDN_DOMAIN="${CDN_DOMAIN:-cdn.pisster.com}"
CADDYFILE="${CADDYFILE:-/opt/chiro/Caddyfile}"
COMPOSE_ENV="${COMPOSE_ENV:-.env}"
ROOT="$(cd "$(dirname "$0")/.." && pwd)"

echo "==> Domain: $DOMAIN"
echo "==> Ensure DNS A records for $DOMAIN and www.$DOMAIN point at this server."
echo "==> Ensure a Site row exists (admin → Websites, or: node scripts/create-site.mjs --domain=$DOMAIN ...)"

# Hint for DB
if [[ -f "$ROOT/scripts/create-site.mjs" ]]; then
  echo ""
  echo "If the Site row is missing, create it with:"
  echo "  node scripts/create-site.mjs --domain=$DOMAIN --name=NAME --slug=SLUG --kind=TUBE"
fi

# Update .env SITE_SERVER_NAMES / NETWORK_REFERERS if present
if [[ -f "$ROOT/$COMPOSE_ENV" ]] || [[ -f "$COMPOSE_ENV" ]]; then
  ENV_FILE="$ROOT/$COMPOSE_ENV"
  [[ -f "$COMPOSE_ENV" ]] && ENV_FILE="$COMPOSE_ENV"
  echo ""
  echo "==> Append hosts to SITE_SERVER_NAMES / NETWORK_REFERERS in $ENV_FILE (manual check recommended)"
  if grep -q '^SITE_SERVER_NAMES=' "$ENV_FILE" 2>/dev/null; then
    if ! grep -q "$DOMAIN" "$ENV_FILE"; then
      # shellcheck disable=SC2016
      sed -i "s|^SITE_SERVER_NAMES=\"\(.*\)\"|SITE_SERVER_NAMES=\"\1 $DOMAIN www.$DOMAIN\"|" "$ENV_FILE" || true
      sed -i "s|^SITE_SERVER_NAMES=\([^\"].*\)|SITE_SERVER_NAMES=\1 $DOMAIN www.$DOMAIN|" "$ENV_FILE" || true
    fi
  else
    echo "SITE_SERVER_NAMES=\"pisster.com www.pisster.com fbbtube.com www.fbbtube.com sharlila.com www.sharlila.com admin.$ADMIN_BASE_DOMAIN $DOMAIN www.$DOMAIN\"" >> "$ENV_FILE"
  fi
  if grep -q '^NETWORK_REFERERS=' "$ENV_FILE" 2>/dev/null; then
    if ! grep -q "$DOMAIN" <<<"$(grep '^NETWORK_REFERERS=' "$ENV_FILE")"; then
      sed -i "s|^NETWORK_REFERERS=\"\(.*\)\"|NETWORK_REFERERS=\"\1 $DOMAIN *.$DOMAIN\"|" "$ENV_FILE" || true
    fi
  else
    echo "NETWORK_REFERERS=\"pisster.com *.pisster.com fbbtube.com *.fbbtube.com sharlila.com *.sharlila.com $DOMAIN *.$DOMAIN\"" >> "$ENV_FILE"
  fi
fi

echo ""
echo "==> Caddy: add '$DOMAIN, www.$DOMAIN' to the network site block in $CADDYFILE"
echo "    (keep $CDN_DOMAIN and admin.$ADMIN_BASE_DOMAIN; do not add admin.$DOMAIN)"
echo "    Then:"
echo "      docker exec chiro-caddy-1 caddy validate --config /etc/caddy/Caddyfile"
echo "      docker exec chiro-caddy-1 caddy reload   --config /etc/caddy/Caddyfile"

echo ""
echo "==> Recreate edge nginx so SITE_SERVER_NAMES / NETWORK_REFERERS take effect:"
echo "      docker compose up -d nginx"

echo ""
echo "Done (checklist printed). CDN host stays $CDN_DOMAIN."
