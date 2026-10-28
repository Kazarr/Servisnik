import type { Database } from '../../src/db/index.ts';

/**
 * Starts all `calls` at once and holds back every write to the table "user" until each of them is
 * waiting to write; then lets them write one after another. It is the race of requests that all
 * checked that an e-mail is free before any of them wrote: left to timing, the first write usually
 * came before the other checks, and a test of the second write's refusal passed without ever reaching it.
 * Reads are not held back, so each call gets through its own check.
 */
export async function raceForUserWrites<T>(db: Database, calls: (() => Promise<T>)[]): Promise<T[]> {
  const holder = await db.$client.connect();
  try {
    await holder.query('begin');
    await holder.query('lock table "user" in share row exclusive mode');
    const results = Promise.all(calls.map((call) => call()));
    for (let attempt = 0; ; attempt++) {
      const { rows } = await holder.query<{ waiting: number }>(
        `select count(*)::int as waiting from pg_locks where locktype = 'relation' and relation = '"user"'::regclass and not granted`,
      );
      if (rows[0]!.waiting >= calls.length) break;
      if (attempt >= 200) throw new Error(`Only ${rows[0]!.waiting} of ${calls.length} calls came to write to "user" within 5 seconds.`);
      await new Promise((resolve) => setTimeout(resolve, 25));
    }
    await holder.query('commit');
    return await results;
  } finally {
    await holder.query('rollback'); // after the commit it only warns; after a failure it frees the lock
    holder.release();
  }
}
