import { sql } from 'drizzle-orm';
import type { Database } from '../../src/db/index.ts';

/**
 * Gives the rows of `table` with these `ids` a `created_at` each, a second apart and the first id the oldest, whenever
 * they were saved. Rows saved one after another can get the same `created_at` (or a clock that stepped back under load
 * the wrong order), and then the list falls back on `id`, which is random: so a test that expects "the newest first" or
 * "in the order saved" says that order itself instead of trusting the clock (#159). Call it right after the saves, and
 * expect the list in the order of `ids`, reversed for "the newest first".
 */
export async function savedInOrder(db: Database, table: 'customer' | 'vehicle' | 'work_order', ids: string[]): Promise<void> {
  for (const [i, id] of ids.entries()) {
    await db.execute(sql`update ${sql.identifier(table)} set created_at = '2026-01-01T00:00:00Z'::timestamptz + ${i}::int * interval '1 second' where id = ${id}`);
  }
}
