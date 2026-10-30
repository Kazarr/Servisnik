import { sql } from 'drizzle-orm';
import { afterAll, beforeAll, beforeEach, expect, test } from 'vitest';
import { createCustomer, getCustomer, listCustomers } from '../src/dal/customers.ts';
import { getHandoverProtocol, getQuote } from '../src/dal/print-forms.ts';
import { getUnpricedWorkOrder } from '../src/dal/unpriced-work-order.ts';
import { createVehicle } from '../src/dal/vehicles.ts';
import { addItem, changeWorkOrderStatus, createWorkOrder, getWorkOrder, listWorkOrdersOfCustomer, listWorkOrdersOfVehicle } from '../src/dal/work-orders.ts';
import { admin, mechanic } from './support/dal-users.ts';
import { createTestDb } from './support/db.ts';
import { idOf } from './support/id-of.ts';
import { truncateTables } from './support/reset.ts';

// Rows saved in one transaction, or in one millisecond, have the same `created_at` (#160), so what a list shows first must not rest on
// that alone. Each test saves its rows, gives them all one `created_at` and reads the list as the app does.
// The ids are random uuids, so an order that falls back on the id keeps the order saved by chance only: with twelve rows,
// 1 time in 479 001 600, which is why every list has twelve.

let ctx: Awaited<ReturnType<typeof createTestDb>>;
beforeAll(async () => {
  ctx = await createTestDb();
});
afterAll(() => ctx.close());
beforeEach(() => truncateTables(ctx.db, 'customer', 'work_order_counter'));

const TWELVE = Array.from({ length: 12 }, (_, i) => i + 1);

/** Every row of `table` gets the `created_at` of this very moment: the same one. */
const savedAtTheSameMoment = (table: string) => ctx.db.execute(sql`update ${sql.identifier(table)} set created_at = now()`);

const vinOf = (n: number) => `TMBZZZ5JZ3W${String(n).padStart(6, '0')}`;
const customer = async (name: string) => idOf(await createCustomer(admin, { type: 'person', name }, ctx.db));
const vehicle = async (ownerId: string, n: number) =>
  idOf(await createVehicle(admin, { ownerId, vin: vinOf(n), licensePlate: '', make: 'Škoda', model: 'Octavia' }, ctx.db));
const workOrder = async (vehicleId: string, customerId?: string) =>
  idOf(await createWorkOrder(admin, { vehicleId, customerId, mileageKm: '1000', customerRequest: 'Výmena oleja' }, ctx.db));

/** A Zákazka Hotová (so that its protocol is read too) with twelve items added one after the other, named 'Položka 1' to 'Položka 12'. */
async function workOrderWithItems() {
  const ownerId = await customer('Firma s.r.o.');
  const id = await workOrder(await vehicle(ownerId, 1));
  for (const n of TWELVE) idOf(await addItem(admin, id, { kind: 'labour', name: `Položka ${n}`, quantity: '1', salePrice: '1' }, ctx.db));
  await changeWorkOrderStatus(admin, id, { to: 'done' }, ctx.db);
  await savedAtTheSameMoment('work_order_item');
  return id;
}
const added = TWELVE.map((n) => `Položka ${n}`);

test.each([
  ['the detail of the Zákazka', async (id: string) => (await getWorkOrder(admin, id, ctx.db))!.items],
  ['the cenová ponuka', async (id: string) => (await getQuote(admin, id, ctx.db))!.items],
  ['the odovzdávací protokol', async (id: string) => (await getHandoverProtocol(admin, id, ctx.db) as { items: { name: string }[] }).items],
  ['the zákazkový list of the mechanik', async (id: string) => (await getUnpricedWorkOrder(mechanic, id, ctx.db))!.items],
])('%s has the items in the order they were added, though they were all saved at the same moment', async (_form, itemsOf) => {
  const id = await workOrderWithItems();

  expect((await itemsOf(id)).map((item) => item.name)).toEqual(added);
});

test('Zákazníci saved at the same moment are listed in the same order whatever the order they were saved in: by their id', async () => {
  for (const n of TWELVE) await customer(`Zákazník ${n}`);
  await savedAtTheSameMoment('customer');

  const ids = (await listCustomers(admin, ctx.db)).map((listed) => listed.id);

  expect(ids).toHaveLength(12);
  expect(ids).toEqual([...ids].sort());
});

test('the Vozidlá of a Zákazník saved at the same moment are listed by their id', async () => {
  const ownerId = await customer('Ján Novák');
  for (const n of TWELVE) await vehicle(ownerId, n);
  await savedAtTheSameMoment('vehicle');

  const ids = (await getCustomer(admin, ownerId, ctx.db))!.vehicles.map((listed) => listed.id);

  expect(ids).toHaveLength(12);
  expect(ids).toEqual([...ids].sort());
});

test('the Zákazky of a Vozidlo and of a Zákazník saved at the same moment are listed from the highest number, as the list of all of them is', async () => {
  const ownerId = await customer('Ján Novák');
  const vehicleId = await vehicle(ownerId, 1);
  for (const _ of TWELVE) await workOrder(vehicleId);
  await savedAtTheSameMoment('work_order');
  // The numbers are now a hash of the id: the order the rows were saved in or its reverse (a plan may read the rows either
  // way) is the order of the numbers 2 times in 479 001 600, so a list that has no second key matches it by that chance only.
  await ctx.db.execute(sql`update work_order set number = 'Z2026-' || md5(id::text)`);

  const ofVehicle = (await listWorkOrdersOfVehicle(admin, vehicleId, ctx.db)).map((order) => order.number);
  const ofCustomer = (await listWorkOrdersOfCustomer(admin, ownerId, ctx.db)).map((order) => order.number);

  expect(ofVehicle).toHaveLength(12);
  expect(ofVehicle).toEqual([...ofVehicle].sort().reverse());
  expect(ofCustomer).toEqual(ofVehicle);
});
