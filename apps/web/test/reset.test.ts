import { afterAll, beforeAll, expect, test, vi } from 'vitest';
import { createCustomer } from '../src/dal/customers.ts';
import { createVehicle } from '../src/dal/vehicles.ts';
import { customer, vehicle } from '../src/db/schema.ts';
import { admin } from './support/dal-users.ts';
import { createTestDb } from './support/db.ts';
import { idOf } from './support/id-of.ts';
import { untilLockWaits } from './support/lock-waits.ts';
import { truncateTables } from './support/reset.ts';

// Issue #134: a TRUNCATE takes its tables one after another, so a transaction of the test before that is still
// running (Vitest does not stop the body of a test that timed out) can hold a later table while it waits for an
// earlier one, and PostgreSQL ends one of the two with 40P01 "deadlock detected". The reset of the next test must
// not fail on that: the truncate that was ended changed nothing, and the transaction it waited for is on its way out.

let ctx: Awaited<ReturnType<typeof createTestDb>>;
beforeAll(async () => {
  ctx = await createTestDb();
  // PostgreSQL looks for a cycle once, when a statement has waited `deadlock_timeout`; the statement that looks and finds
  // one is the victim. The reset waits first, so it is the victim as long as the transaction below closes the cycle within
  // that time. The default 1 s is too short for a test process that a busy machine starves (the other side, which looks
  // 30 s later, then became the victim and the test hung to its limit), so the pool, whose connections open from the first
  // query on, has 10 s.
  ctx.db.$client.options.options = '-c deadlock_timeout=10s';
});
afterAll(() => ctx.close());

// The real work: the reset waits the 10 s of deadlock_timeout before PostgreSQL sees the cycle, then runs again; twice that
// for the wait of the reset to start and the wait of the transaction to close the cycle, on a busy machine (#134).
test('a reset that PostgreSQL ends as the victim of a deadlock with a transaction still running runs again and empties the tables', { timeout: 60_000 }, async () => {
  const ownerId = idOf(await createCustomer(admin, { type: 'person', name: 'Ján Novák' }, ctx.db));
  idOf(await createVehicle(admin, { ownerId, vin: 'WVWZZZ1JZ3W386752', licensePlate: '', make: 'Volkswagen', model: 'Golf' }, ctx.db));
  const executed = vi.spyOn(ctx.db, 'execute');

  // The transaction of the test before: it has read the vehicles (so a truncate of them must wait for it) and is about to read the customers.
  const left = await ctx.db.$client.connect();
  try {
    await left.query('begin');
    await left.query('select 1 from vehicle');

    const resetting = truncateTables(ctx.db, 'customer'); // takes customer, then waits for vehicle
    const settled = resetting.then(() => 'done', (error: unknown) => error);
    await untilLockWaits(ctx.db);
    await left.query('select 1 from customer'); // waits for customer: the cycle, which the reset finds after its 10 s and is ended by, letting go of customer
    await left.query('commit');

    expect(await settled).toBe('done');
  } finally {
    await left.query('rollback');
    left.release();
  }

  expect(executed.mock.calls.filter(([query]) => JSON.stringify(query).includes('truncate'))).toHaveLength(2); // the one that was ended, and the one that ran again
  expect(await ctx.db.$count(customer)).toBe(0);
  expect(await ctx.db.$count(vehicle)).toBe(0);
});
