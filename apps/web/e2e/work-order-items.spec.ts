import { addItem } from '../src/dal/work-orders.ts';
import { colour } from '../test/support/css-tokens.ts';
import { expect, runTag, signIn, test } from './fixtures.ts';
import { admin, openDatabase, seedWorkOrder } from './records.ts';

// The items table of a Zákazka on a tablet and the "Zmazať" of an item (ticket #163). Each spec makes its own Zákazka and
// reads only that one, so it may run beside any other.

let db: ReturnType<typeof openDatabase>;
test.beforeAll(() => {
  db = openDatabase();
});
test.afterAll(() => db.$client.end());

/** A Zákazka with a few items, the dearest of them in thousands of euro: the widest amounts the table is made to show. */
async function seedWorkOrderWithItems(tag: string) {
  const order = await seedWorkOrder(db, tag);
  await addItem(admin, order.orderId, { kind: 'part', code: `RP-${tag}`, name: `Rozvodová sada ${tag}`, quantity: '2', unit: 'ks', purchasePrice: '450', salePrice: '689,90', vatRate: '23' }, db);
  await addItem(admin, order.orderId, { kind: 'part', code: `BD-${tag}`, name: 'Brzdové doštičky predné', quantity: '1', unit: 'sada', purchasePrice: '45,50', salePrice: '89,90', vatRate: '23' }, db);
  await addItem(admin, order.orderId, { kind: 'labour', name: 'Výmena rozvodov a diagnostika', quantity: '3,5', unit: 'h', salePrice: '35', vatRate: '23' }, db);
  return order;
}

test('the "Zmazať" of an item is no primary button: it has neither the gold nor the gloss of the buttons around it', async ({ page }) => {
  const tag = runTag();
  const order = await seedWorkOrderWithItems(tag);
  await signIn(page);
  await page.goto(`/zakazky/${order.orderId}`);

  await expect(page.getByRole('link', { name: 'Upraviť zákazku' })).toHaveCSS('background-color', colour('--color-accent')); // what a primary button looks like
  const remove = page.getByRole('button', { name: `Zmazať Rozvodová sada ${tag}` });
  await expect(remove).not.toHaveCSS('background-color', colour('--color-accent'));
  await expect(remove).not.toHaveCSS('color', colour('--color-accent-text'));
  await expect(remove).toHaveCSS('background-image', 'none');
});

/** Whether a box has more to show than it has room for, sideways. */
const scrollsSideways = (box: import('@playwright/test').Locator) => box.evaluate((element) => element.scrollWidth > element.clientWidth);

test('on a tablet in landscape (1024 px) the items table shows all its columns, and the page does not scroll sideways', async ({ page }) => {
  const order = await seedWorkOrderWithItems(runTag());
  await page.setViewportSize({ width: 1024, height: 768 });
  await signIn(page);
  await page.goto(`/zakazky/${order.orderId}`);
  await page.evaluate(() => document.fonts.ready); // the text is set in Outfit: its width is not the width of the font it falls back to

  const table = page.getByRole('table', { name: 'Položky zákazky' });
  await expect(table.getByRole('columnheader')).toHaveCount(10);
  expect(await scrollsSideways(page.locator('html')), 'the page scrolls sideways').toBe(false);
  expect(await scrollsSideways(table.locator('..')), 'the table scrolls in its own frame').toBe(false);
});

// Under 1024 px the table may scroll, in its own frame: never the whole page (ticket #163; the tablet in portrait is left to R6, ticket #41).
test('on a screen of 768 px the page of a Zákazka with items does not scroll sideways', async ({ page }) => {
  const order = await seedWorkOrderWithItems(runTag());
  await page.setViewportSize({ width: 768, height: 1024 });
  await signIn(page);
  await page.goto(`/zakazky/${order.orderId}`);
  await page.evaluate(() => document.fonts.ready);

  await expect(page.getByRole('table', { name: 'Položky zákazky' })).toBeVisible();
  expect(await scrollsSideways(page.locator('html')), 'the page scrolls sideways').toBe(false);
});
