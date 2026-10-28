import { sql } from 'drizzle-orm';
import type { Database } from './db/index.ts';

/**
 * 200 when the database answers a trivial query, 503 otherwise. The body never says why.
 * A 200 also names the commit the image was built from (`GIT_SHA`, a build argument of the Dockerfile),
 * which the deploy workflow's smoke compares with the commit it deployed; an image built without one names none.
 */
export async function healthResponse(db: Database, sha = process.env.GIT_SHA): Promise<Response> {
  try {
    await db.execute(sql`select 1`);
    return Response.json({ status: 'ok', sha: sha || undefined });
  } catch {
    return Response.json({ status: 'unavailable' }, { status: 503 });
  }
}
