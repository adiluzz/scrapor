#!/usr/bin/env bash
# Regenerate public/brand/pisster-lockup.png from the SVG source (requires ffmpeg + librsvg).
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
SVG="$ROOT/public/brand/pisster-lockup.svg"
PNG="$ROOT/public/brand/pisster-lockup.png"
ffmpeg -y -i "$SVG" -vf "scale=1280:-1" "$PNG"
echo "Wrote $PNG ($(file -b "$PNG"))"
