import type { FullConfig } from '@playwright/test';
import { execFileSync, spawn } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { cpSync } from 'node:fs';
import { createRequire } from 'node:module';
import { join } from 'node:path';
import { createDb } from '../src/db/index.ts';
import { migrateDatabase } from '../src/db/migrate.ts';
import { seedAdmin } from '../src/seed.ts';
import { startPostgres } from '../test/support/postgres.ts';
import { unexpectedStderr } from './server-stderr.ts';

const appDir = join(import.meta.dirname, '..');

/**
 * Batch tier: a fresh PostgreSQL 17 container with every migration and the seeded admin, the
 * production build of the app (the standalone server that ships) on top of it, and a check at the
 * end that the server wrote nothing to stderr.
 */
export default async function globalSetup(config: FullConfig) {
  const baseURL = new URL(config.projects[0]!.use.baseURL!);

  const container = await startPostgres();
  const databaseUrl = container.getConnectionUri();
  process.env.E2E_DATABASE_URL = databaseUrl; // specs create users and records straight in the database
  const db = createDb(databaseUrl);
  await migrateDatabase(db);
  const adminPassword = randomBytes(12).toString('base64url');
  process.env.E2E_ADMIN_EMAIL = 'admin@autoservis.test';
  process.env.E2E_ADMIN_PASSWORD = adminPassword;
  await seedAdmin(db, { email: process.env.E2E_ADMIN_EMAIL, password: adminPassword });
  await db.$client.end();

  const next = createRequire(import.meta.url).resolve('next/dist/bin/next');
  execFileSync(process.execPath, [next, 'build'], { cwd: appDir, stdio: 'inherit', env: { ...process.env, NODE_ENV: 'production' } });
  // The standalone server serves neither static files nor public/ itself; `next build` leaves them beside it.
  const serverDir = join(appDir, '.next/standalone/apps/web');
  cpSync(join(appDir, '.next/static'), join(serverDir, '.next/static'), { recursive: true });
  process.env.E2E_SERVER_DIR = serverDir; // startup.spec.ts starts the same server with a variable missing

  const server = spawn(process.execPath, ['server.js'], {
    cwd: serverDir,
    env: {
      ...process.env,
      NODE_ENV: 'production',
      HOSTNAME: baseURL.hostname,
      PORT: baseURL.port,
      DATABASE_URL: databaseUrl,
      BETTER_AUTH_SECRET: randomBytes(32).toString('base64url'),
      BETTER_AUTH_URL: baseURL.origin,
      CLIENT_IP_HEADER: 'x-forwarded-for', // no proxy here: the specs name their client address themselves (fixtures.ts)
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let stderr = '';
  server.stderr.on('data', (chunk) => (stderr += chunk));
  let exited = false;
  server.on('exit', () => (exited = true));

  const ready = Date.now() + 30_000;
  while (!(await healthy(baseURL))) {
    if (exited || Date.now() > ready) throw new Error(`The app did not start.\n${stderr}`);
    await new Promise((resolve) => setTimeout(resolve, 250));
  }

  return async () => {
    server.kill();
    await container.stop();
    const unexpected = unexpectedStderr(stderr);
    if (unexpected.length > 0) throw new Error(`The app wrote to stderr during the run:\n${unexpected.join('\n')}`);
  };
}

async function healthy(baseURL: URL) {
  try {
    return (await fetch(new URL('/api/health', baseURL))).ok;
  } catch {
    return false;
  }
}
