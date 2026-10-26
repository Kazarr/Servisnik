import pg from 'pg';
import { afterEach, expect, test, vi } from 'vitest';
import { createDb } from '../src/db/index.ts';

// DigitalOcean signs its databases with its own CA. The app, `db:migrate` and `db:seed` all connect
// through createDb, so this is the one place that hands the CA to pg. pg decides what a connection
// verifies when it starts; these tests build the client the way the pool does and read that decision.
const databases: ReturnType<typeof createDb>[] = [];
const connect = (...args: Parameters<typeof createDb>) => {
  const db = createDb(...args);
  databases.push(db);
  return db;
};
afterEach(async () => {
  vi.unstubAllEnvs();
  await Promise.all(databases.splice(0).map((db) => db.$client.end()));
});

type Parameters_ = { ssl: unknown; host: string; port: number; user: string; password: string; database: string; application_name: string };
const parametersOf = (db: ReturnType<typeof createDb>) =>
  (new pg.Client(db.$client.options) as unknown as { connectionParameters: Parameters_ }).connectionParameters;

const ca = '-----BEGIN CERTIFICATE-----\nMIIBfake\n-----END CERTIFICATE-----\n';

test('with a CA the connection is verified against it, although the URL says sslmode=require', () => {
  // On its own, pg lets the URL's sslmode win over the ssl option: `require` means "verify against the
  // system CAs" and DigitalOcean's CA is not among them.
  const db = connect('postgres://doadmin:s3cret@db.example.com:25060/servisnik?sslmode=require', ca);

  expect(parametersOf(db).ssl).toEqual({ ca });
});

test('with a CA the rest of the URL still reaches pg', () => {
  const db = connect('postgres://doadmin:p%40ss%2Fword@db.example.com:25060/servisnik?sslmode=require&application_name=servisnik', ca);

  expect(parametersOf(db)).toMatchObject({
    host: 'db.example.com',
    port: 25060,
    user: 'doadmin',
    password: 'p@ss/word',
    database: 'servisnik',
    application_name: 'servisnik',
  });
});

test('the CA comes from DATABASE_CA_CERT when the caller passes none', () => {
  vi.stubEnv('DATABASE_CA_CERT', ca);

  expect(parametersOf(connect('postgres://u:p@db.example.com:25060/servisnik?sslmode=require')).ssl).toEqual({ ca });
});

test('without a CA the URL is used as it is', () => {
  vi.stubEnv('DATABASE_CA_CERT', '');
  vi.stubEnv('PGSSLMODE', '');
  const url = 'postgres://servisnik:servisnik@localhost:5432/servisnik';

  const db = connect(url);

  expect(db.$client.options.connectionString).toBe(url);
  expect(parametersOf(db).ssl).toBeFalsy();
});
