import { sql } from 'drizzle-orm';
import type { Database } from '../../src/db/index.ts';

/**
 * Empties `tables` and every table that refers to them, before a test. `tables` are names as SQL writes them (`'"user"'`).
 */
export async function truncateTables(db: Database, ...tables: string[]): Promise<void> {
  await db.execute(sql.raw(`truncate ${tables.join(', ')} cascade`));
}
