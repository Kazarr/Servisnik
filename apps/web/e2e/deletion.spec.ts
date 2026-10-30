import { createCustomer, getCustomer } from '../src/dal/customers.ts';
import { createVehicle, getVehicle } from '../src/dal/vehicles.ts';
import { idOf } from '../test/support/id-of.ts';
import { expect, runTag, signIn, test, vinOf } from './fixtures.ts';
import { admin, openDatabase } from './records.ts';

let db: ReturnType<typeof openDatabase>;
test.beforeAll(() => {
  db = openDatabase();
});
test.afterAll(() => db.$client.end());

test('the admin deletes a Vozidlo and then its Zákazník, both made by mistake, and each only after a confirmation', async ({ page }) => {
  test.slow(); // sign-in and six page loads; under --repeat-each the workers share one server
  // All specs share one database, and this one also runs repeated: its records are made through the DAL and carry a tag.
  const tag = runTag();
  const name = `Omyl ${tag}`;
  const vin = vinOf(tag, 'E2E00000001');
  const customerId = idOf(await createCustomer(admin, { type: 'person', name }, db));
  const vehicleId = idOf(await createVehicle(admin, { ownerId: customerId, vin, licensePlate: '', make: 'Škoda', model: 'Fabia' }, db));
  await signIn(page);
  const main = page.locator('main');
  const confirm = main.getByRole('button', { name: 'Potvrdiť zmazanie' });

  // A Zákazník who owns a Vozidlo cannot be deleted, so his detail has no button for it.
  await page.goto(`/zakaznici/${customerId}`);
  await expect(main.locator('h1')).toHaveText(name);
  await expect(main.getByRole('link', { name: vin })).toBeVisible();
  await expect(main.locator('summary')).toHaveCount(0);

  // The Vozidlo has no Zákazka. Asking to delete it only asks: the question comes first and nothing is deleted yet.
  await main.getByRole('link', { name: vin }).click();
  await expect(main.locator('h1')).toHaveText('Škoda Fabia');
  await expect(confirm).toBeHidden();
  await main.locator('summary', { hasText: 'Zmazať vozidlo' }).click();
  await expect(main).toContainText('Zmazanie nemožno vrátiť.');
  expect(await getVehicle(admin, vehicleId, db)).not.toBeNull();

  await confirm.click();
  await expect(page).toHaveURL(/\/vozidla$/);
  expect(await getVehicle(admin, vehicleId, db)).toBeNull();

  // Without the Vozidlo the Zákazník has no link left: now he can be deleted, again after a question.
  await page.goto(`/zakaznici/${customerId}`);
  await expect(main).toContainText('Zatiaľ žiadne vozidlo.');
  await expect(confirm).toBeHidden();
  await main.locator('summary', { hasText: 'Zmazať zákazníka' }).click();
  await expect(main).toContainText('Zmazanie nemožno vrátiť.');
  expect(await getCustomer(admin, customerId, db)).not.toBeNull();

  await confirm.click();
  await expect(page).toHaveURL(/\/zakaznici$/);
  expect(await getCustomer(admin, customerId, db)).toBeNull();
});
