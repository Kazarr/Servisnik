import { drizzle } from 'drizzle-orm/node-postgres';
import pg from 'pg';
import { appEnv } from '../env.ts';
import * as schema from './schema.ts';

export type Database = ReturnType<typeof createDb>;

export function createDb(connectionString: string) {
  return drizzle(new pg.Pool({ connectionString }), { schema });
}

// One pool per process; the global survives dev-server module reloads.
const shared = globalThis as { servisnikDb?: Database };

/** The app's database, created on first use so that importing it needs no environment. */
export const getDb = () => (shared.servisnikDb ??= createDb(appEnv().DATABASE_URL));
