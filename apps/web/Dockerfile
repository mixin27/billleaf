# syntax=docker/dockerfile:1.7
# Build context: repository root.  docker build -f apps/web/Dockerfile .
ARG NODE_VERSION=24-alpine
ARG PNPM_VERSION=11.25.0

FROM node:${NODE_VERSION} AS base
ARG PNPM_VERSION
RUN npm install -g pnpm@${PNPM_VERSION} turbo@2
ENV PNPM_HOME=/pnpm CI=true NEXT_TELEMETRY_DISABLED=1

FROM base AS pruner
WORKDIR /repo
COPY . .
RUN turbo prune web --docker

FROM base AS builder
WORKDIR /repo
COPY --from=pruner /repo/out/json/ .
RUN --mount=type=cache,id=pnpm,target=/pnpm/store pnpm install --frozen-lockfile
COPY --from=pruner /repo/out/full/ .
# NEXT_PUBLIC_* values are inlined at build time.
# One web image per environment (URLs differ), so CI builds it per target.
ARG NEXT_PUBLIC_API_URL
ARG NEXT_PUBLIC_APP_URL
ARG NEXT_PUBLIC_SENTRY_DSN=""
ARG NEXT_PUBLIC_SENTRY_ENVIRONMENT=""
ARG NEXT_PUBLIC_SUPPORT_EMAIL=""
ENV NEXT_PUBLIC_API_URL=${NEXT_PUBLIC_API_URL} \
    NEXT_PUBLIC_APP_URL=${NEXT_PUBLIC_APP_URL} \
    NEXT_PUBLIC_SENTRY_DSN=${NEXT_PUBLIC_SENTRY_DSN} \
    NEXT_PUBLIC_SENTRY_ENVIRONMENT=${NEXT_PUBLIC_SENTRY_ENVIRONMENT} \
    NEXT_PUBLIC_SUPPORT_EMAIL=${NEXT_PUBLIC_SUPPORT_EMAIL}
RUN pnpm turbo build --filter=web...

FROM node:${NODE_VERSION} AS runner
WORKDIR /app
# Git sha of the build, shown by /healthz (the smoke test checks it).
ARG APP_VERSION=dev
ENV NODE_ENV=production PORT=3000 HOSTNAME=0.0.0.0 NEXT_TELEMETRY_DISABLED=1 APP_VERSION=${APP_VERSION}
RUN addgroup -S app && adduser -S app -G app
# Standalone output keeps the monorepo layout: server lives at apps/web/server.js
COPY --from=builder --chown=app:app /repo/apps/web/.next/standalone ./
COPY --from=builder --chown=app:app /repo/apps/web/.next/static ./apps/web/.next/static
COPY --from=builder --chown=app:app /repo/apps/web/public ./apps/web/public
USER app
EXPOSE 3000
HEALTHCHECK --interval=15s --timeout=3s --retries=5 CMD wget -qO- http://127.0.0.1:3000/healthz || exit 1
CMD ["node", "apps/web/server.js"]
