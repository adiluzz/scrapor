#!/bin/bash
# Start Docker Ollama + Next.js so the Browser Assistant can drive recording.
set -e
cd "$(dirname "$0")/.."

CONTAINER="${OLLAMA_CONTAINER:-ollama-assistant}"
PORT="${OLLAMA_PORT:-11435}"

if docker ps -a --format '{{.Names}}' 2>/dev/null | grep -q "^${CONTAINER}$"; then
  echo "Starting Ollama container: $CONTAINER"
  docker start "$CONTAINER" || true
else
  echo "No container $CONTAINER. Run: npm run ollama:docker"
fi

echo "Checking Ollama on port $PORT..."
if ! curl -sf "http://127.0.0.1:${PORT}/api/tags" >/dev/null; then
  echo "Warning: Ollama not responding on ${PORT}. Set OLLAMA_BASE_URL in .env."
fi

echo "Starting Next.js (open http://localhost:3000/assistant)..."
exec npm run dev
