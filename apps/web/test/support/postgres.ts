import { PostgreSqlContainer } from '@testcontainers/postgresql';

/** The PostgreSQL 17 container of one run, data on tmpfs. The global setups of Vitest and of Playwright both start it. */
export const startPostgres = () => new PostgreSqlContainer('postgres:17').withTmpFs({ '/var/lib/postgresql/data': 'rw' }).start();

/** `uri` with the database `name` on the same server. */
export function withDatabase(uri: string, name: string) {
  const url = new URL(uri);
  url.pathname = `/${name}`;
  return url.href;
}
