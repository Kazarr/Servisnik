import { createCustomer } from '../src/dal/customers.ts';
import { getVehicle } from '../src/dal/vehicles.ts';
import { idOf } from '../test/support/id-of.ts';
import { addCustomer, addVehicleAndOpen, expect, runTag, searchOwners, searchVehicles, signIn, test, vinOf } from './fixtures.ts';
import { admin, openDatabase, seedWorkOrder } from './records.ts';

let db: ReturnType<typeof openDatabase>;
test.beforeAll(() => {
  db = openDatabase();
});
test.afterAll(() => db.$client.end());

test('the admin finds a vehicle by the last 6 characters of its VIN and transfers it, and its Zákazka stays with the vehicle and with the customer it was made for', async ({
  page,
}) => {
  test.slow(); // forms for two customers, a vehicle and a Zákazka, then the search and the Prepis; under --repeat-each the workers share one server
  // All specs share one database, and this one also runs repeated: the customers and the VIN carry a tag.
  const tag = runTag();
  const [seller, buyer, vin] = [`Predávajúci ${tag}`, `Kupujúci ${tag}`, vinOf(tag, 'WVWZZZ1JZ3W')];
  const main = page.locator('main');
  await signIn(page);
  await addCustomer(page, buyer);
  const buyerUrl = page.url();
  await addCustomer(page, seller, 'Firma');
  const sellerUrl = page.url();
  await addVehicleAndOpen(page, vin, 'Volkswagen', 'Golf');
  await main.getByRole('link', { name: 'Nová zákazka' }).click();
  await page.getByLabel('Kilometre pri príjme').fill('123 456');
  await page.getByLabel('Požiadavka zákazníka').fill(`Výmena oleja ${tag}`);
  await page.getByRole('button', { name: 'Uložiť zákazku' }).click();
  const heading = main.locator('h1');
  await expect(heading).toHaveText(/^Z\d{4}-\d{4}$/);
  const number = (await heading.textContent())!;

  // The vehicle is found by the last 6 characters of its VIN, in small letters, as they are dictated.
  await page.getByRole('navigation', { name: 'Hlavné menu' }).getByRole('link', { name: 'Vozidlá' }).click();
  await expect(heading).toHaveText('Vozidlá');
  await searchVehicles(page, vin.slice(-6).toLowerCase());
  const found = main.locator('tbody tr');
  await expect(found).toHaveCount(1);
  await expect(found).toContainText(seller);
  await found.getByRole('link', { name: vin }).click();
  await expect(heading).toHaveText('Volkswagen Golf');
  const vehicleUrl = page.url();
  await expect(main.getByRole('link', { name: seller })).toBeVisible();

  // The new owner is searched for; the search finds both customers of this test by the tag and offers only the other one.
  await main.getByRole('link', { name: 'Prepísať na iného zákazníka' }).click();
  await expect(heading).toHaveText('Prepísať vozidlo');
  await searchOwners(page, tag);
  await expect(main.getByRole('link', { name: tag })).toHaveText([buyer]);
  await main.getByRole('link', { name: buyer }).click();
  await expect(main).toContainText(`z ${seller} na ${buyer}`);
  await main.getByRole('button', { name: 'Potvrdiť prepis' }).click();

  // The vehicle has its new owner, and the Zákazka is still in its history, for the customer it was made for.
  await expect(page).toHaveURL(vehicleUrl);
  await expect(heading).toHaveText('Volkswagen Golf');
  await expect(main.getByRole('link', { name: buyer })).toBeVisible();
  await expect(main.getByRole('link', { name: seller })).toHaveCount(0);
  await expect(main.getByRole('row', { name: new RegExp(number) }).getByRole('cell')).toHaveText([number, seller, 'Prijatá']);

  // The old owner has no vehicle any more and keeps the Zákazka; the new one has the vehicle and not the Zákazka.
  await page.goto(sellerUrl);
  await expect(heading).toHaveText(seller);
  await expect(main).toContainText('Zatiaľ žiadne vozidlo.');
  await expect(main.getByRole('row', { name: new RegExp(number) })).toBeVisible();
  await page.goto(buyerUrl);
  await expect(heading).toHaveText(buyer);
  await expect(main.getByRole('link', { name: vin })).toBeVisible();
  await expect(main).not.toContainText(number);
});

test('a Prepis confirmed after another Prepis of the same vehicle is refused with a message and does not overwrite it', async ({ page, context }) => {
  test.slow(); // a sign-in and two pages open at once; under --repeat-each the workers share one server
  const tag = runTag();
  const { vehicleId } = await seedWorkOrder(db, tag);
  const [first, second] = await Promise.all(
    [`Prvý kupujúci ${tag}`, `Druhý kupujúci ${tag}`].map(async (name) => idOf(await createCustomer(admin, { type: 'person', name }, db))),
  );
  const confirmation = (to: string) => `/vozidla/${vehicleId}/prepis?zakaznik=${to}`;
  await signIn(page);

  // Both confirmations are opened while the vehicle still has its owner; the second is the first to be sent.
  await page.goto(confirmation(first!));
  const other = await context.newPage();
  await other.goto(confirmation(second!));
  await other.getByRole('button', { name: 'Potvrdiť prepis' }).click();
  await expect(other).toHaveURL(`/vozidla/${vehicleId}`);

  await page.getByRole('button', { name: 'Potvrdiť prepis' }).click();
  await expect(page.locator('main').getByRole('alert')).toHaveText('Majiteľ vozidla sa medzitým zmenil, nič sa neprepísalo. Otvorte detail vozidla a skúste to znova.');
  expect(await getVehicle(admin, vehicleId, db)).toMatchObject({ owner: { id: second } });
});
