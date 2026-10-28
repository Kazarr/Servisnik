import { workOrderStatuses, type ItemInput, type WorkOrderStatus } from '@servisnik/domain/work-order';
import { randomUUID } from 'node:crypto';
import { sql } from 'drizzle-orm';
import { afterAll, beforeAll, beforeEach, expect, test, vi } from 'vitest';
import { createCustomer } from '../src/dal/customers.ts';
import { UnauthenticatedError } from '../src/dal/user.ts';
import { createVehicle } from '../src/dal/vehicles.ts';
import {
  addItem,
  changeWorkOrderStatus,
  createWorkOrder,
  deleteItem,
  getWorkOrder,
  listUnclosedWorkOrdersOfVehicle,
  listWorkOrders,
  updateItem,
} from '../src/dal/work-orders.ts';
import { admin } from './support/dal-users.ts';
import { createTestDb } from './support/db.ts';
import { idOf } from './support/id-of.ts';

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
  await ctx.db.execute(sql`update workshop set vat_rates = '{23,19,5}', default_vat_rate = 23`); // the rates the migration starts with; some tests change them
  ownerId = idOf(await createCustomer(admin, { type: 'company', name: 'Firma s.r.o.', ico: '12345678' }, ctx.db));
  vehicleId = idOf(await createVehicle(admin, { ownerId, vin: 'WVWZZZ1JZ3W386752', licensePlate: 'BA123AB', make: 'Volkswagen', model: 'Golf' }, ctx.db));
});

const intake = (overrides: { vehicleId?: string; customerId?: string; mileageKm?: string; customerRequest?: string } = {}) => ({
  vehicleId,
  mileageKm: '123 456',
  customerRequest: 'Výmena oleja',
  ...overrides,
});

const oilChange: ItemInput = { kind: 'labour', name: 'Výmena oleja', quantity: '1,5', unitPrice: '40', vatRate: '23' };

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
  const itemId = idOf(await addItem(admin, id, oilChange, ctx.db));
  const before = { orders: await listWorkOrders(admin, ctx.db), detail: await getWorkOrder(admin, id, ctx.db) };

  const rejected = [
    createWorkOrder(null, intake(), ctx.db, summer),
    addItem(null, id, oilChange, ctx.db),
    updateItem(null, itemId, { name: 'Iný názov', quantity: '1', unitPrice: '1' }, ctx.db),
    deleteItem(null, itemId, ctx.db),
    changeWorkOrderStatus(null, id, { to: 'done' }, ctx.db, summer),
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

  const first = await addItem(admin, id, oilChange, ctx.db);
  const second = await addItem(admin, id, { kind: 'labour', name: ' Kontrola bŕzd ', quantity: '0,25', unitPrice: '33,33', vatRate: '23' }, ctx.db);

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

  const result = await addItem(admin, id, { kind: 'labour', name: ' ', quantity: '0', unitPrice: '40,505', vatRate: '150' }, ctx.db);

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

  const adding = addItem(admin, id, oilChange, ctx.db);
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

test('a vehicle lists every Zákazka that is not Uzavretá, so not a Vyfakturovaná or a Zrušená one, and not another vehicle’s', async () => {
  const otherVehicle = idOf(await createVehicle(admin, { ownerId, vin: 'TMBZZZ5JZ3W000002', licensePlate: '', make: 'Škoda', model: 'Fabia' }, ctx.db));
  // One Zákazka per status, oldest first; Z2026-0001 is Prijatá, and so on in the order of the statuses.
  const ids: Record<string, string> = {};
  for (const status of workOrderStatuses) ids[status] = await workOrderIn(status);
  await newWorkOrderId({ vehicleId: otherVehicle });

  const unclosed = await listUnclosedWorkOrdersOfVehicle(admin, vehicleId, ctx.db);

  expect(unclosed).toEqual([
    { id: ids.done, number: 'Z2026-0004', status: 'done' },
    { id: ids.waitingForParts, number: 'Z2026-0003', status: 'waitingForParts' },
    { id: ids.inProgress, number: 'Z2026-0002', status: 'inProgress' },
    { id: ids.received, number: 'Z2026-0001', status: 'received' },
  ]);
  expect(await listUnclosedWorkOrdersOfVehicle(admin, 'vozidlo-1', ctx.db)).toEqual([]);
});

test('a Zákazka that does not exist, or an id that is not one, reads as nothing', async () => {
  await expect(getWorkOrder(admin, randomUUID(), ctx.db)).resolves.toBeNull();
  await expect(getWorkOrder(admin, 'zakazka-1', ctx.db)).resolves.toBeNull();
});

// A Diel: 2 l at 12,50 € without VAT, bought for 10,00 €, VAT 19 %.
const oilCan: ItemInput = { kind: 'part', code: ' OL-5W30 ', name: 'Olej 5W-30', quantity: '2', unit: 'l', purchasePrice: '10', unitPrice: '12,50', vatRate: '19' };

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
      unitPriceCents: 1250,
      vatRate: 19,
      amounts: { net: 2500, vat: 475, gross: 2975 },
    },
  ]);
  expect(detail?.totals).toEqual({ net: 8500, vat: 1855, gross: 10355 });
  expect(detail?.margin).toEqual({ purchaseNet: 2000, cents: 6500, percentTenths: 765, partsWithoutPurchasePrice: 0 });
});

test('a Diel is in pieces unless the unit is typed', async () => {
  const id = await newWorkOrderId();

  idOf(await addItem(admin, id, { kind: 'part', name: 'Žiarovka', quantity: '1', unitPrice: '3', vatRate: '23' }, ctx.db));

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

  const result = await addItem(admin, id, { ...oilCan, name: '', quantity: '0', unit: ' ', purchasePrice: '-1', unitPrice: '1,005', vatRate: '7' }, ctx.db);

  expect(result).toEqual({
    ok: false,
    errors: { name: 'required', quantity: 'invalid', unit: 'required', purchasePrice: 'invalid', unitPrice: 'invalid', vatRate: 'invalid' },
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

test('an item is changed: its code, name, quantity, unit, prices and VAT rate, and the amounts follow, where its kind and its place stay', async () => {
  const id = await newWorkOrderId();
  idOf(await addItem(admin, id, oilChange, ctx.db));
  const partId = idOf(await addItem(admin, id, oilCan, ctx.db));
  idOf(await addItem(admin, id, { ...oilChange, name: 'Kontrola' }, ctx.db));

  const result = await updateItem(
    admin,
    partId,
    { code: 'OL-0W20', name: ' Olej 0W-20 ', quantity: '3,5', unit: 'kg', purchasePrice: '11,10', unitPrice: '14', vatRate: '5' },
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
    unitPriceCents: 1400,
    vatRate: 5,
    amounts: { net: 4900, vat: 245, gross: 5145 },
  });
  expect(detail?.items[0]).toMatchObject({ name: 'Výmena oleja', amounts: { net: 6000, vat: 1380, gross: 7380 } });
  expect(detail?.totals).toEqual({ net: 6000 + 4900 + 6000, vat: 1380 + 245 + 1380, gross: 7380 + 5145 + 7380 });
});

test('an item changed loses the code and the Nákupná cena that are left out', async () => {
  const id = await newWorkOrderId();
  const partId = idOf(await addItem(admin, id, oilCan, ctx.db));

  await updateItem(admin, partId, { name: 'Olej', quantity: '2', unitPrice: '12,50' }, ctx.db);

  const detail = await getWorkOrder(admin, id, ctx.db);
  expect(detail?.items).toMatchObject([{ code: null, unit: 'ks', purchasePriceCents: null, vatRate: 19 }]);
  expect(detail?.margin.partsWithoutPurchasePrice).toBe(1);
});

test('a Práca changed never gets a Nákupná cena', async () => {
  const id = await newWorkOrderId();
  const labourId = idOf(await addItem(admin, id, oilChange, ctx.db));

  const result = await updateItem(admin, labourId, { name: 'Výmena oleja', quantity: '1', unitPrice: '40', purchasePrice: '5' }, ctx.db);

  expect(result).toMatchObject({ ok: true });
  expect((await getWorkOrder(admin, id, ctx.db))?.items).toMatchObject([{ kind: 'labour', purchasePriceCents: null }]);
});

test('an item that keeps a VAT rate Nastavenia no longer offer can be changed, but cannot move to another they do not offer', async () => {
  const id = await newWorkOrderId();
  const itemId = idOf(await addItem(admin, id, { ...oilChange, vatRate: '5' }, ctx.db));
  await ctx.db.execute(sql`update workshop set vat_rates = '{23}', default_vat_rate = 23`);

  const kept = await updateItem(admin, itemId, { name: 'Prejmenovaná', quantity: '1', unitPrice: '40', vatRate: '5' }, ctx.db);
  const unchanged = await updateItem(admin, itemId, { name: 'Prejmenovaná znova', quantity: '1', unitPrice: '40' }, ctx.db);
  const moved = await updateItem(admin, itemId, { name: 'Iná', quantity: '1', unitPrice: '40', vatRate: '19' }, ctx.db);

  expect(kept).toMatchObject({ ok: true });
  expect(unchanged).toMatchObject({ ok: true });
  expect(moved).toEqual({ ok: false, errors: { vatRate: 'invalid' } });
  expect((await getWorkOrder(admin, id, ctx.db))?.items).toMatchObject([{ name: 'Prejmenovaná znova', vatRate: 5 }]);
});

test('an item changed to something that breaks a rule is not changed, and every reason comes back', async () => {
  const id = await newWorkOrderId();
  const partId = idOf(await addItem(admin, id, oilCan, ctx.db));
  const before = await getWorkOrder(admin, id, ctx.db);

  const result = await updateItem(admin, partId, { name: ' ', quantity: '0', unit: '', purchasePrice: 'x', unitPrice: '-1', vatRate: '7' }, ctx.db);

  expect(result).toEqual({
    ok: false,
    errors: { name: 'required', quantity: 'invalid', unit: 'required', purchasePrice: 'invalid', unitPrice: 'invalid', vatRate: 'invalid' },
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

  await deleteItem(admin, firstItem, ctx.db);

  expect((await getWorkOrder(admin, first, ctx.db))?.items).toEqual([]);
  expect((await getWorkOrder(admin, second, ctx.db))?.items).toHaveLength(1);
});

test('an item is changed and deleted only while the Zákazka is still Prijatá, the same as adding one', async () => {
  const done = await newWorkOrderId();
  const doneItem = idOf(await addItem(admin, done, oilChange, ctx.db));
  await markWorkOrderDone(admin, done, ctx.db, summer);
  const invoiced = await newWorkOrderId();
  const invoicedItem = idOf(await addItem(admin, invoiced, oilChange, ctx.db));
  await ctx.db.execute(sql`update work_order set status = 'invoiced' where id = ${invoiced}`);
  const before = [await getWorkOrder(admin, done, ctx.db), await getWorkOrder(admin, invoiced, ctx.db)];
  const change = { name: 'Zmenená', quantity: '2', unitPrice: '1' };

  for (const itemId of [doneItem, invoicedItem]) {
    expect(await updateItem(admin, itemId, change, ctx.db)).toEqual({ ok: false, errors: { workOrder: 'not-editable' } });
    expect(await deleteItem(admin, itemId, ctx.db)).toEqual({ ok: false, error: 'not-editable' });
  }

  expect([await getWorkOrder(admin, done, ctx.db), await getWorkOrder(admin, invoiced, ctx.db)]).toEqual(before);
});

test('an item that does not exist, or an id that is not one, is unknown', async () => {
  const change = { name: 'Zmenená', quantity: '2', unitPrice: '1' };

  for (const itemId of [randomUUID(), 'polozka-1']) {
    expect(await updateItem(admin, itemId, change, ctx.db)).toEqual({ ok: false, errors: { item: 'unknown' } });
    expect(await deleteItem(admin, itemId, ctx.db)).toEqual({ ok: false, error: 'unknown' });
  }
});

test.each([
  ['changed', (itemId: string) => updateItem(admin, itemId, { name: 'Zmenená', quantity: '2', unitPrice: '1' }, ctx.db), { ok: false, errors: { workOrder: 'not-editable' } }],
  ['deleted', (itemId: string) => deleteItem(admin, itemId, ctx.db), { ok: false, error: 'not-editable' }],
])('an item %s while another request is marking the Zákazka as done waits for it and is then refused', async (_what, change, refusal) => {
  const id = await newWorkOrderId();
  const itemId = idOf(await addItem(admin, id, oilChange, ctx.db));
  const marking = Promise.withResolvers<void>();
  const committed = Promise.withResolvers<void>();
  // The other request: its update holds the row lock until `committed` is resolved.
  const marked = ctx.db.transaction(async (tx) => {
    await tx.execute(sql`update work_order set status = 'done', completed_on = '2026-07-15' where id = ${id}`);
    marking.resolve();
    await committed.promise;
  });
  await marking.promise;

  const changing = change(itemId);
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

  expect(await changing).toEqual(refusal);
  expect((await getWorkOrder(admin, id, ctx.db))?.items).toMatchObject([{ id: itemId, name: 'Výmena oleja' }]);
});
