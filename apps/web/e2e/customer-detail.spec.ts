import { createCustomer } from '../src/dal/customers.ts';
import { createWorkOrder } from '../src/dal/work-orders.ts';
import { idOf } from '../test/support/id-of.ts';
import { expect, runTag, signIn, test } from './fixtures.ts';
import { admin, openDatabase, seedWorkOrder } from './records.ts';

let db: ReturnType<typeof openDatabase>;
test.beforeAll(() => {
  db = openDatabase();
});
test.afterAll(() => db.$client.end());

test("a customer's detail lists the Zákazky made for them, and a Zákazka of another customer on their vehicle only on that customer's detail", async ({
  page,
}) => {
  test.slow(); // sign-in and four page loads; under --repeat-each the workers share one server
  // All specs share one database, and this one also runs repeated: its records are made through the DAL and carry a tag.
  const tag = runTag();
  const mine = await seedWorkOrder(db, tag); // a customer, their vehicle, and a Zákazka for that customer
  const otherName = `Iný Zákazník ${tag}`;
  const otherId = idOf(await createCustomer(admin, { type: 'person', name: otherName }, db));
  const foreign = await createWorkOrder(admin, { vehicleId: mine.vehicleId, customerId: otherId, mileageKm: '2000', customerRequest: `Cudzia zákazka ${tag}` }, db);
  if (!foreign.ok) throw new Error('The record was expected to be saved.');
  await signIn(page);
  const main = page.locator('main');

  await page.goto(`/zakaznici/${mine.customerId}`);
  await expect(main.locator('h1')).toHaveText(mine.customerName);
  await expect(main.getByRole('heading', { name: 'Zákazky', exact: true })).toBeVisible();
  const ownRow = main.getByRole('row', { name: new RegExp(mine.number) });
  await expect(ownRow.getByRole('cell')).toHaveText([mine.number, mine.customerName, new RegExp(mine.vin), 'Prijatá']);
  await expect(main).not.toContainText(foreign.number);

  // The vehicle and the Zákazka open from here.
  await main.getByRole('link', { name: mine.vin }).click();
  await expect(main.locator('h1')).toHaveText('Škoda Octavia');
  await page.goBack();
  await ownRow.getByRole('link', { name: mine.number }).click();
  await expect(page).toHaveURL(new RegExp(`/zakazky/${mine.orderId}$`));

  // The Zákazka made for the other customer is on their detail, which has no vehicle, and not on the owner's.
  await page.goto(`/zakaznici/${otherId}`);
  await expect(main.locator('h1')).toHaveText(otherName);
  const foreignRow = main.getByRole('row', { name: new RegExp(foreign.number) });
  await expect(foreignRow.getByRole('cell')).toHaveText([foreign.number, otherName, new RegExp(mine.vin), 'Prijatá']);
  await expect(main).not.toContainText(mine.number);
  await expect(main).toContainText('Zatiaľ žiadne vozidlo.');
});

test('the detail of a customer without Zákazky says there is none', async ({ page }) => {
  const name = `Zákazník Bez Zákaziek ${runTag()}`;
  const id = idOf(await createCustomer(admin, { type: 'person', name }, db));
  await signIn(page);

  await page.goto(`/zakaznici/${id}`);

  await expect(page.locator('main h1')).toHaveText(name);
  await expect(page.locator('main')).toContainText('Zatiaľ tu nič nie je.');
  await expect(page.locator('main').getByRole('row')).toHaveCount(0);
});
