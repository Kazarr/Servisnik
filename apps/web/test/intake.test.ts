import { randomUUID } from 'node:crypto';
import { sql } from 'drizzle-orm';
import { afterAll, beforeAll, beforeEach, expect, test } from 'vitest';
import { createCustomer } from '../src/dal/customers.ts';
import { UnauthenticatedError } from '../src/dal/user.ts';
import { createVehicle, getVehicle } from '../src/dal/vehicles.ts';
import { createIntake, getWorkOrder } from '../src/dal/work-orders.ts';
import { customer, vehicle, workOrder, workOrderCounter } from '../src/db/schema.ts';
import { admin } from './support/dal-users.ts';
import { createTestDb } from './support/db.ts';
import { failInsertsInto } from './support/failing-insert.ts';
import { idOf } from './support/id-of.ts';

// Príjem vozidla (GLOSSARY): a Zákazník, a Vozidlo and a Zákazka saved in one go, or none of them. The rules
// of each part are tested with the part; what is proven here is the sum, against PostgreSQL.

const summer = new Date('2026-07-15T10:00:00Z');

let ctx: Awaited<ReturnType<typeof createTestDb>>;
let ownerId: string;
let existingVehicleId: string;
beforeAll(async () => {
  ctx = await createTestDb();
});
afterAll(() => ctx.close());
beforeEach(async () => {
  await ctx.db.execute(sql`truncate customer, work_order_counter cascade`);
  ownerId = idOf(await createCustomer(admin, { type: 'company', name: 'Firma s.r.o.', ico: '12345678' }, ctx.db));
  existingVehicleId = idOf(await createVehicle(admin, { ownerId, vin: 'WVWZZZ1JZ3W386752', licensePlate: 'BA123AB', make: 'Volkswagen', model: 'Golf' }, ctx.db));
});

type Input = Parameters<typeof createIntake>[1];

const newFirma = { type: 'company', name: 'Nová Firma s.r.o.', ico: '87654321' } as const;
const input = (overrides: Partial<Input> = {}): Input => ({
  owner: { customer: newFirma },
  vehicle: { vin: 'TMBZZZ5JZ3W000101', licensePlate: 'BA 456 CD', make: 'Škoda', model: 'Octavia' },
  mileageKm: '45 000',
  customerRequest: 'Výmena oleja',
  ...overrides,
});

/** Every row of every table an intake writes, in a fixed order, so that "nothing was written" is one strict comparison. */
async function everything() {
  const byId = <Row extends { id: string }>(rows: Row[]) => [...rows].sort((a, b) => a.id.localeCompare(b.id));
  return {
    customers: byId(await ctx.db.select().from(customer)),
    vehicles: byId(await ctx.db.select().from(vehicle)),
    workOrders: byId(await ctx.db.select().from(workOrder)),
    counters: await ctx.db.select().from(workOrderCounter),
  };
}

test('without a user it rejects, and nothing is written', async () => {
  const before = await everything();

  await expect(createIntake(null, input(), ctx.db, summer)).rejects.toBeInstanceOf(UnauthenticatedError);

  expect(await everything()).toEqual(before);
});

test('a new Firma, its new Vozidlo and the Zákazka are saved together, and the new customer is the Majiteľ and the Zákazník', async () => {
  const created = await createIntake(admin, input(), ctx.db, summer);

  expect(created).toEqual({ ok: true, id: expect.any(String), number: 'Z2026-0001' });
  const order = await getWorkOrder(admin, idOf(created), ctx.db);
  expect(order).toMatchObject({
    number: 'Z2026-0001',
    status: 'received',
    mileageKm: 45000,
    customerRequest: 'Výmena oleja',
    customer: { name: 'Nová Firma s.r.o.' },
    vehicle: { vin: 'TMBZZZ5JZ3W000101', licensePlate: 'BA456CD', make: 'Škoda', model: 'Octavia' },
  });
  const saved = await getVehicle(admin, order!.vehicle.id, ctx.db);
  expect(saved).toMatchObject({ owner: { id: order!.customer.id, name: 'Nová Firma s.r.o.' }, mileageKm: 45000 });
  expect((await everything()).customers).toHaveLength(2);
});

test('the Termín and the internal note of the form are saved on the Zákazka', async () => {
  const created = await createIntake(admin, input({ deadline: '2026-12-01', note: ' Zákazník čaká na zavolanie ' }), ctx.db, summer);

  expect(await getWorkOrder(admin, idOf(created), ctx.db)).toMatchObject({ deadline: '2026-12-01', note: 'Zákazník čaká na zavolanie' });
});

test('a new Osoba is saved the same way, with no company fields', async () => {
  const created = await createIntake(admin, input({ owner: { customer: { type: 'person', name: 'Ján Novák', ico: '11111111' } } }), ctx.db, summer);

  const order = await getWorkOrder(admin, idOf(created), ctx.db);
  expect(order).toMatchObject({ customer: { name: 'Ján Novák' } });
  const [saved] = (await everything()).customers.filter(({ id }) => id === order!.customer.id);
  expect(saved).toMatchObject({ type: 'person', ico: null });
});

test('a new Vozidlo for an existing Zákazník saves no customer, and he is the Majiteľ and the Zákazník', async () => {
  const created = await createIntake(admin, input({ owner: { id: ownerId } }), ctx.db, summer);

  const order = await getWorkOrder(admin, idOf(created), ctx.db);
  expect(order).toMatchObject({ customer: { id: ownerId, name: 'Firma s.r.o.' }, vehicle: { vin: 'TMBZZZ5JZ3W000101' } });
  expect(await getVehicle(admin, order!.vehicle.id, ctx.db)).toMatchObject({ owner: { id: ownerId }, mileageKm: 45000 });
  expect((await everything()).customers).toHaveLength(1);
});

test('the Zákazka gets the next number of the year, like any other', async () => {
  await createIntake(admin, input(), ctx.db, summer);

  const second = await createIntake(admin, input({ owner: { id: ownerId }, vehicle: { vin: 'TMBZZZ5JZ3W000102', licensePlate: '', make: 'Škoda', model: 'Fabia' } }), ctx.db, summer);

  expect(second).toMatchObject({ ok: true, number: 'Z2026-0002' });
});

test('every reason of the rules, in every part, comes back at once, and nothing is written, not even a number', async () => {
  const before = await everything();

  const refused = await createIntake(
    admin,
    input({
      owner: { customer: { type: 'company', name: ' ', ico: '123' } },
      vehicle: { vin: 'TMBZZZ5JZ3W0001', licensePlate: '', make: '', model: 'Octavia' },
      mileageKm: '-5',
      customerRequest: ' ',
    }),
    ctx.db,
    summer,
  );

  expect(refused).toEqual({
    ok: false,
    errors: {
      customer: { name: 'required', ico: 'format' },
      vehicle: { vin: 'length', make: 'required' },
      workOrder: { mileageKm: 'invalid', customerRequest: 'required' },
    },
  });
  expect(await everything()).toEqual(before);
});

test('a VIN that another Vozidlo has is refused with that Vozidlo, and the new Zákazník saved before it is not left behind', async () => {
  const before = await everything();

  const refused = await createIntake(admin, input({ vehicle: { vin: 'wvw zzz1jz3w386752', licensePlate: '', make: 'Škoda', model: 'Octavia' } }), ctx.db, summer);

  expect(refused).toEqual({
    ok: false,
    errors: { vehicle: { vin: 'taken' } },
    existingVehicle: { id: existingVehicleId, make: 'Volkswagen', model: 'Golf', owner: { id: ownerId, name: 'Firma s.r.o.' } },
  });
  expect(await everything()).toEqual(before);
});

test('an IČO that another Firma has is refused with that Firma, and nothing is written', async () => {
  const before = await everything();

  const refused = await createIntake(admin, input({ owner: { customer: { ...newFirma, ico: '12345678' } } }), ctx.db, summer);

  expect(refused).toEqual({ ok: false, errors: { customer: { ico: 'taken' } }, existingCustomer: { id: ownerId, name: 'Firma s.r.o.' } });
  expect(await everything()).toEqual(before);
});

test.each([
  ['an id of nobody', randomUUID()],
  ['not an id', 'zakaznik-1'],
])('an owner that is %s is no Zákazník: refused, and nothing is written', async (_what, id) => {
  const before = await everything();

  const refused = await createIntake(admin, input({ owner: { id } }), ctx.db, summer);

  expect(refused).toEqual({ ok: false, errors: { owner: 'unknown' } });
  expect(await everything()).toEqual(before);
});

test.each(['vehicle', 'work_order'] as const)('a failure of PostgreSQL when the %s is saved leaves no Zákazník, no Vozidlo, no Zákazka and no number', async (table) => {
  const before = await everything();
  const lift = await failInsertsInto(ctx.db, table);

  try {
    await expect(createIntake(admin, input(), ctx.db, summer)).rejects.toThrow();
  } finally {
    await lift();
  }

  expect(await everything()).toEqual(before);
  expect(await createIntake(admin, input(), ctx.db, summer)).toMatchObject({ ok: true, number: 'Z2026-0001' });
});

test('two intakes of the same VIN at once save one Vozidlo and one Zákazka, and the loser leaves no Zákazník', async () => {
  const sameVin = { vin: 'TMBZZZ5JZ3W000101', licensePlate: '', make: 'Škoda', model: 'Octavia' };

  const results = await Promise.all([
    createIntake(admin, input({ owner: { customer: { type: 'person', name: 'Prvý Zákazník' } }, vehicle: sameVin }), ctx.db, summer),
    createIntake(admin, input({ owner: { customer: { type: 'person', name: 'Druhý Zákazník' } }, vehicle: sameVin }), ctx.db, summer),
  ]);

  expect(results.filter(({ ok }) => ok)).toHaveLength(1);
  expect(results.filter(({ ok }) => !ok)).toMatchObject([{ errors: { vehicle: { vin: 'taken' } } }]);
  const saved = await everything();
  expect(saved.customers).toHaveLength(2); // the existing Firma and the winner
  expect(saved.vehicles).toHaveLength(2);
  expect(saved.workOrders).toHaveLength(1);
});
