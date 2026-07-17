# ── deps ──────────────────────────────────────────────────────────────
FROM node:24-slim AS deps
WORKDIR /app
RUN apt-get update && apt-get install -y --no-install-recommends openssl ca-certificates && rm -rf /var/lib/apt/lists/*
COPY package.json package-lock.json* ./
COPY prisma ./prisma
RUN npm ci

# ── builder ───────────────────────────────────────────────────────────
FROM node:24-slim AS builder
WORKDIR /app
RUN apt-get update && apt-get install -y --no-install-recommends openssl ca-certificates && rm -rf /var/lib/apt/lists/*
COPY --from=deps /app/node_modules ./node_modules
COPY . .
# Next.js expects public/; ensure it exists even when the repo has no static assets yet.
RUN mkdir -p public && npx prisma generate && npm run build

# ── runner (Next standalone) ─────────────────────────────────────────
FROM node:24-slim AS runner
WORKDIR /app
ENV NODE_ENV=production
# ffmpeg: admin video-editor clip extract for large library files (OpenReel)
RUN apt-get update && apt-get install -y --no-install-recommends openssl ca-certificates ffmpeg && rm -rf /var/lib/apt/lists/*

COPY --from=builder /app/public ./public
COPY --from=builder /app/.next/standalone ./
COPY --from=builder /app/.next/static ./.next/static
# Keep schema + migrations available for reference / init container.
COPY --from=builder /app/prisma ./prisma

EXPOSE 3000
# Bind on all interfaces via Next standalone's default (0.0.0.0) when HOSTNAME
# is unset. Do NOT set HOSTNAME=0.0.0.0 — Auth.js/Next then build absolute
# URLs as https://0.0.0.0:3000/... and login redirects break behind the proxy.
ENV PORT=3000
CMD ["node", "server.js"]
