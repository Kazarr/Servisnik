import type { Role } from '@servisnik/domain/access';
import { APIError } from 'better-auth/api';
import { afterAll, beforeAll, beforeEach, expect, test, vi } from 'vitest';
import { createAuth } from '../src/auth.ts';
import { changeOwnPassword, type PasswordChange } from '../src/dal/password.ts';
import { requireUser, UnauthenticatedError } from '../src/dal/user.ts';
import { createTestDb } from './support/db.ts';
import { seedUser } from './support/users.ts';

// What the Server Action's response would carry to the browser: Better Auth's nextCookies plugin
// writes the cookies of a new session through next/headers, which here is a recording stand-in.
const sent = vi.hoisted(() => new Map<string, string>());
vi.mock('next/headers.js', () => ({
  headers: async () => new Headers(),
  cookies: async () => ({ set: (name: string, value: string) => void sent.set(name, value) }),
}));

const secret = 'test-secret-test-secret-test-secret-0123';
const oldPassword = 'povodne-heslo-1234';
const newPassword = 'nove-heslo-5678';

let ctx: Awaited<ReturnType<typeof createTestDb>>;
let auth: ReturnType<typeof createAuth>;
beforeAll(async () => {
  ctx = await createTestDb();
  auth = createAuth({ db: ctx.db, secret });
});
afterAll(() => ctx.close());
beforeEach(() => sent.clear());

let counter = 0;
/** A Používateľ of its own, so that no test meets another's sessions. */
async function newUser(role: Role) {
  const account = { email: `uzivatel${++counter}@autoservis.test`, password: oldPassword, role };
  await seedUser(ctx.db, account);
  return account;
}

/** The Cookie header the browser sends back: Next.js URL-encodes a value when it writes the cookie. */
const cookieHeader = (cookies: Map<string, string>) =>
  new Headers({ cookie: [...cookies].map(([name, value]) => `${name}=${encodeURIComponent(value)}`).join('; ') });

/** The request headers of a new sign-in, as the browser would send them with its cookie. */
async function signIn({ email, password }: { email: string; password: string }) {
  sent.clear();
  await auth.api.signInEmail({ body: { email, password } });
  return cookieHeader(sent);
}

const change = async (requestHeaders: Headers, input: Partial<PasswordChange> = {}) =>
  changeOwnPassword(await requireUser(requestHeaders, auth), requestHeaders, { currentPassword: oldPassword, newPassword, confirmation: newPassword, ...input }, auth);

/** True when the user can still sign in with this password. */
const canSignInWith = (email: string, password: string) =>
  auth.api.signInEmail({ body: { email, password } }).then(
    () => true,
    (error) => (error instanceof APIError ? false : Promise.reject(error)),
  );

test.each(['admin', 'mechanik'] as const)(
  'the %s changes his own password: his other sign-ins end, the one he is in stays, and nobody else is touched',
  async (role) => {
    const account = await newUser(role);
    const here = await signIn(account);
    const elsewhere = await signIn(account);
    const other = await newUser('mechanik');
    const othersSignIn = await signIn(other);
    sent.clear();

    const result = await change(here);
    const cookieSent = cookieHeader(sent); // taken now: a request with an ended session makes Better Auth send a cookie that clears it

    expect(result).toEqual({ ok: true });
    await expect(requireUser(elsewhere, auth)).rejects.toBeInstanceOf(UnauthenticatedError);
    // Better Auth swaps the session he is in for a new one and sends its cookie; with that cookie he is still signed in.
    await expect(requireUser(cookieSent, auth)).resolves.toMatchObject({ email: account.email, role });
    await expect(requireUser(othersSignIn, auth)).resolves.toMatchObject({ email: other.email });
  },
);

test('after the change the new password signs him in and the old one does not', async () => {
  const account = await newUser('mechanik');

  expect(await change(await signIn(account))).toEqual({ ok: true });

  expect(await canSignInWith(account.email, newPassword)).toBe(true);
  expect(await canSignInWith(account.email, oldPassword)).toBe(false);
});

/** Nothing happened: the old password still signs in, the new one does not, and the other sign-in is still valid. */
async function expectNothingChanged(account: { email: string }, elsewhere: Headers) {
  expect(await canSignInWith(account.email, oldPassword)).toBe(true);
  expect(await canSignInWith(account.email, newPassword)).toBe(false);
  await expect(requireUser(elsewhere, auth)).resolves.toMatchObject({ email: account.email });
}

test('a wrong current password is refused and nothing changes', async () => {
  const account = await newUser('mechanik');
  const here = await signIn(account);
  const elsewhere = await signIn(account);

  expect(await change(here, { currentPassword: 'zle-heslo-1234' })).toEqual({ ok: false, errors: { currentPassword: 'wrong' } });

  await expectNothingChanged(account, elsewhere);
});

test('a current password of 129 characters is wrong, not a server error', async () => {
  const account = await newUser('mechanik');
  const here = await signIn(account);
  const elsewhere = await signIn(account);

  expect(await change(here, { currentPassword: 'a'.repeat(129) })).toEqual({ ok: false, errors: { currentPassword: 'wrong' } });

  await expectNothingChanged(account, elsewhere);
});

test.each([
  ['7 characters is too short', '1234567', 'tooShort'],
  ['an empty password is too short', '', 'tooShort'],
  ['129 characters is too long', 'a'.repeat(129), 'tooLong'],
] as const)('a new password of %s is refused and nothing changes', async (_name, tooBad, reason) => {
  const account = await newUser('admin');
  const here = await signIn(account);
  const elsewhere = await signIn(account);

  expect(await change(here, { newPassword: tooBad, confirmation: tooBad })).toEqual({ ok: false, errors: { newPassword: reason } });

  await expectNothingChanged(account, elsewhere);
});

test('passwords of 8 and of 128 characters are accepted', async () => {
  for (const length of [8, 128]) {
    const account = await newUser('mechanik');
    const chosen = 'x'.repeat(length);

    expect(await change(await signIn(account), { newPassword: chosen, confirmation: chosen })).toEqual({ ok: true });

    expect(await canSignInWith(account.email, chosen)).toBe(true);
  }
});

test('a repeat that does not match is refused and nothing changes, even with the right current password', async () => {
  const account = await newUser('mechanik');
  const here = await signIn(account);
  const elsewhere = await signIn(account);

  expect(await change(here, { confirmation: `${newPassword}!` })).toEqual({ ok: false, errors: { confirmation: 'mismatch' } });

  await expectNothingChanged(account, elsewhere);
});

test('a password that is too short and a repeat that differs are both reported', async () => {
  const account = await newUser('mechanik');

  const result = await change(await signIn(account), { newPassword: '1234567', confirmation: '7654321' });

  expect(result).toEqual({ ok: false, errors: { newPassword: 'tooShort', confirmation: 'mismatch' } });
});

test('a wrong current password does not hide a new password that is too short: the short one is reported first', async () => {
  const account = await newUser('mechanik');

  const result = await change(await signIn(account), { currentPassword: 'zle-heslo-1234', newPassword: '1234567', confirmation: '1234567' });

  expect(result).toEqual({ ok: false, errors: { newPassword: 'tooShort' } });
});
