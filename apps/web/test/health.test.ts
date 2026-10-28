import { createServer, type AddressInfo } from 'node:net';
import { afterAll, beforeAll, expect, test, vi } from 'vitest';
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

// The deploy workflow's smoke asks the live app which commit it was built from (GIT_SHA, set by the image build).
test('health names the commit the image was built from', async () => {
  const response = await healthResponse(ctx.db, 'abc123');

  expect(await response.json()).toEqual({ status: 'ok', sha: 'abc123' });
});

test('health reads the commit from GIT_SHA, and names none when the image was built without one', async () => {
  vi.stubEnv('GIT_SHA', 'def456');
  expect(await (await healthResponse(ctx.db)).json()).toEqual({ status: 'ok', sha: 'def456' });

  vi.stubEnv('GIT_SHA', ''); // what `ENV GIT_SHA=$GIT_SHA` leaves when the build had no --build-arg
  expect(await (await healthResponse(ctx.db)).json()).toEqual({ status: 'ok' });
  vi.unstubAllEnvs();
});

test('health is 503 when the database is unreachable, without leaking why', async () => {
  const unreachable = createDb('postgres://servisnik:tajne-heslo@127.0.0.1:1/servisnik');

  const response = await healthResponse(unreachable, 'abc123');
  await unreachable.$client.end();

  expect(response.status).toBe(503);
  expect(await response.json()).toEqual({ status: 'unavailable' }); // no sha either: a 503 says nothing about the build
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
