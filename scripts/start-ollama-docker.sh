#!/bin/bash
# Start Ollama in Docker (newer version with /api/chat support).
# Use when system Ollama is too old (< 0.1.14).
# Then set OLLAMA_BASE_URL=http://127.0.0.1:11434/api in .env

set -e
CONTAINER="ollama-assistant"
PORT=11434

if docker ps -a --format '{{.Names}}' | grep -q "^${CONTAINER}$"; then
  EXISTING_PORT="$(docker inspect -f '{{(index (index .HostConfig.PortBindings "11434/tcp") 0).HostPort}}' "$CONTAINER" 2>/dev/null || true)"
  if [ "$EXISTING_PORT" != "$PORT" ]; then
    echo "Recreating container to map host port ${PORT}..."
    docker rm -f "$CONTAINER" >/dev/null 2>&1 || true
    docker run -d --name "$CONTAINER" -p ${PORT}:11434 -v ollama_docker:/root/.ollama ollama/ollama
  else
    echo "Starting existing container..."
    docker start "$CONTAINER"
  fi
else
  echo "Creating new Ollama container..."
  docker run -d --name "$CONTAINER" -p ${PORT}:11434 -v ollama_docker:/root/.ollama ollama/ollama
fi

echo "Waiting for Ollama to be ready..."
for i in {1..30}; do
  if curl -s http://127.0.0.1:${PORT}/api/tags >/dev/null 2>&1; then
    echo "Ollama is ready."
    break
  fi
  sleep 1
done

echo "Pulling llava model (vision, for screenshots)..."
docker exec "$CONTAINER" ollama pull llava

echo ""
echo "Done! Add to your .env:"
echo "  OLLAMA_BASE_URL=http://127.0.0.1:${PORT}/api"
echo ""
echo "Then restart: npm run dev"
