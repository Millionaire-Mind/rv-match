# Multi-stage build. Two final targets:
#   - `runner` - the lean production web server (Next.js standalone output).
#   - `worker` - runs the video-generation and feed-import workers
#     (scripts/run-video-worker.ts, scripts/run-feed-import.ts), which need
#     `tsx` and other devDependencies the standalone output deliberately
#     prunes, so it's built from the full `builder` stage instead of
#     `runner`. Both targets share the same FFmpeg-equipped base.
#
# Build: docker build --target runner -t rvmatch-app .
#        docker build --target worker -t rvmatch-worker .
# (docker-compose.yml does this for you.)

FROM node:22-bookworm-slim AS base
# ffmpeg/ffprobe: required at runtime by the video-generation pipeline
# (src/server/video/generate.ts, validate.ts). postgresql-client: only
# actually used by the one-shot `migrate` service (docker-compose.yml), to
# apply the local-dev auth stub the same way scripts/db/local-bootstrap.sh
# does outside Docker - installed on the shared base for simplicity rather
# than a third stage.
RUN apt-get update && apt-get install -y --no-install-recommends ffmpeg postgresql-client \
    && rm -rf /var/lib/apt/lists/*
WORKDIR /app

FROM base AS deps
COPY package.json package-lock.json ./
RUN npm ci

FROM base AS builder
COPY --from=deps /app/node_modules ./node_modules
COPY . .
# Placeholder build-time values only - real secrets are supplied at
# container *runtime* via docker-compose's env_file/environment, never
# baked into the image. next build needs *some* value for these to
# complete, but no server code reads them until a request actually comes
# in, well after the real runtime environment has replaced these.
ENV DATABASE_URL="postgres://placeholder:placeholder@localhost:5432/placeholder"
ENV SESSION_SECRET="placeholder-build-time-value-not-used-at-runtime-00000000"
RUN npm run build

# ---- Web server (lean) ----
FROM base AS runner
ENV NODE_ENV=production
RUN groupadd --system --gid 1001 nodejs && useradd --system --uid 1001 --gid nodejs nextjs

COPY --from=builder --chown=nextjs:nodejs /app/public ./public
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static

USER nextjs
EXPOSE 3000
ENV PORT=3000
CMD ["node", "server.js"]

# ---- Video/feed workers (needs the full toolchain, not the pruned standalone output) ----
FROM builder AS worker
ENV NODE_ENV=production
RUN groupadd --system --gid 1001 nodejs && useradd --system --uid 1001 --gid nodejs worker
# Same uid:gid (1001:1001) as the `runner` stage's `nextjs` user, and
# chowned here for the same reason `runner` copies with --chown: whichever
# container (app or video-worker) happens to be first to touch the shared
# `media` named volume is the one that sets its initial ownership, so both
# images need to agree on the same numeric owner or the other one is
# permission-denied writing to it.
RUN mkdir -p /app/public/media && chown -R worker:nodejs /app/public
USER worker
# No default CMD - docker-compose.yml sets `command:` per worker service
# (video-worker vs feed-worker) against this same image.
