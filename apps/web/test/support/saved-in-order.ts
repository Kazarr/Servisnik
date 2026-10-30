import { sql } from 'drizzle-orm';
import type { Database } from '../../src/db/index.ts';

/**
 * Gives the rows of `table` with these `ids` a `created_at` each, a second apart and the first id the oldest, whenever
 * they were saved. Rows saved one after another can get the same `created_at` (or a clock that stepped back under load
 * the wrong order), and then the order of a tie is not the order saved: `searchVehicles` breaks it by `id`, which is
 * random, `listWorkOrders` by `number`, and `listCustomers`, `listWorkOrdersOfVehicle` and `listWorkOrdersOfCustomer`
 * by nothing, so PostgreSQL returns a tie in no defined order. A test that expects "the newest first" or "in the order
 * saved" therefore says that order itself instead of trusting the clock (#159). Call it right after the saves, and
 * expect the list in the order of `ids`, reversed for "the newest first".
 *
 * `ids` must be every row the list shows: the stamps start on 2026-01-01, before `now()`, so a listed row left out
 * keeps its saved `created_at` and is newer than all of them. Each id must be a row of `table`, or it throws right
 * there, as `idOf` does, and not leave that row to the clock.
 */
export async function savedInOrder(db: Database, table: 'customer' | 'vehicle' | 'work_order', ids: string[]): Promise<void> {
  for (const [i, id] of ids.entries()) {
    const { rowCount } = await db.execute(sql`update ${sql.identifier(table)} set created_at = '2026-01-01T00:00:00Z'::timestamptz + ${i}::int * interval '1 second' where id = ${id}`);
    if (rowCount !== 1) throw new Error(`"${id}" is not exactly one row of ${table}: the update hit ${rowCount ?? 0}.`);
  }
}
