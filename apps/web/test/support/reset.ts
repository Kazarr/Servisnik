import { sql } from 'drizzle-orm';
import type { Database } from '../../src/db/index.ts';

/**
 * Empties `tables` and every table that refers to them, before a test. `tables` are names as SQL writes them (`'"user"'`).
 *
 * A TRUNCATE takes its tables one after another, so a transaction of the test before that is still running (Vitest
 * does not stop the body of a test that timed out) can hold a later table while it waits for an earlier one, and
 * PostgreSQL ends one of the two with 40P01 "deadlock detected" (test/reset.test.ts forces it). The truncate that
 * was ended changed nothing, and the transaction it met finishes on its own, so it is run again; a deadlock that
 * returns after a few runs is not a leftover but a bug, and is thrown.
 */
export async function truncateTables(db: Database, ...tables: string[]): Promise<void> {
  for (let attempt = 1; ; attempt++) {
    try {
      await db.execute(sql.raw(`truncate ${tables.join(', ')} cascade`));
      return;
    } catch (error) {
      const deadlock = error instanceof Error && (error.cause as { code?: string } | undefined)?.code === '40P01';
      if (!deadlock || attempt >= 5) throw error;
    }
  }
}
