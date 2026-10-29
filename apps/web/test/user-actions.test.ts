import type { Role } from '@servisnik/domain/access';
import { eq } from 'drizzle-orm';
import { afterAll, beforeAll, expect, test, vi } from 'vitest';
import { updateUserAction } from '../src/app/(app)/nastavenia/user-actions.ts';
import { createAuth, type Auth } from '../src/auth.ts';
import { requireUser, type User } from '../src/dal/user.ts';
import { user } from '../src/db/schema.ts';
import { createTestDb } from './support/db.ts';
import { signInHeaders } from './support/sessions.ts';
import { seedUser } from './support/users.ts';

// The Server Action of the form that edits a Používateľ, called as the admin's page calls it: the form of
// another user's page has the field of the Rola, the form of the admin's own page has none. The DAL and
// Better Auth are the real ones, over the database of this file; who may call it is in forbidden.test.ts.

const { request } = vi.hoisted(() => ({ request: {} as { user: User; headers: Headers; auth: Auth } }));
vi.mock('../src/dal/current-user.ts', () => ({ currentUser: async () => request.user }));
vi.mock('../src/auth.ts', async (importOriginal) => ({ ...(await importOriginal<typeof import('../src/auth.ts')>()), getAuth: () => request.auth }));
// The request's headers carry the admin's session. Better Auth's nextCookies plugin reads the headers and writes cookies through the same
// module on every call, also while a test signs its users in, before there is a request.
vi.mock('next/headers', () => ({ headers: async () => request.headers ?? new Headers(), cookies: async () => ({ set: () => undefined }) }));
// A saved form asks Next.js to draw the list of Používatelia again, which outside a request has nothing to do.
vi.mock('next/cache', () => ({ revalidatePath: () => undefined }));

const secret = 'test-secret-test-secret-test-secret-0123';
const password = 'pociatocne-heslo-1234';

let ctx: Awaited<ReturnType<typeof createTestDb>>;
beforeAll(async () => {
  ctx = await createTestDb();
  request.auth = createAuth({ db: ctx.db, secret });
});
afterAll(() => ctx.close());

let counter = 0;
/** A Používateľ of its own with this Rola: his id and e-mail, and the request he signs in with. */
async function newUser(role: Role) {
  const email = `uzivatel${++counter}@autoservis.test`;
  const id = await seedUser(ctx.db, { email, password, role, name: `Používateľ ${counter}` });
  const headers = await signInHeaders(request.auth, email, password);
  return { id, email, headers, user: await requireUser(headers, request.auth) };
}

/** The admin sends the next form: the request is his. */
const actingAs = (admin: Awaited<ReturnType<typeof newUser>>) => Object.assign(request, { user: admin.user, headers: admin.headers });

function form(fields: Record<string, string>) {
  const data = new FormData();
  for (const [name, value] of Object.entries(fields)) data.set(name, value);
  return data;
}

const rowOf = async (id: string) => (await ctx.db.select({ name: user.name, email: user.email, role: user.role }).from(user).where(eq(user.id, id)))[0];

test('the admin saves his own page, which has no field of the Rola: the name and e-mail change, the Rola stays and the save is told', async () => {
  const boss = await newUser('admin');
  actingAs(boss);

  const answer = await updateUserAction(null, form({ userId: boss.id, userName: 'Nové meno', userEmail: 'Nove.Meno@autoservis.test' }));

  expect(answer).toMatchObject({ values: { name: 'Nové meno', email: 'nove.meno@autoservis.test' }, errors: {}, saved: true });
  expect(await rowOf(boss.id)).toEqual({ name: 'Nové meno', email: 'nove.meno@autoservis.test', role: 'admin' });
});

test("the admin saves another user's page, which has the field of the Rola: the Rola changes with the name and e-mail", async () => {
  const boss = await newUser('admin');
  const worker = await newUser('mechanik');
  actingAs(boss);

  const answer = await updateUserAction(null, form({ userId: worker.id, userName: 'Povýšený', userEmail: worker.email, userRole: 'admin' }));

  expect(answer).toMatchObject({ values: { name: 'Povýšený', email: worker.email, role: 'admin' }, errors: {}, saved: true });
  expect(await rowOf(worker.id)).toEqual({ name: 'Povýšený', email: worker.email, role: 'admin' });
});
