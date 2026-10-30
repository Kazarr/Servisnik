import { afterAll, beforeAll, beforeEach, expect, test, vi } from 'vitest';
import { removeVehicle } from '../src/app/(app)/vozidla/actions.ts';
import { removeCustomer } from '../src/app/(app)/zakaznici/actions.ts';
import { getCustomer } from '../src/dal/customers.ts';
import { getVehicle } from '../src/dal/vehicles.ts';
import { createWorkOrder } from '../src/dal/work-orders.ts';
import type { Database } from '../src/db/index.ts';
import { savedIn } from './support/customer-vehicle.ts';
import { admin } from './support/dal-users.ts';
import { createTestDb } from './support/db.ts';
import { digestOf } from './support/digest-of.ts';
import { form } from './support/form-data.ts';
import { idOf } from './support/id-of.ts';
import { truncateTables } from './support/reset.ts';

// Mazanie (spec #67), the Server Actions behind "Potvrdiť zmazanie", called as the admin's forms call them: what they answer
// when the delete is refused because a link was added after the page was opened, and what they do with an id that is no
// record. The DAL is the real one, over the database of this file, and its own refusal under a race is in deletion.test.ts;
// who may call them is in forbidden.test.ts, the detail pages that offer the button in deletion-pages.test.ts.

const { handed } = vi.hoisted(() => ({ handed: { db: null as unknown as Database } }));
vi.mock('../src/dal/current-user.ts', async () => ({ currentUser: async () => (await import('./support/dal-users.ts')).admin }));
vi.mock('../src/db/index.ts', async (importOriginal) => ({ ...(await importOriginal<typeof import('../src/db/index.ts')>()), getDb: () => handed.db }));

let ctx: Awaited<ReturnType<typeof createTestDb>>;
beforeAll(async () => {
  ctx = await createTestDb();
  handed.db = ctx.db;
});
afterAll(() => ctx.close());
beforeEach(async () => {
  await truncateTables(ctx.db, 'customer');
});

const { person, vehicleOf } = savedIn(() => ctx.db);

const unknownId = '3f0c8c1e-6a52-4a39-9c52-0d4a4b6c1f10';

test('a Zákazník who got a Vozidlo after the page was opened is not deleted: the form is answered with why, and he stays', async () => {
  const id = await person(); // no link when the page showed the button
  await vehicleOf(id); // a link by the time "Potvrdiť zmazanie" is pressed

  const answer = await removeCustomer(null, form({ id }));

  expect(answer).toEqual({ error: 'Zákazník má vozidlo alebo zákazku, preto ho nemožno zmazať' });
  expect(await getCustomer(admin, id, ctx.db)).not.toBeNull();
});

test('a Vozidlo that got a Zákazka after the page was opened is not deleted: the form is answered with why, and it stays', async () => {
  const id = await vehicleOf(await person());
  idOf(await createWorkOrder(admin, { vehicleId: id, mileageKm: '1000', customerRequest: 'Brzdy' }, ctx.db));

  const answer = await removeVehicle(null, form({ id }));

  expect(answer).toEqual({ error: 'Vozidlo má zákazku, preto ho nemožno zmazať' });
  expect(await getVehicle(admin, id, ctx.db)).not.toBeNull();
});

test('a Zákazník that does not exist, or an id that is not one, is a page that does not exist, and nothing is deleted', async () => {
  const owner = await person();

  expect(await digestOf(removeCustomer(null, form({ id: unknownId })))).toMatch(/^NEXT_HTTP_ERROR_FALLBACK;404/);
  expect(await digestOf(removeCustomer(null, form({ id: 'nie-je-id' })))).toMatch(/^NEXT_HTTP_ERROR_FALLBACK;404/);
  expect(await digestOf(removeCustomer(null, form({})))).toMatch(/^NEXT_HTTP_ERROR_FALLBACK;404/);

  expect(await getCustomer(admin, owner, ctx.db)).not.toBeNull();
});

test('a Vozidlo that does not exist, or an id that is not one, is a page that does not exist, and nothing is deleted', async () => {
  const id = await vehicleOf(await person());

  expect(await digestOf(removeVehicle(null, form({ id: unknownId })))).toMatch(/^NEXT_HTTP_ERROR_FALLBACK;404/);
  expect(await digestOf(removeVehicle(null, form({ id: 'nie-je-id' })))).toMatch(/^NEXT_HTTP_ERROR_FALLBACK;404/);
  expect(await digestOf(removeVehicle(null, form({})))).toMatch(/^NEXT_HTTP_ERROR_FALLBACK;404/);

  expect(await getVehicle(admin, id, ctx.db)).not.toBeNull();
});
