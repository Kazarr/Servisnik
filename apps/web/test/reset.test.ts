import { sql } from 'drizzle-orm';
import { afterAll, beforeAll, expect, test, vi } from 'vitest';
import { createCustomer } from '../src/dal/customers.ts';
import { createVehicle } from '../src/dal/vehicles.ts';
import { customer, vehicle } from '../src/db/schema.ts';
import { admin } from './support/dal-users.ts';
import { createTestDb } from './support/db.ts';
import { idOf } from './support/id-of.ts';
import { truncateTables } from './support/reset.ts';

// Issue #134: a TRUNCATE takes its tables one after another, so a transaction of the test before that is still
// running (Vitest does not stop the body of a test that timed out) can hold a later table while it waits for an
// earlier one, and PostgreSQL ends one of the two with 40P01 "deadlock detected". The reset of the next test must
// not fail on that: the truncate that was ended changed nothing, and the transaction it waited for is on its way out.

let ctx: Awaited<ReturnType<typeof createTestDb>>;
beforeAll(async () => {
  ctx = await createTestDb();
});
afterAll(() => ctx.close());

test('a reset that PostgreSQL ends as the victim of a deadlock with a transaction still running runs again and empties the tables', async () => {
  const ownerId = idOf(await createCustomer(admin, { type: 'person', name: 'Ján Novák' }, ctx.db));
  idOf(await createVehicle(admin, { ownerId, vin: 'WVWZZZ1JZ3W386752', licensePlate: '', make: 'Volkswagen', model: 'Golf' }, ctx.db));

  // The transaction of the test before: it has read the vehicles (so a truncate of them must wait for it) and is about to read the customers.
  const left = await ctx.db.$client.connect();
  try {
    await left.query('begin');
    await left.query(`set local deadlock_timeout = '30s'`); // so that the reset, which waits first and has the default 1 s, is the one that finds the deadlock
    await left.query('select 1 from vehicle');

    const resetting = truncateTables(ctx.db, 'customer'); // takes customer, then waits for vehicle
    const settled = resetting.then(() => 'done', (error: unknown) => error);
    await vi.waitFor(
      async () => {
        const { rows } = await ctx.db.execute<{ waiting: number }>(
          sql`select count(*)::int as waiting from pg_stat_activity where datname = current_database() and wait_event_type = 'Lock'`,
        );
        expect(rows[0]!.waiting).toBe(1);
      },
      { timeout: 10_000 }, // as in deletion.test.ts: the reset needs a connection and a plan before it waits, which the 1 s default does not allow under load
    );
    await left.query('select 1 from customer'); // waits for customer: the cycle; the reset is ended and lets go of customer
    await left.query('commit');

    expect(await settled).toBe('done');
  } finally {
    await left.query('rollback');
    left.release();
  }

  expect(await ctx.db.$count(customer)).toBe(0);
  expect(await ctx.db.$count(vehicle)).toBe(0);
});
