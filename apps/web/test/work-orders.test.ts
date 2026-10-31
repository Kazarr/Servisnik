import type { PriceListItemInput } from '@servisnik/domain/price-list';
import { workOrderStatuses, type ItemInput, type WorkOrderStatus } from '@servisnik/domain/work-order';
import { randomUUID } from 'node:crypto';
import { eq, sql } from 'drizzle-orm';
import { afterAll, beforeAll, beforeEach, expect, test } from 'vitest';
import { createCustomer } from '../src/dal/customers.ts';
import { createPriceListItem, deletePriceListItem, updatePriceListItem } from '../src/dal/price-list.ts';
import { UnauthenticatedError } from '../src/dal/user.ts';
import { createVehicle, transferOwnership } from '../src/dal/vehicles.ts';
import {
  addItem,
  addItemFromPriceList,
  changeWorkOrderStatus,
  createWorkOrder,
  deleteItem,
  getWorkOrder,
  listWorkOrders,
  setHandoverMileage,
  updateWorkOrderHeader,
  updateItem,
  listWorkOrdersOfCustomer,
  listWorkOrdersOfVehicle,
} from '../src/dal/work-orders.ts';
import { vehicle } from '../src/db/schema.ts';
import { admin } from './support/dal-users.ts';
import { createTestDb } from './support/db.ts';
import { failInsertsInto } from './support/failing-insert.ts';
import { idOf } from './support/id-of.ts';
import { untilLockWaits } from './support/lock-waits.ts';
import { findPriceKeys } from './support/price-keys.ts';
import { truncateTables } from './support/reset.ts';
import { savedInOrder } from './support/saved-in-order.ts';

const summer = new Date('2026-07-15T10:00:00Z');

let ctx: Awaited<ReturnType<typeof createTestDb>>;
let ownerId: string;
let vehicleId: string;
beforeAll(async () => {
  ctx = await createTestDb();
});
afterAll(() => ctx.close());
beforeEach(async () => {
  await truncateTables(ctx.db, 'customer', 'work_order_counter', 'price_list_item');
  await ctx.db.execute(sql`update workshop set vat_rates = '{23,19,5}', default_vat_rate = 23`); // the rates the migration starts with; some tests change them
  ownerId = idOf(await createCustomer(admin, { type: 'company', name: 'Firma s.r.o.', ico: '12345678' }, ctx.db));
  vehicleId = idOf(await createVehicle(admin, { ownerId, vin: 'WVWZZZ1JZ3W386752', licensePlate: 'BA123AB', make: 'Volkswagen', model: 'Golf' }, ctx.db));
});

const intake = (overrides: { vehicleId?: string; customerId?: string; mileageKm?: string; customerRequest?: string; deadline?: string; note?: string } = {}) => ({
  vehicleId,
  mileageKm: '123 456',
  customerRequest: 'Výmena oleja',
  ...overrides,
});

const oilChange: ItemInput = { kind: 'labour', name: 'Výmena oleja', quantity: '1,5', salePrice: '40', vatRate: '23' };

/** The new header of a Zákazka: every value the edit form sends, none of them the one `intake` saves. */
const newHeader = { mileageKm: '150 000', customerRequest: 'Výmena brzdových kotúčov', deadline: '2026-08-01', note: 'Zákazník príde po 16:00' };

/** The Zákazky of the page of the list `query` asks for, newest first; the list is the default one (Neuzavreté) when it asks for none. */
const listed = async (query: Parameters<typeof listWorkOrders>[1] = {}) => (await listWorkOrders(admin, query, ctx.db)).orders;

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

/**
 * Runs `act` while another request keeps what `hold` took in its transaction, and lets that request commit only once
 * PostgreSQL shows a session of this database waiting for a lock (not after a timer), so `act` has met the lock and
 * sees what the request left. The request commits whatever happens to `act`, so a failing test never hangs on it.
 */
async function whileHeld(hold: (tx: Parameters<Parameters<typeof ctx.db.transaction>[0]>[0]) => Promise<unknown>, act: () => Promise<unknown>) {
  const holding = Promise.withResolvers<void>();
  const committed = Promise.withResolvers<void>();
  const other = ctx.db.transaction(async (tx) => {
    await hold(tx);
    holding.resolve();
    await committed.promise;
  });
  other.catch(holding.reject);
  await holding.promise;

  const acting = act();
  try {
    await untilLockWaits(ctx.db);
  } finally {
    committed.resolve();
    await other;
    await acting.catch(() => {}); // when waiting failed, `act` still finishes before the next test resets the tables (#134); the failure is the one reported
  }
  return acting;
}

test('without a user every function rejects, and nothing is written', async () => {
  const id = await newWorkOrderId();
  const itemId = idOf(await addItem(admin, id, oilChange, ctx.db));
  const before = { orders: await listed(), detail: await getWorkOrder(admin, id, ctx.db) };

  const rejected = [
    createWorkOrder(null, intake(), ctx.db, summer),
    addItem(null, id, oilChange, ctx.db),
    addItemFromPriceList(null, id, randomUUID(), ctx.db),
    updateWorkOrderHeader(null, id, newHeader, ctx.db),
    updateItem(null, itemId, { name: 'Iný názov', quantity: '1', salePrice: '1' }, ctx.db),
    deleteItem(null, itemId, ctx.db),
    changeWorkOrderStatus(null, id, { to: 'done' }, ctx.db, summer),
    getWorkOrder(null, id, ctx.db),
    listWorkOrders(null, {}, ctx.db),
    listWorkOrdersOfVehicle(null, vehicleId, ctx.db),
    listWorkOrdersOfCustomer(null, ownerId, ctx.db),
  ];
  for (const call of rejected) await expect(call).rejects.toBeInstanceOf(UnauthenticatedError);

  expect({ orders: await listed(), detail: await getWorkOrder(admin, id, ctx.db) }).toEqual(before);
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

  await transferOwnership(admin, vehicleId, { fromOwnerId: ownerId, toOwnerId: buyer }, ctx.db);
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
  expect(await listed()).toHaveLength(1);
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
  expect(await listed({ status: 'all' })).toEqual([]);
  expect(await createWorkOrder(admin, intake(), ctx.db, summer)).toMatchObject({ ok: true, number: 'Z2026-0001' });
});

test('work is added to a Zákazka and its amounts without VAT, VAT and with VAT are shown per item and in total', async () => {
  const id = await newWorkOrderId();

  const first = await addItem(admin, id, oilChange, ctx.db);
  const second = await addItem(admin, id, { kind: 'labour', name: ' Kontrola bŕzd ', quantity: '0,25', salePrice: '33,33', vatRate: '23' }, ctx.db);

  expect(first).toEqual({ ok: true, id: expect.any(String) });
  expect(second).toEqual({ ok: true, id: expect.any(String) });
  const detail = await getWorkOrder(admin, id, ctx.db);
  expect(detail?.items).toMatchObject([
    { kind: 'labour', name: 'Výmena oleja', quantityHundredths: 150, unit: 'h', salePriceCents: 4000, vatRate: 23, amounts: { net: 6000, vat: 1380, gross: 7380 } },
    { kind: 'labour', name: 'Kontrola bŕzd', quantityHundredths: 25, unit: 'h', salePriceCents: 3333, vatRate: 23, amounts: { net: 833, vat: 192, gross: 1025 } },
  ]);
  expect(detail?.totals).toEqual({ net: 6833, vat: 1572, gross: 8405 });
});

test('work that breaks a rule is not added, and every reason comes back', async () => {
  const id = await newWorkOrderId();

  const result = await addItem(admin, id, { kind: 'labour', name: ' ', quantity: '0', salePrice: '40,505', vatRate: '150' }, ctx.db);

  expect(result).toEqual({ ok: false, errors: { name: 'required', quantity: 'invalid', salePrice: 'invalid', vatRate: 'invalid' } });
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

  const result = await addItem(admin, id, oilChange, ctx.db);

  if (added) {
    expect(result).toEqual({ ok: true, id: expect.any(String) });
    expect((await getWorkOrder(admin, id, ctx.db))?.items).toHaveLength(1);
  } else {
    expect(result).toEqual({ ok: false, errors: { workOrder: 'not-editable' } });
    expect(await getWorkOrder(admin, id, ctx.db)).toEqual(before);
  }
});

test('work is added to no Zákazka that does not exist, and an id that is not one reads as unknown', async () => {
  expect(await addItem(admin, randomUUID(), oilChange, ctx.db)).toEqual({ ok: false, errors: { workOrder: 'unknown' } });
  expect(await addItem(admin, 'zakazka-1', oilChange, ctx.db)).toEqual({ ok: false, errors: { workOrder: 'unknown' } });
});

test('a Zákazka is saved with a Termín and a note, and without them it has none', async () => {
  const withBoth = await newWorkOrderId({ ...newHeader });
  const without = await newWorkOrderId();

  expect(await getWorkOrder(admin, withBoth, ctx.db)).toMatchObject({ deadline: '2026-08-01', note: 'Zákazník príde po 16:00' });
  expect(await getWorkOrder(admin, without, ctx.db)).toMatchObject({ deadline: null, note: null });
});

test('a Zákazka with a Termín that is not a day is not saved and uses up no number', async () => {
  const bad = await createWorkOrder(admin, intake({ deadline: '2026-02-30' }), ctx.db, summer);

  expect(bad).toEqual({ ok: false, errors: { deadline: 'invalid' } });
  expect(await listed({ status: 'all' })).toEqual([]);
  expect(await createWorkOrder(admin, intake(), ctx.db, summer)).toMatchObject({ ok: true, number: 'Z2026-0001' });
});

test.each(['received', 'inProgress', 'waitingForParts'] as const)(
  'the header of a Zákazka that is %s is edited: kilometres, request, Termín and note, and nothing else',
  async (status) => {
    const id = await workOrderIn(status);
    await addItem(admin, id, oilChange, ctx.db);
    const before = await getWorkOrder(admin, id, ctx.db);

    const result = await updateWorkOrderHeader(admin, id, { ...newHeader, customerRequest: ' Výmena brzdových kotúčov ' }, ctx.db);

    expect(result).toEqual({ ok: true });
    expect(await getWorkOrder(admin, id, ctx.db)).toEqual({
      ...before,
      mileageKm: 150000,
      customerRequest: 'Výmena brzdových kotúčov',
      deadline: '2026-08-01',
      note: 'Zákazník príde po 16:00',
    });
  },
);

test('the Termín and the note are cleared by saving them blank', async () => {
  const id = await newWorkOrderId({ ...newHeader });

  const result = await updateWorkOrderHeader(admin, id, { ...newHeader, deadline: '', note: '  ' }, ctx.db);

  expect(result).toEqual({ ok: true });
  expect(await getWorkOrder(admin, id, ctx.db)).toMatchObject({ deadline: null, note: null });
});

test.each(['done', 'invoiced', 'cancelled'] as const)('the header of a Zákazka that is %s is not edited, and the Zákazka stays as it is', async (status) => {
  const id = await workOrderIn(status, status === 'done' ? '2026-07-15' : null);
  const before = await getWorkOrder(admin, id, ctx.db);

  const result = await updateWorkOrderHeader(admin, id, newHeader, ctx.db);

  expect(result).toEqual({ ok: false, errors: { workOrder: 'not-editable' } });
  expect(await getWorkOrder(admin, id, ctx.db)).toEqual(before);
});

test('a header that breaks a rule is not saved, and every reason comes back', async () => {
  const id = await newWorkOrderId({ ...newHeader });
  const before = await getWorkOrder(admin, id, ctx.db);

  const result = await updateWorkOrderHeader(admin, id, { mileageKm: '-5', customerRequest: ' ', deadline: 'zajtra', note: 'Nová poznámka' }, ctx.db);

  expect(result).toEqual({ ok: false, errors: { mileageKm: 'invalid', customerRequest: 'required', deadline: 'invalid' } });
  expect(await getWorkOrder(admin, id, ctx.db)).toEqual(before);
});

test('the header of no Zákazka that does not exist is edited, and an id that is not one reads as unknown', async () => {
  expect(await updateWorkOrderHeader(admin, randomUUID(), newHeader, ctx.db)).toEqual({ ok: false, errors: { workOrder: 'unknown' } });
  expect(await updateWorkOrderHeader(admin, 'zakazka-1', newHeader, ctx.db)).toEqual({ ok: false, errors: { workOrder: 'unknown' } });
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

test('a cancelled Zákazka keeps its number and stays in the list of Všetky, and the next Zákazka does not get the number', async () => {
  const first = await newWorkOrderId();
  await move(first, 'cancelled', { confirmed: true });

  const second = await newWorkOrderId();

  expect(await getWorkOrder(admin, first, ctx.db)).toMatchObject({ number: 'Z2026-0001', status: 'cancelled' });
  expect(await getWorkOrder(admin, second, ctx.db)).toMatchObject({ number: 'Z2026-0002', status: 'received' });
  expect((await listed({ status: 'all' })).map(({ number, status }) => ({ number, status }))).toEqual([
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

  const adding = await whileHeld(
    (tx) => tx.execute(sql`update work_order set status = 'done', completed_on = '2026-07-15' where id = ${id}`),
    () => addItem(admin, id, oilChange, ctx.db),
  );

  expect(adding).toEqual({ ok: false, errors: { workOrder: 'not-editable' } });
  expect((await getWorkOrder(admin, id, ctx.db))?.items).toEqual([]);
});

test('a header edited while another request is marking the Zákazka as done waits for it and is then refused', async () => {
  const id = await newWorkOrderId();

  const edited = await whileHeld(
    (tx) => tx.execute(sql`update work_order set status = 'done', completed_on = '2026-07-15' where id = ${id}`),
    () => updateWorkOrderHeader(admin, id, newHeader, ctx.db),
  );

  expect(edited).toEqual({ ok: false, errors: { workOrder: 'not-editable' } });
  expect(await getWorkOrder(admin, id, ctx.db)).toMatchObject({ status: 'done', mileageKm: 123456, customerRequest: 'Výmena oleja', deadline: null, note: null });
});

test('Zákazky are listed from the newest with number, customer, vehicle, status and Termín', async () => {
  const other = idOf(await createCustomer(admin, { type: 'person', name: 'Ján Novák' }, ctx.db));
  await newWorkOrderId();
  const second = await newWorkOrderId({ customerId: other, deadline: '2026-08-01' });
  await move(second, 'done');

  const list = await listed();

  expect(
    list.map(({ number, customer, vehicle, status, deadline }) => ({ number, customer: customer.name, vehicle: `${vehicle.make} ${vehicle.model}`, status, deadline })),
  ).toEqual([
    { number: 'Z2026-0002', customer: 'Ján Novák', vehicle: 'Volkswagen Golf', status: 'done', deadline: '2026-08-01' },
    { number: 'Z2026-0001', customer: 'Firma s.r.o.', vehicle: 'Volkswagen Golf', status: 'received', deadline: null },
  ]);
});

/** The numbers of a list, in its order. */
const numbersOf = (orders: { number: string }[]) => orders.map(({ number }) => number);

test('the list shows the Zákazky that are not Uzavretá unless it is asked for others, or for all', async () => {
  // One Zákazka per status, in the order of the statuses: Z2026-0001 is Prijatá, Z2026-0004 Hotová, Z2026-0005 Vyfakturovaná, Z2026-0006 Zrušená.
  for (const status of workOrderStatuses) await workOrderIn(status);

  expect(numbersOf(await listed())).toEqual(['Z2026-0004', 'Z2026-0003', 'Z2026-0002', 'Z2026-0001']);
  expect(numbersOf(await listed({ status: 'unclosed' }))).toEqual(['Z2026-0004', 'Z2026-0003', 'Z2026-0002', 'Z2026-0001']);
  expect(numbersOf(await listed({ status: 'all' }))).toEqual(['Z2026-0006', 'Z2026-0005', 'Z2026-0004', 'Z2026-0003', 'Z2026-0002', 'Z2026-0001']);
  // A status the list does not know is the default list, not an empty one.
  expect(numbersOf(await listed({ status: 'neznamy' }))).toEqual(['Z2026-0004', 'Z2026-0003', 'Z2026-0002', 'Z2026-0001']);
});

test.each(workOrderStatuses)('the list can be limited to the Zákazky that are %s, and shows exactly those', async (status) => {
  for (const each of workOrderStatuses) await workOrderIn(each);

  const orders = await listed({ status });

  expect(orders.map((order) => order.status)).toEqual([status]);
});

test('the period of the list is the days of intake from and to, both included, by the calendar of Europe/Bratislava', async () => {
  const at = async (instant: string) => {
    const id = await newWorkOrderId();
    await ctx.db.execute(sql`update work_order set created_at = ${instant}::timestamptz where id = ${id}`);
  };
  // The clocks went back on 25 October 2026, so in Bratislava the 1st of November starts at 23:00 UTC on the 31st.
  await at('2026-10-31T22:59:59Z'); // Z2026-0001: 23:59:59 on 31 October
  await at('2026-10-31T23:00:00Z'); // Z2026-0002: 00:00:00 on 1 November
  await at('2026-11-01T22:59:59Z'); // Z2026-0003: 23:59:59 on 1 November
  await at('2026-11-01T23:00:00Z'); // Z2026-0004: 00:00:00 on 2 November

  expect(numbersOf(await listed({ from: '2026-11-01', to: '2026-11-01' }))).toEqual(['Z2026-0003', 'Z2026-0002']);
  expect(numbersOf(await listed({ from: '2026-11-01' }))).toEqual(['Z2026-0004', 'Z2026-0003', 'Z2026-0002']);
  expect(numbersOf(await listed({ to: '2026-10-31' }))).toEqual(['Z2026-0001']);
  expect(numbersOf(await listed({ from: '2026-11-03' }))).toEqual([]);
  expect(numbersOf(await listed({ from: '2026-11-02', to: '2026-11-01' }))).toEqual([]);
});

test('the period and the status are both applied', async () => {
  const early = await workOrderIn('done');
  const late = await workOrderIn('done');
  const received = await newWorkOrderId();
  await ctx.db.execute(sql`update work_order set created_at = '2026-06-01T10:00:00Z' where id in (${early}, ${received})`);
  await ctx.db.execute(sql`update work_order set created_at = '2026-07-01T10:00:00Z' where id = ${late}`);

  expect(numbersOf(await listed({ status: 'done', from: '2026-06-15' }))).toEqual(['Z2026-0002']);
  expect(numbersOf(await listed({ status: 'done', to: '2026-06-15' }))).toEqual(['Z2026-0001']);
  expect(numbersOf(await listed({ status: 'received', to: '2026-06-15' }))).toEqual(['Z2026-0003']);
});

/** 27 Zákazky, Z2026-0001 to Z2026-0027, the first one Prijatá and the other 26 Hotová. */
async function twentySevenOrders() {
  for (let i = 0; i < 27; i++) await newWorkOrderId();
  await ctx.db.execute(sql`update work_order set status = 'done' where number <> 'Z2026-0001'`);
}

test('the list has 25 Zákaziek on a page, newest first, and says how many pages and Zákaziek there are', async () => {
  await twentySevenOrders();

  const first = await listWorkOrders(admin, {}, ctx.db);
  const second = await listWorkOrders(admin, { page: 2 }, ctx.db);

  expect(first).toMatchObject({ page: 1, pageCount: 2, orderCount: 27 });
  expect(numbersOf(first.orders)).toEqual(Array.from({ length: 25 }, (_, i) => `Z2026-${String(27 - i).padStart(4, '0')}`));
  expect(second).toMatchObject({ page: 2, pageCount: 2, orderCount: 27 });
  expect(numbersOf(second.orders)).toEqual(['Z2026-0002', 'Z2026-0001']);
});

test('a page past the last is the last, and anything that is not a page is the first', async () => {
  await twentySevenOrders();

  for (const page of [3, 99]) expect(await listWorkOrders(admin, { page }, ctx.db), `page ${page}`).toMatchObject({ page: 2 });
  for (const page of [0, -4, 1.5, Number.NaN]) expect(await listWorkOrders(admin, { page }, ctx.db), `page ${page}`).toMatchObject({ page: 1 });
});

test('paging goes on under a filter: the pages and the count are those of the filtered list', async () => {
  await twentySevenOrders();

  const first = await listWorkOrders(admin, { status: 'done' }, ctx.db);
  const second = await listWorkOrders(admin, { status: 'done', page: 2 }, ctx.db);
  const received = await listWorkOrders(admin, { status: 'received' }, ctx.db);

  expect(first).toMatchObject({ page: 1, pageCount: 2, orderCount: 26 });
  expect(first.orders).toHaveLength(25);
  expect(numbersOf(second.orders)).toEqual(['Z2026-0002']);
  expect(received).toMatchObject({ page: 1, pageCount: 1, orderCount: 1 });
  expect(numbersOf(received.orders)).toEqual(['Z2026-0001']);
});

test('an empty list is one empty page, and it says which filter it applied', async () => {
  expect(await listWorkOrders(admin, { status: 'cancelled', from: '2026-10-01', to: 'dnes' }, ctx.db)).toEqual({
    orders: [],
    page: 1,
    pageCount: 1,
    orderCount: 0,
    filter: { status: 'cancelled', from: '2026-10-01', to: null },
  });
});

test('a vehicle lists all its Zákazky from the newest with their customer, in every status and whoever the owner is, and not another vehicle’s', async () => {
  const other = idOf(await createCustomer(admin, { type: 'person', name: 'Ján Novák' }, ctx.db));
  const otherVehicle = idOf(await createVehicle(admin, { ownerId, vin: 'TMBZZZ5JZ3W000002', licensePlate: '', make: 'Škoda', model: 'Fabia' }, ctx.db));
  // One Zákazka per status, oldest first, then one whose customer is not the owner of the vehicle.
  const oldestFirst: { id: string; status: WorkOrderStatus; customer: string }[] = [];
  for (const status of workOrderStatuses) oldestFirst.push({ id: await workOrderIn(status), status, customer: 'Firma s.r.o.' });
  oldestFirst.push({ id: await newWorkOrderId({ customerId: other }), status: 'received', customer: 'Ján Novák' });
  await newWorkOrderId({ vehicleId: otherVehicle });
  await savedInOrder(ctx.db, 'work_order', oldestFirst.map(({ id }) => id));

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
  await savedInOrder(ctx.db, 'work_order', [received, done, invoiced]);

  const orders = await listWorkOrdersOfCustomer(admin, ownerId, ctx.db);

  expect(orders).toEqual([
    {
      id: invoiced,
      number: 'Z2026-0003',
      status: 'invoiced',
      deadline: null,
      customer: { id: ownerId, name: 'Firma s.r.o.' },
      vehicle: { id: vehicleId, vin: 'WVWZZZ1JZ3W386752', licensePlate: 'BA123AB', make: 'Volkswagen', model: 'Golf' },
    },
    expect.objectContaining({ id: done, number: 'Z2026-0002', status: 'done', vehicle: expect.objectContaining({ id: second }) }),
    expect.objectContaining({ id: received, number: 'Z2026-0001', status: 'received' }),
  ]);
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

  // The other save: another intake raised the Stav km to 200 000 and holds the row until this one has met the lock.
  const created = await whileHeld(
    (tx) => tx.execute(sql`update vehicle set mileage_km = 200000 where id = ${vehicleId}`),
    () => createWorkOrder(admin, intake({ mileageKm: '150 000' }), ctx.db, summer),
  );

  expect(created).toMatchObject({ ok: true, lowerMileage: { vehicleMileageKm: 200000 } });
  expect((await vehicleRow()).mileageKm).toBe(200000);
});

test('Zákazky created at once on one vehicle leave its Stav km at the highest kilometres', async () => {
  const kilometres = ['150 000', '90 000', '200 000', '120 000', '180 000'];

  const created = await Promise.all(kilometres.map((mileageKm) => createWorkOrder(admin, intake({ mileageKm }), ctx.db, summer)));

  expect(created.every(({ ok }) => ok)).toBe(true);
  expect((await vehicleRow()).mileageKm).toBe(200000);
});

// A Diel: 2 l at 12,50 € without VAT, bought for 10,00 €, VAT 19 %.
const oilCan: ItemInput = { kind: 'part', code: ' OL-5W30 ', name: 'Olej 5W-30', quantity: '2', unit: 'l', purchasePrice: '10', salePrice: '12,50', vatRate: '19' };

test('a Diel is added with its code, unit, Nákupná cena and Predajná cena, and the Zákazka shows its totals and its Marža', async () => {
  const id = await newWorkOrderId();
  idOf(await addItem(admin, id, oilChange, ctx.db));

  const added = await addItem(admin, id, oilCan, ctx.db);

  expect(added).toEqual({ ok: true, id: expect.any(String) });
  const detail = await getWorkOrder(admin, id, ctx.db);
  expect(detail?.items).toMatchObject([
    { kind: 'labour', code: null, unit: 'h', purchasePriceCents: null, amounts: { net: 6000, vat: 1380, gross: 7380 } },
    {
      kind: 'part',
      code: 'OL-5W30',
      name: 'Olej 5W-30',
      quantityHundredths: 200,
      unit: 'l',
      purchasePriceCents: 1000,
      salePriceCents: 1250,
      vatRate: 19,
      amounts: { net: 2500, vat: 475, gross: 2975 },
    },
  ]);
  expect(detail?.totals).toEqual({ net: 8500, vat: 1855, gross: 10355 });
  expect(detail?.margin).toEqual({ purchaseNet: 2000, cents: 6500, percentTenths: 765, partsWithoutPurchasePrice: 0 });
});

test('a Diel is in pieces unless the unit is typed', async () => {
  const id = await newWorkOrderId();

  idOf(await addItem(admin, id, { kind: 'part', name: 'Žiarovka', quantity: '1', salePrice: '3', vatRate: '23' }, ctx.db));

  expect((await getWorkOrder(admin, id, ctx.db))?.items).toMatchObject([{ kind: 'part', code: null, unit: 'ks' }]);
});

test('a Diel without a Nákupná cena is added, counts as 0 in the Marža, and the Zákazka says how many Diely are missing it', async () => {
  const id = await newWorkOrderId();
  idOf(await addItem(admin, id, { ...oilCan, purchasePrice: '' }, ctx.db));
  idOf(await addItem(admin, id, { ...oilCan, name: 'Filter', purchasePrice: undefined }, ctx.db));
  idOf(await addItem(admin, id, { ...oilCan, name: 'Zadarmo kúpený', purchasePrice: '0' }, ctx.db));

  const detail = await getWorkOrder(admin, id, ctx.db);

  expect(detail?.items.map((item) => item.purchasePriceCents)).toEqual([null, null, 0]);
  expect(detail?.margin).toEqual({ purchaseNet: 0, cents: 7500, percentTenths: 1000, partsWithoutPurchasePrice: 2 });
});

test('only the Nákupná cena and the Predajná cena are stored, the Prirážka is not', async () => {
  const id = await newWorkOrderId();
  idOf(await addItem(admin, id, oilCan, ctx.db));

  const [item] = (await getWorkOrder(admin, id, ctx.db))?.items ?? [];

  expect(Object.keys(item!).filter((key) => /markup|prirazka/i.test(key))).toEqual([]);
});

test('a Zákazka with no item has no Marža and no percentage', async () => {
  const id = await newWorkOrderId();

  expect((await getWorkOrder(admin, id, ctx.db))?.margin).toEqual({ purchaseNet: 0, cents: 0, percentTenths: null, partsWithoutPurchasePrice: 0 });
});

test('a Diel that breaks a rule is not added, and every reason comes back', async () => {
  const id = await newWorkOrderId();

  const result = await addItem(admin, id, { ...oilCan, name: '', quantity: '0', unit: ' ', purchasePrice: '-1', salePrice: '1,005', vatRate: '7' }, ctx.db);

  expect(result).toEqual({
    ok: false,
    errors: { name: 'required', quantity: 'invalid', unit: 'required', purchasePrice: 'invalid', salePrice: 'invalid', vatRate: 'invalid' },
  });
  expect((await getWorkOrder(admin, id, ctx.db))?.items).toEqual([]);
});

test('a VAT rate that Nastavenia do not offer is refused, and one they offer is kept; the default is taken when none is typed', async () => {
  const id = await newWorkOrderId();
  await ctx.db.execute(sql`update workshop set vat_rates = '{20,10}', default_vat_rate = 10`);

  const notOffered = await addItem(admin, id, { ...oilChange, vatRate: '23' }, ctx.db);
  idOf(await addItem(admin, id, { ...oilChange, vatRate: '20' }, ctx.db));
  const { vatRate: _typed, ...withoutRate } = oilChange;
  idOf(await addItem(admin, id, withoutRate, ctx.db));

  expect(notOffered).toEqual({ ok: false, errors: { vatRate: 'invalid' } });
  expect((await getWorkOrder(admin, id, ctx.db))?.items.map((item) => item.vatRate)).toEqual([20, 10]);
});

test('the database refuses a Práca with a Nákupná cena and a Nákupná cena below 0', async () => {
  const id = await newWorkOrderId();
  const insert = (kind: string, purchasePriceCents: number) => ctx.db.execute(sql`
    insert into work_order_item (work_order_id, kind, name, quantity_hundredths, unit, unit_price_cents, vat_rate, purchase_price_cents)
    values (${id}, ${kind}, 'Test', 100, 'ks', 100, 23, ${purchasePriceCents})
  `);

  await expect(insert('labour', 100)).rejects.toMatchObject({ cause: { constraint: 'work_order_item_purchase_price_kind_check' } });
  await expect(insert('part', -1)).rejects.toMatchObject({ cause: { constraint: 'work_order_item_purchase_price_check' } });
  await expect(insert('part', 0)).resolves.toBeDefined();
});

test('the detail of a Zákazka returns the items without their place (added_seq), which only the order of a read uses (#160)', async () => {
  const id = await newWorkOrderId();
  idOf(await addItem(admin, id, oilChange, ctx.db));

  const items = (await getWorkOrder(admin, id, ctx.db))?.items;

  expect(items).toHaveLength(1);
  expect(items![0]).not.toHaveProperty('addedSeq');
});

test('an item is changed: its code, name, quantity, unit, prices and VAT rate, and the amounts follow, where its kind and its place stay', async () => {
  const id = await newWorkOrderId();
  idOf(await addItem(admin, id, oilChange, ctx.db));
  const partId = idOf(await addItem(admin, id, oilCan, ctx.db));
  idOf(await addItem(admin, id, { ...oilChange, name: 'Kontrola' }, ctx.db));

  const result = await updateItem(
    admin,
    partId,
    { code: 'OL-0W20', name: ' Olej 0W-20 ', quantity: '3,5', unit: 'kg', purchasePrice: '11,10', salePrice: '14', vatRate: '5' },
    ctx.db,
  );

  expect(result).toEqual({ ok: true, workOrderId: id });
  const detail = await getWorkOrder(admin, id, ctx.db);
  expect(detail?.items.map((item) => item.name)).toEqual(['Výmena oleja', 'Olej 0W-20', 'Kontrola']);
  expect(detail?.items[1]).toMatchObject({
    id: partId,
    kind: 'part',
    code: 'OL-0W20',
    quantityHundredths: 350,
    unit: 'kg',
    purchasePriceCents: 1110,
    salePriceCents: 1400,
    vatRate: 5,
    amounts: { net: 4900, vat: 245, gross: 5145 },
  });
  expect(detail?.items[0]).toMatchObject({ name: 'Výmena oleja', amounts: { net: 6000, vat: 1380, gross: 7380 } });
  expect(detail?.totals).toEqual({ net: 6000 + 4900 + 6000, vat: 1380 + 245 + 1380, gross: 7380 + 5145 + 7380 });
});

test('an item changed loses the code and the Nákupná cena that are left out', async () => {
  const id = await newWorkOrderId();
  const partId = idOf(await addItem(admin, id, oilCan, ctx.db));

  await updateItem(admin, partId, { name: 'Olej', quantity: '2', salePrice: '12,50' }, ctx.db);

  const detail = await getWorkOrder(admin, id, ctx.db);
  expect(detail?.items).toMatchObject([{ code: null, unit: 'ks', purchasePriceCents: null, vatRate: 19 }]);
  expect(detail?.margin.partsWithoutPurchasePrice).toBe(1);
});

test('a Práca changed never gets a Nákupná cena', async () => {
  const id = await newWorkOrderId();
  const labourId = idOf(await addItem(admin, id, oilChange, ctx.db));

  const result = await updateItem(admin, labourId, { name: 'Výmena oleja', quantity: '1', salePrice: '40', purchasePrice: '5' }, ctx.db);

  expect(result).toMatchObject({ ok: true });
  expect((await getWorkOrder(admin, id, ctx.db))?.items).toMatchObject([{ kind: 'labour', purchasePriceCents: null }]);
});

test('an item that keeps a VAT rate Nastavenia no longer offer can be changed, but cannot move to another they do not offer', async () => {
  const id = await newWorkOrderId();
  const itemId = idOf(await addItem(admin, id, { ...oilChange, vatRate: '5' }, ctx.db));
  await ctx.db.execute(sql`update workshop set vat_rates = '{23}', default_vat_rate = 23`);

  const kept = await updateItem(admin, itemId, { name: 'Prejmenovaná', quantity: '1', salePrice: '40', vatRate: '5' }, ctx.db);
  const unchanged = await updateItem(admin, itemId, { name: 'Prejmenovaná znova', quantity: '1', salePrice: '40' }, ctx.db);
  const moved = await updateItem(admin, itemId, { name: 'Iná', quantity: '1', salePrice: '40', vatRate: '19' }, ctx.db);

  expect(kept).toMatchObject({ ok: true });
  expect(unchanged).toMatchObject({ ok: true });
  expect(moved).toEqual({ ok: false, errors: { vatRate: 'invalid' } });
  expect((await getWorkOrder(admin, id, ctx.db))?.items).toMatchObject([{ name: 'Prejmenovaná znova', vatRate: 5 }]);
});

test('an item changed to something that breaks a rule is not changed, and every reason comes back', async () => {
  const id = await newWorkOrderId();
  const partId = idOf(await addItem(admin, id, oilCan, ctx.db));
  const before = await getWorkOrder(admin, id, ctx.db);

  const result = await updateItem(admin, partId, { name: ' ', quantity: '0', unit: '', purchasePrice: 'x', salePrice: '-1', vatRate: '7' }, ctx.db);

  expect(result).toEqual({
    ok: false,
    errors: { name: 'required', quantity: 'invalid', unit: 'required', purchasePrice: 'invalid', salePrice: 'invalid', vatRate: 'invalid' },
  });
  expect(await getWorkOrder(admin, id, ctx.db)).toEqual(before);
});

test('an item is deleted, and the totals and the Marža follow', async () => {
  const id = await newWorkOrderId();
  idOf(await addItem(admin, id, oilChange, ctx.db));
  const partId = idOf(await addItem(admin, id, oilCan, ctx.db));

  const result = await deleteItem(admin, partId, ctx.db);

  expect(result).toEqual({ ok: true, workOrderId: id });
  const detail = await getWorkOrder(admin, id, ctx.db);
  expect(detail?.items.map((item) => item.name)).toEqual(['Výmena oleja']);
  expect(detail?.totals).toEqual({ net: 6000, vat: 1380, gross: 7380 });
  expect(detail?.margin).toEqual({ purchaseNet: 0, cents: 6000, percentTenths: 1000, partsWithoutPurchasePrice: 0 });
  expect(await deleteItem(admin, partId, ctx.db)).toEqual({ ok: false, error: 'unknown' });
});

test('an item of another Zákazka is not touched by changing or deleting this one', async () => {
  const [first, second] = [await newWorkOrderId(), await newWorkOrderId()];
  const firstItem = idOf(await addItem(admin, first, oilChange, ctx.db));
  idOf(await addItem(admin, second, oilChange, ctx.db));
  const secondBefore = await getWorkOrder(admin, second, ctx.db);

  await updateItem(admin, firstItem, { name: 'Zmenená', quantity: '2', salePrice: '1' }, ctx.db);

  expect((await getWorkOrder(admin, first, ctx.db))?.items).toMatchObject([{ id: firstItem, name: 'Zmenená' }]);
  expect(await getWorkOrder(admin, second, ctx.db)).toEqual(secondBefore);

  await deleteItem(admin, firstItem, ctx.db);

  expect((await getWorkOrder(admin, first, ctx.db))?.items).toEqual([]);
  expect(await getWorkOrder(admin, second, ctx.db)).toEqual(secondBefore);
});

test.each([
  ['received', true],
  ['inProgress', true],
  ['waitingForParts', true],
  ['done', false],
  ['invoiced', false],
  ['cancelled', false],
] as const)('an item of a Zákazka that is %s is changed and deleted only if it is Rozpracovaná, as adding one is: %s', async (status, allowed) => {
  const id = await newWorkOrderId();
  const itemId = idOf(await addItem(admin, id, oilChange, ctx.db));
  await ctx.db.execute(sql`update work_order set status = ${status}::work_order_status where id = ${id}`);
  const before = await getWorkOrder(admin, id, ctx.db);

  const changed = await updateItem(admin, itemId, { name: 'Zmenená', quantity: '2', salePrice: '1' }, ctx.db);
  const deleted = await deleteItem(admin, itemId, ctx.db);

  if (allowed) {
    expect(changed).toEqual({ ok: true, workOrderId: id });
    expect(deleted).toEqual({ ok: true, workOrderId: id });
    expect((await getWorkOrder(admin, id, ctx.db))?.items).toEqual([]);
  } else {
    expect(changed).toEqual({ ok: false, errors: { workOrder: 'not-editable' } });
    expect(deleted).toEqual({ ok: false, error: 'not-editable' });
    expect(await getWorkOrder(admin, id, ctx.db)).toEqual(before);
  }
});

test('an item that does not exist, or an id that is not one, is unknown', async () => {
  const change = { name: 'Zmenená', quantity: '2', salePrice: '1' };

  for (const itemId of [randomUUID(), 'polozka-1']) {
    expect(await updateItem(admin, itemId, change, ctx.db)).toEqual({ ok: false, errors: { item: 'unknown' } });
    expect(await deleteItem(admin, itemId, ctx.db)).toEqual({ ok: false, error: 'unknown' });
  }
});

test.each([
  ['changed', (itemId: string) => updateItem(admin, itemId, { name: 'Zmenená', quantity: '2', salePrice: '1' }, ctx.db), { ok: false, errors: { workOrder: 'not-editable' } }],
  ['deleted', (itemId: string) => deleteItem(admin, itemId, ctx.db), { ok: false, error: 'not-editable' }],
])('an item %s while another request is marking the Zákazka as done waits for it and is then refused', async (_what, change, refusal) => {
  const id = await newWorkOrderId();
  const itemId = idOf(await addItem(admin, id, oilChange, ctx.db));

  const changing = await whileHeld(
    (tx) => tx.execute(sql`update work_order set status = 'done', completed_on = '2026-07-15' where id = ${id}`),
    () => change(itemId),
  );

  expect(changing).toEqual(refusal);
  expect((await getWorkOrder(admin, id, ctx.db))?.items).toMatchObject([{ id: itemId, name: 'Výmena oleja' }]);
});

test.each([
  ['changed', (itemId: string) => updateItem(admin, itemId, { name: 'Zmenená', quantity: '2', salePrice: '1' }, ctx.db), { ok: false, errors: { item: 'unknown' } }],
  ['deleted', (itemId: string) => deleteItem(admin, itemId, ctx.db), { ok: false, error: 'unknown' }],
])('an item %s while another request deletes it waits for that request and is then unknown', async (_what, change, refusal) => {
  const id = await newWorkOrderId();
  const itemId = idOf(await addItem(admin, id, oilChange, ctx.db));
  const kept = idOf(await addItem(admin, id, { ...oilChange, name: 'Zostane' }, ctx.db));

  // The other request takes the lock of the Zákazka as updateItem and deleteItem do, and deletes the item before they get it.
  const changing = await whileHeld(
    async (tx) => {
      await tx.execute(sql`select 1 from work_order where id = ${id} for update`);
      await tx.execute(sql`delete from work_order_item where id = ${itemId}`);
    },
    () => change(itemId),
  );

  expect(changing).toEqual(refusal);
  expect((await getWorkOrder(admin, id, ctx.db))?.items).toMatchObject([{ id: kept, name: 'Zostane' }]);
});

// Pridanie z cenníka: the Položka cenníka is copied onto the Zákazka, which then owes the Cenník nothing.

const brake: PriceListItemInput = { kind: 'part', code: 'BR-123', name: 'Brzdová doštička', unit: 'ks', purchasePrice: '20', salePrice: '30', vatRate: '19' };
const labourFromList: PriceListItemInput = { kind: 'labour', name: 'Výmena oleja', unit: 'h', salePrice: '45,50', vatRate: '23' };

async function priceListItemId(input: PriceListItemInput) {
  return idOf(await createPriceListItem(admin, input, ctx.db));
}

/** The rows of the items of every Zákazka as the database holds them, in a fixed order. */
const storedItems = async () => (await ctx.db.execute(sql`select * from work_order_item order by id`)).rows;

test('a Diel of the Cenník is added to a Zákazka as an item of quantity 1 with its kind, code, name, unit, both prices and VAT rate, and the totals and the Marža follow', async () => {
  const id = await newWorkOrderId();
  const fromList = await priceListItemId(brake);

  const added = await addItemFromPriceList(admin, id, fromList, ctx.db);

  expect(added).toEqual({ ok: true, id: expect.any(String) });
  const order = await getWorkOrder(admin, id, ctx.db);
  expect(order?.items).toEqual([
    {
      id: idOf(added),
      workOrderId: id,
      kind: 'part',
      code: 'BR-123',
      name: 'Brzdová doštička',
      quantityHundredths: 100,
      unit: 'ks',
      purchasePriceCents: 2000,
      salePriceCents: 3000,
      vatRate: 19,
      createdAt: expect.any(Date),
      updatedAt: expect.any(Date),
      amounts: { net: 3000, vat: 570, gross: 3570 },
    },
  ]);
  expect(order?.totals).toEqual({ net: 3000, vat: 570, gross: 3570 });
  expect(order?.margin).toMatchObject({ purchaseNet: 2000, cents: 1000 });
});

test('a Práca of the Cenník is added with its hour, its price and no Nákupná cena', async () => {
  const id = await newWorkOrderId();

  await addItemFromPriceList(admin, id, await priceListItemId(labourFromList), ctx.db);

  expect((await getWorkOrder(admin, id, ctx.db))?.items).toMatchObject([
    { kind: 'labour', code: null, name: 'Výmena oleja', quantityHundredths: 100, unit: 'h', purchasePriceCents: null, salePriceCents: 4550, vatRate: 23 },
  ]);
});

test('the same item of the Cenník added twice is two items, each of quantity 1', async () => {
  const id = await newWorkOrderId();
  const fromList = await priceListItemId(brake);

  await addItemFromPriceList(admin, id, fromList, ctx.db);
  await addItemFromPriceList(admin, id, fromList, ctx.db);

  expect((await getWorkOrder(admin, id, ctx.db))?.items).toMatchObject([{ quantityHundredths: 100 }, { quantityHundredths: 100 }]);
});

test('changing or deleting an item of the Cenník changes no Zákazka and none of its items', async () => {
  const first = await newWorkOrderId();
  const second = await newWorkOrderId();
  const fromList = await priceListItemId(brake);
  await addItemFromPriceList(admin, first, fromList, ctx.db);
  await addItemFromPriceList(admin, second, fromList, ctx.db);
  await addItem(admin, second, oilChange, ctx.db);
  const before = { first: await getWorkOrder(admin, first, ctx.db), second: await getWorkOrder(admin, second, ctx.db), stored: await storedItems() };

  const changed = await updatePriceListItem(admin, fromList, { code: 'XX-9', name: 'Iný názov', unit: 'sada', purchasePrice: '1', salePrice: '2', vatRate: '5' }, ctx.db);
  expect(changed).toEqual({ ok: true });
  expect({ first: await getWorkOrder(admin, first, ctx.db), second: await getWorkOrder(admin, second, ctx.db), stored: await storedItems() }).toEqual(before);

  expect(await deletePriceListItem(admin, fromList, ctx.db)).toEqual({ ok: true });
  expect({ first: await getWorkOrder(admin, first, ctx.db), second: await getWorkOrder(admin, second, ctx.db), stored: await storedItems() }).toEqual(before);
});

test('a copy of an item of the Cenník is edited like any item, and the Cenník keeps its own values', async () => {
  const id = await newWorkOrderId();
  const fromList = await priceListItemId(brake);
  const itemId = idOf(await addItemFromPriceList(admin, id, fromList, ctx.db));

  await updateItem(admin, itemId, { name: 'Brzdová doštička predná', quantity: '2', unit: 'ks', purchasePrice: '22', salePrice: '35', vatRate: '19' }, ctx.db);

  expect((await getWorkOrder(admin, id, ctx.db))?.items).toMatchObject([{ name: 'Brzdová doštička predná', quantityHundredths: 200, salePriceCents: 3500 }]);
  expect((await ctx.db.execute(sql`select name, unit_price_cents from price_list_item`)).rows).toEqual([{ name: 'Brzdová doštička', unit_price_cents: 3000 }]);
});

test('an item of the Cenník with a VAT rate Nastavenia no longer offer is refused, nothing is added, and it is added once the item of the Cenník has a rate they offer', async () => {
  const id = await newWorkOrderId();
  const fromList = await priceListItemId({ ...brake, vatRate: '5' });
  await ctx.db.execute(sql`update workshop set vat_rates = '{23,19}', default_vat_rate = 23`);
  const before = await getWorkOrder(admin, id, ctx.db);

  expect(await addItemFromPriceList(admin, id, fromList, ctx.db)).toEqual({ ok: false, errors: { vatRate: 'not-offered' } });

  expect(await getWorkOrder(admin, id, ctx.db)).toEqual(before);
  expect(await updatePriceListItem(admin, fromList, { ...brake, vatRate: '19' }, ctx.db)).toEqual({ ok: true });
  expect(await addItemFromPriceList(admin, id, fromList, ctx.db)).toMatchObject({ ok: true });
  expect((await getWorkOrder(admin, id, ctx.db))?.items).toMatchObject([{ vatRate: 19 }]);
});

test('an item of the Cenník with a rate that Nastavenia offer but do not default to is added with that rate', async () => {
  const id = await newWorkOrderId();
  const fromList = await priceListItemId({ ...brake, vatRate: '5' });

  expect(await addItemFromPriceList(admin, id, fromList, ctx.db)).toMatchObject({ ok: true });

  expect((await getWorkOrder(admin, id, ctx.db))?.items).toMatchObject([{ vatRate: 5 }]);
});

test('an item of the Cenník that does not exist, or an id that is not one, is unknown, and nothing is added', async () => {
  const id = await newWorkOrderId();
  const before = await getWorkOrder(admin, id, ctx.db);

  for (const unknown of [randomUUID(), 'polozka-1']) {
    expect(await addItemFromPriceList(admin, id, unknown, ctx.db)).toEqual({ ok: false, errors: { priceListItem: 'unknown' } });
  }

  expect(await getWorkOrder(admin, id, ctx.db)).toEqual(before);
});

test('a Zákazka that does not exist, or an id that is not one, is unknown', async () => {
  const fromList = await priceListItemId(brake);

  for (const unknown of [randomUUID(), 'zakazka-1']) {
    expect(await addItemFromPriceList(admin, unknown, fromList, ctx.db)).toEqual({ ok: false, errors: { workOrder: 'unknown' } });
  }
});

// The order of the reasons: an item that is not in the Cenník, then a VAT rate Nastavenia no longer offer, then the Zákazka.

test('an item of the Cenník that does not exist is reported before the state of a Zákazka that is Hotová, and before a Zákazka that does not exist', async () => {
  const done = await workOrderIn('done');

  expect(await addItemFromPriceList(admin, done, randomUUID(), ctx.db)).toEqual({ ok: false, errors: { priceListItem: 'unknown' } });
  expect(await addItemFromPriceList(admin, randomUUID(), randomUUID(), ctx.db)).toEqual({ ok: false, errors: { priceListItem: 'unknown' } });
});

test('a VAT rate Nastavenia no longer offer is reported before the state of a Zákazka that is Hotová', async () => {
  const done = await workOrderIn('done');
  const fromList = await priceListItemId({ ...brake, vatRate: '5' });
  await ctx.db.execute(sql`update workshop set vat_rates = '{23,19}', default_vat_rate = 23`);

  expect(await addItemFromPriceList(admin, done, fromList, ctx.db)).toEqual({ ok: false, errors: { vatRate: 'not-offered' } });
});

test.each([
  ['received', true],
  ['inProgress', true],
  ['waitingForParts', true],
  ['done', false],
  ['invoiced', false],
  ['cancelled', false],
] as const)('an item of the Cenník is added to a Zákazka that is %s only if it is Rozpracovaná, as any item is: %s', async (status, allowed) => {
  const id = await workOrderIn(status);
  const fromList = await priceListItemId(brake);

  const added = await addItemFromPriceList(admin, id, fromList, ctx.db);

  if (allowed) expect(added).toMatchObject({ ok: true });
  else expect(added).toEqual({ ok: false, errors: { workOrder: 'not-editable' } });
  expect((await getWorkOrder(admin, id, ctx.db))?.items).toHaveLength(allowed ? 1 : 0);
});

test('an item of the Cenník added while another request is marking the Zákazka as done waits for it and is then refused', async () => {
  const id = await newWorkOrderId();
  const fromList = await priceListItemId(brake);

  const adding = await whileHeld(
    (tx) => tx.execute(sql`update work_order set status = 'done', completed_on = '2026-07-15' where id = ${id}`),
    () => addItemFromPriceList(admin, id, fromList, ctx.db),
  );

  expect(adding).toEqual({ ok: false, errors: { workOrder: 'not-editable' } });
  expect((await getWorkOrder(admin, id, ctx.db))?.items).toEqual([]);
});

// Kilometre pri odovzdaní (GLOSSARY, #164): the admin enters them on a Zákazka that is Hotová or Vyfakturovaná. The rules (what is read,
// what warns, what the Stav km does) are in packages/domain; here is what the database does with them. Every Zákazka here is made at 100 000 km, so the Stav km of the vehicle is 100 000 too.
const atHandover = (id: string, km: string) => setHandoverMileage(admin, id, km, ctx.db);
const handoverKm = async (id: string) => (await getWorkOrder(admin, id, ctx.db))?.handoverMileageKm;

async function handedOverAt(intakeKm: string) {
  const id = await newWorkOrderId({ mileageKm: intakeKm });
  await move(id, 'done');
  return id;
}

/** A Zákazka at 100 000 km in `status` straight away, as a later ticket or the invoice would leave it. */
async function atHundredThousandIn(status: WorkOrderStatus) {
  const id = await newWorkOrderId({ mileageKm: '100 000' });
  await ctx.db.execute(sql`update work_order set status = ${status}::work_order_status where id = ${id}`);
  return id;
}

test('a Zákazka starts without kilometres at handover', async () => {
  expect(await handoverKm(await handedOverAt('100 000'))).toBeNull();
});

test('higher kilometres at handover are saved on a Zákazka that is Hotová and raise the Stav km of the vehicle', async () => {
  const id = await handedOverAt('100 000');

  expect(await atHandover(id, '100 450')).toEqual({ ok: true });

  expect(await handoverKm(id)).toBe(100450);
  expect((await vehicleRow()).mileageKm).toBe(100450);
  expect(await getWorkOrder(admin, id, ctx.db)).toMatchObject({ mileageKm: 100000 }); // the kilometres at intake stay as they were
});

test('they are saved on a Zákazka that is Vyfakturovaná too', async () => {
  const id = await atHundredThousandIn('invoiced');

  expect(await atHandover(id, '100 450')).toEqual({ ok: true });

  expect(await handoverKm(id)).toBe(100450);
});

test('kilometres that are lower than at intake are saved with a warning that names both, and the Stav km of the vehicle stays', async () => {
  const id = await handedOverAt('100 000');

  expect(await atHandover(id, '99 000')).toEqual({ ok: true, lowerThanIntake: { intakeKm: 100000, vehicleMileageKm: 100000 } });

  expect(await handoverKm(id)).toBe(99000);
  expect((await vehicleRow()).mileageKm).toBe(100000);
});

test('kilometres that are not lower than at intake, but lower than the Stav km of the vehicle, are saved without a warning and leave the Stav km alone', async () => {
  const id = await handedOverAt('100 000');
  await setVehicleKm(100800); // another Zákazka of the vehicle went further

  expect(await atHandover(id, '100 450')).toEqual({ ok: true });

  expect(await handoverKm(id)).toBe(100450);
  expect((await vehicleRow()).mileageKm).toBe(100800);
});

test('kilometres for a vehicle that has no Stav km give it one', async () => {
  const id = await handedOverAt('100 000');
  await ctx.db.execute(sql`update vehicle set mileage_km = null where id = ${vehicleId}`);

  expect(await atHandover(id, '100 450')).toEqual({ ok: true });

  expect((await vehicleRow()).mileageKm).toBe(100450);
});

test('a second entry replaces the first, and the Stav km of the vehicle never falls with it', async () => {
  const id = await handedOverAt('100 000');
  await atHandover(id, '100 450');

  expect(await atHandover(id, '100 440')).toEqual({ ok: true });

  expect(await handoverKm(id)).toBe(100440);
  expect((await vehicleRow()).mileageKm).toBe(100450);
});

test('a blank entry clears the kilometres at handover, and leaves the Stav km of the vehicle where it is', async () => {
  const id = await handedOverAt('100 000');
  await atHandover(id, '100 450');

  expect(await atHandover(id, '  ')).toEqual({ ok: true });

  expect(await handoverKm(id)).toBeNull();
  expect((await vehicleRow()).mileageKm).toBe(100450);
});

test('kilometres that are not a whole number are refused, and nothing changes', async () => {
  const id = await handedOverAt('100 000');
  await atHandover(id, '100 450');

  expect(await atHandover(id, '12,5')).toEqual({ ok: false, errors: { handoverMileageKm: 'invalid' } });

  expect(await handoverKm(id)).toBe(100450);
  expect((await vehicleRow()).mileageKm).toBe(100450);
});

test.each(['received', 'inProgress', 'waitingForParts', 'cancelled'] as const)(
  'a Zákazka that is %s takes no kilometres at handover: the vehicle is not handed over yet, or never will be',
  async (status) => {
    const id = await atHundredThousandIn(status);

    expect(await atHandover(id, '100 450')).toEqual({ ok: false, errors: { workOrder: 'wrong-status' } });

    expect(await handoverKm(id)).toBeNull();
    expect((await vehicleRow()).mileageKm).toBe(100000);
  },
);

test('there is no Zákazka to take kilometres for an id that is none, a malformed one included', async () => {
  const unknown = { ok: false, errors: { workOrder: 'unknown' } };

  expect(await atHandover(randomUUID(), '100 450')).toEqual(unknown);
  expect(await atHandover('not-an-id', '100 450')).toEqual(unknown);
});

test('kilometres read the Stav km of the vehicle after another save of it has committed, so lower ones cannot overwrite higher ones', async () => {
  const id = await handedOverAt('100 000');

  // The other save: an intake raised the Stav km to 200 000 and holds the row until this one has met the lock.
  const saved = await whileHeld(
    (tx) => tx.execute(sql`update vehicle set mileage_km = 200000 where id = ${vehicleId}`),
    () => atHandover(id, '150 000'),
  );

  expect(saved).toEqual({ ok: true });
  expect((await vehicleRow()).mileageKm).toBe(200000);
});

test('kilometres of Zákazky of one vehicle entered at once leave its Stav km at the highest', async () => {
  const ids = [await handedOverAt('100 000'), await handedOverAt('100 000'), await handedOverAt('100 000'), await handedOverAt('100 000')];
  const kilometres = ['150 000', '110 000', '200 000', '120 000'];

  const saved = await Promise.all(ids.map((id, index) => atHandover(id, kilometres[index]!)));

  expect(saved.every(({ ok }) => ok)).toBe(true);
  expect((await vehicleRow()).mileageKm).toBe(200000);
});

test('kilometres entered while the Zákazka is being marked as done wait for it and are saved, not refused for the status they saw first', async () => {
  const id = await newWorkOrderId({ mileageKm: '100 000' });

  const saved = await whileHeld(
    (tx) => tx.execute(sql`update work_order set status = 'done', completed_on = '2026-07-15' where id = ${id}`),
    () => atHandover(id, '100 450'),
  );

  expect(saved).toEqual({ ok: true });
  expect(await handoverKm(id)).toBe(100450);
});
