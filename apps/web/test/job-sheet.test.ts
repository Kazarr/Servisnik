import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, beforeEach, expect, test } from 'vitest';
import { createCustomer } from '../src/dal/customers.ts';
import { getJobSheet } from '../src/dal/job-sheet.ts';
import { createVehicle } from '../src/dal/vehicles.ts';
import { addItem, changeWorkOrderStatus, createWorkOrder } from '../src/dal/work-orders.ts';
import { admin, mechanic } from './support/dal-users.ts';
import { createTestDb } from './support/db.ts';
import { idOf } from './support/id-of.ts';
import { findPriceKeys } from './support/price-keys.ts';
import { truncateTables } from './support/reset.ts';

// The data of the Zákazkový list (GLOSSARY): the customer, the vehicle, the kilometres and the request, and no price.

let ctx: Awaited<ReturnType<typeof createTestDb>>;
let ownerId: string;
let vehicleId: string;
beforeAll(async () => {
  ctx = await createTestDb();
});
afterAll(() => ctx.close());
beforeEach(async () => {
  await truncateTables(ctx.db, 'customer', 'work_order_counter');
  ownerId = idOf(await createCustomer(admin, { type: 'company', name: 'Firma s.r.o.', ico: '12345678' }, ctx.db));
  vehicleId = idOf(await createVehicle(admin, { ownerId, vin: 'WVWZZZ1JZ3W386752', licensePlate: 'BA123AB', make: 'Volkswagen', model: 'Golf' }, ctx.db));
});

const newWorkOrder = async (customerId?: string, deadline?: string) =>
  idOf(await createWorkOrder(admin, { vehicleId, customerId, mileageKm: '123 456', customerRequest: 'Výmena oleja\nKontrola bŕzd', deadline }, ctx.db));

test.each([
  ['the admin', admin],
  ['the mechanik', mechanic],
])('%s reads the number, the customer, the vehicle, the kilometres, the Termín and the request of a Zákazka', async (_who, user) => {
  const id = await newWorkOrder(undefined, '2026-12-01');

  const sheet = await getJobSheet(user, id, ctx.db);

  expect(sheet).toEqual({
    number: expect.stringMatching(/^Z\d{4}-0001$/),
    customer: { name: 'Firma s.r.o.' },
    vehicle: { vin: 'WVWZZZ1JZ3W386752', licensePlate: 'BA123AB', make: 'Volkswagen', model: 'Golf' },
    mileageKm: 123456,
    deadline: '2026-12-01',
    customerRequest: 'Výmena oleja\nKontrola bŕzd',
  });
});

test('a Zákazka without a Termín has none on the sheet', async () => {
  expect((await getJobSheet(admin, await newWorkOrder(), ctx.db))?.deadline).toBeNull();
});

test('the internal note of the Zákazka is on no sheet', async () => {
  const id = idOf(await createWorkOrder(admin, { vehicleId, mileageKm: '1', customerRequest: 'Brzdy', note: 'Zákazník je dlžník' }, ctx.db));

  expect(JSON.stringify(await getJobSheet(admin, id, ctx.db))).not.toContain('dlžník');
});

test('the zákazkový list has no price key anywhere, even when the Zákazka has priced work and parts bought for it, for the mechanik and the admin', async () => {
  const id = await newWorkOrder();
  idOf(await addItem(admin, id, { kind: 'labour', name: 'Výmena oleja', quantity: '1,5', salePrice: '40', vatRate: '23' }, ctx.db));
  idOf(await addItem(admin, id, { kind: 'part', code: 'OF-1', name: 'Olejový filter', quantity: '1', purchasePrice: '5', salePrice: '9', vatRate: '23' }, ctx.db));

  expect(findPriceKeys(await getJobSheet(mechanic, id, ctx.db))).toEqual([]);
  expect(findPriceKeys(await getJobSheet(admin, id, ctx.db))).toEqual([]);
});

test('the customer is the one the Zákazka was made for, not the Majiteľ the vehicle has now', async () => {
  const otherId = idOf(await createCustomer(admin, { type: 'person', name: 'Iný Zákazník' }, ctx.db));
  const id = await newWorkOrder(otherId);

  expect((await getJobSheet(admin, id, ctx.db))?.customer).toEqual({ name: 'Iný Zákazník' });
});

test('a vehicle without a ŠPZ has none on the sheet', async () => {
  const noPlateId = idOf(await createVehicle(admin, { ownerId, vin: 'TMBZZZ5JZ3W000101', licensePlate: '', make: 'Škoda', model: 'Octavia' }, ctx.db));
  const id = idOf(await createWorkOrder(admin, { vehicleId: noPlateId, mileageKm: '0', customerRequest: 'Brzdy' }, ctx.db));

  expect((await getJobSheet(admin, id, ctx.db))?.vehicle.licensePlate).toBeNull();
});

test('a Zákazka that is Hotová or Zrušená still has its zákazkový list: it is not limited by the state', async () => {
  const done = await newWorkOrder();
  await changeWorkOrderStatus(admin, done, { to: 'done' }, ctx.db);
  const cancelled = await newWorkOrder();
  await changeWorkOrderStatus(admin, cancelled, { to: 'cancelled', confirmed: true }, ctx.db);

  expect(await getJobSheet(admin, done, ctx.db)).not.toBeNull();
  expect(await getJobSheet(admin, cancelled, ctx.db)).not.toBeNull();
});

test('there is no zákazkový list for an id that is no Zákazka, a malformed id included', async () => {
  expect(await getJobSheet(admin, randomUUID(), ctx.db)).toBeNull();
  expect(await getJobSheet(admin, 'not-an-id', ctx.db)).toBeNull();
});
