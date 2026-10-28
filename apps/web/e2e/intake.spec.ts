import type { Page } from '@playwright/test';
import { createCustomer } from '../src/dal/customers.ts';
import { createVehicle } from '../src/dal/vehicles.ts';
import { idOf } from '../test/support/id-of.ts';
import { detail, expect, fillIntake, newIco, runTag, searchOwners, searchVehicles, signIn, startWorkOrder, test, vinOf } from './fixtures.ts';
import { admin, openDatabase } from './records.ts';

let db: ReturnType<typeof openDatabase>;
test.beforeAll(() => {
  db = openDatabase();
});
test.afterAll(() => db.$client.end());

/** The field called exactly `label`. */
const field = (page: Page, label: string) => page.getByLabel(label, { exact: true });

async function fillVehicle(page: Page, vin: string, make = 'Škoda', model = 'Octavia') {
  await page.getByLabel('VIN').fill(vin);
  await page.getByLabel('Značka').fill(make);
  await page.getByLabel('Model').fill(model);
}

test('the admin takes in a new vehicle with a new customer from Zákazky: one form saves the customer, the vehicle and the Zákazka', async ({ page }) => {
  test.slow(); // sign-in, a long form and three pages after it; under --repeat-each the workers share one server
  const tag = runTag();
  const [owner, vin] = [`Nový Majiteľ Príjmu ${tag}`, vinOf(tag)];
  await signIn(page);
  const main = page.locator('main');

  await startWorkOrder(page);
  await main.getByRole('link', { name: 'Nové vozidlo' }).click();
  await main.getByRole('link', { name: 'Nový zákazník' }).click();
  await page.getByLabel('Firma', { exact: true }).check();
  await page.getByLabel('Názov (pri osobe meno a priezvisko)').fill(owner);
  await page.getByLabel('IČO', { exact: true }).fill(newIco());
  await fillVehicle(page, vin);
  await expect(page.getByLabel('Stav km')).toHaveCount(0); // the kilometres at intake are it
  await fillIntake(page, '45 000', 'Výmena oleja');

  await expect(page).toHaveURL(/\/zakazky\/[0-9a-f-]{36}$/);
  await expect(main.locator('h1')).toHaveText(/^Z\d{4}-\d{4}$/);
  await expect(detail(main, 'Stav')).toHaveText('Prijatá');
  await expect(detail(main, 'Zákazník')).toHaveText(owner);
  await expect(detail(main, 'Vozidlo')).toContainText('Škoda Octavia');
  await expect(detail(main, 'Vozidlo')).toContainText(vin);
  await expect(detail(main, 'Kilometre pri príjme')).toHaveText('45 000 km');

  // The new customer is the Majiteľ of the new vehicle, whose Stav km are the kilometres at intake.
  await main.getByRole('link', { name: 'Škoda Octavia' }).click();
  await expect(detail(main, 'Majiteľ').getByRole('link', { name: owner })).toBeVisible();
  await expect(detail(main, 'Stav km')).toHaveText('45 000 km');
});

test('the admin finds the vehicle from Zákazky, and kilometres lower than its Stav km are saved with a warning that leaves the vehicle alone', async ({ page }) => {
  test.slow(); // two Zákazky and the pages between them; under --repeat-each the workers share one server
  const tag = runTag();
  const owner = `Majiteľ Nižších Km ${tag}`;
  const vin = vinOf(tag);
  const ownerId = idOf(await createCustomer(admin, { type: 'person', name: owner }, db));
  const vehicleId = idOf(await createVehicle(admin, { ownerId, vin, licensePlate: '', make: 'Škoda', model: 'Octavia', mileageKm: '100000' }, db));
  await signIn(page);
  const main = page.locator('main');

  // The last 6 characters of the VIN find it; its row leads to the form of a Zákazka for that vehicle.
  await startWorkOrder(page);
  await searchVehicles(page, tag);
  await main.getByRole('row', { name: new RegExp(vin) }).getByRole('link', { name: 'Založiť zákazku' }).click();
  await expect(page).toHaveURL(new RegExp(`/zakazky/nova\\?vozidlo=${vehicleId}$`));
  await expect(main).toContainText(vin);

  // Lower kilometres: the Zákazka is saved, the page says so and warns, and the vehicle keeps its Stav km.
  await fillIntake(page, '90 000', 'Tachometer bol vymenený');
  const notice = main.getByRole('status');
  await expect(notice).toContainText('nižšie ako stav km vozidla (100 000 km)');
  await expect(notice).toContainText('stav km vozidla sa nezmenil');
  await notice.getByRole('link', { name: /^Z\d{4}-\d{4}$/ }).click();
  await expect(detail(main, 'Kilometre pri príjme')).toHaveText('90 000 km');
  await page.goto(`/vozidla/${vehicleId}`);
  await expect(detail(main, 'Stav km')).toHaveText('100 000 km');

  // Higher kilometres: no warning, the Zákazka opens, and its kilometres are the Stav km of the vehicle.
  await page.goto(`/zakazky/nova?vozidlo=${vehicleId}`);
  await fillIntake(page, '120 000', 'Pravidelný servis');
  await expect(page).toHaveURL(/\/zakazky\/[0-9a-f-]{36}$/);
  await expect(detail(main, 'Kilometre pri príjme')).toHaveText('120 000 km');
  await page.goto(`/vozidla/${vehicleId}`);
  await expect(detail(main, 'Stav km')).toHaveText('120 000 km');
});

test('a new vehicle with a VIN that is taken stays on the form with what was typed, and leads to a Zákazka for the vehicle that has it', async ({ page }) => {
  test.slow(); // two owners, a search and a long form; under --repeat-each the workers share one server
  const tag = runTag();
  const [holder, newOwner] = [`Držiteľ VIN ${tag}`, `Nový Majiteľ Vozidla ${tag}`];
  const vin = vinOf(tag);
  const holderId = idOf(await createCustomer(admin, { type: 'person', name: holder }, db));
  const vehicleId = idOf(await createVehicle(admin, { ownerId: holderId, vin, licensePlate: '', make: 'Škoda', model: 'Octavia' }, db));
  idOf(await createCustomer(admin, { type: 'person', name: newOwner }, db));
  await signIn(page);
  const main = page.locator('main');

  // The owner of the new vehicle is found by the same search as on the list of customers.
  await startWorkOrder(page);
  await main.getByRole('link', { name: 'Nové vozidlo' }).click();
  await searchOwners(page, newOwner);
  await main.getByRole('link', { name: newOwner }).click();
  await expect(main).toContainText(`Majiteľ: ${newOwner}`);

  // A VIN that is not one: the reason is at the field, and nothing typed is lost.
  await fillVehicle(page, 'TMBZZZ5JZ3W00', 'Škoda', 'Fabia');
  await fillIntake(page, '1 000', 'Brzdy');
  await expect(field(page, 'VIN')).toHaveAccessibleDescription('VIN musí mať presne 17 znakov');
  await expect(field(page, 'Model')).toHaveValue('Fabia');
  await expect(field(page, 'Požiadavka zákazníka')).toHaveValue('Brzdy');

  // A VIN that another vehicle has: the reason names that vehicle, and the link starts a Zákazka on it.
  await field(page, 'VIN').fill(vin);
  await page.getByRole('button', { name: 'Uložiť zákazku' }).click();
  const taken = page.locator('#vehicle\\.vin-error');
  await expect(taken).toContainText('Vozidlo s týmto VIN už existuje');
  await expect(taken).toContainText(holder);
  await expect(field(page, 'Model')).toHaveValue('Fabia');
  await taken.getByRole('link', { name: /Založiť zákazku/ }).click();
  await expect(page).toHaveURL(new RegExp(`/zakazky/nova\\?vozidlo=${vehicleId}$`));
  await expect(main).toContainText(vin);
});
