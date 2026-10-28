import { afterAll, afterEach, beforeAll, beforeEach, expect, test, vi } from 'vitest';
import { createAuth } from '../src/auth.ts';
import { signInWithPassword } from '../src/dal/sign-in.ts';
import { createTestDb } from './support/db.ts';
import { seedUser } from './support/users.ts';

// The attempts to sign in and to change the password are limited like Better Auth's HTTP router limits
// them (spec #117, "Rate limit prihlásenia ostáva predvolený"): 3 attempts in 10 seconds from one
// client address. The Server Actions call `auth.api` directly, which never reaches the router's limiter.

// The cookies Better Auth's nextCookies plugin writes through next/headers, which here goes nowhere.
vi.mock('next/headers.js', () => ({
  headers: async () => new Headers(),
  cookies: async () => ({ set: () => undefined }),
}));

const password = 'spravne-heslo-1234';

let ctx: Awaited<ReturnType<typeof createTestDb>>;
let auth: ReturnType<typeof createAuth>;
let verifiesPassword: ReturnType<typeof vi.spyOn>;
beforeAll(async () => {
  ctx = await createTestDb();
  // Better Auth limits only when NODE_ENV is production, unless told to: the tests tell it to.
  auth = createAuth({ db: ctx.db, secret: 'test-secret-test-secret-test-secret-0123', rateLimit: { enabled: true } });
  verifiesPassword = vi.spyOn(auth.api, 'signInEmail');
});
afterAll(() => ctx.close());
beforeEach(() => verifiesPassword.mockClear());
afterEach(() => vi.useRealTimers());

let counter = 0;
/** A Používateľ of its own, so that no test meets another's attempts. */
async function newUser() {
  const account = { email: `uzivatel${++counter}@autoservis.test`, password, role: 'mechanik' as const };
  await seedUser(ctx.db, account);
  return account;
}

/** The headers of a request from a client of its own: the address the limit counts by is in the first one. */
const client = () => new Headers({ 'x-forwarded-for': `203.0.113.${++counter}`, 'content-type': 'multipart/form-data', 'content-length': '120' });

test('the fourth attempt to sign in within 10 seconds is refused, with the right password too, and the password is not checked', async () => {
  const account = await newUser();
  const from = client();
  for (let attempt = 0; attempt < 3; attempt++) {
    expect(await signInWithPassword(from, { email: account.email, password: 'zle-heslo-1234' }, auth)).toEqual({ ok: false, reason: 'refused' });
  }
  expect(verifiesPassword).toHaveBeenCalledTimes(3);

  const fourth = await signInWithPassword(from, { email: account.email, password }, auth);

  expect(fourth).toEqual({ ok: false, reason: 'tooManyAttempts' });
  expect(verifiesPassword).toHaveBeenCalledTimes(3);
});
