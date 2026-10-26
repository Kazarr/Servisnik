import { randomUUID } from 'node:crypto';
import pg from 'pg';
import { inject } from 'vitest';
import { createDb, type Database } from '../../src/db/index.ts';

/**
 * A fresh database with every migration applied, cloned from the template the global setup
 * prepared. Each test file takes its own, so files do not see each other's rows.
 */
export async function createTestDb(): Promise<{ db: Database; close: () => Promise<void> }> {
  const base = new URL(inject('pgUri'));
  const name = `t_${randomUUID().replaceAll('-', '')}`;

  const maintenance = new pg.Client({ connectionString: base.href });
  await maintenance.connect();
  await maintenance.query(`CREATE DATABASE ${name} TEMPLATE migrated`);
  await maintenance.end();

  base.pathname = `/${name}`;
  const db = createDb(base.href);
  return { db, close: () => db.$client.end() };
}
