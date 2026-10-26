import type { TestProject } from 'vitest/node';
import { createDb } from '../../src/db/index.ts';
import { migrateDatabase } from '../../src/db/migrate.ts';
import { startPostgres, withDatabase } from './postgres.ts';

declare module 'vitest' {
  export interface ProvidedContext {
    /** Connection URI of the one PostgreSQL 17 container of this run; see createTestDb. */
    pgUri: string;
  }
}

/** One PostgreSQL 17 container per run, with a template database that has every migration applied. */
export default async function setup(project: TestProject) {
  const container = await startPostgres();
  const uri = container.getConnectionUri();

  const maintenance = createDb(uri);
  await maintenance.execute('CREATE DATABASE migrated');
  await maintenance.$client.end();

  const migrated = createDb(withDatabase(uri, 'migrated'));
  await migrateDatabase(migrated);
  await migrated.$client.end();

  project.provide('pgUri', uri);
  return () => container.stop();
}
