# syntax=docker/dockerfile:1.7
# Build from the REPO ROOT:  docker build -f apps/web/Dockerfile -t template-web .
#
# Runtime is nginx: it serves the static SPA and reverse-proxies /api + /health to
# the BFF. Point it at your BFF with the BFF_UPSTREAM env var (default http://bff:3001).

# ---- builder: install all deps + build the static SPA ----
FROM node:22-alpine AS builder
ENV PNPM_HOME=/pnpm PATH=/pnpm:$PATH CI=true
# Resilient package fetches (slow/flaky registry mirrors, CI runners).
ENV npm_config_fetch_timeout=600000 \
    npm_config_fetch_retries=5 \
    npm_config_fetch_retry_maxtimeout=120000
# git is required by the root `prepare` script (vp config sets up git hooks).
RUN apk add --no-cache git && corepack enable
WORKDIR /repo

# Copy manifests first so the install layer is cached until a manifest changes.
# Copy every workspace manifest so the install matches the lockfile's importers.
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
RUN --mount=type=cache,id=pnpm,target=/pnpm/store pnpm install --frozen-lockfile

COPY . .
RUN pnpm --filter web run build

# ---- runtime: nginx serving the static build + reverse proxy ----
FROM nginx:1.27-alpine AS runtime
ENV BFF_UPSTREAM=http://bff:3001
# The base image entrypoint runs envsubst on /etc/nginx/templates/*.template at start,
# substituting only variables present in the environment (so $host etc. are preserved).
COPY apps/web/deploy/nginx.conf.template /etc/nginx/templates/default.conf.template
COPY --from=builder /repo/apps/web/dist /usr/share/nginx/html
EXPOSE 80
