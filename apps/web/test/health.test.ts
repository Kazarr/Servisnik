import { afterAll, beforeAll, expect, test } from 'vitest';
import { createDb } from '../src/db/index.ts';
import { healthResponse } from '../src/health.ts';
import { createTestDb } from './support/db.ts';

let ctx: Awaited<ReturnType<typeof createTestDb>>;
beforeAll(async () => {
  ctx = await createTestDb();
});
afterAll(() => ctx.close());

test('health is 200 while the database answers', async () => {
  const response = await healthResponse(ctx.db);

  expect(response.status).toBe(200);
  expect(await response.json()).toEqual({ status: 'ok' });
});

test('health is 503 when the database is unreachable, without leaking why', async () => {
  const unreachable = createDb('postgres://servisnik:tajne-heslo@127.0.0.1:1/servisnik');

  const response = await healthResponse(unreachable);
  await unreachable.$client.end();

  expect(response.status).toBe(503);
  expect(await response.json()).toEqual({ status: 'unavailable' });
});
