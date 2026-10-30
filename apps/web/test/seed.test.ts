import { APIError } from 'better-auth/api';
import { eq } from 'drizzle-orm';
import { afterEach, beforeEach, expect, test } from 'vitest';
import { createAuth } from '../src/auth.ts';
import { requireUser, UnauthenticatedError } from '../src/dal/user.ts';
import { account, session, user } from '../src/db/schema.ts';
import { seedAdmin } from '../src/seed.ts';
import { createTestDb } from './support/db.ts';
import { signInHeaders } from './support/sessions.ts';
import { signedInUser } from './support/signed-in-user.ts';

const secret = 'test-secret-test-secret-test-secret-0123';
const email = 'admin@autoservis.test';

// A database of its own for each test: whether an admin is there already is what the seed looks at.
let ctx: Awaited<ReturnType<typeof createTestDb>>;
let auth: ReturnType<typeof createAuth>;
beforeEach(async () => {
  ctx = await createTestDb();
  auth = createAuth({ db: ctx.db, secret });
});
afterEach(() => ctx.close());

const signIn = (password: string) => auth.api.signInEmail({ body: { email, password } });

test('seeding creates an admin who signs in with the given e-mail and password', async () => {
  await seedAdmin(ctx.db, { email: 'Admin@Autoservis.test', password: 'prve-heslo-1234' });

  const { user: signedIn } = await signIn('prve-heslo-1234');
  expect(signedIn).toMatchObject({ email, role: 'admin' });
});

test('seeding again with the same input leaves one admin who still signs in', async () => {
  await seedAdmin(ctx.db, { email, password: 'prve-heslo-1234' });
  await seedAdmin(ctx.db, { email, password: 'prve-heslo-1234' });

  expect(await ctx.db.$count(user)).toBe(1);
  await expect(signIn('prve-heslo-1234')).resolves.toBeDefined();
});

test('an admin who changed his password in the app keeps it when the seed runs with ADMIN_PASSWORD again', async () => {
  await seedAdmin(ctx.db, { email, password: 'prve-heslo-1234' });
  const inApp = await signInHeaders(auth, email, 'prve-heslo-1234');
  await auth.api.changePassword({ headers: inApp, body: { currentPassword: 'prve-heslo-1234', newPassword: 'zmenene-heslo-5678' } });

  await seedAdmin(ctx.db, { email, password: 'prve-heslo-1234' });

  await expect(signIn('prve-heslo-1234')).rejects.toBeInstanceOf(APIError);
  await expect(signIn('zmenene-heslo-5678')).resolves.toBeDefined();
});

test('an admin who has another e-mail than ADMIN_EMAIL gets no second admin from the seed', async () => {
  await seedAdmin(ctx.db, { email, password: 'prve-heslo-1234' });
  await ctx.db.update(user).set({ email: 'majitel@autoservis.test' }).where(eq(user.email, email));

  await seedAdmin(ctx.db, { email, password: 'prve-heslo-1234' });

  expect(await ctx.db.$count(user)).toBe(1);
  await expect(signIn('prve-heslo-1234')).rejects.toBeInstanceOf(APIError);
});

test('with no admin left, seeding gives the admin role and the given password to the user with the given e-mail', async () => {
  await seedAdmin(ctx.db, { email, password: 'prve-heslo-1234' });
  await ctx.db.update(user).set({ role: 'mechanik' }).where(eq(user.email, email));

  await seedAdmin(ctx.db, { email, password: 'druhe-heslo-5678' });

  expect((await signIn('druhe-heslo-5678')).user).toMatchObject({ role: 'admin' });
});

test('promoting the user ends the sessions he held: his old cookie opens nothing, though he does not know ADMIN_PASSWORD', async () => {
  await seedAdmin(ctx.db, { email, password: 'prve-heslo-1234' });
  const held = await signInHeaders(auth, email, 'prve-heslo-1234');
  await ctx.db.update(user).set({ role: 'mechanik' }).where(eq(user.email, email));
  await expect(requireUser(held, auth)).resolves.toMatchObject({ role: 'mechanik' });

  await seedAdmin(ctx.db, { email, password: 'druhe-heslo-5678' });

  await expect(requireUser(held, auth)).rejects.toBeInstanceOf(UnauthenticatedError);
  expect(await ctx.db.$count(session)).toBe(0);
});

test('promoting a deactivated user activates him: he signs in with ADMIN_PASSWORD', async () => {
  await seedAdmin(ctx.db, { email, password: 'prve-heslo-1234' });
  await ctx.db
    .update(user)
    .set({ role: 'mechanik', banned: true, banReason: 'odisiel', banExpires: new Date('2099-01-01') })
    .where(eq(user.email, email));
  await expect(signIn('prve-heslo-1234')).rejects.toBeInstanceOf(APIError);

  await seedAdmin(ctx.db, { email, password: 'druhe-heslo-5678' });

  expect((await signIn('druhe-heslo-5678')).user).toMatchObject({ role: 'admin', banned: false });
  expect(await ctx.db.select({ banReason: user.banReason, banExpires: user.banExpires }).from(user)).toEqual([
    { banReason: null, banExpires: null },
  ]);
});

test('promoting the user leaves the sessions of other users alone', async () => {
  await seedAdmin(ctx.db, { email, password: 'prve-heslo-1234' });
  await ctx.db.update(user).set({ role: 'mechanik' }).where(eq(user.email, email));
  const colleague = await signedInUser(ctx.db, auth, 'mechanik', 'kolegovo-heslo-1234');

  await seedAdmin(ctx.db, { email, password: 'druhe-heslo-5678' });

  await expect(requireUser(colleague.headers, auth)).resolves.toMatchObject({ id: colleague.id });
  expect(await ctx.db.$count(session, eq(session.userId, colleague.id))).toBe(1);
});

// All rows of the three tables the seed writes to, in a fixed order, to compare with strict equality.
const authState = async () => ({
  users: await ctx.db.select().from(user).orderBy(user.id),
  accounts: await ctx.db.select().from(account).orderBy(account.id),
  sessions: await ctx.db.select().from(session).orderBy(session.id),
});

test('when every admin is deactivated, seeding fails loudly and changes nothing, though an active mechanik is there', async () => {
  await seedAdmin(ctx.db, { email, password: 'prve-heslo-1234' });
  await signInHeaders(auth, email, 'prve-heslo-1234'); // a session of the admin, who is deactivated after it
  await ctx.db.update(user).set({ banned: true }).where(eq(user.email, email));
  await signedInUser(ctx.db, auth, 'mechanik', 'kolegovo-heslo-1234');
  const before = await authState();
  expect(before.sessions).toHaveLength(2);

  await expect(seedAdmin(ctx.db, { email, password: 'druhe-heslo-5678' })).rejects.toThrow(/deaktivovaní/);

  expect(await authState()).toStrictEqual(before);
});

test('one active admin is enough: a deactivated admin beside him does not make the seed fail', async () => {
  await seedAdmin(ctx.db, { email, password: 'prve-heslo-1234' });
  await ctx.db.insert(user).values({ id: 'druhy-admin', name: 'Druhý', email: 'druhy@autoservis.test', role: 'admin', banned: true });

  await expect(seedAdmin(ctx.db, { email, password: 'prve-heslo-1234' })).resolves.toBeUndefined();
});
