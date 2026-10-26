import { APIError } from 'better-auth/api';
import { eq } from 'drizzle-orm';
import { afterAll, beforeAll, expect, test } from 'vitest';
import { createAuth } from '../src/auth.ts';
import { user } from '../src/db/schema.ts';
import { seedAdmin } from '../src/seed.ts';
import { createTestDb } from './support/db.ts';

const secret = 'test-secret-test-secret-test-secret-0123';
const email = 'admin@autoservis.test';

let ctx: Awaited<ReturnType<typeof createTestDb>>;
beforeAll(async () => {
  ctx = await createTestDb();
});
afterAll(() => ctx.close());

const signIn = (password: string) =>
  createAuth({ db: ctx.db, secret }).api.signInEmail({ body: { email, password } });

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

test('seeding with a new password replaces the old one', async () => {
  await seedAdmin(ctx.db, { email, password: 'druhe-heslo-5678' });

  await expect(signIn('prve-heslo-1234')).rejects.toBeInstanceOf(APIError);
  await expect(signIn('druhe-heslo-5678')).resolves.toBeDefined();
});

test('seeding gives the admin role back to an existing user', async () => {
  await ctx.db.update(user).set({ role: 'mechanik' }).where(eq(user.email, email));

  await seedAdmin(ctx.db, { email, password: 'druhe-heslo-5678' });

  expect((await signIn('druhe-heslo-5678')).user).toMatchObject({ role: 'admin' });
});
