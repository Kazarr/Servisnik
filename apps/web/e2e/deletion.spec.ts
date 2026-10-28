import { createCustomer, getCustomer } from '../src/dal/customers.ts';
import { createVehicle, getVehicle } from '../src/dal/vehicles.ts';
import { createWorkOrder } from '../src/dal/work-orders.ts';
import { idOf } from '../test/support/id-of.ts';
import { expect, runTag, signIn, test, vinOf } from './fixtures.ts';
import { admin, openDatabase, seedWorkOrder } from './records.ts';

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

test('a Zákazník and a Vozidlo with a Zákazka have no button to delete them', async ({ page }) => {
  test.slow(); // sign-in and four page loads; under --repeat-each the workers share one server
  const tag = runTag();
  const mine = await seedWorkOrder(db, tag); // a customer, their vehicle, and a Zákazka for that customer
  const otherName = `Iný Zákazník ${tag}`;
  const otherId = idOf(await createCustomer(admin, { type: 'person', name: otherName }, db));
  const foreign = await createWorkOrder(admin, { vehicleId: mine.vehicleId, customerId: otherId, mileageKm: '2000', customerRequest: `Cudzia zákazka ${tag}` }, db);
  if (!foreign.ok) throw new Error('The record was expected to be saved.');
  await signIn(page);
  const main = page.locator('main');

  await page.goto(`/vozidla/${mine.vehicleId}`);
  await expect(main.locator('h1')).toHaveText('Škoda Octavia');
  await expect(main.getByRole('row', { name: new RegExp(mine.number) })).toBeVisible();
  await expect(main.locator('summary')).toHaveCount(0);

  await page.goto(`/zakaznici/${mine.customerId}`);
  await expect(main.locator('h1')).toHaveText(mine.customerName);
  await expect(main.getByRole('row', { name: new RegExp(mine.number) })).toBeVisible();
  await expect(main.locator('summary')).toHaveCount(0);

  // The other Zákazník has no Vozidlo, only a Zákazka on the vehicle of the first one, and that is a link too.
  await page.goto(`/zakaznici/${otherId}`);
  await expect(main.locator('h1')).toHaveText(otherName);
  await expect(main).toContainText('Zatiaľ žiadne vozidlo.');
  await expect(main.getByRole('row', { name: new RegExp(foreign.number) })).toBeVisible();
  await expect(main.locator('summary')).toHaveCount(0);
});

test('a link added while the question is open stops the delete, and the page says why', async ({ page }) => {
  test.slow(); // sign-in and four page loads; under --repeat-each the workers share one server
  const tag = runTag();
  const [customerName, ownerName] = [`Bez väzieb ${tag}`, `Majiteľ ${tag}`];
  const customerId = idOf(await createCustomer(admin, { type: 'person', name: customerName }, db));
  const ownerId = idOf(await createCustomer(admin, { type: 'person', name: ownerName }, db));
  const vehicleId = idOf(await createVehicle(admin, { ownerId, vin: vinOf(tag, 'E2E00000002'), licensePlate: '', make: 'Škoda', model: 'Fabia' }, db));
  await signIn(page);
  const main = page.locator('main');
  const confirm = main.getByRole('button', { name: 'Potvrdiť zmazanie' });

  // The Zákazník has no link when the page opens, and gets a Vozidlo before the admin confirms.
  await page.goto(`/zakaznici/${customerId}`);
  await expect(main.locator('h1')).toHaveText(customerName);
  await main.locator('summary', { hasText: 'Zmazať zákazníka' }).click();
  idOf(await createVehicle(admin, { ownerId: customerId, vin: vinOf(tag, 'E2E00000003'), licensePlate: '', make: 'Škoda', model: 'Octavia' }, db));
  await confirm.click();
  await expect(main.getByRole('alert')).toHaveText('Zákazník má vozidlo alebo zákazku, preto ho nemožno zmazať');
  await expect(main.locator('h1')).toHaveText(customerName);
  expect(await getCustomer(admin, customerId, db)).not.toBeNull();

  // The Vozidlo has no Zákazka when the page opens, and gets one before the admin confirms.
  await page.goto(`/vozidla/${vehicleId}`);
  await expect(main.locator('h1')).toHaveText('Škoda Fabia');
  await main.locator('summary', { hasText: 'Zmazať vozidlo' }).click();
  idOf(await createWorkOrder(admin, { vehicleId, mileageKm: '1000', customerRequest: `Brzdy ${tag}` }, db));
  await confirm.click();
  await expect(main.getByRole('alert')).toHaveText('Vozidlo má zákazku, preto ho nemožno zmazať');
  await expect(main.locator('h1')).toHaveText('Škoda Fabia');
  expect(await getVehicle(admin, vehicleId, db)).not.toBeNull();
});
