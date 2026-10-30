import { afterAll, beforeAll, beforeEach, expect, test, vi } from 'vitest';
import { addVehicle } from '../src/app/(app)/vozidla/actions.ts';
import { addCustomer } from '../src/app/(app)/zakaznici/actions.ts';
import { createAuth, type Auth } from '../src/auth.ts';
import { createCustomer, listCustomers } from '../src/dal/customers.ts';
import { searchVehicles } from '../src/dal/vehicles.ts';
import type { Database } from '../src/db/index.ts';
import { admin } from './support/dal-users.ts';
import { createTestDb } from './support/db.ts';
import { digestOf } from './support/digest-of.ts';
import { form } from './support/form-data.ts';
import { idOf } from './support/id-of.ts';
import { truncateTables } from './support/reset.ts';

// Zákazníci a vozidlá (spec #67), a form sent after the session ended, from a page that stayed open: the proxy only sees a cookie, so
// only the Server Action can refuse (docs/adr/0001-stack.md). Here nobody is signed in; currentUser, Better Auth and the DAL are the
// real ones, over the database of this file. What an action answers a user whose Rola may not send the form is in forbidden.test.ts.

const { handed } = vi.hoisted(() => ({ handed: {} as { db: Database; auth: Auth } }));
vi.mock('../src/db/index.ts', async (importOriginal) => ({ ...(await importOriginal<typeof import('../src/db/index.ts')>()), getDb: () => handed.db }));
vi.mock('../src/auth.ts', async (importOriginal) => ({ ...(await importOriginal<typeof import('../src/auth.ts')>()), getAuth: () => handed.auth }));
// The request of the form carries no cookie of a session.
vi.mock('next/headers', () => ({ headers: async () => new Headers(), cookies: async () => ({ set: () => undefined }) }));

let ctx: Awaited<ReturnType<typeof createTestDb>>;
let ownerId: string;
beforeAll(async () => {
  ctx = await createTestDb();
  handed.db = ctx.db;
  handed.auth = createAuth({ db: ctx.db, secret: 'test-secret-test-secret-test-secret-0123' });
});
afterAll(() => ctx.close());
beforeEach(async () => {
  await truncateTables(ctx.db, 'customer');
  ownerId = idOf(await createCustomer(admin, { type: 'person', name: 'Majiteľ bez auta' }, ctx.db));
});

test.each([
  ['a customer', () => addCustomer(null, form({ type: 'person', name: 'Nemal by sa uložiť' }))],
  ['a vehicle', () => addVehicle(null, form({ ownerId, vin: 'TMBZZZ5JZ3W000101', make: 'Škoda', model: 'Fabia' }))],
])('the form of %s sent after the session ended leads to the login page and saves nothing', async (_what, send) => {
  const digest = await digestOf(send());

  expect(digest).toMatch(/^NEXT_REDIRECT;[^;]*;\/login;/);
  expect((await listCustomers(admin, ctx.db)).map(({ name }) => name)).toEqual(['Majiteľ bez auta']);
  expect((await searchVehicles(admin, {}, ctx.db)).total).toBe(0);
});
