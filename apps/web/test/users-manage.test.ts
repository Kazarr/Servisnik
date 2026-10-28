import type { Role } from '@servisnik/domain/access';
import { eq, sql } from 'drizzle-orm';
import { afterAll, beforeAll, beforeEach, expect, test } from 'vitest';
import { createAuth } from '../src/auth.ts';
import { ForbiddenError, requireUser } from '../src/dal/user.ts';
import { listUsers, updateUser } from '../src/dal/users.ts';
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
/** A Používateľ of its own with this Rola, signed in: his id, e-mail, the headers of his session and the user the DAL gets from them. */
async function newUser(role: Role) {
  const email = `uzivatel${++counter}@autoservis.test`;
  const name = `Používateľ ${counter}`;
  const id = await seedUser(ctx.db, { email, password, role, name });
  const headers = await signInHeaders(auth, email, password);
  return { id, name, email, headers, user: await requireUser(headers, auth) };
}

type Account = Awaited<ReturnType<typeof newUser>>;
const rowOf = async (id: string) => (await ctx.db.select({ name: user.name, email: user.email, role: user.role }).from(user).where(eq(user.id, id)))[0];

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

const edit = (by: Account, targetId: string, input: { name?: string; email?: string; role?: string }) =>
  updateUser(by.user, by.headers, targetId, { name: 'Ján Nový', email: 'jan.novy@autoservis.test', ...input }, auth);

test('the admin changes the name, e-mail and Rola of another user, and the e-mail is kept in lower case', async () => {
  const boss = await newUser('admin');
  const worker = await newUser('mechanik');

  expect(await edit(boss, worker.id, { name: ' Ján Nový ', email: ' Jan.Novy@AutoServis.TEST ', role: 'admin' })).toEqual({ ok: true });

  expect(await rowOf(worker.id)).toEqual({ name: 'Ján Nový', email: 'jan.novy@autoservis.test', role: 'admin' });
  // His password is the same, his e-mail the new one.
  await expect(auth.api.signInEmail({ body: { email: 'jan.novy@autoservis.test', password } })).resolves.toBeDefined();
});

test('the admin takes the Rola admin from another admin', async () => {
  const boss = await newUser('admin');
  const other = await newUser('admin');

  expect(await edit(boss, other.id, { role: 'mechanik' })).toEqual({ ok: true });

  expect((await rowOf(other.id))!.role).toBe('mechanik');
});

test('an edit without a role changes the name and e-mail and leaves the Rola', async () => {
  const boss = await newUser('admin');
  const other = await newUser('admin');

  expect(await edit(boss, other.id, {})).toEqual({ ok: true });

  expect(await rowOf(other.id)).toEqual({ name: 'Ján Nový', email: 'jan.novy@autoservis.test', role: 'admin' });
});

test.each([
  ['the same', (email: string) => email],
  ['one that differs only in case', (email: string) => email.toUpperCase()],
])('an e-mail that another user has is refused, %s, and nothing of the edit is saved', async (_name, spelled) => {
  const boss = await newUser('admin');
  const worker = await newUser('mechanik');
  const other = await newUser('mechanik');

  expect(await edit(boss, worker.id, { name: 'Iné meno', email: spelled(other.email) })).toEqual({ ok: false, errors: { email: 'taken' } });

  expect(await rowOf(worker.id)).toEqual({ name: worker.name, email: worker.email, role: 'mechanik' });
});

test('a user keeps his e-mail when only his name changes, and that is not "taken"', async () => {
  const boss = await newUser('admin');
  const worker = await newUser('mechanik');

  expect(await edit(boss, worker.id, { name: 'Prepísané meno', email: worker.email.toUpperCase() })).toEqual({ ok: true });

  expect(await rowOf(worker.id)).toEqual({ name: 'Prepísané meno', email: worker.email, role: 'mechanik' });
});

test('an edit that breaks several rules is refused with every reason, and nothing is saved', async () => {
  const boss = await newUser('admin');
  const worker = await newUser('mechanik');

  expect(await edit(boss, worker.id, { name: ' ', email: 'nie-je-email', role: 'superuser' })).toEqual({
    ok: false,
    errors: { name: 'required', email: 'format', role: 'invalid' },
  });

  expect(await rowOf(worker.id)).toEqual({ name: worker.name, email: worker.email, role: 'mechanik' });
});

test('an e-mail of the shape of ours that Better Auth does not take is refused as a wrong format, not as a server error', async () => {
  const boss = await newUser('admin');
  const worker = await newUser('mechanik');

  expect(await edit(boss, worker.id, { email: 'jan@autoservis.t' })).toEqual({ ok: false, errors: { email: 'format' } });

  expect((await rowOf(worker.id))!.email).toBe(worker.email);
});

test('two edits to the same e-mail at once save one and tell the other it is taken, not a server error', async () => {
  const boss = await newUser('admin');
  const first = await newUser('mechanik');
  const second = await newUser('mechanik');

  const results = await Promise.all([first, second].map((worker) => edit(boss, worker.id, { email: 'spolu@autoservis.test' })));

  expect(results.filter((result) => result.ok)).toHaveLength(1);
  expect(results.filter((result) => !result.ok)).toEqual([{ ok: false, errors: { email: 'taken' } }]);
});

test('the Rola counts from the next request of the user whose Rola changed, with the cookie he already has', async () => {
  const boss = await newUser('admin');
  const worker = await newUser('mechanik');
  await expect(listUsers(await requireUser(worker.headers, auth), ctx.db)).rejects.toBeInstanceOf(ForbiddenError);

  await edit(boss, worker.id, { role: 'admin' });
  const promoted = await requireUser(worker.headers, auth);

  expect(promoted.role).toBe('admin');
  expect(await listUsers(promoted, ctx.db)).toHaveLength(2); // what an admin may do

  await edit(boss, worker.id, { role: 'mechanik' });
  await expect(listUsers(await requireUser(worker.headers, auth), ctx.db)).rejects.toBeInstanceOf(ForbiddenError);
});

test('the admin changes his own name and e-mail, and may send his own Rola as it is', async () => {
  const boss = await newUser('admin');

  expect(await edit(boss, boss.id, { role: 'admin' })).toEqual({ ok: true });

  expect(await rowOf(boss.id)).toEqual({ name: 'Ján Nový', email: 'jan.novy@autoservis.test', role: 'admin' });
});

test('the admin does not change his own Rola, and nothing of that edit is saved, so an active admin is always left', async () => {
  const boss = await newUser('admin');

  expect(await edit(boss, boss.id, { name: 'Iné meno', role: 'mechanik' })).toEqual({ ok: false, errors: { role: 'own' } });

  expect(await rowOf(boss.id)).toEqual({ name: boss.name, email: boss.email, role: 'admin' });
});
