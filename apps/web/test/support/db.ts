import { randomUUID } from 'node:crypto';
import pg from 'pg';
import { inject } from 'vitest';
import { createDb, type Database } from '../../src/db/index.ts';
import { withDatabase } from './postgres.ts';

/**
 * A fresh database with every migration applied, cloned from the template the global setup
 * prepared. Each test file takes its own, so files do not see each other's rows.
 */
export async function createTestDb(): Promise<{ db: Database; close: () => Promise<void> }> {
  const uri = inject('pgUri');
  const name = `t_${randomUUID().replaceAll('-', '')}`;

  const maintenance = new pg.Client({ connectionString: uri });
  await maintenance.connect();
  await maintenance.query(`CREATE DATABASE ${name} TEMPLATE migrated`);
  await maintenance.end();

  const db = createDb(withDatabase(uri, name));
  return { db, close: () => db.$client.end() };
}
