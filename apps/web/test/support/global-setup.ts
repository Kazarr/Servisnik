import { PostgreSqlContainer } from '@testcontainers/postgresql';
import type { TestProject } from 'vitest/node';
import { createDb } from '../../src/db/index.ts';
import { migrateDatabase } from '../../src/db/migrate.ts';

declare module 'vitest' {
  export interface ProvidedContext {
    /** Connection URI of the one PostgreSQL 17 container of this run; see createTestDb. */
    pgUri: string;
  }
}

/** One PostgreSQL 17 container per run, with a template database that has every migration applied. */
export default async function setup(project: TestProject) {
  const container = await new PostgreSqlContainer('postgres:17')
    .withTmpFs({ '/var/lib/postgresql/data': 'rw' })
    .start();
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

function withDatabase(uri: string, name: string) {
  const url = new URL(uri);
  url.pathname = `/${name}`;
  return url.href;
}
