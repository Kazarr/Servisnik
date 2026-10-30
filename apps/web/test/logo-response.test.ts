import { maxLogoBytes } from '@servisnik/domain/settings';
import { afterAll, beforeAll, beforeEach, expect, test } from 'vitest';
import { getLogo, removeLogo, saveLogo } from '../src/dal/logo.ts';
import type { User } from '../src/dal/user.ts';
import { deleteLogoResponse, getLogoResponse, putLogoResponse } from '../src/logo-response.ts';
import { admin, mechanic } from './support/dal-users.ts';
import { createTestDb } from './support/db.ts';
import { gif, jpeg, padded, png, textNamedPng } from './support/logo-files.ts';

// The Route Handler of the logo (specification, Logo): uploading and removing it is the admin's, reading the
// image is every signed-in user's. The route file only finds the user in the session; the answers are here.

let ctx: Awaited<ReturnType<typeof createTestDb>>;
beforeAll(async () => {
  ctx = await createTestDb();
});
afterAll(() => ctx.close());
beforeEach(() => removeLogo(admin, ctx.db));

const url = 'http://localhost/api/logo';
const put = (user: User | null, body: BodyInit | null, headers: Record<string, string> = {}) =>
  putLogoResponse(user, new Request(url, { method: 'PUT', body, headers }), ctx.db);
// The image is the login page's too (ticket #150), so reading it asks for no session: `get` takes nobody.
const get = () => getLogoResponse(ctx.db);
const remove = (user: User | null) => deleteLogoResponse(user, ctx.db);

/** A body of `file` that reports whether anybody read it: its queue holds nothing ahead of a read. */
function watchedBody(file: Uint8Array) {
  let read = false;
  const body = new ReadableStream<Uint8Array>(
    {
      pull(controller) {
        read = true;
        controller.enqueue(file);
        controller.close();
      },
    },
    { highWaterMark: 0 },
  );
  return { body, wasRead: () => read };
}

const bytesOf = async (response: Response) => new Uint8Array(await response.arrayBuffer());
const stored = async () => (await getLogo(admin, ctx.db))?.bytes ?? null;

test('the admin uploads a PNG, and anybody reads it back with its type and nosniff, signed in or not', async () => {
  const uploaded = await put(admin, png, { 'Content-Type': 'image/png' });
  expect(uploaded.status).toBe(204);

  const response = await get();
  expect(response.status).toBe(200);
  expect(response.headers.get('Content-Type')).toBe('image/png');
  expect(response.headers.get('X-Content-Type-Options')).toBe('nosniff');
  expect(await bytesOf(response)).toEqual(png);
});

// A replaced logo must show at once: the browser asks again on every use (no-cache), and no shared cache keeps the image (private).
// The address of the preview carries the time of the change as well (e2e/logo.spec.ts).
test('the image is revalidated on every use and kept out of shared caches', async () => {
  await put(admin, png);

  const response = await get();

  expect(response.headers.get('Cache-Control')).toBe('private, no-cache');
});

test('the type of the answer is the one read from the content, not the one the sender claimed', async () => {
  expect((await put(admin, jpeg, { 'Content-Type': 'image/png' })).status).toBe(204);

  const response = await get();

  expect(response.headers.get('Content-Type')).toBe('image/jpeg');
});

test('a PNG sent as text is still a PNG, because only its content counts', async () => {
  expect((await put(admin, png, { 'Content-Type': 'text/plain' })).status).toBe(204);

  expect((await get()).headers.get('Content-Type')).toBe('image/png');
});

test('an answer that is not the image does not claim to be one', async () => {
  const missing = await get();

  expect(missing.status).toBe(404);
  expect(missing.headers.get('Content-Type')).toMatch(/^application\/json/);
  expect(await missing.json()).toEqual({ error: 'Logo nie je nahrané.' });
});

test('a new upload replaces the logo, and removing it makes the image a 404 again', async () => {
  await put(admin, png);
  await put(admin, jpeg);
  expect(await bytesOf(await get())).toEqual(jpeg);

  expect((await remove(admin)).status).toBe(204);
  expect((await remove(admin)).status).toBe(204); // nothing to remove is no failure

  expect((await get()).status).toBe(404);
});

test.each([
  ['a GIF', gif],
  ['text named .png', textNamedPng],
  ['an empty body', new Uint8Array()],
])('%s is refused with 415 and a message that says what is wanted, and the logo stays', async (_what, file) => {
  await saveLogo(admin, png, ctx.db);

  const response = await put(admin, file.length ? file : null, { 'Content-Type': 'image/png' });

  expect(response.status).toBe(415);
  expect(await response.json()).toEqual({ error: 'Logo musí byť obrázok PNG alebo JPEG. Rozhoduje obsah súboru, nie jeho prípona.' });
  expect(await stored()).toEqual(png);
});

test('a file of exactly 1 MB is kept and one byte more is refused with 413, the logo staying as it was', async () => {
  expect((await put(admin, padded(png, maxLogoBytes))).status).toBe(204);

  const response = await put(admin, padded(jpeg, maxLogoBytes + 1));

  expect(response.status).toBe(413);
  expect(await response.json()).toEqual({ error: 'Súbor je väčší ako 1 MB. Vyberte menšie logo.' });
  const kept = await stored();
  expect(kept).not.toBeNull();
  expect(kept!.byteLength).toBe(maxLogoBytes); // first, so that a size that differs shows its numbers
  expect(Buffer.compare(kept!, padded(png, maxLogoBytes))).toBe(0); // `toEqual` walks a million bytes one by one: seconds on an idle machine, over the limit on a busy one
});

test('a body that says in advance it is over 1 MB is refused before it is read', async () => {
  const { body, wasRead } = watchedBody(png);
  const request = new Request(url, { method: 'PUT', body, duplex: 'half', headers: { 'Content-Length': String(maxLogoBytes + 1) } } as RequestInit);

  const response = await putLogoResponse(admin, request, ctx.db);

  expect(response.status).toBe(413);
  expect(wasRead()).toBe(false);
});

// A sender that declares nothing, or lies, can still send without end: the answer must come after 1 MB and one byte, not after the body.
test('a body that never ends is refused with 413 after the first byte over 1 MB, and the stream is closed', async () => {
  let pulls = 0;
  let cancelled = false;
  const endless = new ReadableStream<Uint8Array>({
    pull(controller) {
      pulls += 1;
      controller.enqueue(new Uint8Array(64 * 1024));
    },
    cancel: () => void (cancelled = true),
  });
  const request = new Request(url, { method: 'PUT', body: endless, duplex: 'half' } as RequestInit);

  const response = await putLogoResponse(admin, request, ctx.db);

  expect(response.status).toBe(413);
  expect(cancelled).toBe(true);
  expect(pulls).toBeLessThan(maxLogoBytes / (64 * 1024) + 8); // 16 chunks hold the limit; the stream's own queue reads ahead a few more
});

test('the mechanik may neither upload nor remove the logo: 403 with a message, nothing read or changed', async () => {
  await saveLogo(admin, png, ctx.db);
  const { body, wasRead } = watchedBody(jpeg);

  const uploaded = await putLogoResponse(mechanic, new Request(url, { method: 'PUT', body, duplex: 'half' } as RequestInit), ctx.db);
  const removed = await remove(mechanic);

  for (const response of [uploaded, removed]) {
    expect(response.status).toBe(403);
    expect(await response.json()).toEqual({ error: 'Na túto akciu nemáte oprávnenie' });
  }
  expect(wasRead()).toBe(false);
  expect(await stored()).toEqual(png);
});

// Both rules are broken at once: the mechanik may not, and the file is too large and a GIF. The Rola is asked first.
test('a mechanik who sends a file that is too large and not an image is told he may not, not what is wrong with the file', async () => {
  expect((await put(mechanic, padded(gif, maxLogoBytes + 1))).status).toBe(403);
});

test('nobody signed in may change the logo: 401, but the image is shown to anybody, as the login page needs it', async () => {
  await saveLogo(admin, png, ctx.db);

  for (const response of [await put(null, png), await remove(null)]) {
    expect(response.status).toBe(401);
    expect(await response.json()).toEqual({ error: 'Nie ste prihlásený.' });
  }
  expect(await stored()).toEqual(png);
  expect(await bytesOf(await get())).toEqual(png);
});
