# Image of the app (docs/adr/0001-stack.md): Debian (node:24-slim, Playwright does not support Alpine),
# Next.js `standalone`, runs as the non-root user `node`. Chromium comes with printing (K08).
# Build: docker build -t servisnik .        README, "Nasadenie", has the commands for running it.
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
# TypeScript Node can strip, while a copy of it inside node_modules it refuses to. The packages deleted
# below are the weight of Next.js (300 MB) and migrating does not use them; a script that starts to use
# one fails on its import, which the pre-deploy job reports before the new version goes live.
FROM node:24-slim AS migrate
RUN corepack enable
WORKDIR /migrate
COPY . .
RUN pnpm install --frozen-lockfile --prod --filter "@servisnik/web..." \
 && cd node_modules/.pnpm \
 && rm -rf next@* @next+swc-* @img+* sharp@*

FROM node:24-slim
# Next.js standalone listens on HOSTNAME, which Docker sets to the container id; 0.0.0.0 makes it reachable.
ENV NODE_ENV=production NEXT_TELEMETRY_DISABLED=1 HOSTNAME=0.0.0.0 PORT=3000
COPY --from=build --chown=node:node /repo/apps/web/.next/standalone /app
# The standalone server serves neither .next/static nor public/ itself.
COPY --from=build --chown=node:node /repo/apps/web/.next/static /app/apps/web/.next/static
COPY --from=migrate --chown=node:node /migrate /migrate
USER node
WORKDIR /app/apps/web
EXPOSE 3000
CMD ["node", "server.js"]
