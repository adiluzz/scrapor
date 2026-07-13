#!/usr/bin/env bash
# Backfill ThePornDB profile + image for pornstars missing data.
#
# Local docker:
#   ./scripts/backfill-pornstar-tpdb.sh
#   ./scripts/backfill-pornstar-tpdb.sh --backfill-limit 50
#   ./scripts/backfill-pornstar-tpdb.sh --backfill-delay 0.5
#
# On the production host (/opt/pisster):
#   COMPOSE_FILE=docker-compose.yml:docker-compose.vpn.yml \
#     docker compose exec -T worker python worker/worker.py --backfill-tpdb
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

if [[ -f docker-compose.vpn.yml ]]; then
  export COMPOSE_FILE="${COMPOSE_FILE:-docker-compose.yml:docker-compose.vpn.yml}"
fi

exec docker compose exec -T worker python worker/worker.py --backfill-tpdb "$@"
