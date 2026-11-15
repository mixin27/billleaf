# syntax=docker/dockerfile:1.7
# Build context: repository root.  docker build -f apps/api/Dockerfile .
# One image runs three commands: api (default), worker, migrate.
ARG NODE_VERSION=24-alpine
ARG PNPM_VERSION=11.25.0

FROM node:${NODE_VERSION} AS base
ARG PNPM_VERSION
RUN npm install -g pnpm@${PNPM_VERSION} turbo@2
ENV PNPM_HOME=/pnpm CI=true

# 1. Prune the monorepo to the api and its workspace deps
FROM base AS pruner
WORKDIR /repo
COPY . .
RUN turbo prune api --docker

# 2. Install + build
FROM base AS builder
WORKDIR /repo
COPY --from=pruner /repo/out/json/ .
RUN --mount=type=cache,id=pnpm,target=/pnpm/store pnpm install --frozen-lockfile
COPY --from=pruner /repo/out/full/ .
RUN pnpm turbo build --filter=api...
# Self-contained production folder (workspace packages copied in, dev deps dropped)
RUN pnpm --filter api deploy --legacy --prod /prod/api

# 3. Runtime
FROM node:${NODE_VERSION} AS runner
WORKDIR /app
# Git sha of the build, shown by /health/live (the smoke test checks it).
ARG APP_VERSION=dev
ENV NODE_ENV=production PORT=4000 APP_VERSION=${APP_VERSION}
RUN addgroup -S app && adduser -S app -G app
COPY --from=builder --chown=app:app /prod/api ./
USER app
EXPOSE 4000
HEALTHCHECK --interval=15s --timeout=3s --retries=5 CMD wget -qO- http://127.0.0.1:4000/health/live || exit 1
CMD ["node", "--import", "./dist/instrument.js", "dist/main.js"]
