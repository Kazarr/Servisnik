import { randomUUID } from 'node:crypto';
import { sql } from 'drizzle-orm';
import { afterAll, beforeAll, beforeEach, expect, test, vi } from 'vitest';
import { createCustomer } from '../src/dal/customers.ts';
import { UnauthenticatedError, type User } from '../src/dal/user.ts';
import { createVehicle } from '../src/dal/vehicles.ts';
import {
  addLabour,
  createWorkOrder,
  getWorkOrder,
  listUnclosedWorkOrdersOfVehicle,
  listWorkOrders,
  markWorkOrderDone,
} from '../src/dal/work-orders.ts';
import { createTestDb } from './support/db.ts';
import { idOf } from './support/id-of.ts';

const admin: User = { id: 'user-1', email: 'admin@autoservis.test', name: 'Admin', role: 'admin' };
const summer = new Date('2026-07-15T10:00:00Z');

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

const intake = (overrides: { vehicleId?: string; customerId?: string; mileageKm?: string; customerRequest?: string } = {}) => ({
  vehicleId,
  mileageKm: '123 456',
  customerRequest: 'Výmena oleja',
  ...overrides,
});

const oilChange = { name: 'Výmena oleja', quantity: '1,5', unitPrice: '40', vatRate: '23' };

async function openWorkOrder(overrides: Parameters<typeof intake>[0] = {}, now = summer) {
  return idOf(await createWorkOrder(admin, intake(overrides), ctx.db, now));
}

test('without a user every function rejects, and nothing is written', async () => {
  const id = await openWorkOrder();
  idOf(await addLabour(admin, id, oilChange, ctx.db));
  const before = { orders: await listWorkOrders(admin, ctx.db), detail: await getWorkOrder(admin, id, ctx.db) };

  const rejected = [
    createWorkOrder(null, intake(), ctx.db, summer),
    addLabour(null, id, oilChange, ctx.db),
    markWorkOrderDone(null, id, ctx.db, summer),
    getWorkOrder(null, id, ctx.db),
    listWorkOrders(null, ctx.db),
    listUnclosedWorkOrdersOfVehicle(null, vehicleId, ctx.db),
  ];
  for (const call of rejected) await expect(call).rejects.toBeInstanceOf(UnauthenticatedError);

  expect({ orders: await listWorkOrders(admin, ctx.db), detail: await getWorkOrder(admin, id, ctx.db) }).toEqual(before);
  const counter = await ctx.db.execute(sql`select last_sequence from work_order_counter`);
  expect(counter.rows).toEqual([{ last_sequence: 1 }]);
});

test('a Zákazka is saved Prijatá with its number, vehicle, kilometres and request, and the owner as its customer', async () => {
  const created = await createWorkOrder(admin, intake({ customerRequest: ' Výmena oleja ' }), ctx.db, summer);

  expect(created).toEqual({ ok: true, id: expect.any(String), number: 'Z2026-0001' });
  expect(await getWorkOrder(admin, idOf(created), ctx.db)).toMatchObject({
    number: 'Z2026-0001',
    status: 'received',
    completedOn: null,
    mileageKm: 123456,
    customerRequest: 'Výmena oleja',
    customer: { id: ownerId, name: 'Firma s.r.o.' },
    vehicle: { id: vehicleId, vin: 'WVWZZZ1JZ3W386752', make: 'Volkswagen', model: 'Golf' },
    items: [],
    totals: { net: 0, vat: 0, gross: 0 },
  });
});

test('without a given moment the number carries the current year', async () => {
  const created = await createWorkOrder(admin, intake(), ctx.db);

  expect(created).toMatchObject({ ok: true, number: expect.stringMatching(/^Z\d{4}-0001$/) });
});

test('a Zákazka for another customer than the owner keeps that customer', async () => {
  const other = idOf(await createCustomer(admin, { type: 'person', name: 'Ján Novák' }, ctx.db));

  const id = await openWorkOrder({ customerId: other });

  expect(await getWorkOrder(admin, id, ctx.db)).toMatchObject({ customer: { id: other, name: 'Ján Novák' } });
});

test('after the vehicle is transferred to a new owner the Zákazka stays with its customer', async () => {
  const buyer = idOf(await createCustomer(admin, { type: 'person', name: 'Ján Novák' }, ctx.db));
  const id = await openWorkOrder();

  await ctx.db.execute(sql`update vehicle set owner_id = ${buyer} where id = ${vehicleId}`);
  const next = await openWorkOrder();

  expect(await getWorkOrder(admin, id, ctx.db)).toMatchObject({ customer: { id: ownerId, name: 'Firma s.r.o.' } });
  expect(await getWorkOrder(admin, next, ctx.db)).toMatchObject({ customer: { id: buyer, name: 'Ján Novák' } });
});

test('numbers count up in a year and start again from 1 in the next, by the date in Europe/Bratislava', async () => {
  const numbers = [
    await createWorkOrder(admin, intake(), ctx.db, new Date('2026-03-01T10:00:00Z')),
    await createWorkOrder(admin, intake(), ctx.db, new Date('2026-12-31T22:30:00Z')),
    // 23:30 UTC on New Year's Eve is already 1 January in Bratislava.
    await createWorkOrder(admin, intake(), ctx.db, new Date('2026-12-31T23:30:00Z')),
    await createWorkOrder(admin, intake(), ctx.db, new Date('2027-01-02T10:00:00Z')),
    // The counters are per year: a late entry for 2026 carries on with 2026.
    await createWorkOrder(admin, intake(), ctx.db, new Date('2026-12-31T21:00:00Z')),
  ];

  expect(numbers.map((created) => created.ok && created.number)).toEqual(['Z2026-0001', 'Z2026-0002', 'Z2027-0001', 'Z2027-0002', 'Z2026-0003']);
});

test('ten Zákazky created at once get ten different numbers, with no gap', async () => {
  const created = await Promise.all(Array.from({ length: 10 }, () => createWorkOrder(admin, intake(), ctx.db, summer)));

  const numbers = created.map((result) => (result.ok ? result.number : 'failed')).sort();
  expect(numbers).toEqual(Array.from({ length: 10 }, (_, i) => `Z2026-${String(i + 1).padStart(4, '0')}`));
});

test('the database itself refuses a second Zákazka with the same number', async () => {
  const id = await openWorkOrder();

  const duplicate = ctx.db.execute(sql`
    insert into work_order (number, customer_id, vehicle_id, mileage_km, customer_request)
    select number, customer_id, vehicle_id, mileage_km, customer_request from work_order where id = ${id}
  `);

  await expect(duplicate).rejects.toThrow();
  expect(await listWorkOrders(admin, ctx.db)).toHaveLength(1);
});

test('a Zákazka that breaks a rule is not saved, uses up no number, and every reason comes back', async () => {
  const bad = await createWorkOrder(admin, intake({ mileageKm: '-5', customerRequest: ' ' }), ctx.db, summer);
  const noVehicle = await createWorkOrder(admin, intake({ vehicleId: randomUUID() }), ctx.db, summer);
  const notAnId = await createWorkOrder(admin, intake({ vehicleId: 'vozidlo-1' }), ctx.db, summer);
  const noCustomer = await createWorkOrder(admin, intake({ customerId: randomUUID() }), ctx.db, summer);

  expect(bad).toEqual({ ok: false, errors: { mileageKm: 'invalid', customerRequest: 'required' } });
  expect(noVehicle).toEqual({ ok: false, errors: { vehicle: 'unknown' } });
  expect(notAnId).toEqual({ ok: false, errors: { vehicle: 'unknown' } });
  expect(noCustomer).toEqual({ ok: false, errors: { customer: 'unknown' } });
  expect(await listWorkOrders(admin, ctx.db)).toEqual([]);
  expect(await createWorkOrder(admin, intake(), ctx.db, summer)).toMatchObject({ ok: true, number: 'Z2026-0001' });
});

test('work is added to a Zákazka and its amounts without VAT, VAT and with VAT are shown per item and in total', async () => {
  const id = await openWorkOrder();

  const first = await addLabour(admin, id, oilChange, ctx.db);
  const second = await addLabour(admin, id, { name: ' Kontrola bŕzd ', quantity: '0,25', unitPrice: '33,33', vatRate: '23' }, ctx.db);

  expect(first).toEqual({ ok: true, id: expect.any(String) });
  expect(second).toEqual({ ok: true, id: expect.any(String) });
  const detail = await getWorkOrder(admin, id, ctx.db);
  expect(detail?.items).toMatchObject([
    { kind: 'labour', name: 'Výmena oleja', quantityHundredths: 150, unit: 'h', unitPriceCents: 4000, vatRate: 23, amounts: { net: 6000, vat: 1380, gross: 7380 } },
    { kind: 'labour', name: 'Kontrola bŕzd', quantityHundredths: 25, unit: 'h', unitPriceCents: 3333, vatRate: 23, amounts: { net: 833, vat: 192, gross: 1025 } },
  ]);
  expect(detail?.totals).toEqual({ net: 6833, vat: 1572, gross: 8405 });
});

test('work that breaks a rule is not added, and every reason comes back', async () => {
  const id = await openWorkOrder();

  const result = await addLabour(admin, id, { name: ' ', quantity: '0', unitPrice: '40,505', vatRate: '150' }, ctx.db);

  expect(result).toEqual({ ok: false, errors: { name: 'required', quantity: 'invalid', unitPrice: 'invalid', vatRate: 'invalid' } });
  expect((await getWorkOrder(admin, id, ctx.db))?.items).toEqual([]);
});

test('work is added to a Zákazka that exists and is still Prijatá, and to no other', async () => {
  const done = await openWorkOrder();
  idOf(await addLabour(admin, done, oilChange, ctx.db));
  await markWorkOrderDone(admin, done, ctx.db, summer);
  const invoiced = await openWorkOrder();
  await ctx.db.execute(sql`update work_order set status = 'invoiced' where id = ${invoiced}`);
  const before = await getWorkOrder(admin, done, ctx.db);

  expect(await addLabour(admin, done, oilChange, ctx.db)).toEqual({ ok: false, errors: { workOrder: 'not-editable' } });
  expect(await addLabour(admin, invoiced, oilChange, ctx.db)).toEqual({ ok: false, errors: { workOrder: 'not-editable' } });
  expect(await addLabour(admin, randomUUID(), oilChange, ctx.db)).toEqual({ ok: false, errors: { workOrder: 'unknown' } });
  expect(await addLabour(admin, 'zakazka-1', oilChange, ctx.db)).toEqual({ ok: false, errors: { workOrder: 'unknown' } });
  expect(await getWorkOrder(admin, done, ctx.db)).toEqual(before);
  expect((await getWorkOrder(admin, invoiced, ctx.db))?.items).toEqual([]);
});

test('marking a Zákazka as done makes it Hotová and records the Dátum dokončenia in Europe/Bratislava', async () => {
  const id = await openWorkOrder();

  // 23:30 UTC on New Year's Eve is already 1 January in Bratislava.
  const result = await markWorkOrderDone(admin, id, ctx.db, new Date('2026-12-31T23:30:00Z'));

  expect(result).toEqual({ ok: true });
  expect(await getWorkOrder(admin, id, ctx.db)).toMatchObject({ status: 'done', completedOn: '2027-01-01' });
});

test('a Zákazka that is already Hotová is not marked again, and its Dátum dokončenia stays', async () => {
  const id = await openWorkOrder();
  await markWorkOrderDone(admin, id, ctx.db, new Date('2026-07-15T10:00:00Z'));

  const again = await markWorkOrderDone(admin, id, ctx.db, new Date('2026-07-20T10:00:00Z'));

  expect(again).toEqual({ ok: false, error: 'not-allowed' });
  expect(await getWorkOrder(admin, id, ctx.db)).toMatchObject({ status: 'done', completedOn: '2026-07-15' });
});

test('a Vyfakturovaná Zákazka cannot be marked Hotová, and one that does not exist reads as unknown', async () => {
  const id = await openWorkOrder();
  await ctx.db.execute(sql`update work_order set status = 'invoiced' where id = ${id}`);

  expect(await markWorkOrderDone(admin, id, ctx.db, summer)).toEqual({ ok: false, error: 'not-allowed' });
  expect(await markWorkOrderDone(admin, randomUUID(), ctx.db, summer)).toEqual({ ok: false, error: 'unknown' });
  expect(await markWorkOrderDone(admin, 'zakazka-1', ctx.db, summer)).toEqual({ ok: false, error: 'unknown' });
  expect(await getWorkOrder(admin, id, ctx.db)).toMatchObject({ status: 'invoiced', completedOn: null });
});

test('a double click on "Označiť ako hotovú" marks the Zákazka once', async () => {
  const id = await openWorkOrder();

  const results = await Promise.all([markWorkOrderDone(admin, id, ctx.db, summer), markWorkOrderDone(admin, id, ctx.db, summer)]);

  expect(results).toContainEqual({ ok: true });
  expect(results).toContainEqual({ ok: false, error: 'not-allowed' });
});

test('work added while another request is marking the Zákazka as done waits for it and is then refused', async () => {
  const id = await openWorkOrder();
  const marking = Promise.withResolvers<void>();
  const committed = Promise.withResolvers<void>();
  // The other request: its update holds the row lock until `committed` is resolved.
  const marked = ctx.db.transaction(async (tx) => {
    await tx.execute(sql`update work_order set status = 'done', completed_on = '2026-07-15' where id = ${id}`);
    marking.resolve();
    await committed.promise;
  });
  await marking.promise;

  const adding = addLabour(admin, id, oilChange, ctx.db);
  // Not a timer: go on only once PostgreSQL shows a session of this database waiting for a lock.
  await vi.waitFor(
    async () => {
      const waiting = await ctx.db.execute(sql`select 1 from pg_stat_activity where datname = current_database() and wait_event_type = 'Lock'`);
      expect(waiting.rows).toHaveLength(1);
    },
    { timeout: 10_000 },
  );
  committed.resolve();
  await marked;

  expect(await adding).toEqual({ ok: false, errors: { workOrder: 'not-editable' } });
  expect((await getWorkOrder(admin, id, ctx.db))?.items).toEqual([]);
});

test('Zákazky are listed from the newest with number, customer, vehicle and status', async () => {
  const other = idOf(await createCustomer(admin, { type: 'person', name: 'Ján Novák' }, ctx.db));
  await openWorkOrder();
  const second = await openWorkOrder({ customerId: other });
  await markWorkOrderDone(admin, second, ctx.db, summer);

  const list = await listWorkOrders(admin, ctx.db);

  expect(list.map(({ number, customer, vehicle, status }) => ({ number, customer: customer.name, vehicle: `${vehicle.make} ${vehicle.model}`, status }))).toEqual([
    { number: 'Z2026-0002', customer: 'Ján Novák', vehicle: 'Volkswagen Golf', status: 'done' },
    { number: 'Z2026-0001', customer: 'Firma s.r.o.', vehicle: 'Volkswagen Golf', status: 'received' },
  ]);
});

test('a vehicle lists its Zákazky that are not Uzavretá, Prijatá and Hotová, and not an invoiced one or another vehicle’s', async () => {
  const otherVehicle = idOf(await createVehicle(admin, { ownerId, vin: 'TMBZZZ5JZ3W000002', licensePlate: '', make: 'Škoda', model: 'Fabia' }, ctx.db));
  const received = await openWorkOrder();
  const done = await openWorkOrder();
  await markWorkOrderDone(admin, done, ctx.db, summer);
  const invoiced = await openWorkOrder();
  await ctx.db.execute(sql`update work_order set status = 'invoiced' where id = ${invoiced}`);
  await openWorkOrder({ vehicleId: otherVehicle });

  const unclosed = await listUnclosedWorkOrdersOfVehicle(admin, vehicleId, ctx.db);

  expect(unclosed).toEqual([
    { id: done, number: 'Z2026-0002', status: 'done' },
    { id: received, number: 'Z2026-0001', status: 'received' },
  ]);
  expect(await listUnclosedWorkOrdersOfVehicle(admin, 'vozidlo-1', ctx.db)).toEqual([]);
});

test('a Zákazka that does not exist, or an id that is not one, reads as nothing', async () => {
  await expect(getWorkOrder(admin, randomUUID(), ctx.db)).resolves.toBeNull();
  await expect(getWorkOrder(admin, 'zakazka-1', ctx.db)).resolves.toBeNull();
});
