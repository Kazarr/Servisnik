import { APIError } from 'better-auth/api';
import { eq } from 'drizzle-orm';
import { afterEach, beforeEach, expect, test } from 'vitest';
import { createAuth } from '../src/auth.ts';
import { user } from '../src/db/schema.ts';
import { seedAdmin } from '../src/seed.ts';
import { createTestDb } from './support/db.ts';

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
  const { headers } = await auth.api.signInEmail({ body: { email, password: 'prve-heslo-1234' }, returnHeaders: true });
  const inApp = new Headers({ cookie: headers.getSetCookie().map((c) => c.split(';')[0]).join('; ') });
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
