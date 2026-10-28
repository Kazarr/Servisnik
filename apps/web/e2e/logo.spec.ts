import { maxLogoBytes } from '@servisnik/domain/settings';
import { test, type Page } from '@playwright/test';
import { randomBytes } from 'node:crypto';
import { removeLogo } from '../src/dal/logo.ts';
import { jpeg, padded, png, textNamedPng } from '../test/support/logo-files.ts';
import { seedUser } from '../test/support/users.ts';
import { expect, runTag, signIn, signInAs } from './fixtures.ts';
import { admin, openDatabase } from './records.ts';
import { watchPage } from './watch-page.ts';

let db: ReturnType<typeof openDatabase>;
test.beforeAll(() => {
  db = openDatabase();
});
test.afterAll(() => db.$client.end());

/** Chooses `file` in the file field of the logo, named `name` and claimed to be a PNG; the button sends it. */
const choose = (page: Page, file: Uint8Array, name = 'logo.png') =>
  page.getByLabel('Súbor loga (PNG alebo JPEG do 1 MB)').setInputFiles({ name, mimeType: 'image/png', buffer: Buffer.from(file) });

// The logo is one row for the whole autoservis and no other spec touches it. It is one test, so that nothing
// removes the logo from under another run of it. It uses the plain `test`, not the one from fixtures.ts:
// Chromium logs every refused upload as a console error, which that fixture would fail on, and this test
// makes the refusals on purpose. It watches the page itself and expects those two lines.
test('the admin uploads the logo, sees it, has a wrong file refused, replaces and removes it; the mechanik reads it but can neither change nor remove it', async ({
  page,
  browser,
  baseURL,
  request,
}) => {
  test.slow(); // two users and an upload, a replacement, two refusals and a removal, all through the production build the workers share
  await removeLogo(admin, db);
  const mechanik = { email: `mechanik-${runTag()}@autoservis.test`, password: randomBytes(12).toString('base64url') };
  await seedUser(db, { ...mechanik, role: 'mechanik' });
  const problems = watchPage(page);
  await signIn(page);
  await page.goto('/nastavenia');
  const main = page.locator('main');
  await expect(main.getByRole('heading', { level: 2, name: 'Logo' })).toBeVisible();
  const preview = main.getByRole('img', { name: 'Logo autoservisu' });
  await expect(preview).toHaveCount(0);
  await expect(main.getByRole('button', { name: 'Odstrániť logo' })).toHaveCount(0);

  await choose(page, png);
  await main.getByRole('button', { name: 'Nahrať logo' }).click();
  await expect(main.getByRole('status')).toHaveText('Logo je uložené.');
  await expect(preview).toBeVisible();
  await expect(preview).toHaveJSProperty('naturalWidth', 1); // the browser drew the PNG
  await expect(main.getByText(`PNG, ${png.length} B`)).toBeVisible();
  // The address carries the time of the change, so that a replaced logo is never shown from the browser's cache.
  await expect(preview).toHaveAttribute('src', /^\/api\/logo\?v=\d+$/);
  const firstSrc = await preview.getAttribute('src');
  await page.reload();
  await expect(preview).toHaveJSProperty('naturalWidth', 1);

  // The mechanik does not see Nastavenia, but the image he prints is served to him, and he cannot touch it.
  const elsewhere = await browser.newContext({ baseURL });
  const mechanikPage = await elsewhere.newPage();
  await signInAs(mechanikPage, mechanik);
  const shown = await mechanikPage.request.get('/api/logo');
  expect(shown.status()).toBe(200);
  expect(shown.headers()['content-type']).toBe('image/png');
  expect(shown.headers()['x-content-type-options']).toBe('nosniff');
  expect(new Uint8Array(await shown.body())).toEqual(png);
  const forbidden = { error: 'Na túto akciu nemáte oprávnenie' };
  const uploaded = await mechanikPage.request.put('/api/logo', { data: Buffer.from(jpeg) });
  expect(uploaded.status()).toBe(403);
  expect(await uploaded.json()).toEqual(forbidden);
  const removed = await mechanikPage.request.delete('/api/logo');
  expect(removed.status()).toBe(403);
  expect(await removed.json()).toEqual(forbidden);
  await elsewhere.close();
  // Nobody signed in, or with a cookie that is no session, is told so by the route itself (the proxy does not
  // cover /api/logo, see proxy.ts): not sent to the login page, and the image is not shown.
  const notSignedIn = { error: 'Nie ste prihlásený.' };
  const withoutSession: Record<string, string>[] = [{}, { cookie: 'better-auth.session_token=fake.cookie' }];
  for (const headers of withoutSession) {
    const read = await request.get('/api/logo', { headers, maxRedirects: 0 });
    expect(read.status()).toBe(401);
    expect(await read.json()).toEqual(notSignedIn);
    const written = await request.put('/api/logo', { headers, data: Buffer.from(png), maxRedirects: 0 });
    expect(written.status()).toBe(401);
    expect(await written.json()).toEqual(notSignedIn);
  }
  expect(new Uint8Array(await (await page.request.get('/api/logo')).body())).toEqual(png); // nobody changed anything

  // A replacement: the same PNG with bytes after its end, which a browser ignores, so only the size tells them apart.
  const replacement = padded(png, png.length + 30);
  await choose(page, replacement);
  await main.getByRole('button', { name: 'Nahradiť logo' }).click();
  await expect(main.getByText(`PNG, ${replacement.length} B`)).toBeVisible();
  await expect(preview).toHaveJSProperty('naturalWidth', 1);
  await expect(preview).not.toHaveAttribute('src', firstSrc!);
  await expect(preview).toHaveAttribute('src', /^\/api\/logo\?v=\d+$/);

  // A file that is not a PNG or JPEG, whatever its name, and one over 1 MB are refused with the reason, and the logo stays.
  await choose(page, textNamedPng);
  await main.getByRole('button', { name: 'Nahradiť logo' }).click();
  await expect(main.getByRole('alert')).toHaveText('Logo musí byť obrázok PNG alebo JPEG. Rozhoduje obsah súboru, nie jeho prípona.');
  await expect(main.getByRole('status')).toHaveCount(0);
  await choose(page, padded(png, maxLogoBytes + 1));
  await main.getByRole('button', { name: 'Nahradiť logo' }).click();
  await expect(main.getByRole('alert')).toHaveText('Súbor je väčší ako 1 MB. Vyberte menšie logo.');
  await expect(main.getByText(`PNG, ${replacement.length} B`)).toBeVisible();
  await expect(preview).toHaveJSProperty('naturalWidth', 1);

  await main.getByRole('button', { name: 'Odstrániť logo' }).click();
  await expect(main.getByRole('status')).toHaveText('Logo je odstránené.');
  await expect(preview).toHaveCount(0);
  await expect(main.getByRole('button', { name: 'Odstrániť logo' })).toHaveCount(0);
  expect((await page.request.get('/api/logo')).status()).toBe(404);
  expect(problems).toEqual([expect.stringMatching(/status of 415/), expect.stringMatching(/status of 413/)]);
});
