import { createDb } from '../src/db/index.ts';
import { migrateDatabase } from '../src/db/migrate.ts';
import { readEnv } from '../src/env.ts';

// `pnpm db:migrate`: applies the SQL migrations in apps/web/drizzle to DATABASE_URL.
// Node runs this file as it is, without a build step, which is why relative imports of
// TypeScript files in apps/web spell out their extension.
try {
  const { DATABASE_URL } = readEnv(process.env, ['DATABASE_URL']);
  const db = createDb(DATABASE_URL);
  await migrateDatabase(db);
  await db.$client.end();
  console.log('Migrácie sú aplikované.');
} catch (error) {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
}
