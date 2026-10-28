import { test as plainTest, type Page } from '@playwright/test';
import { randomBytes } from 'node:crypto';
import { removeLogo } from '../src/dal/logo.ts';
import { jpeg, padded, png, textNamedPng } from '../test/support/logo-files.ts';
import { seedUser } from '../test/support/users.ts';
import { expect, runTag, signIn, signInAs, test } from './fixtures.ts';
import { admin, openDatabase } from './records.ts';
import { watchPage } from './watch-page.ts';

let db: ReturnType<typeof openDatabase>;
test.beforeAll(() => {
  db = openDatabase();
});
test.afterAll(() => db.$client.end());
// The logo is one for the whole autoservis, and no other spec touches it: the specs of this file run one after another, each from no logo.
test.beforeEach(() => removeLogo(admin, db));

/** Chooses `file` in the file field of the logo, named `name` and claimed to be a PNG; the button sends it. */
const choose = (page: Page, file: Uint8Array, name = 'logo.png') =>
  page.getByLabel('Súbor loga (PNG alebo JPEG do 1 MB)').setInputFiles({ name, mimeType: 'image/png', buffer: Buffer.from(file) });

test('the admin uploads the logo and sees it, replaces it, and removes it; the mechanik reads it but can neither change nor remove it', async ({
  page,
  browser,
  baseURL,
  request,
}) => {
  test.slow(); // two users, the upload, the replacement and the removal go through the production build the workers share
  const mechanik = { email: `mechanik-${runTag()}@autoservis.test`, password: randomBytes(12).toString('base64url') };
  await seedUser(db, { ...mechanik, role: 'mechanik' });
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
  // Nobody signed in is sent to the login page and never gets the image.
  expect((await request.get('/api/logo', { maxRedirects: 0 })).status()).toBe(307);
  expect(new Uint8Array(await (await page.request.get('/api/logo')).body())).toEqual(png); // the mechanik changed nothing

  // A replacement: the same PNG with bytes after its end, which a browser ignores, so only the size tells them apart.
  const replacement = padded(png, png.length + 30);
  await choose(page, replacement);
  await main.getByRole('button', { name: 'Nahradiť logo' }).click();
  await expect(main.getByText(`PNG, ${replacement.length} B`)).toBeVisible();
  await expect(preview).toHaveJSProperty('naturalWidth', 1);

  await main.getByRole('button', { name: 'Odstrániť logo' }).click();
  await expect(main.getByRole('status')).toHaveText('Logo je odstránené.');
  await expect(preview).toHaveCount(0);
  await expect(main.getByRole('button', { name: 'Odstrániť logo' })).toHaveCount(0);
  expect((await page.request.get('/api/logo')).status()).toBe(404);
});

// Plain `test`, not the one from fixtures.ts: Chromium logs every refused upload as a console error, which the
// page fixture would fail on, and this test makes the refusals on purpose. It watches the page itself and expects those two lines.
plainTest('a file that is not a PNG or JPEG, whatever its name, and one over 1 MB are refused with the reason, and the logo stays', async ({ page }) => {
  plainTest.slow();
  await signIn(page);
  const problems = watchPage(page);
  await page.goto('/nastavenia');
  const main = page.locator('main');
  await choose(page, png);
  await main.getByRole('button', { name: 'Nahrať logo' }).click();
  await expect(main.getByRole('status')).toHaveText('Logo je uložené.');

  await choose(page, textNamedPng);
  await main.getByRole('button', { name: 'Nahradiť logo' }).click();
  await expect(main.getByRole('alert')).toHaveText('Logo musí byť obrázok PNG alebo JPEG. Rozhoduje obsah súboru, nie jeho prípona.');
  await expect(main.getByRole('status')).toHaveCount(0);

  await choose(page, padded(png, 1_048_577));
  await main.getByRole('button', { name: 'Nahradiť logo' }).click();
  await expect(main.getByRole('alert')).toHaveText('Súbor je väčší ako 1 MB. Vyberte menšie logo.');

  await expect(main.getByText(`PNG, ${png.length} B`)).toBeVisible();
  await expect(main.getByRole('img', { name: 'Logo autoservisu' })).toHaveJSProperty('naturalWidth', 1);
  expect(problems).toEqual([expect.stringMatching(/status of 415/), expect.stringMatching(/status of 413/)]);
});
