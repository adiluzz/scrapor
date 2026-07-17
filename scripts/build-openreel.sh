#!/usr/bin/env bash
# Rebuild vendored OpenReel SPA into public/openreel (host bridge + editor UI).
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT/vendor/openreel"

if command -v nvm >/dev/null 2>&1; then
  # shellcheck disable=SC1091
  . ~/.nvm/nvm.sh 2>/dev/null || true
fi

if ! command -v pnpm >/dev/null 2>&1; then
  echo "pnpm is required to build OpenReel" >&2
  exit 1
fi

pnpm install --frozen-lockfile 2>/dev/null || pnpm install
pnpm --filter @openreel/web build || pnpm build

DIST="$ROOT/vendor/openreel/apps/web/dist"
if [[ ! -d "$DIST" ]]; then
  echo "OpenReel dist not found at $DIST" >&2
  exit 1
fi

rm -rf "$ROOT/public/openreel"
mkdir -p "$ROOT/public/openreel"
cp -a "$DIST/." "$ROOT/public/openreel/"
# Allow embedding in admin iframe (Netlify-style _headers is unused by Next).
if [[ -f "$ROOT/public/openreel/_headers" ]]; then
  sed -i '/X-Frame-Options/d' "$ROOT/public/openreel/_headers" || true
fi
echo "Copied OpenReel → public/openreel"
