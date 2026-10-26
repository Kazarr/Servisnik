import { createServer, type AddressInfo } from 'node:net';
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

// A host that drops packets neither refuses nor answers. A local socket that accepts and stays
// silent looks the same to the app on every network; an address like 10.255.255.1 does not.
test('health is 503 within seconds when the database host never answers', async () => {
  const silent = createServer();
  await new Promise<void>((resolve) => silent.listen(0, '127.0.0.1', resolve));
  const { port } = silent.address() as AddressInfo;
  const hung = createDb(`postgres://servisnik:tajne-heslo@127.0.0.1:${port}/servisnik`);

  const started = performance.now();
  const response = await healthResponse(hung);
  const elapsed = performance.now() - started;
  await hung.$client.end();
  silent.close();

  expect(response.status).toBe(503);
  expect(elapsed).toBeLessThan(4000);
}, 8000);
