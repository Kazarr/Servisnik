import { sql } from 'drizzle-orm';
import { afterAll, beforeAll, beforeEach, expect, test } from 'vitest';
import { createCustomer } from '../src/dal/customers.ts';
import { getUnpricedWorkOrder } from '../src/dal/unpriced-work-order.ts';
import { createVehicle } from '../src/dal/vehicles.ts';
import { addItem, changeWorkOrderStatus, createWorkOrder, getWorkOrder } from '../src/dal/work-orders.ts';
import { admin, mechanic } from './support/dal-users.ts';
import { createTestDb } from './support/db.ts';
import { idOf } from './support/id-of.ts';
import { findPriceKeys } from './support/price-keys.ts';

// The detail of a Zákazka the mechanik reads (spec #95, Mechanik): a shape of its own with a list of the allowed fields,
// so a field nobody adds to it, a price above all, he does not get.

let ctx: Awaited<ReturnType<typeof createTestDb>>;
let ownerId: string;
let vehicleId: string;
beforeAll(async () => {
  ctx = await createTestDb();
});
afterAll(() => ctx.close());
beforeEach(async () => {
  await ctx.db.execute(sql`truncate customer, work_order_counter cascade`);
  ownerId = idOf(await createCustomer(admin, { type: 'company', name: 'Firma s.r.o.', ico: '12345678' }, ctx.db));
  vehicleId = idOf(await createVehicle(admin, { ownerId, vin: 'WVWZZZ1JZ3W386752', licensePlate: 'BA123AB', make: 'Volkswagen', model: 'Golf' }, ctx.db));
});

const newWorkOrder = async (fields: { customerId?: string; deadline?: string; note?: string } = {}) =>
  idOf(await createWorkOrder(admin, { vehicleId, mileageKm: '123 456', customerRequest: 'Výmena oleja\nKontrola bŕzd', ...fields }, ctx.db));

/** A Zákazka with a work and a part, both priced: the work at 58,91, the part bought for 333,33 and sold for 777,77, so that the digits of a price are easy to look for. */
async function pricedWorkOrder() {
  const id = await newWorkOrder({ deadline: '2026-12-01', note: 'Zákazník príde po štvrtej' });
  idOf(await addItem(admin, id, { kind: 'labour', name: 'Výmena oleja', quantity: '1,5', salePrice: '58,91', vatRate: '23' }, ctx.db));
  idOf(await addItem(admin, id, { kind: 'part', code: 'OF-1', name: 'Olejový filter', quantity: '2', unit: 'ks', purchasePrice: '333,33', salePrice: '777,77', vatRate: '23' }, ctx.db));
  return id;
}

test.each([
  ['the admin', admin],
  ['the mechanik', mechanic],
])('%s reads the number, status, customer, vehicle, kilometres, request, Termín, note and items with the quantity and unit of a Zákazka', async (_who, user) => {
  const id = await pricedWorkOrder();

  const order = await getUnpricedWorkOrder(user, id, ctx.db);

  expect(order).toEqual({
    id,
    number: expect.stringMatching(/^Z\d{4}-0001$/),
    status: 'received',
    customer: { name: 'Firma s.r.o.' },
    vehicle: { vin: 'WVWZZZ1JZ3W386752', licensePlate: 'BA123AB', make: 'Volkswagen', model: 'Golf' },
    mileageKm: 123456,
    customerRequest: 'Výmena oleja\nKontrola bŕzd',
    deadline: '2026-12-01',
    note: 'Zákazník príde po štvrtej',
    items: [
      { kind: 'labour', code: null, name: 'Výmena oleja', quantityHundredths: 150, unit: 'h' },
      { kind: 'part', code: 'OF-1', name: 'Olejový filter', quantityHundredths: 200, unit: 'ks' },
    ],
  });
});

test('the answer has no price key anywhere, and none of the prices of the items is in it, whatever it is called', async () => {
  const id = await pricedWorkOrder();

  const order = await getUnpricedWorkOrder(mechanic, id, ctx.db);

  expect(order?.items).toHaveLength(2);
  expect(findPriceKeys(order)).toEqual([]);
  expect(JSON.stringify({ ...order, id: undefined })).not.toMatch(/77777|33333|5891|777[,.]77|333[,.]33|58[,.]91/); // the id is random hex: leave it out of what is looked through
});

test('the same Zákazka read with its prices has price keys, so the check above is not blind', async () => {
  const id = await pricedWorkOrder();

  expect(findPriceKeys(await getWorkOrder(admin, id, ctx.db))).not.toEqual([]);
});

test('a Zákazka without items, a Termín or a note has none of them', async () => {
  const id = await newWorkOrder();

  expect(await getUnpricedWorkOrder(mechanic, id, ctx.db)).toMatchObject({ deadline: null, note: null, items: [] });
});

test('a vehicle without a ŠPZ has none', async () => {
  const noPlateId = idOf(await createVehicle(admin, { ownerId, vin: 'TMBZZZ5JZ3W000101', licensePlate: '', make: 'Škoda', model: 'Octavia' }, ctx.db));
  const id = idOf(await createWorkOrder(admin, { vehicleId: noPlateId, mileageKm: '0', customerRequest: 'Brzdy' }, ctx.db));

  expect((await getUnpricedWorkOrder(mechanic, id, ctx.db))?.vehicle.licensePlate).toBeNull();
});

test('the customer is the one the Zákazka was made for, not the Majiteľ the vehicle has now', async () => {
  const otherId = idOf(await createCustomer(admin, { type: 'person', name: 'Iný Zákazník' }, ctx.db));
  const id = await newWorkOrder({ customerId: otherId });

  expect((await getUnpricedWorkOrder(mechanic, id, ctx.db))?.customer).toEqual({ name: 'Iný Zákazník' });
});

test('a Zákazka in any Stav is read, Hotová and Zrušená too', async () => {
  const done = await newWorkOrder();
  await changeWorkOrderStatus(admin, done, { to: 'done' }, ctx.db);
  const cancelled = await newWorkOrder();
  await changeWorkOrderStatus(admin, cancelled, { to: 'cancelled', confirmed: true }, ctx.db);

  expect((await getUnpricedWorkOrder(mechanic, done, ctx.db))?.status).toBe('done');
  expect((await getUnpricedWorkOrder(mechanic, cancelled, ctx.db))?.status).toBe('cancelled');
});

test('there is no Zákazka for an id that is none, or that is not even an id', async () => {
  expect(await getUnpricedWorkOrder(mechanic, '7d1c0a3e-0000-4000-8000-000000000001', ctx.db)).toBeNull();
  expect(await getUnpricedWorkOrder(mechanic, 'nie-je-id', ctx.db)).toBeNull();
});
