import { randomUUID } from 'node:crypto';
import type { WorkOrderStatus } from '@servisnik/domain/work-order';
import { sql } from 'drizzle-orm';
import { afterAll, beforeAll, beforeEach, expect, test } from 'vitest';
import { createCustomer } from '../src/dal/customers.ts';
import { getHandoverProtocol } from '../src/dal/print-forms.ts';
import { createVehicle } from '../src/dal/vehicles.ts';
import { addItem, changeWorkOrderStatus, createWorkOrder } from '../src/dal/work-orders.ts';
import { admin } from './support/dal-users.ts';
import { createTestDb } from './support/db.ts';
import { idOf } from './support/id-of.ts';
import { findPriceKeys } from './support/price-keys.ts';

// The data of the Odovzdávací protokol (GLOSSARY): the customer, the vehicle, the kilometres at intake and the work and
// parts of the Zákazka with their quantities and units, and no price.

let ctx: Awaited<ReturnType<typeof createTestDb>>;
let ownerId: string;
let vehicleId: string;
beforeAll(async () => {
  ctx = await createTestDb();
});
afterAll(() => ctx.close());
beforeEach(async () => {
  await ctx.db.execute(sql`truncate customer, work_order_counter cascade`);
  await ctx.db.execute(sql`update workshop set vat_rates = '{23,19,5}', default_vat_rate = 23`);
  ownerId = idOf(await createCustomer(admin, { type: 'company', name: 'Firma s.r.o.', ico: '12345678' }, ctx.db));
  vehicleId = idOf(await createVehicle(admin, { ownerId, vin: 'WVWZZZ1JZ3W386752', licensePlate: 'BA123AB', make: 'Volkswagen', model: 'Golf' }, ctx.db));
});

const newWorkOrder = async (customerId?: string) =>
  idOf(await createWorkOrder(admin, { vehicleId, customerId, mileageKm: '123 456', customerRequest: 'Výmena oleja', note: 'Zákazník je dlžník' }, ctx.db));

/** The Zákazka when the customer takes the vehicle over: Hotová. It comes after the items, which change only while a Zákazka is Rozpracovaná. */
const handedOver = async (id: string) => {
  await changeWorkOrderStatus(admin, id, { to: 'done' }, ctx.db);
  return id;
};

/**
 * The Zákazka in `status`, reached the way the app reaches it: Prijatá is where a Zákazka starts, the others the admin's
 * buttons. Only Vyfakturovaná is written straight, as the invoice would leave it: nothing in the app makes it yet.
 */
async function setStatus(id: string, status: WorkOrderStatus) {
  if (status === 'invoiced') await ctx.db.execute(sql`update work_order set status = ${status}::work_order_status where id = ${id}`);
  else if (status !== 'received') expect(await changeWorkOrderStatus(admin, id, { to: status, confirmed: true }, ctx.db)).toEqual({ ok: true });
  return id;
}

test('the admin reads the number, the customer, the vehicle, the kilometres and the work and parts with their quantities and units', async () => {
  const id = await newWorkOrder();
  await addItem(admin, id, { kind: 'labour', name: 'Výmena oleja', quantity: '1,5', unitPrice: '40' }, ctx.db);
  await addItem(admin, id, { kind: 'part', code: 'OL-5W30', name: 'Olej 5W-30', quantity: '4,25', unit: 'l', purchasePrice: '8', unitPrice: '12,50' }, ctx.db);
  await handedOver(id);

  const protocol = await getHandoverProtocol(admin, id, ctx.db);

  expect(protocol).toEqual({
    number: expect.stringMatching(/^Z\d{4}-0001$/),
    customer: { name: 'Firma s.r.o.' },
    vehicle: { vin: 'WVWZZZ1JZ3W386752', licensePlate: 'BA123AB', make: 'Volkswagen', model: 'Golf' },
    mileageKm: 123456,
    items: [
      { kind: 'labour', code: null, name: 'Výmena oleja', quantityHundredths: 150, unit: 'h' },
      { kind: 'part', code: 'OL-5W30', name: 'Olej 5W-30', quantityHundredths: 425, unit: 'l' },
    ],
  });
});

test('the protocol has no price key anywhere, though the Zákazka has priced work and parts bought for it, and no internal note', async () => {
  const id = await newWorkOrder();
  await addItem(admin, id, { kind: 'labour', name: 'Výmena oleja', quantity: '1,5', unitPrice: '40', vatRate: '23' }, ctx.db);
  await addItem(admin, id, { kind: 'part', code: 'OF-1', name: 'Olejový filter', quantity: '1', purchasePrice: '5', unitPrice: '9', vatRate: '23' }, ctx.db);
  await handedOver(id);

  const protocol = await getHandoverProtocol(admin, id, ctx.db);

  expect(findPriceKeys(protocol)).toEqual([]);
  expect(JSON.stringify(protocol)).not.toContain('dlžník');
});

test('the items come in the order they were added', async () => {
  const id = await newWorkOrder();
  for (const name of ['Prvá', 'Druhá', 'Tretia', 'Štvrtá']) await addItem(admin, id, { kind: 'labour', name, quantity: '1', unitPrice: '1' }, ctx.db);
  await handedOver(id);

  expect(await getHandoverProtocol(admin, id, ctx.db)).toMatchObject({ items: [{ name: 'Prvá' }, { name: 'Druhá' }, { name: 'Tretia' }, { name: 'Štvrtá' }] });
});

test('a Zákazka without items has an empty list', async () => {
  expect(await getHandoverProtocol(admin, await handedOver(await newWorkOrder()), ctx.db)).toMatchObject({ items: [] });
});

test('a vehicle without a ŠPZ has none on the protocol, and the customer is the one the Zákazka was made for', async () => {
  const otherId = idOf(await createCustomer(admin, { type: 'person', name: 'Iný Zákazník' }, ctx.db));
  const noPlateId = idOf(await createVehicle(admin, { ownerId, vin: 'TMBZZZ5JZ3W000101', licensePlate: '', make: 'Škoda', model: 'Octavia' }, ctx.db));
  const id = await handedOver(idOf(await createWorkOrder(admin, { vehicleId: noPlateId, customerId: otherId, mileageKm: '0', customerRequest: 'Brzdy' }, ctx.db)));

  const protocol = await getHandoverProtocol(admin, id, ctx.db);

  expect(protocol).toMatchObject({ vehicle: { licensePlate: null }, customer: { name: 'Iný Zákazník' } });
});

// The customer takes the vehicle over when the work is done (Kazarr, #139): Hotová, and Vyfakturovaná so that it prints after the invoice.
test.each(['done', 'invoiced'] as const)('a Zákazka that is %s has its protocol', async (status) => {
  const id = await newWorkOrder();
  await addItem(admin, id, { kind: 'labour', name: 'Výmena oleja', quantity: '1', unitPrice: '40' }, ctx.db);
  await setStatus(id, status);

  expect(await getHandoverProtocol(admin, id, ctx.db)).toMatchObject({ number: expect.stringMatching(/^Z\d{4}-0001$/), items: [{ name: 'Výmena oleja' }] });
});

test.each(['received', 'inProgress', 'waitingForParts', 'cancelled'] as const)('a Zákazka that is %s has no protocol: it is refused, and nothing of the Zákazka comes back', async (status) => {
  const id = await newWorkOrder();
  await addItem(admin, id, { kind: 'labour', name: 'Výmena oleja', quantity: '1', unitPrice: '40' }, ctx.db);
  await setStatus(id, status);

  expect(await getHandoverProtocol(admin, id, ctx.db)).toBe('wrong-status');
});

test('there is no protocol for an id that is no Zákazka, a malformed id included', async () => {
  expect(await getHandoverProtocol(admin, randomUUID(), ctx.db)).toBeNull();
  expect(await getHandoverProtocol(admin, 'not-an-id', ctx.db)).toBeNull();
});
