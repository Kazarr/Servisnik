import { sql } from 'drizzle-orm';
import type { Database } from '../../src/db/index.ts';

/**
 * Makes every insert into `table` fail with an error PostgreSQL raises at that insert, as any error at the
 * last step of a write would, and returns the function that lifts it (the trigger and the function it
 * calls both go). The tables a write ends in are the ones a test needs.
 */
export async function failInsertsInto(db: Database, table: 'work_order' | 'vehicle') {
  await db.execute(sql`create or replace function refuse_insert() returns trigger language plpgsql as $$ begin raise exception 'The test refuses this insert.'; end $$`);
  await db.execute(sql.raw(`create trigger refuse_insert before insert on ${table} for each row execute function refuse_insert()`));
  return async () => {
    await db.execute(sql.raw(`drop trigger refuse_insert on ${table}`));
    await db.execute(sql`drop function refuse_insert()`);
  };
}
