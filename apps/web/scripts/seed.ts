import { createDb } from '../src/db/index.ts';
import { readEnv } from '../src/env.ts';
import { printError } from '../src/print-error.ts';
import { seedAdmin } from '../src/seed.ts';

// `pnpm db:seed`: when there is no admin, creates him from ADMIN_EMAIL and ADMIN_PASSWORD, or makes the user
// with that e-mail an active admin with that password and none of his old sessions; an existing admin is left as he
// is, and when every admin is deactivated it fails (README.md, "Známe obmedzenia").
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
