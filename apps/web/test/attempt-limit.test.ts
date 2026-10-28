import { afterAll, afterEach, beforeAll, beforeEach, expect, test, vi, type MockInstance } from 'vitest';
import { signInWithPassword } from '../src/app/login/sign-in.ts';
import { createAuth } from '../src/auth.ts';
import { changeOwnPassword, type PasswordChange } from '../src/dal/password.ts';
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

const secret = 'test-secret-test-secret-test-secret-0123';
const password = 'spravne-heslo-1234';
const newPassword = 'nove-heslo-5678';
const wrongPassword = 'zle-heslo-1234';

let ctx: Awaited<ReturnType<typeof createTestDb>>;
let auth: ReturnType<typeof createAuth>;
let checksSignIn: MockInstance<(typeof auth.api)['signInEmail']>;
let checksCurrentPassword: MockInstance<(typeof auth.api)['changePassword']>;
beforeAll(async () => {
  ctx = await createTestDb();
  // Better Auth limits only when NODE_ENV is production, unless told to: the tests tell it to.
  auth = createAuth({ db: ctx.db, secret, rateLimit: { enabled: true } });
  checksSignIn = vi.spyOn(auth.api, 'signInEmail');
  checksCurrentPassword = vi.spyOn(auth.api, 'changePassword');
});
afterAll(() => ctx.close());
beforeEach(() => {
  // Not returned: vitest runs a function a hook returns as its cleanup.
  checksSignIn.mockClear();
  checksCurrentPassword.mockClear();
});
afterEach(() => vi.useRealTimers());

let counter = 0;
/** A Používateľ of its own, so that no test meets another's attempts. */
async function newUser() {
  const account = { email: `uzivatel${++counter}@autoservis.test`, password, role: 'mechanik' as const };
  await seedUser(ctx.db, account);
  return account;
}

/** The headers of a request from a client address of its own, with those a form post carries too. */
const client = () => new Headers({ 'x-forwarded-for': `203.0.113.${++counter}`, 'content-type': 'multipart/form-data', 'content-length': '120' });

/** The same client with the cookie of a session of this Používateľ: Better Auth is asked directly, which no limit counts. */
async function signedIn(account: { email: string }, from: Headers) {
  const { headers } = await auth.api.signInEmail({ body: { email: account.email, password }, returnHeaders: true });
  const withCookie = new Headers(from);
  withCookie.set('cookie', headers.getSetCookie().map((cookie) => cookie.split(';')[0]).join('; '));
  checksSignIn.mockClear();
  return withCookie;
}

const signIn = (account: { email: string }, from: Headers, withPassword = password) => signInWithPassword(auth, from, account.email, withPassword);
const change = (from: Headers, input: Partial<PasswordChange> = {}) =>
  changeOwnPassword(from, { currentPassword: password, newPassword, confirmation: newPassword, ...input }, auth);

// The messages are the ones the Používateľ reads, written out here and not taken from the code.
const refused = { ok: false, message: 'Nesprávny e-mail alebo heslo.' } as const;
const tooManyAttempts = { ok: false, message: 'Príliš veľa pokusov. Skúste to znova o chvíľu.' } as const;
const tooManyChanges = { ok: false, errors: { form: 'tooManyAttempts' } } as const;

test('the fourth attempt to sign in within 10 seconds is refused, with the right password too, and the password is not checked', async () => {
  const account = await newUser();
  const from = client();
  for (let attempt = 0; attempt < 3; attempt++) expect(await signIn(account, from, wrongPassword)).toEqual(refused);
  expect(checksSignIn).toHaveBeenCalledTimes(3);

  const fourth = await signIn(account, from);

  expect(fourth).toEqual(tooManyAttempts);
  expect(checksSignIn).toHaveBeenCalledTimes(3);
});

test('10 seconds after the last attempt that was let through the client signs in again, not a moment before', async () => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(Date.UTC(2026, 9, 28, 12));
  const account = await newUser();
  const from = client();
  for (let attempt = 0; attempt < 3; attempt++) await signIn(account, from, wrongPassword);
  expect(await signIn(account, from)).toEqual(tooManyAttempts);

  vi.setSystemTime(Date.UTC(2026, 9, 28, 12, 0, 9, 999));
  expect(await signIn(account, from)).toEqual(tooManyAttempts);
  vi.setSystemTime(Date.UTC(2026, 9, 28, 12, 0, 10));

  expect(await signIn(account, from)).toEqual({ ok: true });
});

test("a client is not limited by another client's attempts", async () => {
  const account = await newUser();
  const busy = client();
  for (let attempt = 0; attempt < 3; attempt++) await signIn(account, busy, wrongPassword);
  expect(await signIn(account, busy)).toEqual(tooManyAttempts);

  expect(await signIn(account, client())).toEqual({ ok: true });
});

test('the address of the client is read from the header the app is told to, not from x-forwarded-for, which a proxy fills with itself', async () => {
  // DigitalOcean's ingress is what x-forwarded-for holds for every client, and the client is in do-connecting-ip.
  const behindProxy = createAuth({ db: ctx.db, secret, rateLimit: { enabled: true }, clientIpHeader: 'do-connecting-ip' });
  const account = await newUser();
  const request = (address: string, forwardedFor = '198.51.100.1, 198.51.100.2') => new Headers({ 'x-forwarded-for': forwardedFor, 'do-connecting-ip': address });
  const busyAddress = `203.0.113.${++counter}`;
  for (let attempt = 0; attempt < 3; attempt++) await signInWithPassword(behindProxy, request(busyAddress), account.email, wrongPassword);
  expect(await signInWithPassword(behindProxy, request(busyAddress), account.email, password)).toEqual(tooManyAttempts);

  // A forged x-forwarded-for gives the client no new attempts.
  expect(await signInWithPassword(behindProxy, request(busyAddress, '192.0.2.77'), account.email, password)).toEqual(tooManyAttempts);
  // A client with another address has attempts of its own, behind the same x-forwarded-for.
  expect(await signInWithPassword(behindProxy, request(`203.0.113.${++counter}`), account.email, password)).toEqual({ ok: true });
});

test('the fourth attempt to change the password within 10 seconds is refused, with the right current password too, and nothing is checked or changed', async () => {
  const account = await newUser();
  const from = await signedIn(account, client());
  for (let attempt = 0; attempt < 3; attempt++) {
    expect(await change(from, { currentPassword: wrongPassword })).toEqual({ ok: false, errors: { currentPassword: 'wrong' } });
  }
  expect(checksCurrentPassword).toHaveBeenCalledTimes(3);

  const fourth = await change(from);

  expect(fourth).toEqual(tooManyChanges);
  expect(checksCurrentPassword).toHaveBeenCalledTimes(3);
  expect(await signIn(account, client())).toEqual({ ok: true }); // the password is still the old one
  expect(await signIn(account, client(), newPassword)).toEqual(refused);
});

test('a new password or a repeat that is refused before the current password is checked is not an attempt', async () => {
  const account = await newUser();
  const from = await signedIn(account, client());
  for (const bad of [{ newPassword: '1234567', confirmation: '1234567' }, { confirmation: `${newPassword}!` }, { newPassword: '', confirmation: '' }, { newPassword: 'a'.repeat(129), confirmation: 'a'.repeat(129) }]) {
    expect((await change(from, bad)).ok).toBe(false);
  }
  expect(checksCurrentPassword).not.toHaveBeenCalled();

  expect(await change(from)).toEqual({ ok: true });
});

test('attempts to sign in and attempts to change the password are counted apart', async () => {
  const account = await newUser();
  const from = await signedIn(account, client());
  for (let attempt = 0; attempt < 3; attempt++) await signIn(account, from, wrongPassword);
  expect(await signIn(account, from)).toEqual(tooManyAttempts);

  expect(await change(from)).toEqual({ ok: true });
});
