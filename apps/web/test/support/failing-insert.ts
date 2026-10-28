import { sql } from 'drizzle-orm';
import type { Database } from '../../src/db/index.ts';

/**
 * Makes every insert into `table` fail, as a full disk or a lost connection would at the last step of a
 * write, and returns the function that lifts it. The tables a write ends in are the ones a test needs.
 */
export async function failInsertsInto(db: Database, table: 'work_order' | 'vehicle') {
  await db.execute(sql`create or replace function refuse_insert() returns trigger language plpgsql as $$ begin raise exception 'The test refuses this insert.'; end $$`);
  await db.execute(sql.raw(`create trigger refuse_insert before insert on ${table} for each row execute function refuse_insert()`));
  return () => db.execute(sql.raw(`drop trigger refuse_insert on ${table}`));
}
