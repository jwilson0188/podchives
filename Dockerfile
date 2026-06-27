# Background worker image for Podchives.
# Render's native Node runtime can't install system packages (no root), so we
# ship a Docker image with ffmpeg + yt-dlp baked in.
FROM node:20-slim AS base

# System deps:
#   ffmpeg   — audio extraction + chunking + ffprobe (lib/transcription.ts)
#   python3  — required by the yt-dlp zipapp
#   curl/ca  — fetch the yt-dlp release binary
#   unzip    — required by the Deno install script
RUN apt-get update \
  && apt-get install -y --no-install-recommends \
      ffmpeg \
      python3 \
      curl \
      ca-certificates \
      unzip \
  && curl -L https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp \
      -o /usr/local/bin/yt-dlp \
  && chmod a+rx /usr/local/bin/yt-dlp \
  && rm -rf /var/lib/apt/lists/*

# YouTube now requires an external JavaScript runtime to solve its JS
# challenges (n-param / signature). Without one, format availability is
# severely limited for logged-in (cookie) sessions, causing
# "Requested format is not available". Deno is yt-dlp's recommended runtime.
# See https://github.com/yt-dlp/yt-dlp/wiki/EJS
RUN curl -fsSL https://deno.land/install.sh | DENO_INSTALL=/usr/local sh \
  && deno --version

WORKDIR /app

# ── Build stage: dev deps for prisma generate + typecheck only ──────────────
FROM base AS build

COPY package.json package-lock.json ./
RUN npm ci --include=dev --ignore-scripts

COPY . .
RUN npx prisma generate && npx tsc --noEmit

# ── Runtime stage: production deps only (no eslint → no deprecation spam) ───
FROM base AS runner

COPY package.json package-lock.json ./
RUN npm ci --omit=dev --ignore-scripts

COPY --from=build /app/node_modules/.prisma ./node_modules/.prisma
COPY . .

CMD ["npm", "run", "worker"]
