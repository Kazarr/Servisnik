import type { Locator, Page } from '@playwright/test';
import { addItem } from '../src/dal/work-orders.ts';
import { colour } from '../test/support/css-tokens.ts';
import { expect, runTag, scrollsSideways, signIn, test } from './fixtures.ts';
import { admin, openDatabase, seedWorkOrder } from './records.ts';

// The items table of a Zákazka on a tablet and the "Zmazať" of an item (ticket #163). Each spec makes its own Zákazka and
// reads only that one, so it may run beside any other.

let db: ReturnType<typeof openDatabase>;
test.beforeAll(() => {
  db = openDatabase();
});
test.afterAll(() => db.$client.end());

/**
 * A Zákazka with a few items, the dearest of them 8 765,43 € a piece, two of which come to 21 562,96 € with DPH: the widest
 * amounts the seed puts in the table, five digits before the comma.
 */
async function seedWorkOrderWithItems(tag: string) {
  const order = await seedWorkOrder(db, tag);
  await addItem(admin, order.orderId, { kind: 'part', code: `RP-${tag}`, name: `Rozvodová sada ${tag}`, quantity: '2', unit: 'ks', purchasePrice: '4321,09', salePrice: '8765,43', vatRate: '23' }, db);
  await addItem(admin, order.orderId, { kind: 'part', code: `BD-${tag}`, name: 'Brzdové doštičky predné', quantity: '1', unit: 'sada', purchasePrice: '45,50', salePrice: '89,90', vatRate: '23' }, db);
  await addItem(admin, order.orderId, { kind: 'labour', name: 'Výmena rozvodov a diagnostika', quantity: '3,5', unit: 'h', salePrice: '35', vatRate: '23' }, db);
  return order;
}

/** Makes a Zákazka with items, signs in at a window of `width`×`height` and opens it, once the font the text is set in has loaded: its width is not the width of the font it falls back to. */
async function openWorkOrderWithItemsAt(page: Page, width: number, height: number) {
  const order = await seedWorkOrderWithItems(runTag());
  await page.setViewportSize({ width, height });
  await signIn(page);
  await page.goto(`/zakazky/${order.orderId}`);
  await page.evaluate(() => document.fonts.ready);
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
  await expect(remove).not.toHaveCSS('border-color', colour('--color-accent'));
  await expect(remove).not.toHaveCSS('color', colour('--color-accent-text'));
  await expect(remove).toHaveCSS('background-image', 'none');
});

test('on a tablet in landscape (1024 px) the items table shows all its columns, and the page does not scroll sideways', async ({ page }) => {
  await openWorkOrderWithItemsAt(page, 1024, 768);

  const table = page.getByRole('table', { name: 'Položky zákazky' });
  await expect(table.getByRole('columnheader')).toHaveCount(10);
  await expect(table.getByRole('columnheader', { name: 'Akcie' })).toBeInViewport({ ratio: 1 }); // the last column, in the view and not behind the edge of the frame
  expect(await scrollsSideways(page.locator('html')), 'the page scrolls sideways').toBe(false);
  expect(await scrollsSideways(table.locator('..')), 'the table scrolls in its own frame').toBe(false);
});

/** The size of the text of a box, in px. */
const fontSizeOf = (box: Locator) => box.evaluate((element) => parseFloat(getComputedStyle(element).fontSize));

// The table is set closer under 1366 px, the width it fits from without (ticket #148): up to 1365 px, the last width under it, and not from 1366 px.
for (const [width, closer] of [[1365, true], [1366, false]] as const) {
  test(`at ${width} px the items table is ${closer ? '' : 'not '}set in smaller text than the page`, async ({ page }) => {
    await openWorkOrderWithItemsAt(page, width, 768);

    const table = page.getByRole('table', { name: 'Položky zákazky' });
    expect((await fontSizeOf(table)) < (await fontSizeOf(page.locator('main'))), 'the table is set in smaller text than the page').toBe(closer);
  });
}

// Under 1024 px the table scrolls, in its own frame: never the whole page (ticket #163; the tablet in portrait is left to R6, ticket #41).
test('on a screen of 768 px the items table scrolls in its own frame and the page of a Zákazka does not scroll sideways', async ({ page }) => {
  await openWorkOrderWithItemsAt(page, 768, 1024);

  const frame = page.getByRole('table', { name: 'Položky zákazky' }).locator('..');
  await expect(frame).toBeVisible();
  expect(await scrollsSideways(page.locator('html')), 'the page scrolls sideways').toBe(false);
  expect(await scrollsSideways(frame), 'the table has no more to show than its frame has room for').toBe(true);
  await expect(frame).toHaveCSS('overflow-x', /^(auto|scroll)$/); // it has more to show: the frame must let the user scroll to it
});
