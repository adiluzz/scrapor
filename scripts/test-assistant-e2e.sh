#!/bin/bash
# End-to-end test: Docker Ollama + Next.js + Assistant UI
# Sends a web scraping prompt and verifies Ollama responds.

set -e

# Run from project root
cd "$(dirname "$0")/.."

# Load .env if present
[ -f .env ] && set -a && source .env && set +a

OLLAMA_URL="${OLLAMA_BASE_URL:-http://127.0.0.1:11435/api}"
BASE="${OLLAMA_URL%/api}"  # http://127.0.0.1:11435 for curl $BASE/api/tags
ASSISTANT_PORT="${PORT:-3000}"
TEST_PROMPT="${1:-Go to example.com, take a screenshot, and describe what you see on the page.}"

echo "=== Assistant E2E Test ==="
echo "Ollama: $BASE"
echo "Prompt: $TEST_PROMPT"
echo ""

# 1. Check Ollama is running and has a model
echo "1. Checking Ollama..."
TAGS=$(curl -s "$BASE/api/tags" 2>/dev/null || echo '{"models":[]}')
if echo "$TAGS" | grep -q '"models":\[\]'; then
  echo "   No models found. Pull llava first:"
  echo "   docker exec ollama-assistant ollama pull llava"
  echo ""
  echo "   Or upgrade system Ollama and use port 11434:"
  echo "   curl -fsSL https://ollama.com/install.sh | sh"
  echo "   ollama pull llava"
  echo "   Then set OLLAMA_BASE_URL=http://127.0.0.1:11434/api in .env"
  exit 1
fi
echo "   OK - models available"

# 2. Check Next.js is running
echo ""
echo "2. Checking Next.js..."
for port in 3000 3001 3002; do
  if curl -s -o /dev/null -w "%{http_code}" "http://localhost:$port" 2>/dev/null | grep -q "200\|304"; then
    ASSISTANT_PORT=$port
    echo "   OK - server on port $port"
    break
  fi
done
if ! curl -s -o /dev/null "http://localhost:${ASSISTANT_PORT}/assistant" 2>/dev/null; then
  echo "   Next.js not running. Start with: npm run dev"
  exit 1
fi

# 3. Send prompt via UI
echo ""
echo "3. Opening assistant and sending prompt..."
echo "   A browser will open. Watch the assistant control it."
ASSISTANT_URL="http://localhost:${ASSISTANT_PORT}/assistant" node scripts/send-assistant-prompt.cjs "$TEST_PROMPT"

echo ""
echo "=== Test started. Leave the browser open to observe. ==="
