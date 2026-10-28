import { eq, sql } from 'drizzle-orm';
import { afterAll, beforeAll, beforeEach, expect, test } from 'vitest';
import { createAuth } from '../src/auth.ts';
import { createUser, getUser, listUsers } from '../src/dal/users.ts';
import { account, user } from '../src/db/schema.ts';
import { admin } from './support/dal-users.ts';
import { createTestDb } from './support/db.ts';

// Používatelia in Nastavenia: the list and the creation of one, on the real Better Auth (admin plugin) and PostgreSQL.
// Who may do it is the table in dal-access.test.ts.

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

const create = (input: Partial<Parameters<typeof createUser>[1]> = {}) =>
  createUser(admin, { name: 'Ján Novák', email: 'jan@autoservis.test', role: 'mechanik', password, ...input }, auth);

const signIn = (email: string, withPassword = password) => auth.api.signInEmail({ body: { email, password: withPassword } });

/** What the table `column` of `table` is, or undefined when there is no such column. */
async function columnOf(table: string, column: string) {
  const { rows } = await ctx.db.execute<{ udt_name: string; is_nullable: string; column_default: string | null }>(
    sql`select udt_name, is_nullable, column_default from information_schema.columns where table_name = ${table} and column_name = ${column}`,
  );
  return rows[0];
}

test('the admin plugin has its columns: banned, ban_reason and ban_expires on the user, impersonated_by on the session, and the role is still an enum', async () => {
  expect(await columnOf('user', 'banned')).toMatchObject({ udt_name: 'bool', is_nullable: 'NO', column_default: 'false' });
  expect(await columnOf('user', 'ban_reason')).toMatchObject({ udt_name: 'text', is_nullable: 'YES' });
  expect(await columnOf('user', 'ban_expires')).toMatchObject({ udt_name: 'timestamptz', is_nullable: 'YES' });
  expect(await columnOf('session', 'impersonated_by')).toMatchObject({ udt_name: 'text', is_nullable: 'YES' });
  expect(await columnOf('user', 'role')).toMatchObject({ udt_name: 'role', is_nullable: 'NO', column_default: "'mechanik'::role" });
});

test.each(['mechanik', 'admin'] as const)('the admin creates a %s, who signs in with the password given and has that Rola', async (role) => {
  const created = await create({ role });

  expect(created).toEqual({ ok: true, id: expect.any(String) }); // the password is not given back
  const { user: signedIn } = await signIn('jan@autoservis.test');
  expect(signedIn).toMatchObject({ id: created.ok && created.id, name: 'Ján Novák', email: 'jan@autoservis.test', role });
});

test('a user created through Better Auth with no Rola is a mechanik, the least privilege', async () => {
  const { user: made } = await auth.api.createUser({ body: { email: 'bez-roly@autoservis.test', name: 'Bez roly', password } });

  expect(made.role).toBe('mechanik');
});

test('the e-mail is stored in lower case and the password only as a hash', async () => {
  await create({ email: ' Jan.Novak@AutoServis.TEST ' });

  const [stored] = await ctx.db.select({ email: user.email }).from(user);
  expect(stored).toEqual({ email: 'jan.novak@autoservis.test' });
  const [credential] = await ctx.db.select({ password: account.password }).from(account);
  expect(credential!.password).toMatch(/^[0-9a-f]+:[0-9a-f]+$/); // salt:hash
  expect(credential!.password).not.toContain(password);
  await expect(signIn('jan.novak@autoservis.test')).resolves.toBeDefined();
});

test.each([
  ['the same', 'jan@autoservis.test'],
  ['one that differs only in case', 'JAN@Autoservis.test'],
])('an e-mail that another user has is refused, %s, and nothing is created', async (_name, email) => {
  await create({ name: 'Prvý' });

  expect(await create({ name: 'Druhý', email, role: 'admin' })).toEqual({ ok: false, errors: { email: 'taken' } });

  expect((await listUsers(admin, ctx.db)).map(({ name, role }) => ({ name, role }))).toEqual([{ name: 'Prvý', role: 'mechanik' }]);
  expect(await ctx.db.$count(account)).toBe(1);
});

test.each([
  ['7 characters is too short', '1234567', 'tooShort'],
  ['an empty password is too short', '', 'tooShort'],
  ['129 characters is too long', 'a'.repeat(129), 'tooLong'],
] as const)('a password of %s: refused with the reason, and nothing is created', async (_name, tooBad, reason) => {
  expect(await create({ password: tooBad })).toEqual({ ok: false, errors: { password: reason } });

  expect(await ctx.db.$count(user)).toBe(0);
  expect(await ctx.db.$count(account)).toBe(0);
});

test.each([8, 128])('a password of %i characters is accepted and signs in', async (length) => {
  const chosen = 'x'.repeat(length);

  expect(await create({ password: chosen })).toMatchObject({ ok: true });

  await expect(signIn('jan@autoservis.test', chosen)).resolves.toBeDefined();
});

test('a user that breaks several rules is refused with every reason, and nothing is created', async () => {
  const result = await create({ name: ' ', email: 'nie-je-email', role: 'superuser', password: '1' });

  expect(result).toEqual({ ok: false, errors: { name: 'required', email: 'format', role: 'invalid', password: 'tooShort' } });
  expect(await ctx.db.$count(user)).toBe(0);
});

test('an e-mail of the shape of ours that Better Auth does not take is refused as a wrong format, not as a server error', async () => {
  expect(await create({ email: 'jan@autoservis.t' })).toMatchObject({ ok: false, errors: { email: 'format' } });
  expect(await ctx.db.$count(user)).toBe(0);
});

test('the list is ordered by name, the Slovak way, and holds the name, e-mail, Rola and state of each user, and nothing else', async () => {
  for (const name of ['Zuzana', 'Štefan', 'adam', 'Branislav', 'Cyril']) {
    await create({ name, email: `${name.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase()}@autoservis.test`, role: name === 'Zuzana' ? 'admin' : 'mechanik' });
  }
  await ctx.db.update(user).set({ banned: true, banReason: 'No reason' }).where(eq(user.name, 'Cyril'));

  const listed = await listUsers(admin, ctx.db);

  expect(listed.map(({ name }) => name)).toEqual(['adam', 'Branislav', 'Cyril', 'Štefan', 'Zuzana']);
  expect(listed.find(({ name }) => name === 'Cyril')).toEqual({ id: expect.any(String), name: 'Cyril', email: 'cyril@autoservis.test', role: 'mechanik', banned: true });
  expect(listed.find(({ name }) => name === 'Zuzana')).toEqual({ id: expect.any(String), name: 'Zuzana', email: 'zuzana@autoservis.test', role: 'admin', banned: false });
});

test('one user is read by his id, with what the list shows of him, and an id nobody has gives none', async () => {
  const created = await create({ name: 'Cyril', email: 'cyril@autoservis.test' });
  await ctx.db.update(user).set({ banned: true, banReason: 'No reason' }).where(eq(user.name, 'Cyril'));

  expect(await getUser(admin, created.ok ? created.id : '', ctx.db)).toEqual({
    id: created.ok && created.id,
    name: 'Cyril',
    email: 'cyril@autoservis.test',
    role: 'mechanik',
    banned: true,
  });
  expect(await getUser(admin, 'nikto', ctx.db)).toBeNull();
});
