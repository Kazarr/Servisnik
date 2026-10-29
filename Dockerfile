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
# Chromium prints the PDFs of the forms (docs/adr/0001-stack.md). Playwright downloads the headless shell; the
# libraries it links are the list Playwright gives for Chromium on Debian 12 (tools/deploy-config.test.ts reads it
# from the locked playwright-core and fails when this one lacks a name). `playwright install --with-deps` is not
# used: it adds a group of tools too (xvfb, and the Chinese, emoji and unifont fonts), which are most of the weight
# and gave the text of a form a Chinese font. The only font is fonts-liberation (Liberation Sans, with the Slovak
# letters of Latin Extended-A), which is what Arial, the font of the forms, is answered with. This layer sits above
# the code, so that a new commit does not download the browser again, and its version is the one pnpm-lock.yaml
# locks for playwright-core (the test compares them). PLAYWRIGHT_BROWSERS_PATH stays set: it is where the app
# looks for the browser, and every user may read it. The layer ends by removing the apt lists, the whole of /root/.npm
# (the npm cache, its logs and the npx copy of playwright-core) and the compile cache that npx leaves in /tmp, so that
# none of them stays in the image.
ARG PLAYWRIGHT_VERSION=1.64.1
ENV PLAYWRIGHT_BROWSERS_PATH=/ms-playwright
RUN apt-get update \
 && apt-get install -y --no-install-recommends \
    fonts-liberation libfontconfig1 libfreetype6 \
    libasound2 libatk-bridge2.0-0 libatk1.0-0 libatspi2.0-0 libcairo2 libcups2 libdbus-1-3 libdrm2 libgbm1 \
    libglib2.0-0 libnspr4 libnss3 libpango-1.0-0 libx11-6 libxcb1 libxcomposite1 libxdamage1 libxext6 \
    libxfixes3 libxkbcommon0 libxrandr2 \
 && npx --yes playwright-core@${PLAYWRIGHT_VERSION} install --only-shell chromium \
 && apt-get clean \
 && rm -r /root/.npm /tmp/node-compile-cache /var/lib/apt/lists/*
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
