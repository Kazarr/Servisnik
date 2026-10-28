import { createCustomer } from '../src/dal/customers.ts';
import { createVehicle } from '../src/dal/vehicles.ts';
import { idOf } from '../test/support/id-of.ts';
import { expect, runTag, searchVehicles as search, signIn, test } from './fixtures.ts';
import { admin, openDatabase } from './records.ts';

let db: ReturnType<typeof openDatabase>;
test.beforeAll(() => {
  db = openDatabase();
});
test.afterAll(() => db.$client.end());

type Fields = { vin: string; licensePlate?: string; make?: string; model?: string };

/** Saves a vehicle for `ownerId` through the DAL, as the admin; the spec fails right there when it is not saved. */
async function addVehicle(ownerId: string, { vin, licensePlate = '', make = 'Škoda', model = 'Fabia' }: Fields) {
  idOf(await createVehicle(admin, { ownerId, vin, licensePlate, make, model }, db));
}

test('the admin finds a vehicle by a part of the VIN, the ŠPZ or the name of the owner, however they are written', async ({ page }) => {
  test.slow(); // a dozen searches; under --repeat-each the workers share one server
  // All specs share one database, so every search key carries a tag of its own and a search finds only the rows of this test.
  const [vinTag, plateTag, ownerTag] = [runTag(), runTag(), runTag()];
  const [novak, kovac] = [`Ján Novák ${ownerTag}`, `Peter Kováč ${ownerTag}`];
  const novakId = idOf(await createCustomer(admin, { type: 'person', name: novak }, db));
  const kovacId = idOf(await createCustomer(admin, { type: 'person', name: kovac }, db));
  // The VIN ends with the tag, the way the last 6 characters are read off a technical certificate.
  const vins = [`WVWZZZ1JZ3W${vinTag.toUpperCase()}`, `TMBZZZ5JZ3W${plateTag.toUpperCase()}`, `VF1ZZZ5JZ3W${ownerTag.toUpperCase()}`] as const;
  const plate = `E2E${plateTag.toUpperCase()}`;
  await addVehicle(novakId, { vin: vins[0], make: 'Volkswagen', model: 'Golf' });
  await addVehicle(novakId, { vin: vins[1], licensePlate: plate, make: 'Škoda', model: 'Octavia' });
  await addVehicle(kovacId, { vin: vins[2], make: 'Renault', model: 'Clio' });

  const main = page.locator('main');
  const rows = main.locator('tbody tr');
  await signIn(page);
  await page.getByRole('navigation', { name: 'Hlavné menu' }).getByRole('link', { name: 'Vozidlá' }).click();
  await expect(main.locator('h1')).toHaveText('Vozidlá');

  // The last 6 characters of the VIN, in small letters; the list shows what the admin needs to know the car.
  await search(page, vinTag);
  await expect(rows).toHaveCount(1);
  for (const shown of [vins[0], 'Volkswagen', 'Golf', novak]) await expect(rows).toContainText(shown);

  // The ŠPZ, as it is dictated: with a space, with a hyphen and without either.
  await search(page, `e2e ${plateTag}`);
  await expect(rows).toHaveCount(1);
  for (const shown of [vins[1], plate, 'Škoda', 'Octavia', novak]) await expect(rows).toContainText(shown);

  // A part of the name of the owner, without diacritics, finds both his vehicles and not the other owner's.
  await search(page, `novak ${ownerTag}`);
  await expect(rows).toHaveCount(2);
  await expect(main.getByRole('link', { name: vins[0] })).toBeVisible();
  await expect(main.getByRole('link', { name: vins[1] })).toBeVisible();
  await expect(main.getByRole('link', { name: vins[2] })).toHaveCount(0);

  await search(page, `e2e-${plateTag}`);
  await expect(rows).toHaveCount(1);
  await expect(rows).toContainText(vins[1]);

  await search(page, `KOVAC ${ownerTag}`);
  await expect(rows).toHaveCount(1);
  await expect(rows).toContainText(vins[2]);

  await search(page, `nikto ${ownerTag}`);
  await expect(main).toContainText(`Nič sa nenašlo pre „nikto ${ownerTag}“.`);
  await expect(rows).toHaveCount(0);
  await expect(page.getByLabel('Hľadať vozidlo')).toHaveValue(`nikto ${ownerTag}`);

  await search(page, `E2E${plateTag.toUpperCase()}`);
  await expect(rows).toHaveCount(1);

  // A row leads to the vehicle.
  await main.getByRole('link', { name: vins[1] }).click();
  await expect(main.locator('h1')).toHaveText('Škoda Octavia');
  await expect(main).toContainText(vins[1]);
});

test('the list of vehicles is 25 to a page, and the pages of a search stay in the search', async ({ page }) => {
  test.slow(); // 26 vehicles are saved before the pages are read
  const tag = runTag();
  const owner = `Pager ${tag}`;
  const ownerId = idOf(await createCustomer(admin, { type: 'person', name: owner }, db));
  // A VIN of its own for each, saved in this order: the list shows the newest first.
  const vins = Array.from({ length: 26 }, (_, i) => `WVWZZZ1JZ${String(i + 1).padStart(2, '0')}${tag.toUpperCase()}`);
  for (const vin of vins) await addVehicle(ownerId, { vin });
  // Newer than all of them and not theirs: without the search it would push the oldest of the 25 off the first page.
  await addVehicle(idOf(await createCustomer(admin, { type: 'person', name: `Iný majiteľ ${tag}` }, db)), { vin: `WVWZZZ1JZ99${tag.toUpperCase()}` });
  const newestFirst = [...vins].reverse();

  const main = page.locator('main');
  const rows = main.getByRole('link', { name: tag });
  await signIn(page);
  await page.goto('/vozidla');
  await search(page, `pager ${tag}`);
  await expect(rows).toHaveText(newestFirst.slice(0, 25));
  await expect(main).toContainText('Strana 1 z 2');
  await expect(main.getByRole('link', { name: 'Predchádzajúca' })).toHaveCount(0);

  await main.getByRole('link', { name: 'Nasledujúca' }).click();
  await expect(rows).toHaveText([newestFirst[25]!]);
  await expect(main).toContainText('Strana 2 z 2');
  await expect(main.getByRole('link', { name: 'Nasledujúca' })).toHaveCount(0);
  await expect(page.getByLabel('Hľadať vozidlo')).toHaveValue(`pager ${tag}`);
  await expect(page).toHaveURL(/strana=2/);

  await main.getByRole('link', { name: 'Predchádzajúca' }).click();
  await expect(rows).toHaveText(newestFirst.slice(0, 25));
  await expect(main).toContainText('Strana 1 z 2');
});
