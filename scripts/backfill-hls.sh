#!/usr/bin/env bash
# Enqueue catalog HLS backfill jobs (videos with MP4 on S3 but no s3HlsMasterKey).
#
#   ./scripts/backfill-hls.sh
#   ./scripts/backfill-hls.sh --seed-hls-backfill-force
#
set -euo pipefail
cd "$(dirname "$0")/.."
exec docker compose exec -T worker python worker/worker.py --seed-hls-backfill "$@"
