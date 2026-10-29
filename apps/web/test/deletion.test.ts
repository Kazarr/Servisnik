import { eq, sql } from 'drizzle-orm';
import { afterAll, beforeAll, beforeEach, expect, test, vi } from 'vitest';
import { createCustomer, deleteCustomer, getCustomer, searchCustomers } from '../src/dal/customers.ts';
import { createVehicle, deleteVehicle, getVehicle } from '../src/dal/vehicles.ts';
import { changeWorkOrderStatus, createWorkOrder, listWorkOrdersOfCustomer, listWorkOrdersOfVehicle } from '../src/dal/work-orders.ts';
import { customer, vehicle } from '../src/db/schema.ts';
import { admin } from './support/dal-users.ts';
import { createTestDb } from './support/db.ts';
import { idOf } from './support/id-of.ts';
import { truncateTables } from './support/reset.ts';

// Mazanie (spec #67): a Zákazník or a Vozidlo with any link is never deleted. PostgreSQL decides (the
// foreign keys are `restrict`), so no check can go stale between the look and the delete; the Rola
// and the missing user are the rows of test/dal-access.test.ts.

let ctx: Awaited<ReturnType<typeof createTestDb>>;
let ownerId: string;
beforeAll(async () => {
  ctx = await createTestDb();
});
afterAll(() => ctx.close());
beforeEach(async () => {
  await truncateTables(ctx.db, 'customer');
  ownerId = idOf(await createCustomer(admin, { type: 'company', name: 'Firma s.r.o.', ico: '12345678' }, ctx.db));
});

const golf = (vin = 'WVWZZZ1JZ3W386752') => ({ ownerId, vin, licensePlate: 'BA123AB', make: 'Volkswagen', model: 'Golf' });
const oilChange = { mileageKm: '123 456', customerRequest: 'Výmena oleja' };

/** A Vozidlo of `ownerId`. */
const newVehicle = async (vin?: string) => idOf(await createVehicle(admin, golf(vin), ctx.db));

/** A Zákazka on `vehicleId`, for `customerId` or, when none is given, the Majiteľ of the Vozidlo. */
const newOrder = async (vehicleId: string, customerId?: string) => idOf(await createWorkOrder(admin, { vehicleId, customerId, ...oilChange }, ctx.db));

test('a Zákazník with no Vozidlo and no Zákazka is deleted, and no other one is', async () => {
  const alone = idOf(await createCustomer(admin, { type: 'person', name: 'Ján Novák' }, ctx.db));

  expect(await deleteCustomer(admin, alone, ctx.db)).toEqual({ ok: true });

  expect(await getCustomer(admin, alone, ctx.db)).toBeNull();
  expect((await searchCustomers(admin, {}, ctx.db)).customers.map(({ id }) => id)).toEqual([ownerId]);
});

test('a Zákazník who is the Majiteľ of a Vozidlo is not deleted, and keeps it', async () => {
  const vehicleId = await newVehicle();

  expect(await deleteCustomer(admin, ownerId, ctx.db)).toEqual({ ok: false, error: 'has-links' });

  expect((await getCustomer(admin, ownerId, ctx.db))?.vehicles.map(({ id }) => id)).toEqual([vehicleId]);
});

test('a Zákazník with a Zákazka and no Vozidlo is not deleted, and keeps the Zákazka', async () => {
  const vehicleId = await newVehicle();
  const other = idOf(await createCustomer(admin, { type: 'person', name: 'Ján Novák' }, ctx.db));
  const orderId = await newOrder(vehicleId, other);

  expect(await deleteCustomer(admin, other, ctx.db)).toEqual({ ok: false, error: 'has-links' });

  expect(await getCustomer(admin, other, ctx.db)).not.toBeNull();
  expect((await listWorkOrdersOfCustomer(admin, other, ctx.db)).map(({ id }) => id)).toEqual([orderId]);
});

test('a cancelled Zákazka is still a link: the Zákazník is not deleted', async () => {
  const vehicleId = await newVehicle();
  const other = idOf(await createCustomer(admin, { type: 'person', name: 'Ján Novák' }, ctx.db));
  const orderId = await newOrder(vehicleId, other);
  expect(await changeWorkOrderStatus(admin, orderId, { to: 'cancelled', confirmed: true }, ctx.db)).toEqual({ ok: true });

  expect(await deleteCustomer(admin, other, ctx.db)).toEqual({ ok: false, error: 'has-links' });

  expect(await getCustomer(admin, other, ctx.db)).not.toBeNull();
});

test('a Zákazník who does not exist, or an id that is not one, is unknown, and nothing is deleted', async () => {
  expect(await deleteCustomer(admin, '3f0c8c1e-6a52-4a39-9c52-0d4a4b6c1f10', ctx.db)).toEqual({ ok: false, error: 'unknown' });
  expect(await deleteCustomer(admin, 'nie-je-id', ctx.db)).toEqual({ ok: false, error: 'unknown' });

  expect(await getCustomer(admin, ownerId, ctx.db)).not.toBeNull();
});

test('a Vozidlo with no Zákazka is deleted, and its Majiteľ stays', async () => {
  const vehicleId = await newVehicle();

  expect(await deleteVehicle(admin, vehicleId, ctx.db)).toEqual({ ok: true });

  expect(await getVehicle(admin, vehicleId, ctx.db)).toBeNull();
  expect(await getCustomer(admin, ownerId, ctx.db)).toMatchObject({ id: ownerId, vehicles: [] });
});

test('a Vozidlo with a cancelled Zákazka is not deleted, and keeps the Zákazka', async () => {
  const vehicleId = await newVehicle();
  const orderId = await newOrder(vehicleId);
  expect(await changeWorkOrderStatus(admin, orderId, { to: 'cancelled', confirmed: true }, ctx.db)).toEqual({ ok: true });

  expect(await deleteVehicle(admin, vehicleId, ctx.db)).toEqual({ ok: false, error: 'has-links' });

  expect(await getVehicle(admin, vehicleId, ctx.db)).not.toBeNull();
  expect((await listWorkOrdersOfVehicle(admin, vehicleId, ctx.db)).map(({ id }) => id)).toEqual([orderId]);
});

test('a Vozidlo that does not exist, or an id that is not one, is unknown, and nothing is deleted', async () => {
  const vehicleId = await newVehicle();

  expect(await deleteVehicle(admin, '3f0c8c1e-6a52-4a39-9c52-0d4a4b6c1f10', ctx.db)).toEqual({ ok: false, error: 'unknown' });
  expect(await deleteVehicle(admin, 'nie-je-id', ctx.db)).toEqual({ ok: false, error: 'unknown' });

  expect(await getVehicle(admin, vehicleId, ctx.db)).not.toBeNull();
});

// The database, without the DAL: what refuses the delete when no check was made at all.

test('PostgreSQL itself refuses to delete a Zákazník with a Vozidlo or a Zákazka, and a Vozidlo with a Zákazka', async () => {
  const vehicleId = await newVehicle();
  const other = idOf(await createCustomer(admin, { type: 'person', name: 'Ján Novák' }, ctx.db));
  await newOrder(vehicleId, other);
  const foreignKeyViolation = { cause: { code: '23503' } };

  await expect(ctx.db.delete(customer).where(eq(customer.id, ownerId))).rejects.toMatchObject(foreignKeyViolation);
  await expect(ctx.db.delete(customer).where(eq(customer.id, other))).rejects.toMatchObject(foreignKeyViolation);
  await expect(ctx.db.delete(vehicle).where(eq(vehicle.id, vehicleId))).rejects.toMatchObject(foreignKeyViolation);

  expect(await ctx.db.$count(customer)).toBe(2);
  expect(await ctx.db.$count(vehicle)).toBe(1);
});

test('every foreign key that points at a Zákazník or a Vozidlo is `restrict`, so a table added later cannot cascade a delete', async () => {
  const { rows } = await ctx.db.execute<{ name: string; on_delete: string }>(sql`
    select conname as name, confdeltype as on_delete
    from pg_constraint
    where contype = 'f' and confrelid in ('customer'::regclass, 'vehicle'::regclass)`);

  expect(rows.map(({ name }) => name).sort()).toEqual(
    expect.arrayContaining(['vehicle_owner_id_customer_id_fk', 'work_order_customer_id_customer_id_fk', 'work_order_vehicle_id_vehicle_id_fk']),
  );
  expect(rows.filter(({ on_delete }) => on_delete !== 'r').map(({ name }) => name)).toEqual([]);
});

// A link that is added while the delete is under way. Its foreign key holds a lock on the row the
// delete wants, so the delete waits for it, and then PostgreSQL looks again and refuses.

/** Waits until a statement of this database is blocked behind another one's lock. */
const untilSomeoneWaits = () =>
  vi.waitFor(async () => {
    const { rows } = await ctx.db.execute<{ waiting: number }>(
      sql`select count(*)::int as waiting from pg_stat_activity where datname = current_database() and wait_event_type = 'Lock'`,
    );
    expect(rows[0]!.waiting).toBeGreaterThan(0);
  });

/** Runs `link` in a transaction that stays open, starts `deleting`, lets it wait on the lock of the link, and only then commits. */
async function deleteWhileLinkIsAdded<Result>(link: string, parameters: unknown[], deleting: () => Promise<Result>) {
  const other = await ctx.db.$client.connect();
  let result: Promise<Result> | undefined;
  let failed = true;
  try {
    await other.query('begin');
    await other.query(link, parameters);
    result = deleting();
    await untilSomeoneWaits();
    await other.query('commit');
    const done = await result;
    failed = false;
    return done;
  } finally {
    // After a failure the connection still has its transaction open and holds the locks, so the delete would wait for them and
    // the next test's reset after it. Destroying the connection ends the transaction (#134), and waiting for the delete leaves
    // nothing running when the next test starts; the failure that got us here is the one the test reports.
    other.release(failed);
    await result?.catch(() => {});
  }
}

test('a Vozidlo added to a Zákazník while he is being deleted stops the delete', async () => {
  const result = await deleteWhileLinkIsAdded(
    `insert into vehicle (vin, owner_id, make, model) values ($1, $2, 'Škoda', 'Octavia')`,
    ['TMBZZZ5JZ3W000101', ownerId],
    () => deleteCustomer(admin, ownerId, ctx.db),
  );

  expect(result).toEqual({ ok: false, error: 'has-links' });
  expect((await getCustomer(admin, ownerId, ctx.db))?.vehicles).toHaveLength(1);
});

test('a Zákazka added for a Zákazník while he is being deleted stops the delete', async () => {
  const vehicleId = await newVehicle();
  const other = idOf(await createCustomer(admin, { type: 'person', name: 'Ján Novák' }, ctx.db));

  const result = await deleteWhileLinkIsAdded(
    `insert into work_order (number, customer_id, vehicle_id, mileage_km, customer_request) values ('Z0000-0001', $1, $2, 1, 'Brzdy')`,
    [other, vehicleId],
    () => deleteCustomer(admin, other, ctx.db),
  );

  expect(result).toEqual({ ok: false, error: 'has-links' });
  expect(await listWorkOrdersOfCustomer(admin, other, ctx.db)).toHaveLength(1);
});

test('a Zákazka added for a Vozidlo while it is being deleted stops the delete', async () => {
  const vehicleId = await newVehicle();

  const result = await deleteWhileLinkIsAdded(
    `insert into work_order (number, customer_id, vehicle_id, mileage_km, customer_request) values ('Z0000-0001', $1, $2, 1, 'Brzdy')`,
    [ownerId, vehicleId],
    () => deleteVehicle(admin, vehicleId, ctx.db),
  );

  expect(result).toEqual({ ok: false, error: 'has-links' });
  expect(await getVehicle(admin, vehicleId, ctx.db)).not.toBeNull();
  expect(await listWorkOrdersOfVehicle(admin, vehicleId, ctx.db)).toHaveLength(1);
});
