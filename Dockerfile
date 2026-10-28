# Image of the app (docs/adr/0001-stack.md): Debian (node:24-slim, Playwright does not support Alpine),
# Next.js `standalone`, runs as the non-root user `node`. Chromium comes with printing (K08).
# Build: docker build -t servisnik .        README, "Nasadenie", has the commands for running it.
# The deploy workflow adds --build-arg GIT_SHA=<commit>: /api/health reports it and the smoke compares it.
FROM node:24-slim AS build
ENV NEXT_TELEMETRY_DISABLED=1
RUN corepack enable
WORKDIR /repo
COPY . .
RUN pnpm install --frozen-lockfile
RUN pnpm --filter @servisnik/web build

# The migration (`node /migrate/apps/web/scripts/migrate.ts`, the App Spec's pre-deploy job) and the admin
# seed need drizzle-orm, pg and the SQL migrations, which the standalone output does not carry. They run
# from their own production install of the workspace: its links point at the real packages/domain, whose
# TypeScript Node can strip, while a copy of it inside node_modules it refuses to. tools/prune-migrate.sh
# deletes the weight of Next.js (300 MB) from it, which migrating does not use; a script that starts to use
# a package it deleted fails on its import, which the pre-deploy job reports before the new version goes live.
FROM node:24-slim AS migrate
RUN corepack enable
WORKDIR /migrate
COPY . .
RUN pnpm install --frozen-lockfile --prod --filter "@servisnik/web..." \
 && sh tools/prune-migrate.sh node_modules/.pnpm

FROM node:24-slim
# Next.js standalone listens on HOSTNAME, which Docker sets to the container id; 0.0.0.0 makes it reachable.
ENV NODE_ENV=production NEXT_TELEMETRY_DISABLED=1 HOSTNAME=0.0.0.0 PORT=3000
# Chromium prints the PDFs of the forms (docs/adr/0001-stack.md). Playwright installs the headless browser and the
# libraries it needs; fonts-liberation adds the fonts, which cover the Slovak letters (Latin Extended-A). This layer
# sits above the code, so that a new commit does not download the browser again, and its version is the one pnpm-lock.yaml
# locks for playwright-core (tools/deploy-config.test.ts compares them). PLAYWRIGHT_BROWSERS_PATH stays set: it is where
# the app looks for the browser, and every user may read it.
ARG PLAYWRIGHT_VERSION=1.64.1
ENV PLAYWRIGHT_BROWSERS_PATH=/ms-playwright
RUN npx --yes playwright-core@${PLAYWRIGHT_VERSION} install --with-deps --only-shell chromium \
 && apt-get install -y --no-install-recommends fonts-liberation \
 && apt-get clean \
 && npm cache clean --force \
 && rm -r /var/lib/apt/lists/*
# The code belongs to root: the user that runs it cannot change it. Only .next/cache is writable.
COPY --from=build /repo/apps/web/.next/standalone /app
# The standalone server does not serve .next/static itself.
COPY --from=build /repo/apps/web/.next/static /app/apps/web/.next/static
RUN mkdir -p /app/apps/web/.next/cache && chown node:node /app/apps/web/.next/cache
# /migrate is only what migrate.ts and seed.ts import (tools/deploy-config.test.ts follows their imports) and
# what Node and the migrator read beside them: the links to the dependencies, package.json, the SQL files.
COPY --from=migrate /migrate/node_modules /migrate/node_modules
COPY --from=migrate /migrate/packages/domain /migrate/packages/domain
COPY --from=migrate /migrate/apps/web/node_modules /migrate/apps/web/node_modules
COPY --from=migrate /migrate/apps/web/package.json /migrate/apps/web/package.json
COPY --from=migrate /migrate/apps/web/drizzle /migrate/apps/web/drizzle
COPY --from=migrate /migrate/apps/web/scripts /migrate/apps/web/scripts
COPY --from=migrate /migrate/apps/web/src/db /migrate/apps/web/src/db
COPY --from=migrate /migrate/apps/web/src/env.ts /migrate/apps/web/src/print-error.ts /migrate/apps/web/src/seed.ts /migrate/apps/web/src/
# Last, so that a new GIT_SHA invalidates no cached layer above it.
ARG GIT_SHA=
ENV GIT_SHA=$GIT_SHA
USER node
WORKDIR /app/apps/web
EXPOSE 3000
CMD ["node", "server.js"]
