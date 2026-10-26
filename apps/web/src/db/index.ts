import { drizzle } from 'drizzle-orm/node-postgres';
import pg from 'pg';
import { appEnv } from '../env.ts';
import * as schema from './schema.ts';

export type Database = ReturnType<typeof createDb>;

// pg waits forever for a host that neither refuses nor answers, and /api/health must answer well
// inside a platform health-check timeout.
const connectionTimeoutMillis = 2000;

/**
 * The app, `db:migrate` and `db:seed` all connect here. `ca` is the PEM of the CA that signed the
 * database's certificate (DigitalOcean signs its databases with its own, `DATABASE_CA_CERT`); with it
 * the connection is verified against that CA. pg lets the URL's `sslmode` win over the `ssl` option
 * (`require` means "verify against the system CAs"), so the URL is handed over without it.
 */
export function createDb(connectionString: string, ca = process.env.DATABASE_CA_CERT) {
  const options = ca ? { connectionString: withoutSslmode(connectionString), ssl: { ca } } : { connectionString };
  return drizzle(new pg.Pool({ ...options, connectionTimeoutMillis }), { schema });
}

function withoutSslmode(connectionString: string) {
  const url = new URL(connectionString);
  url.searchParams.delete('sslmode');
  return url.toString();
}

// One pool per process; the global survives dev-server module reloads.
const shared = globalThis as { servisnikDb?: Database };

/** The app's database, created on first use so that importing it needs no environment. */
export const getDb = () => (shared.servisnikDb ??= createDb(appEnv().DATABASE_URL));
