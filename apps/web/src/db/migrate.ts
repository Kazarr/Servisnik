import { migrate } from 'drizzle-orm/node-postgres/migrator';
import { fileURLToPath } from 'node:url';
import type { Database } from './index.ts';

const migrationsFolder = fileURLToPath(new URL('../../drizzle', import.meta.url));

/** Applies the SQL migrations committed in apps/web/drizzle that the database has not seen yet. */
export const migrateDatabase = (db: Database) => migrate(db, { migrationsFolder });
