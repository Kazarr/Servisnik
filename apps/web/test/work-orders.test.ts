import { randomUUID } from 'node:crypto';
import { workOrderStatuses, type WorkOrderStatus } from '@servisnik/domain/work-order';
import { eq, sql } from 'drizzle-orm';
import { afterAll, beforeAll, beforeEach, expect, test, vi } from 'vitest';
import { createCustomer } from '../src/dal/customers.ts';
import { UnauthenticatedError } from '../src/dal/user.ts';
import { createVehicle } from '../src/dal/vehicles.ts';
import {
  addLabour,
  changeWorkOrderStatus,
  createWorkOrder,
  getWorkOrder,
  listWorkOrders,
  listWorkOrdersOfCustomer,
  listWorkOrdersOfVehicle,
} from '../src/dal/work-orders.ts';
import { vehicle } from '../src/db/schema.ts';
import { admin } from './support/dal-users.ts';
import { createTestDb } from './support/db.ts';
import { failInsertsInto } from './support/failing-insert.ts';
import { idOf } from './support/id-of.ts';
import { findPriceKeys } from './support/price-keys.ts';

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

async function newWorkOrderId(overrides: Parameters<typeof intake>[0] = {}, now = summer) {
  return idOf(await createWorkOrder(admin, intake(overrides), ctx.db, now));
}

/** The admin takes a Zákazka to `to`, as the buttons of its detail do. */
const move = (id: string, to: WorkOrderStatus, { confirmed, now = summer }: { confirmed?: boolean; now?: Date } = {}) =>
  changeWorkOrderStatus(admin, id, { to, confirmed }, ctx.db, now);

/** A Zákazka in `status` straight away, as a later ticket or the invoice would leave it. */
async function workOrderIn(status: WorkOrderStatus, completedOn: string | null = null) {
  const id = await newWorkOrderId();
  await ctx.db.execute(sql`update work_order set status = ${status}::work_order_status, completed_on = ${completedOn} where id = ${id}`);
  return id;
}

test('without a user every function rejects, and nothing is written', async () => {
  const id = await newWorkOrderId();
  idOf(await addLabour(admin, id, oilChange, ctx.db));
  const before = { orders: await listWorkOrders(admin, ctx.db), detail: await getWorkOrder(admin, id, ctx.db) };

  const rejected = [
    createWorkOrder(null, intake(), ctx.db, summer),
    addLabour(null, id, oilChange, ctx.db),
    changeWorkOrderStatus(null, id, { to: 'done' }, ctx.db, summer),
    getWorkOrder(null, id, ctx.db),
    listWorkOrders(null, ctx.db),
    listWorkOrdersOfVehicle(null, vehicleId, ctx.db),
    listWorkOrdersOfCustomer(null, ownerId, ctx.db),
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

  const id = await newWorkOrderId({ customerId: other });

  expect(await getWorkOrder(admin, id, ctx.db)).toMatchObject({ customer: { id: other, name: 'Ján Novák' } });
});

test('after the vehicle is transferred to a new owner the Zákazka stays with its customer', async () => {
  const buyer = idOf(await createCustomer(admin, { type: 'person', name: 'Ján Novák' }, ctx.db));
  const id = await newWorkOrderId();

  await ctx.db.execute(sql`update vehicle set owner_id = ${buyer} where id = ${vehicleId}`);
  const next = await newWorkOrderId();

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
  const id = await newWorkOrderId();

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
  const id = await newWorkOrderId();

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
  const id = await newWorkOrderId();

  const result = await addLabour(admin, id, { name: ' ', quantity: '0', unitPrice: '40,505', vatRate: '150' }, ctx.db);

  expect(result).toEqual({ ok: false, errors: { name: 'required', quantity: 'invalid', unitPrice: 'invalid', vatRate: 'invalid' } });
  expect((await getWorkOrder(admin, id, ctx.db))?.items).toEqual([]);
});

test.each([
  ['received', true],
  ['inProgress', true],
  ['waitingForParts', true],
  ['done', false],
  ['invoiced', false],
  ['cancelled', false],
] as const)('work is added to a Zákazka that is %s only if it is Rozpracovaná: %s', async (status, added) => {
  const id = await workOrderIn(status);
  const before = await getWorkOrder(admin, id, ctx.db);

  const result = await addLabour(admin, id, oilChange, ctx.db);

  if (added) {
    expect(result).toEqual({ ok: true, id: expect.any(String) });
    expect((await getWorkOrder(admin, id, ctx.db))?.items).toHaveLength(1);
  } else {
    expect(result).toEqual({ ok: false, errors: { workOrder: 'not-editable' } });
    expect(await getWorkOrder(admin, id, ctx.db)).toEqual(before);
  }
});

test('work is added to no Zákazka that does not exist, and an id that is not one reads as unknown', async () => {
  expect(await addLabour(admin, randomUUID(), oilChange, ctx.db)).toEqual({ ok: false, errors: { workOrder: 'unknown' } });
  expect(await addLabour(admin, 'zakazka-1', oilChange, ctx.db)).toEqual({ ok: false, errors: { workOrder: 'unknown' } });
});

test('marking a Zákazka as done makes it Hotová and records the Dátum dokončenia in Europe/Bratislava', async () => {
  const id = await newWorkOrderId();

  // 23:30 UTC on New Year's Eve is already 1 January in Bratislava.
  const result = await move(id, 'done', { now: new Date('2026-12-31T23:30:00Z') });

  expect(result).toEqual({ ok: true });
  expect(await getWorkOrder(admin, id, ctx.db)).toMatchObject({ status: 'done', completedOn: '2027-01-01' });
});

test('a Zákazka moves between Prijatá, V práci and Čaká na diely in any order, and has no Dátum dokončenia', async () => {
  const id = await newWorkOrderId();

  for (const to of ['waitingForParts', 'inProgress', 'received', 'inProgress', 'waitingForParts'] as const) {
    expect(await move(id, to), `to ${to}`).toEqual({ ok: true });
    expect(await getWorkOrder(admin, id, ctx.db), `after ${to}`).toMatchObject({ status: to, completedOn: null });
  }
});

test.each(['inProgress', 'waitingForParts'] as const)('a Zákazka that is %s is marked Hotová with the Dátum dokončenia', async (status) => {
  const id = await workOrderIn(status);

  expect(await move(id, 'done', { now: new Date('2026-07-15T10:00:00Z') })).toEqual({ ok: true });

  expect(await getWorkOrder(admin, id, ctx.db)).toMatchObject({ status: 'done', completedOn: '2026-07-15' });
});

test('the next transition to Hotová overwrites the Dátum dokončenia of the one before', async () => {
  // A Zákazka that was Hotová and went back to work (the ticket that does it comes later) still carries its first date.
  const id = await workOrderIn('inProgress', '2026-07-15');

  expect(await move(id, 'done', { now: new Date('2026-08-01T10:00:00Z') })).toEqual({ ok: true });

  expect(await getWorkOrder(admin, id, ctx.db)).toMatchObject({ status: 'done', completedOn: '2026-08-01' });
});

test('a move between rozpracované statuses leaves the Dátum dokončenia as it was', async () => {
  const id = await workOrderIn('waitingForParts', '2026-07-15');

  expect(await move(id, 'inProgress')).toEqual({ ok: true });

  expect(await getWorkOrder(admin, id, ctx.db)).toMatchObject({ status: 'inProgress', completedOn: '2026-07-15' });
});

test.each(['received', 'inProgress', 'waitingForParts'] as const)('a Zákazka that is %s is cancelled only once the cancelling is confirmed', async (status) => {
  const id = await workOrderIn(status);

  expect(await move(id, 'cancelled')).toEqual({ ok: false, error: 'confirmation-required' });
  expect(await move(id, 'cancelled', { confirmed: false })).toEqual({ ok: false, error: 'confirmation-required' });
  expect(await getWorkOrder(admin, id, ctx.db)).toMatchObject({ status, completedOn: null });

  expect(await move(id, 'cancelled', { confirmed: true })).toEqual({ ok: true });
  expect(await getWorkOrder(admin, id, ctx.db)).toMatchObject({ status: 'cancelled', completedOn: null });
});

test('a cancelled Zákazka keeps its number and stays in the list, and the next Zákazka does not get the number', async () => {
  const first = await newWorkOrderId();
  await move(first, 'cancelled', { confirmed: true });

  const second = await newWorkOrderId();

  expect(await getWorkOrder(admin, first, ctx.db)).toMatchObject({ number: 'Z2026-0001', status: 'cancelled' });
  expect(await getWorkOrder(admin, second, ctx.db)).toMatchObject({ number: 'Z2026-0002', status: 'received' });
  expect((await listWorkOrders(admin, ctx.db)).map(({ number, status }) => ({ number, status }))).toEqual([
    { number: 'Z2026-0002', status: 'received' },
    { number: 'Z2026-0001', status: 'cancelled' },
  ]);
});

test('a Zákazka that is Hotová, Vyfakturovaná or Zrušená is taken to no status by the user, and stays as it is', async () => {
  for (const status of ['done', 'invoiced', 'cancelled'] as const) {
    const id = await workOrderIn(status, status === 'done' ? '2026-07-15' : null);
    const before = await getWorkOrder(admin, id, ctx.db);

    for (const to of workOrderStatuses) {
      expect(await move(id, to, { confirmed: true }), `${status} -> ${to}`).toEqual({ ok: false, error: 'not-allowed' });
    }

    expect(await getWorkOrder(admin, id, ctx.db)).toEqual(before);
  }
});

test('a status the user may not reach from the current one is refused whatever the confirmation, and one that does not exist reads as unknown', async () => {
  const id = await workOrderIn('invoiced');

  expect(await move(id, 'received')).toEqual({ ok: false, error: 'not-allowed' });
  expect(await move(id, 'cancelled')).toEqual({ ok: false, error: 'not-allowed' });
  expect(await move(id, 'cancelled', { confirmed: true })).toEqual({ ok: false, error: 'not-allowed' });
  expect(await move(randomUUID(), 'done')).toEqual({ ok: false, error: 'unknown' });
  expect(await move('zakazka-1', 'done')).toEqual({ ok: false, error: 'unknown' });
  expect(await getWorkOrder(admin, id, ctx.db)).toMatchObject({ status: 'invoiced', completedOn: null });
});

test('a double click on "Označiť ako hotovú" marks the Zákazka once, and one on "Potvrdiť zrušenie" cancels it once', async () => {
  const marked = await newWorkOrderId();
  const cancelled = await newWorkOrderId();

  const marks = await Promise.all([move(marked, 'done'), move(marked, 'done')]);
  const cancels = await Promise.all([move(cancelled, 'cancelled', { confirmed: true }), move(cancelled, 'cancelled', { confirmed: true })]);

  for (const results of [marks, cancels]) {
    expect(results).toContainEqual({ ok: true });
    expect(results).toContainEqual({ ok: false, error: 'not-allowed' });
  }
});

test('work added while another request is marking the Zákazka as done waits for it and is then refused', async () => {
  const id = await newWorkOrderId();
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
  await newWorkOrderId();
  const second = await newWorkOrderId({ customerId: other });
  await move(second, 'done');

  const list = await listWorkOrders(admin, ctx.db);

  expect(list.map(({ number, customer, vehicle, status }) => ({ number, customer: customer.name, vehicle: `${vehicle.make} ${vehicle.model}`, status }))).toEqual([
    { number: 'Z2026-0002', customer: 'Ján Novák', vehicle: 'Volkswagen Golf', status: 'done' },
    { number: 'Z2026-0001', customer: 'Firma s.r.o.', vehicle: 'Volkswagen Golf', status: 'received' },
  ]);
});

test('a vehicle lists all its Zákazky from the newest with their customer, in every status and whoever the owner is, and not another vehicle’s', async () => {
  const other = idOf(await createCustomer(admin, { type: 'person', name: 'Ján Novák' }, ctx.db));
  const otherVehicle = idOf(await createVehicle(admin, { ownerId, vin: 'TMBZZZ5JZ3W000002', licensePlate: '', make: 'Škoda', model: 'Fabia' }, ctx.db));
  // One Zákazka per status, oldest first, then one whose customer is not the owner of the vehicle.
  const oldestFirst: { id: string; status: WorkOrderStatus; customer: string }[] = [];
  for (const status of workOrderStatuses) oldestFirst.push({ id: await workOrderIn(status), status, customer: 'Firma s.r.o.' });
  oldestFirst.push({ id: await newWorkOrderId({ customerId: other }), status: 'received', customer: 'Ján Novák' });
  await newWorkOrderId({ vehicleId: otherVehicle });

  const history = await listWorkOrdersOfVehicle(admin, vehicleId, ctx.db);

  expect(history.map(({ id, status, customer }) => ({ id, status, customer: customer.name }))).toEqual(oldestFirst.reverse());
  expect(findPriceKeys(history)).toEqual([]);
});

test('a vehicle with no Zákazky, one that does not exist and an id that is not one list nothing', async () => {
  const otherVehicle = idOf(await createVehicle(admin, { ownerId, vin: 'TMBZZZ5JZ3W000002', licensePlate: '', make: 'Škoda', model: 'Fabia' }, ctx.db));
  await newWorkOrderId({ vehicleId: otherVehicle });

  expect(await listWorkOrdersOfVehicle(admin, vehicleId, ctx.db)).toEqual([]);
  expect(await listWorkOrdersOfVehicle(admin, randomUUID(), ctx.db)).toEqual([]);
  expect(await listWorkOrdersOfVehicle(admin, 'vozidlo-1', ctx.db)).toEqual([]);
});

test('a customer lists every Zákazka they are the customer of, from the newest, and none of other customers on their vehicles', async () => {
  const other = idOf(await createCustomer(admin, { type: 'person', name: 'Ján Novák' }, ctx.db));
  const second = idOf(await createVehicle(admin, { ownerId, vin: 'TMBZZZ5JZ3W000002', licensePlate: '', make: 'Škoda', model: 'Fabia' }, ctx.db));
  const received = await newWorkOrderId();
  const done = await newWorkOrderId({ vehicleId: second });
  await move(done, 'done');
  const invoiced = await workOrderIn('invoiced'); // Uzavretá, and still listed
  await newWorkOrderId({ customerId: other }); // on a vehicle of the owner, but for someone else

  const orders = await listWorkOrdersOfCustomer(admin, ownerId, ctx.db);

  expect(orders).toEqual([
    {
      id: invoiced,
      number: 'Z2026-0003',
      status: 'invoiced',
      customer: { id: ownerId, name: 'Firma s.r.o.' },
      vehicle: { id: vehicleId, vin: 'WVWZZZ1JZ3W386752', licensePlate: 'BA123AB', make: 'Volkswagen', model: 'Golf' },
    },
    expect.objectContaining({ id: done, number: 'Z2026-0002', status: 'done', vehicle: expect.objectContaining({ id: second }) }),
    expect.objectContaining({ id: received, number: 'Z2026-0001', status: 'received' }),
  ]);
});

test('after a Prepis the Zákazky stay with the customer they were made for, not with the owner of the vehicle', async () => {
  const buyer = idOf(await createCustomer(admin, { type: 'person', name: 'Ján Novák' }, ctx.db));
  const sold = await newWorkOrderId();
  await ctx.db.execute(sql`update vehicle set owner_id = ${buyer} where id = ${vehicleId}`);
  const bought = await newWorkOrderId();

  expect((await listWorkOrdersOfCustomer(admin, ownerId, ctx.db)).map(({ id }) => id)).toEqual([sold]);
  expect((await listWorkOrdersOfCustomer(admin, buyer, ctx.db)).map(({ id }) => id)).toEqual([bought]);
});

test('a customer without Zákazky, one that does not exist, or an id that is not one, lists nothing', async () => {
  const idle = idOf(await createCustomer(admin, { type: 'person', name: 'Ján Novák' }, ctx.db));
  await newWorkOrderId();

  await expect(listWorkOrdersOfCustomer(admin, idle, ctx.db)).resolves.toEqual([]);
  await expect(listWorkOrdersOfCustomer(admin, randomUUID(), ctx.db)).resolves.toEqual([]);
  await expect(listWorkOrdersOfCustomer(admin, 'zakaznik-1', ctx.db)).resolves.toEqual([]);
});

test('a Zákazka that does not exist, or an id that is not one, reads as nothing', async () => {
  await expect(getWorkOrder(admin, randomUUID(), ctx.db)).resolves.toBeNull();
  await expect(getWorkOrder(admin, 'zakazka-1', ctx.db)).resolves.toBeNull();
});

// Kilometres at intake (Príjem vozidla): the rule itself is packages/domain/test/work-order.test.ts; here it is
// proven against PostgreSQL, in the same transaction as the Zákazka.

/** The whole row of the vehicle, `updatedAt` too, as the database holds it. */
const vehicleRow = async () => (await ctx.db.select().from(vehicle).where(eq(vehicle.id, vehicleId)))[0]!;
const setVehicleKm = (km: number) => ctx.db.execute(sql`update vehicle set mileage_km = ${km} where id = ${vehicleId}`);

test('the kilometres of a Zákazka become the Stav km of a vehicle that has none yet', async () => {
  expect((await vehicleRow()).mileageKm).toBeNull();

  const created = await createWorkOrder(admin, intake({ mileageKm: '123 456' }), ctx.db, summer);

  expect(created).toEqual({ ok: true, id: expect.any(String), number: 'Z2026-0001' });
  expect((await vehicleRow()).mileageKm).toBe(123456);
});

test('higher kilometres become the Stav km of the vehicle, and the Zákazka keeps them', async () => {
  await setVehicleKm(100000);

  const id = await newWorkOrderId({ mileageKm: '100 500' });

  expect((await vehicleRow()).mileageKm).toBe(100500);
  expect(await getWorkOrder(admin, id, ctx.db)).toMatchObject({ mileageKm: 100500 });
});

test('lower kilometres are kept on the Zákazka and come back as a warning, and the vehicle is not touched', async () => {
  await setVehicleKm(100000);
  const before = await vehicleRow();

  const created = await createWorkOrder(admin, intake({ mileageKm: '90 000' }), ctx.db, summer);

  expect(created).toEqual({ ok: true, id: expect.any(String), number: 'Z2026-0001', lowerMileage: { vehicleMileageKm: 100000 } });
  expect(await getWorkOrder(admin, idOf(created), ctx.db)).toMatchObject({ mileageKm: 90000 });
  expect(await vehicleRow()).toEqual(before);
});

test('the same kilometres as the Stav km of the vehicle change nothing and warn of nothing', async () => {
  await setVehicleKm(100000);
  const before = await vehicleRow();

  const created = await createWorkOrder(admin, intake({ mileageKm: '100000' }), ctx.db, summer);

  expect(created).toEqual({ ok: true, id: expect.any(String), number: 'Z2026-0001' });
  expect(await vehicleRow()).toEqual(before);
});

test('a Zákazka refused for another reason leaves the Stav km of the vehicle alone', async () => {
  await setVehicleKm(100000);
  const before = await vehicleRow();

  const refused = await createWorkOrder(admin, intake({ mileageKm: '200000', customerId: randomUUID() }), ctx.db, summer);

  expect(refused).toEqual({ ok: false, errors: { customer: 'unknown' } });
  expect(await vehicleRow()).toEqual(before);
});

test('a Zákazka that cannot be saved leaves the Stav km of the vehicle and the number alone', async () => {
  await setVehicleKm(100000);
  const before = await vehicleRow();
  const lift = await failInsertsInto(ctx.db, 'work_order');

  try {
    await expect(createWorkOrder(admin, intake({ mileageKm: '200000' }), ctx.db, summer)).rejects.toThrow();
  } finally {
    await lift();
  }

  expect(await vehicleRow()).toEqual(before);
  expect((await ctx.db.execute(sql`select 1 from work_order_counter`)).rows).toEqual([]);
});

test('kilometres read the Stav km of the vehicle after another save of it has committed, so a lower one cannot overwrite a higher one', async () => {
  await setVehicleKm(100000);
  const raising = Promise.withResolvers<void>();
  const committed = Promise.withResolvers<void>();
  // The other save: another intake raised the Stav km to 200 000 and holds the row until `committed` is resolved.
  const raised = ctx.db.transaction(async (tx) => {
    await tx.execute(sql`update vehicle set mileage_km = 200000 where id = ${vehicleId}`);
    raising.resolve();
    await committed.promise;
  });
  await raising.promise;

  const creating = createWorkOrder(admin, intake({ mileageKm: '150 000' }), ctx.db, summer);
  try {
    // Not a timer: go on only once PostgreSQL shows a session of this database waiting for a lock.
    await vi.waitFor(
      async () => {
        const waiting = await ctx.db.execute(sql`select 1 from pg_stat_activity where datname = current_database() and wait_event_type = 'Lock'`);
        expect(waiting.rows).toHaveLength(1);
      },
      { timeout: 10_000 },
    );
  } finally {
    // Also when nothing waits: the other save must end, or its connection keeps the pool open.
    committed.resolve();
    await raised;
  }

  expect(await creating).toMatchObject({ ok: true, lowerMileage: { vehicleMileageKm: 200000 } });
  expect((await vehicleRow()).mileageKm).toBe(200000);
});

test('Zákazky created at once on one vehicle leave its Stav km at the highest kilometres', async () => {
  const kilometres = ['150 000', '90 000', '200 000', '120 000', '180 000'];

  const created = await Promise.all(kilometres.map((mileageKm) => createWorkOrder(admin, intake({ mileageKm }), ctx.db, summer)));

  expect(created.every(({ ok }) => ok)).toBe(true);
  expect((await vehicleRow()).mileageKm).toBe(200000);
});
