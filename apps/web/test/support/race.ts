import type { Database } from '../../src/db/index.ts';

/**
 * How long every call may take to come to its write. The real work: the calls are Better Auth's, which hashes a password or
 * reads a session first; the slowest test that uses this takes 0.9 s on an idle machine, with its set-up, and the 5 s this had
 * ran out under load (#134). 20 s is about twenty times that, and under the 30 s of a test, so the message below is what fails.
 */
const comeToWriteWithin = 20_000;

/**
 * Starts all `calls` at once and holds back every write to the table "user" until each of them is
 * waiting to write; then lets them write one after another. It is the race of requests that all
 * checked that an e-mail is free before any of them wrote: left to timing, the first write usually
 * came before the other checks, and a test of the second write's refusal passed without ever reaching it.
 * Reads are not held back, so each call gets through its own check.
 */
export async function raceForUserWrites<T>(db: Database, calls: (() => Promise<T>)[]): Promise<T[]> {
  const holder = await db.$client.connect();
  let results: Promise<T[]> | undefined;
  try {
    await holder.query('begin');
    await holder.query('lock table "user" in share row exclusive mode');
    results = Promise.all(calls.map((call) => call()));
    const giveUp = Date.now() + comeToWriteWithin;
    for (;;) {
      const { rows } = await holder.query<{ waiting: number }>(
        `select count(*)::int as waiting from pg_locks where locktype = 'relation' and relation = '"user"'::regclass and not granted`,
      );
      if (rows[0]!.waiting >= calls.length) break;
      if (Date.now() >= giveUp) throw new Error(`Only ${rows[0]!.waiting} of ${calls.length} calls came to write to "user" within ${comeToWriteWithin / 1000} seconds.`);
      await new Promise((resolve) => setTimeout(resolve, 25));
    }
    await holder.query('commit');
    return await results;
  } finally {
    await holder.query('rollback'); // after the commit it only warns; after a failure it frees the lock
    holder.release();
    await results?.catch(() => {}); // when giving up, the calls write now and finish before the next test resets the tables (#134); the failure is the one reported
  }
}
