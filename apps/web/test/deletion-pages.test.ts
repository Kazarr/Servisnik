import { renderToStaticMarkup } from 'react-dom/server';
import { afterAll, beforeAll, beforeEach, expect, test, vi } from 'vitest';
import VehiclePage from '../src/app/(app)/vozidla/[id]/page.tsx';
import CustomerPage from '../src/app/(app)/zakaznici/[id]/page.tsx';
import { createCustomer } from '../src/dal/customers.ts';
import { createVehicle } from '../src/dal/vehicles.ts';
import { createWorkOrder } from '../src/dal/work-orders.ts';
import type { Database } from '../src/db/index.ts';
import { admin } from './support/dal-users.ts';
import { createTestDb } from './support/db.ts';
import { idOf } from './support/id-of.ts';
import { truncateTables } from './support/reset.ts';

// Mazanie (spec #67), the buttons: the detail of a Zákazník or of a Vozidlo offers "Zmazať" only while nothing links to it,
// and a Zákazník or Vozidlo with a link has no button to press. The pages are async Server Components, which Vitest cannot
// render (docs/adr/0001-stack.md); each is called here as the function it is, over the real DAL and the database of this
// file, and what it returns is rendered. What the delete itself answers is in deletion-actions.test.ts and deletion.test.ts;
// e2e/deletion.spec.ts follows one delete in a browser.

const { handed } = vi.hoisted(() => ({ handed: { db: null as unknown as Database } }));
vi.mock('../src/dal/current-user.ts', async () => {
  const { admin } = await import('./support/dal-users.ts');
  return { currentUser: async () => admin, currentUserWith: async () => admin };
});
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

const vin = 'WVWZZZ1JZ3W386752';
const person = async (name = 'Ján Novák') => idOf(await createCustomer(admin, { type: 'person', name }, ctx.db));
const vehicleOf = async (ownerId: string) => idOf(await createVehicle(admin, { ownerId, vin, licensePlate: 'BA123AB', make: 'Volkswagen', model: 'Golf' }, ctx.db));
const orderOn = async (vehicleId: string, customerId?: string) => {
  const created = await createWorkOrder(admin, { vehicleId, customerId, mileageKm: '1000', customerRequest: 'Výmena oleja' }, ctx.db);
  if (!created.ok) throw new Error('The record was expected to be saved.');
  return created.number;
};

const customerPage = async (id: string) => renderToStaticMarkup(await CustomerPage({ params: Promise.resolve({ id }) }));
const vehiclePage = async (id: string) => renderToStaticMarkup(await VehiclePage({ params: Promise.resolve({ id }) }));
/** What the page asks the admin to press to start a delete: the label of each `<summary>` that opens a question. */
const deleteButtons = (html: string) => [...html.matchAll(/<summary>(.*?)<\/summary>/g)].map(([, label]) => label);

test('a Zákazník with no Vozidlo and no Zákazka has the button to delete him', async () => {
  const id = await person();

  expect(deleteButtons(await customerPage(id))).toEqual(['Zmazať zákazníka']);
});

test('a Zákazník who is the Majiteľ of a Vozidlo has no button to delete him, and his page lists the Vozidlo', async () => {
  const id = await person();
  await vehicleOf(id);

  const html = await customerPage(id);

  expect(html).toContain(`>${vin}</a>`);
  expect(deleteButtons(html)).toEqual([]);
});

test('a Zákazník with a Zákazka and no Vozidlo has no button to delete him, and his page lists the Zákazka', async () => {
  const owner = await person('Majiteľ');
  const id = await person();
  const number = await orderOn(await vehicleOf(owner), id);

  const html = await customerPage(id);

  expect(html).toContain('Zatiaľ žiadne vozidlo.');
  expect(html).toContain(`>${number}</a>`);
  expect(deleteButtons(html)).toEqual([]);
});

test('a Vozidlo with no Zákazka has the button to delete it', async () => {
  const id = await vehicleOf(await person());

  expect(deleteButtons(await vehiclePage(id))).toEqual(['Zmazať vozidlo']);
});

test('a Vozidlo with a Zákazka has no button to delete it, and its page lists the Zákazka', async () => {
  const id = await vehicleOf(await person());
  const number = await orderOn(id);

  const html = await vehiclePage(id);

  expect(html).toContain(`>${number}</a>`);
  expect(deleteButtons(html)).toEqual([]);
});
