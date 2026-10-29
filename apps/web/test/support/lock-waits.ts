import { sql } from 'drizzle-orm';
import { expect, vi } from 'vitest';
import type { Database } from '../../src/db/index.ts';

/**
 * Waits, not by a timer but by what PostgreSQL shows, until at least `sessions` statements of the database of `db` are
 * blocked behind a lock. The statement has to get a connection, parse and plan before it reaches the lock: milliseconds on
 * an idle machine, and the 1 s that `vi.waitFor` gives by default ran out under load (#134), so it has 10 s, about a
 * hundred times that.
 */
export const untilLockWaits = (db: Database, sessions = 1) =>
  vi.waitFor(
    async () => {
      const { rows } = await db.execute<{ waiting: number }>(
        sql`select count(*)::int as waiting from pg_stat_activity where datname = current_database() and wait_event_type = 'Lock'`,
      );
      expect(rows[0]!.waiting).toBeGreaterThanOrEqual(sessions);
    },
    { timeout: 10_000 },
  );
