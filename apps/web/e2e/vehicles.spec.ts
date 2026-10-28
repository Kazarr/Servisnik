import { addCustomer, expect, runTag, signIn, test, vinOf } from './fixtures.ts';
import { openDatabase, seedWorkOrder } from './records.ts';

let db: ReturnType<typeof openDatabase>;
test.beforeAll(() => {
  db = openDatabase();
});
test.afterAll(() => db.$client.end());

/** The year after the current one in Europe/Bratislava, the last year a vehicle may be from. */
const lastYear = () => Number(new Date().toLocaleDateString('en-CA', { timeZone: 'Europe/Bratislava', year: 'numeric' })) + 1;

test('the admin adds a vehicle from the list, picks its owner by search, and then corrects its VIN', async ({ page }) => {
  test.slow(); // one long walk through the forms; under --repeat-each the workers share one server
  // All specs share one database, and this one also runs repeated: the owners and the VINs carry a tag.
  const tag = runTag();
  const [owner, other] = [`Majiteľ Vozidla ${tag}`, `Iný Majiteľ ${tag}`];
  const vin = vinOf(tag, 'WVWZZZ1JZ3W');
  const typo = vinOf(tag, 'WVWZZZ1JZ3X');
  const taken = await seedWorkOrder(db, runTag()); // a vehicle that exists already, for the VIN of which the edit is refused
  await signIn(page);
  await addCustomer(page, owner);
  await addCustomer(page, other);
  const main = page.locator('main');

  // The form comes after the owner: he is picked by searching for him, and a search finds more than him.
  await page.getByRole('navigation', { name: 'Hlavné menu' }).getByRole('link', { name: 'Vozidlá' }).click();
  // Waited for: the customer's detail still on the page has a link of the same name, which opens the form for him.
  await expect(main.locator('h1')).toHaveText('Vozidlá');
  await main.getByRole('link', { name: 'Pridať vozidlo' }).click();
  await expect(main.locator('h1')).toHaveText('Nové vozidlo');
  await expect(page.getByLabel('VIN')).toHaveCount(0);
  await page.getByLabel('Hľadať majiteľa').fill(tag);
  await page.getByRole('button', { name: 'Hľadať', exact: true }).click();
  await page.waitForURL((url) => url.searchParams.get('q') === tag);
  await expect(main.getByRole('link', { name: tag })).toHaveText([other, owner]);
  await main.getByRole('link', { name: owner }).click();
  await expect(main.locator('h1')).toHaveText('Nové vozidlo');
  await expect(main).toContainText(`Majiteľ: ${owner}`);

  // Typed the way it is read off a document, with every detail.
  await page.getByLabel('VIN').fill(`${typo.slice(0, 3)} ${typo.slice(3, 9)}-${typo.slice(9)}`.toLowerCase());
  await page.getByLabel('ŠPZ').fill('ba-123 ab');
  await page.getByLabel('Značka').fill('Volkswagen');
  await page.getByLabel('Model').fill('Golf');
  await page.getByLabel('Rok výroby').fill('2015');
  await page.getByLabel('Palivo').selectOption({ label: 'Nafta' });
  await page.getByLabel('Stav km').fill('123 456');
  await page.getByLabel('Poznámka').fill('Nová spojka');
  await page.getByRole('button', { name: 'Uložiť vozidlo' }).click();
  await expect(page).toHaveURL(/\/zakaznici\/[0-9a-f-]{36}$/);
  await expect(main.locator('h1')).toHaveText(owner);
  await main.getByRole('link', { name: typo }).click();

  await expect(main.locator('h1')).toHaveText('Volkswagen Golf');
  for (const shown of [typo, 'BA123AB', '2015', 'Nafta', '123 456 km', 'Nová spojka', owner]) await expect(main).toContainText(shown);
  const vehicleUrl = page.url();

  // The form of an existing vehicle holds what it has, and the owner is not part of it.
  await main.getByRole('link', { name: 'Upraviť' }).click();
  await expect(main.locator('h1')).toHaveText('Upraviť vozidlo');
  await expect(main).toContainText(`Majiteľ: ${owner}`);
  const vinField = page.getByLabel('VIN');
  await expect(vinField).toHaveValue(typo);
  await expect(page.getByLabel('ŠPZ')).toHaveValue('BA123AB');
  await expect(page.getByLabel('Rok výroby')).toHaveValue('2015');
  await expect(page.getByLabel('Palivo')).toHaveValue('diesel');
  await expect(page.getByLabel('Stav km')).toHaveValue('123456');
  await expect(page.getByLabel('Poznámka')).toHaveValue('Nová spojka');

  // The VIN of another vehicle is refused, with that vehicle and its owner to follow.
  await vinField.fill(taken.vin);
  await page.getByRole('button', { name: 'Uložiť vozidlo' }).click();
  await expect(vinField).toHaveAccessibleDescription(`Vozidlo s týmto VIN už existuje: Škoda Octavia, majiteľ ${taken.customerName}`);
  await expect(main.getByRole('alert').getByRole('link', { name: 'Škoda Octavia' })).toHaveAttribute('href', `/vozidla/${taken.vehicleId}`);
  await expect(main.getByRole('alert').getByRole('link', { name: taken.customerName })).toHaveAttribute('href', `/zakaznici/${taken.customerId}`);

  // The typo is corrected: the same vehicle, with the same owner and everything else it had (also after a refused save), under the VIN it should have.
  await vinField.fill(vin);
  await page.getByRole('button', { name: 'Uložiť vozidlo' }).click();
  await expect(page).toHaveURL(vehicleUrl);
  await expect(main.locator('h1')).toHaveText('Volkswagen Golf');
  await expect(main).not.toContainText(typo);
  for (const shown of [vin, 'BA123AB', '2015', 'Nafta', '123 456 km', 'Nová spojka']) await expect(main).toContainText(shown);
  await expect(main.getByRole('link', { name: owner })).toBeVisible();
});

test('the vehicle form opened from a customer takes him as the owner and refuses a bad VIN, year and kilometres with the reason', async ({ page }) => {
  test.slow(); // one long walk through the form; under --repeat-each the workers share one server
  const tag = runTag();
  const vin = vinOf(tag, 'WVWZZZ1JZ3W');
  const { customerId, customerName } = await seedWorkOrder(db, tag);
  await signIn(page);
  await page.goto(`/vozidla/novy?zakaznik=${customerId}`);
  const main = page.locator('main');
  await expect(main).toContainText(`Majiteľ: ${customerName}`);
  await expect(page.getByLabel('Hľadať majiteľa')).toHaveCount(0);

  const vinField = page.getByLabel('VIN');
  await page.getByLabel('Značka').fill('Volkswagen');
  await page.getByLabel('Model').fill('Golf');
  const save = () => page.getByRole('button', { name: 'Uložiť vozidlo' }).click();

  const advice = 'VIN nemá písmená I, O ani Q: namiesto I patrí 1, namiesto O a Q patrí 0';
  const refusedVins = [
    [vin.slice(0, 16), 'VIN musí mať presne 17 znakov'],
    [`${vin}1`, 'VIN musí mať presne 17 znakov'],
    [`${vin.slice(0, 16)}I`, advice],
    [`${vin.slice(0, 16)}O`, advice],
    [`${vin.slice(0, 16)}Q`, advice],
    [`${vin.slice(0, 16)}!`, 'VIN smie obsahovať len písmená A–Z a číslice 0–9'],
  ] as const;
  for (const [typed, reason] of refusedVins) {
    await vinField.fill(typed);
    await save();
    await expect(vinField, typed).toHaveAccessibleDescription(reason);
    await expect(vinField).toHaveValue(typed);
  }

  await vinField.fill(vin);
  const yearField = page.getByLabel('Rok výroby');
  for (const year of ['1949', String(lastYear() + 1)]) {
    await yearField.fill(year);
    await save();
    await expect(yearField, year).toHaveAccessibleDescription(`Rok výroby má byť od 1950 do ${lastYear()}`);
    await expect(yearField).toHaveValue(year);
  }
  await yearField.fill(String(lastYear()));
  const kmField = page.getByLabel('Stav km');
  await kmField.fill('-5');
  await save();
  // The app groups the digits with a no-break space, which \s matches.
  await expect(kmField).toHaveAccessibleDescription(/^Stav km má byť celé číslo od 0 do 9\s999\s999$/);
  await expect(kmField).toHaveValue('-5');

  // With every reason fixed the vehicle is saved once, with 0 km, which is a state of the odometer too.
  await kmField.fill('0');
  await save();
  await expect(page).toHaveURL(`/zakaznici/${customerId}`);
  await expect(main.getByRole('row', { name: new RegExp(vin) })).toBeVisible();
});
