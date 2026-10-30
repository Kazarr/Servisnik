import { randomUUID } from 'node:crypto';
import pg from 'pg';
import { inject } from 'vitest';
import { createDb, type Database } from '../../src/db/index.ts';
import { withDatabase } from './postgres.ts';

/**
 * A fresh database with every migration applied, cloned from the template the global setup
 * prepared. Each test file takes its own, so files do not see each other's rows. A test of a migration asks for
 * `{ migrated: false }`: an empty database, to which it applies the migrations itself.
 */
export async function createTestDb({ migrated = true } = {}): Promise<{ db: Database; close: () => Promise<void> }> {
  const uri = inject('pgUri');
  const name = `t_${randomUUID().replaceAll('-', '')}`;

  const maintenance = new pg.Client({ connectionString: uri });
  await maintenance.connect();
  await maintenance.query(`CREATE DATABASE ${name}${migrated ? ' TEMPLATE migrated' : ''}`);
  await maintenance.end();

  const db = createDb(withDatabase(uri, name));
  // The pool of the app waits 2 s for a connection, so that /api/health answers in time (src/db/index.ts, test/health.test.ts).
  // A test is not a health check: with two `pnpm verify` at once a connection to the container took longer (#134), and the
  // test failed with "Connection terminated due to connection timeout". pg-pool reads the option at every checkout.
  db.$client.options.connectionTimeoutMillis = 30_000;
  return { db, close: () => db.$client.end() };
}
