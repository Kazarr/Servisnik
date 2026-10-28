import type { Role } from '@servisnik/domain/access';
import { sql } from 'drizzle-orm';
import { afterAll, beforeAll, beforeEach, expect, test } from 'vitest';
import { createAuth } from '../src/auth.ts';
import { user } from '../src/db/schema.ts';
import { createTestDb } from './support/db.ts';
import { signInHeaders } from './support/sessions.ts';
import { seedUser } from './support/users.ts';

// What an admin does to another Používateľ: edit him, deactivate and activate him, give him a new password.
// On the real Better Auth (admin plugin) and PostgreSQL. Who may do it is the table in dal-access.test.ts.

const secret = 'test-secret-test-secret-test-secret-0123';
const password = 'pociatocne-heslo-1234';

let ctx: Awaited<ReturnType<typeof createTestDb>>;
let auth: ReturnType<typeof createAuth>;
beforeAll(async () => {
  ctx = await createTestDb();
  auth = createAuth({ db: ctx.db, secret });
});
afterAll(() => ctx.close());
// Every test starts without a user.
beforeEach(async () => {
  await ctx.db.execute(sql`truncate "user" cascade`);
});

let counter = 0;
/** A Používateľ of its own with this Rola, signed in: his id, e-mail and the headers of his session. */
async function newUser(role: Role) {
  const email = `uzivatel${++counter}@autoservis.test`;
  const id = await seedUser(ctx.db, { email, password, role, name: `Používateľ ${counter}` });
  return { id, email, headers: await signInHeaders(auth, email, password) };
}

test("Better Auth's own routes give an admin session neither remove, impersonate nor create, and a mechanik session no part of the admin plugin", async () => {
  const boss = await newUser('admin');
  const worker = await newUser('mechanik');
  const refused = (call: Promise<unknown>) => expect(call).rejects.toMatchObject({ statusCode: 403 });

  // The admin: removing and impersonating are not in his role; creating is not either, because the plugin
  // does not check the length of a password it is given there (the DAL does, and creates with no session).
  await refused(auth.api.removeUser({ body: { userId: worker.id }, headers: boss.headers }));
  await refused(auth.api.impersonateUser({ body: { userId: worker.id }, headers: boss.headers }));
  await refused(auth.api.createUser({ body: { name: 'Krátke heslo', email: 'kratke@autoservis.test', password: '1', role: 'admin' }, headers: boss.headers }));
  // The mechanik: nothing.
  await refused(auth.api.banUser({ body: { userId: boss.id }, headers: worker.headers }));
  await refused(auth.api.setUserPassword({ body: { userId: boss.id, newPassword: 'ukradnute-heslo-1' }, headers: worker.headers }));
  await refused(auth.api.setRole({ body: { userId: worker.id, role: 'admin' }, headers: worker.headers }));

  expect(await ctx.db.$count(user)).toBe(2);
  await expect(auth.api.signInEmail({ body: { email: worker.email, password } })).resolves.toBeDefined();
});
