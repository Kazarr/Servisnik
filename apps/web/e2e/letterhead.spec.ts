import { appCss, hexesOf, tokensOf } from '../test/support/css-tokens.ts';
import { paintsWith, readPdf } from '../test/support/pdf.ts';
import { expect, runTag, signIn, test } from './fixtures.ts';
import { openDatabase, seedWorkOrder } from './records.ts';

let db: ReturnType<typeof openDatabase>;
test.beforeAll(() => {
  db = openDatabase();
});
test.afterAll(() => db.$client.end());

// The Hlavička tlačív (GLOSSARY, ticket #150) is one value for the whole autoservis, so every step that changes it is in this one
// test, and it ends with the white Hlavička that every other spec expects. What is on the PDFs is checked where they are made
// cheaply (test/letterhead.test.ts); here the switch of Nastavenia meets the production build and its Chromium.

const tokens = tokensOf(appCss);
const bar = hexesOf(tokens['--color-background']!)[0]!;
const gold = hexesOf(tokens['--color-accent']!)[0]!;

test('the admin switches the Hlavička tlačív in Nastavenia and the next PDF has the black bar, or no bar again', async ({ page }) => {
  test.slow(); // the server starts its Chromium with the first print; two prints and two saves through the production build the workers share
  const order = await seedWorkOrder(db, runTag());
  const printed = async () => {
    const response = await page.request.get(`/zakazky/${order.orderId}/zakazkovy-list`);
    expect(response.ok()).toBe(true);
    return readPdf(new Uint8Array(await response.body()))[0]!;
  };
  await signIn(page);
  await page.getByRole('navigation', { name: 'Hlavné menu' }).getByRole('link', { name: 'Nastavenia' }).click();
  const main = page.locator('main');
  await expect(main.getByRole('heading', { level: 2, name: 'Tlačivá' })).toBeVisible();
  const letterhead = page.getByLabel('Hlavička tlačív', { exact: true });
  await expect(letterhead).toHaveValue('white');
  expect(paintsWith(await printed(), bar)).toBe(false);

  await letterhead.selectOption('Čierny pruh');
  await main.getByRole('button', { name: 'Uložiť hlavičku tlačív' }).click();
  await expect(main.getByRole('status')).toHaveText('Hlavička tlačív je uložená.');
  await page.reload();
  await expect(letterhead).toHaveValue('blackBar');
  const withBar = await printed();
  expect(paintsWith(withBar, bar)).toBe(true);
  expect(paintsWith(withBar, gold)).toBe(true);
  expect(withBar.text).toContain(order.number);

  await letterhead.selectOption('Biela');
  await main.getByRole('button', { name: 'Uložiť hlavičku tlačív' }).click();
  await expect(main.getByRole('status')).toHaveText('Hlavička tlačív je uložená.');
  await page.reload();
  await expect(letterhead).toHaveValue('white');
  expect(paintsWith(await printed(), bar)).toBe(false);
});
