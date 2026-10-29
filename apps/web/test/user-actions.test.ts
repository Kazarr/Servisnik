import type { Role } from '@servisnik/domain/access';
import { afterAll, beforeAll, expect, test, vi } from 'vitest';
import { updateUserAction } from '../src/app/(app)/nastavenia/user-actions.ts';
import { createAuth, type Auth } from '../src/auth.ts';
import type { User } from '../src/dal/user.ts';
import { createTestDb } from './support/db.ts';
import { form } from './support/form-data.ts';
import { signedInUser } from './support/signed-in-user.ts';
import { userRow } from './support/users.ts';

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

const newUser = (role: Role) => signedInUser(ctx.db, request.auth, role, password);

/** The admin sends the next form: the request is his. */
const actingAs = (admin: Awaited<ReturnType<typeof newUser>>) => Object.assign(request, { user: admin.user, headers: admin.headers });

const rowOf = (id: string) => userRow(ctx.db, id);

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

  const answer = await updateUserAction(null, form({ userId: worker.id, userName: 'Povýšený', userEmail: 'Povysena.Osoba@AutoServis.TEST', userRole: 'admin' }));

  expect(answer).toMatchObject({ values: { name: 'Povýšený', email: 'povysena.osoba@autoservis.test', role: 'admin' }, errors: {}, saved: true });
  expect(await rowOf(worker.id)).toEqual({ name: 'Povýšený', email: 'povysena.osoba@autoservis.test', role: 'admin' });
});
