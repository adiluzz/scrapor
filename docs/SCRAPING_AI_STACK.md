# Scraping AI Automation Stack (Vision-First)

This project is now configured for a vision-first assistant approach.

## Recommended model strategy

For browser scraping agents, best results usually come from this split:

1. **Primary vision+tool model (agent brain)**  
   - Recommended: `Qwen2.5-VL-7B-Instruct` (best quality if you have strong GPU).
   - Local fallback on this machine: `qwen3-vl:2b` in Ollama (already in use).
2. **Fast image description model (optional helper)**  
   - Recommended: `llava:latest` (already configured as image description fallback).
3. **Execution layer**  
   - Playwright-based MCP tools for deterministic browser control.

## Why this stack is best for scraping automation

- **Vision always available** for UI interpretation, popups, and ad overlays.
- **Deterministic tools** (`open`, `navigate`, `click`, `type`) reduce hallucinated actions.
- **Screenshots + click-target extraction** let the model decide where to click with evidence.
- **Video recording support** enables auditability and regression debugging.

## Practical deployment advice

- If you stay local CPU-only, keep model size small (`qwen3-vl:2b`) to avoid long stalls.
- If you can use a GPU machine, move to `Qwen2.5-VL-7B` for better action reliability.
- Keep browser automation tool-first and use pure vision reasoning only when selectors fail.

## Environment variables

Use `.env` values like:

```bash
OLLAMA_BASE_URL=http://127.0.0.1:11435/api
OLLAMA_VISION_MODEL=qwen3-vl:2b
OLLAMA_IMAGE_DESCRIBE_MODEL=llava:latest
```

