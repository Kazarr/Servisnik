import { changeWorkOrderStatus } from '../src/dal/work-orders.ts';
import { expect, runTag, signIn, test } from './fixtures.ts';
import { admin, openDatabase, seedWorkOrder } from './records.ts';

let db: ReturnType<typeof openDatabase>;
test.beforeAll(() => {
  db = openDatabase();
});
test.afterAll(() => db.$client.end());

/** The day `offset` days from today in Europe/Bratislava, as a date field carries it (`YYYY-MM-DD`). */
function dayFromToday(offset: number) {
  const day = new Date(`${new Date().toLocaleDateString('en-CA', { timeZone: 'Europe/Bratislava' })}T00:00:00Z`);
  day.setUTCDate(day.getUTCDate() + offset);
  return day.toISOString().slice(0, 10);
}

test('the list shows what is not closed, and is filtered by status and by the day of intake, with the filter in the address', async ({ page }) => {
  test.slow(); // three work orders seeded and five lists; under --repeat-each the workers share one server
  // Three work orders of this run, each with a customer of its own: one Prijatá, one Hotová, one Zrušená.
  const [received, done, cancelled] = [await seedWorkOrder(db, runTag()), await seedWorkOrder(db, runTag()), await seedWorkOrder(db, runTag())];
  expect(await changeWorkOrderStatus(admin, done.orderId, { to: 'done' }, db)).toEqual({ ok: true });
  expect(await changeWorkOrderStatus(admin, cancelled.orderId, { to: 'cancelled', confirmed: true }, db)).toEqual({ ok: true });
  await signIn(page);
  const main = page.locator('main');
  const rowOf = (order: { number: string }) => main.getByRole('row', { name: new RegExp(order.number) });

  // Neuzavreté is the default: Prijatá and Hotová, not the Zrušená one.
  await page.goto('/zakazky');
  await expect(page.getByLabel('Stav', { exact: true }).locator('option:checked')).toHaveText('Neuzavreté');
  await expect(rowOf(received)).toBeVisible();
  await expect(rowOf(done)).toBeVisible();
  await expect(rowOf(cancelled)).toHaveCount(0);

  // One status, chosen on the form: the address carries it, and only that status is left.
  await page.getByLabel('Stav', { exact: true }).selectOption({ label: 'Hotová' });
  await page.getByRole('button', { name: 'Filtrovať' }).click();
  await page.waitForURL((url) => url.searchParams.get('stav') === 'done');
  await expect(rowOf(done)).toBeVisible();
  await expect(rowOf(received)).toHaveCount(0);

  // Všetky shows the Zrušená one as well.
  await page.getByLabel('Stav', { exact: true }).selectOption({ label: 'Všetky' });
  await page.getByRole('button', { name: 'Filtrovať' }).click();
  await page.waitForURL((url) => url.searchParams.get('stav') === 'all');
  for (const order of [received, done, cancelled]) await expect(rowOf(order)).toBeVisible();

  // The period: the work orders were taken in today, so a period that starts tomorrow shows none of them, and today's period shows them.
  await page.getByLabel('Prijaté od').fill(dayFromToday(1));
  await page.getByRole('button', { name: 'Filtrovať' }).click();
  await page.waitForURL((url) => url.searchParams.get('od') === dayFromToday(1));
  await expect(main).toContainText('Žiadna zákazka nezodpovedá filtru.');
  await expect(rowOf(received)).toHaveCount(0);

  await page.getByLabel('Prijaté od').fill(dayFromToday(0));
  await page.getByLabel('Prijaté do').fill(dayFromToday(0));
  await page.getByRole('button', { name: 'Filtrovať' }).click();
  await page.waitForURL((url) => url.searchParams.get('do') === dayFromToday(0));
  for (const order of [received, done, cancelled]) await expect(rowOf(order)).toBeVisible();

  // The address alone brings the same list back, with the form showing its filter.
  await page.goto(`/zakazky?stav=cancelled&od=${dayFromToday(0)}`);
  await expect(page.getByLabel('Stav', { exact: true }).locator('option:checked')).toHaveText('Zrušená');
  await expect(page.getByLabel('Prijaté od')).toHaveValue(dayFromToday(0));
  await expect(rowOf(cancelled)).toBeVisible();
  await expect(rowOf(received)).toHaveCount(0);
});
