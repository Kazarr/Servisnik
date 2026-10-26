import { sql } from 'drizzle-orm';
import type { Database } from './db/index.ts';

/** 200 when the database answers a trivial query, 503 otherwise. The body never says why. */
export async function healthResponse(db: Database): Promise<Response> {
  try {
    await db.execute(sql`select 1`);
    return Response.json({ status: 'ok' });
  } catch {
    return Response.json({ status: 'unavailable' }, { status: 503 });
  }
}
