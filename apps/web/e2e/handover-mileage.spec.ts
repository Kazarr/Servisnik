import { changeWorkOrderStatus } from '../src/dal/work-orders.ts';
import { detail, downloadPdf, expect, runTag, signIn, test } from './fixtures.ts';
import { admin, openDatabase, seedWorkOrder } from './records.ts';

let db: ReturnType<typeof openDatabase>;
test.beforeAll(() => {
  db = openDatabase();
});
test.afterAll(() => db.$client.end());

// The Kilometre pri odovzdaní (GLOSSARY, #164): the smoke path from the form on the detail of a Hotová Zákazka to the PDF of the odovzdávací
// protokol. What the rules do, and what the form and the PDF show in every case, is checked where it is cheap (test/work-orders.test.ts,
// handover-mileage-actions.test.ts, print-forms-response.test.ts). The seeded Zákazka was taken in at 1 000 km.
test('the admin enters the kilometres at handover on a Hotová Zákazka, is warned of lower ones, and the odovzdávací protokol prints them', async ({ page }) => {
  test.slow(); // the server starts its Chromium with the first print, and on a host that other runs share that takes long
  const order = await seedWorkOrder(db, runTag());
  await signIn(page);
  await page.goto(`/zakazky/${order.orderId}`);
  const main = page.locator('main');
  await expect(main.getByRole('textbox', { name: 'Kilometre pri odovzdaní' })).toHaveCount(0); // a Zákazka that is only Prijatá is not handed over yet

  await changeWorkOrderStatus(admin, order.orderId, { to: 'done' }, db);
  await page.reload();
  await expect(detail(main, 'Kilometre pri odovzdaní')).toHaveCount(0);
  await main.getByRole('textbox', { name: 'Kilometre pri odovzdaní' }).fill('1 450');
  await main.getByRole('button', { name: 'Uložiť kilometre' }).click();

  await expect(detail(main, 'Kilometre pri odovzdaní')).toHaveText('1 450 km');
  await expect(detail(main, 'Kilometre pri príjme')).toHaveText('1 000 km');
  await expect(main.getByRole('status')).toHaveCount(0);
  await page.goto(`/vozidla/${order.vehicleId}`);
  await expect(detail(main, 'Stav km')).toHaveText('1 450 km'); // the higher kilometres are the Stav km of the vehicle

  // Lower kilometres than at intake are saved with a warning, and the Stav km of the vehicle does not fall.
  await page.goto(`/zakazky/${order.orderId}`);
  await main.getByRole('textbox', { name: 'Kilometre pri odovzdaní' }).fill('900');
  await main.getByRole('button', { name: 'Uložiť kilometre' }).click();
  await expect(main.getByRole('status')).toContainText('nižšie ako kilometre pri príjme (1 000 km)');
  await expect(detail(main, 'Kilometre pri odovzdaní')).toHaveText('900 km');
  await page.goto(`/vozidla/${order.vehicleId}`);
  await expect(detail(main, 'Stav km')).toHaveText('1 450 km');

  await page.goto(`/zakazky/${order.orderId}`);
  const { text } = await downloadPdf(page, 'Odovzdávací protokol', `/zakazky/${order.orderId}/odovzdavaci-protokol`);
  expect(text).toContain('Kilometre pri príjme1 000 km');
  expect(text).toContain('Kilometre pri odovzdaní900 km');
});
