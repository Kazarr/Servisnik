import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, beforeEach, expect, test } from 'vitest';
import { createCustomer } from '../src/dal/customers.ts';
import { admin } from './support/dal-users.ts';
import { createTestDb } from './support/db.ts';
import { idOf } from './support/id-of.ts';
import { truncateTables } from './support/reset.ts';
import { savedInOrder } from './support/saved-in-order.ts';

let ctx: Awaited<ReturnType<typeof createTestDb>>;
beforeAll(async () => {
  ctx = await createTestDb();
});
afterAll(() => ctx.close());
beforeEach(() => truncateTables(ctx.db, 'customer'));

test('an id that is no row of the table fails right there, instead of leaving the order to the clock', async () => {
  const saved = idOf(await createCustomer(admin, { type: 'person', name: 'Ján Novák' }, ctx.db));

  await expect(savedInOrder(ctx.db, 'customer', [saved, randomUUID()])).rejects.toThrow(/exactly one row/);
  await expect(savedInOrder(ctx.db, 'vehicle', [saved])).rejects.toThrow(/exactly one row/); // right id, wrong table
});
