import { createDb } from '../src/db/index.ts';
import { readEnv } from '../src/env.ts';
import { printError } from '../src/print-error.ts';
import { seedAdmin } from '../src/seed.ts';

// `pnpm db:seed`: creates the admin from ADMIN_EMAIL and ADMIN_PASSWORD when there is no admin yet; an existing admin is left as he is.
try {
  const { DATABASE_URL, ADMIN_EMAIL, ADMIN_PASSWORD } = readEnv(process.env, ['DATABASE_URL', 'ADMIN_EMAIL', 'ADMIN_PASSWORD']);
  const db = createDb(DATABASE_URL);
  await seedAdmin(db, { email: ADMIN_EMAIL, password: ADMIN_PASSWORD });
  await db.$client.end();
  console.log('Seed hotový, v databáze je admin.');
} catch (error) {
  printError(error);
  process.exitCode = 1;
}
