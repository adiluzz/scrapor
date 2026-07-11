#!/usr/bin/env bash
# Regenerate public/brand/*-lockup.png from SVG sources.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"

export_one() {
  local SVG="$1"
  local PNG="$2"
  if [[ ! -f "$SVG" ]]; then
    echo "skip missing $SVG" >&2
    return 0
  fi
  if command -v rsvg-convert >/dev/null 2>&1; then
    rsvg-convert -w 1280 -h 400 -o "$PNG" "$SVG"
  elif command -v convert >/dev/null 2>&1; then
    convert -background none "$SVG" -resize 1280x400 "$PNG"
  else
    ffmpeg -y -i "$SVG" -vf "scale=1280:-1" "$PNG"
  fi
  echo "Wrote $PNG"
}

export_one "$ROOT/public/brand/pisster-lockup.svg" "$ROOT/public/brand/pisster-lockup.png"
# fbbtube-lockup.png is the silhouette lockup (not generated from SVG)
export_one "$ROOT/public/brand/sharlila-lockup.svg" "$ROOT/public/brand/sharlila-lockup.png"
