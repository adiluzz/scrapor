# Assistant Setup (Ollama)

The browser assistant needs **Ollama 0.1.14 or newer** (for the `/api/chat` endpoint).

## Check your version

```bash
ollama --version
```

If you see 0.1.3 or older, upgrade using one of the options below.

## Option 1: Upgrade system Ollama (recommended)

```bash
curl -fsSL https://ollama.com/install.sh | sh
```

Then pull the vision model:

```bash
ollama pull llava
```

## Option 2: Use Docker Ollama

If you can't upgrade system Ollama:

```bash
npm run ollama:docker
```

This starts Ollama in Docker on port 11435. Then add to your `.env`:

```
OLLAMA_BASE_URL=http://127.0.0.1:11435/api
```

Restart the dev server: `npm run dev`

## Verify

```bash
# System Ollama (port 11434)
curl -s http://127.0.0.1:11434/api/tags

# Docker Ollama (port 11435)
curl -s http://127.0.0.1:11435/api/tags
```

Then open http://localhost:3000/assistant (or 3001/3002 if ports are in use) and send a message.

## Quick E2E Test

Once Ollama has a vision model (llava) and Next.js is running:

```bash
npm run test-assistant
# Or with custom prompt:
npm run test-assistant "Go to example.com and describe the page"
```

This opens the assistant UI, sends the prompt, and a browser window will appear showing Ollama controlling it.

**Tip:** If you have system Ollama with llava but an old version (0.1.3), upgrade it to use your existing model immediately:
`curl -fsSL https://ollama.com/install.sh | sh` — then use `OLLAMA_BASE_URL=http://127.0.0.1:11434/api` (no Docker needed).
