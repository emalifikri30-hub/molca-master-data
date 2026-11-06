# syntax=docker/dockerfile:1.7
# Build from the REPO ROOT:  docker build --ssh default -f apps/api/Dockerfile -t template-api .
# (--ssh is required: @molca/mes is a private git+ssh dependency.)
#
# This is the modular-monolith service: it serves both the post and comment
# domains (/api/v1/posts and /api/v1/comments) from a single process and DB.
#
# NOTE: database migrations are NOT run by this image. Run them separately, e.g.
#   pnpm --filter api db:push      (drizzle-kit migrate)
# drizzle-kit is a devDependency, so it is intentionally absent from this prod image.

# ---- builder: install all deps + build the bundle ----
FROM node:22-alpine AS builder
ENV PNPM_HOME=/pnpm PATH=/pnpm:$PATH CI=true
# Resilient package fetches (slow/flaky registry mirrors, CI runners).
ENV npm_config_fetch_timeout=600000 \
  npm_config_fetch_retries=5 \
  npm_config_fetch_retry_maxtimeout=120000
# git is required by the root `prepare` script (vp config sets up git hooks).
# openssh-client fetches @molca/mes over git+ssh; alpine ships without it.
RUN apk add --no-cache git openssh-client && corepack enable
RUN mkdir -p -m 0700 ~/.ssh && ssh-keyscan github.com >> ~/.ssh/known_hosts
WORKDIR /repo

# Copy manifests first so the install layer is cached until a manifest changes.
# All workspace manifests are copied so pnpm links the @molca/* workspace deps.
COPY pnpm-lock.yaml pnpm-workspace.yaml package.json ./
COPY apps/api/package.json                   apps/api/package.json
COPY apps/bff/package.json                   apps/bff/package.json
COPY apps/web/package.json                   apps/web/package.json
COPY packages/contract-client/package.json   packages/contract-client/package.json
COPY packages/helper/package.json            packages/helper/package.json
COPY packages/network/package.json           packages/network/package.json
COPY packages/observability/package.json     packages/observability/package.json
COPY packages/security/package.json          packages/security/package.json
COPY packages/utils/package.json             packages/utils/package.json
RUN --mount=type=ssh --mount=type=cache,id=pnpm,target=/pnpm/store pnpm install --frozen-lockfile

# Build (tsc && vp build -> dist/index.js, with deps externalized).
# `api...` builds api AND its workspace deps (@molca/*) in topological order —
# the app's tsc/bundle needs each dep's built dist (its exports point at dist/).
COPY . .
RUN pnpm --filter "api..." run build
# Produce a self-contained, prod-only node_modules (no symlinks) for the runtime stage.
# --legacy: use the pre-v10 deploy that resolves workspace deps from the store.
RUN --mount=type=ssh --mount=type=cache,id=pnpm,target=/pnpm/store pnpm --filter api deploy --prod --legacy /out

# ---- runtime: slim image with only prod deps + the bundle ----
FROM node:22-alpine AS runtime
ENV NODE_ENV=production PORT=3002
WORKDIR /app
COPY --from=builder /out/node_modules ./node_modules
# dist is gitignored, so it may be omitted by `pnpm deploy` — copy it explicitly.
COPY --from=builder /repo/apps/api/dist ./dist
COPY --from=builder /repo/apps/api/package.json ./package.json
# OTel preload — installs instrumentation hooks before the bundle loads.
COPY --from=builder /repo/apps/api/instrumentation.mjs ./instrumentation.mjs
USER node
EXPOSE 3002
CMD ["node", "--import", "./instrumentation.mjs", "dist/index.js"]
