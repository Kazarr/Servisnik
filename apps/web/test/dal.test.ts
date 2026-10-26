import { APIError } from 'better-auth/api';
import { sql } from 'drizzle-orm';
import { afterAll, beforeAll, expect, test } from 'vitest';
import { createAuth } from '../src/auth.ts';
import { requireUser, UnauthenticatedError } from '../src/dal/user.ts';
import { seedAdmin } from '../src/seed.ts';
import { createTestDb } from './support/db.ts';

const email = 'admin@autoservis.test';
const password = 'spravne-heslo-1234';

let ctx: Awaited<ReturnType<typeof createTestDb>>;
let auth: ReturnType<typeof createAuth>;
beforeAll(async () => {
  ctx = await createTestDb();
  auth = createAuth({ db: ctx.db, secret: 'test-secret-test-secret-test-secret-0123' });
  await seedAdmin(ctx.db, { email, password });
});
afterAll(() => ctx.close());

/** The Cookie header a browser would send after signing in. */
async function signIn() {
  const { headers } = await auth.api.signInEmail({ body: { email, password }, returnHeaders: true });
  const cookie = headers.getSetCookie().map((c) => c.split(';')[0]).join('; ');
  return new Headers({ cookie });
}

test('without a session the DAL rejects', async () => {
  await expect(requireUser(new Headers(), auth)).rejects.toBeInstanceOf(UnauthenticatedError);
});

test('a session cookie the server never issued is rejected', async () => {
  const forged = new Headers({ cookie: 'better-auth.session_token=forged.signature' });
  await expect(requireUser(forged, auth)).rejects.toBeInstanceOf(UnauthenticatedError);
});

test('with a session the DAL returns the signed-in user and role', async () => {
  const requestHeaders = await signIn();
  await expect(requireUser(requestHeaders, auth)).resolves.toMatchObject({ email, role: 'admin' });
});

test('signing out ends the session: the same cookie is rejected afterwards', async () => {
  const requestHeaders = await signIn();
  await expect(requireUser(requestHeaders, auth)).resolves.toBeDefined();

  await auth.api.signOut({ headers: requestHeaders });

  await expect(requireUser(requestHeaders, auth)).rejects.toBeInstanceOf(UnauthenticatedError);
});

test('a session whose role this code does not know is rejected', async () => {
  const requestHeaders = await signIn();
  // A database newer than the code can hold a role this version has never heard of.
  await ctx.db.execute(sql`alter type role add value if not exists 'future_role'`);
  await ctx.db.execute(sql`update "user" set role = 'future_role' where email = ${email}`);

  try {
    await expect(requireUser(requestHeaders, auth)).rejects.toBeInstanceOf(UnauthenticatedError);
  } finally {
    await ctx.db.execute(sql`update "user" set role = 'admin' where email = ${email}`);
  }
});

test('there is no registration', async () => {
  const signUp = auth.api.signUpEmail({ body: { email: 'novy@autoservis.test', name: 'Novy', password } });
  await expect(signUp).rejects.toBeInstanceOf(APIError);
});
