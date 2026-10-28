import { eq, sql } from 'drizzle-orm';
import { afterAll, beforeAll, beforeEach, expect, test } from 'vitest';
import { signInWithPassword } from '../src/app/login/sign-in.ts';
import { createAuth } from '../src/auth.ts';
import { session, user } from '../src/db/schema.ts';
import { createTestDb } from './support/db.ts';
import { seedUser } from './support/users.ts';

// The login of a Používateľ, with the message each refusal gets (spec #117, "Používatelia"): the
// message of a Deaktivovaný používateľ comes only after the right password.

const secret = 'test-secret-test-secret-test-secret-0123';
const email = 'jan@autoservis.test';
const password = 'pociatocne-heslo-1234';
const wrongMessage = 'Nesprávny e-mail alebo heslo.';
const deactivatedMessage = 'Účet je deaktivovaný. Obráťte sa na admina.';

let ctx: Awaited<ReturnType<typeof createTestDb>>;
let auth: ReturnType<typeof createAuth>;
beforeAll(async () => {
  ctx = await createTestDb();
  auth = createAuth({ db: ctx.db, secret });
});
afterAll(() => ctx.close());
beforeEach(async () => {
  await ctx.db.execute(sql`truncate "user" cascade`);
  await seedUser(ctx.db, { email, password, role: 'mechanik' });
});

const signIn = (withEmail: string, withPassword: string) => signInWithPassword(auth, new Headers(), withEmail, withPassword);
const deactivate = () => ctx.db.update(user).set({ banned: true, banReason: 'No reason' }).where(eq(user.email, email));

test('the right e-mail and password sign the user in, and a session starts', async () => {
  expect(await signIn(email, password)).toEqual({ ok: true });

  expect(await ctx.db.$count(session)).toBe(1);
});

test.each([
  ['a wrong password', email, 'nespravne-heslo-1'],
  ['an e-mail nobody has', 'nikto@autoservis.test', password],
])('%s is refused with the ordinary message, and no session starts', async (_name, withEmail, withPassword) => {
  expect(await signIn(withEmail, withPassword)).toEqual({ ok: false, message: wrongMessage });

  expect(await ctx.db.$count(session)).toBe(0);
});

test('a Deaktivovaný používateľ with the right password is told his account is deactivated, and no session starts', async () => {
  await deactivate();

  expect(await signIn(email, password)).toEqual({ ok: false, message: deactivatedMessage });

  expect(await ctx.db.$count(session)).toBe(0);
});

test('a Deaktivovaný používateľ with a wrong password gets the ordinary message, so the message tells nothing to who does not know the password', async () => {
  await deactivate();

  expect(await signIn(email, 'nespravne-heslo-1')).toEqual({ ok: false, message: wrongMessage });
});
