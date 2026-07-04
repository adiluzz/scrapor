#!/usr/bin/env bash
# Regenerate public/brand/pisster-lockup.png from the SVG source.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
SVG="$ROOT/public/brand/pisster-lockup.svg"
PNG="$ROOT/public/brand/pisster-lockup.png"

if command -v rsvg-convert >/dev/null 2>&1; then
  rsvg-convert -w 1280 -h 400 -o "$PNG" "$SVG"
else
  ffmpeg -y -i "$SVG" -vf "scale=1280:-1" "$PNG"
fi
echo "Wrote $PNG ($(file -b "$PNG"))"
