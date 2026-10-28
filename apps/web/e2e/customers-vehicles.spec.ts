import { addCustomer, endSessionBehindThePage, expect, newIco, runTag, signIn, test, vinOf } from './fixtures.ts';

test('the admin adds a company and its vehicle, and a second vehicle with the same VIN is refused', async ({ page }) => {
  test.slow(); // one long walk through the forms; under --repeat-each the workers share one server and it took 25 s
  // All specs share one database, and this one also runs repeated: the company and the VIN carry a tag.
  const tag = runTag();
  const company = `Autodoprava Kováč ${tag} s.r.o.`;
  const vin = vinOf(tag, 'WVWZZZ1JZ3W');
  const ico = newIco();
  await signIn(page);
  await page.getByRole('navigation', { name: 'Hlavné menu' }).getByRole('link', { name: 'Zákazníci' }).click();
  await page.getByRole('link', { name: 'Pridať zákazníka' }).click();
  await expect(page.locator('main h1')).toHaveText('Nový zákazník');

  // The company fields belong to a company only.
  for (const label of ['IČO', 'DIČ', 'IČ DPH']) await expect(page.getByLabel(label, { exact: true })).toHaveCount(0);
  await page.getByLabel('Firma', { exact: true }).check();
  for (const label of ['IČO', 'DIČ', 'IČ DPH']) await expect(page.getByLabel(label, { exact: true })).toBeVisible();

  await page.getByLabel('Názov').fill(company);
  await page.getByLabel('IČO', { exact: true }).fill(ico);
  await page.getByLabel('DIČ', { exact: true }).fill('2020123456');
  await page.getByLabel('IČ DPH', { exact: true }).fill('SK2020123456');
  await page.getByLabel('Ulica').fill('Hlavná 1');
  await page.getByLabel('Mesto').fill('Bratislava');
  await page.getByLabel('PSČ').fill('81101');
  await page.getByLabel('E-mail').fill('info@kovac.sk');
  await page.getByRole('button', { name: 'Uložiť zákazníka' }).click();

  const main = page.locator('main');
  await expect(page).toHaveURL(/\/zakaznici\/[0-9a-f-]{36}$/);
  await expect(main.locator('h1')).toHaveText(company);
  for (const shown of [ico, '2020123456', 'SK2020123456', 'Hlavná 1', 'Bratislava', '81101', 'info@kovac.sk']) {
    await expect(main).toContainText(shown);
  }
  const customerUrl = page.url();

  // A VIN that is not one stays on the form, with the reason at the field and what was typed.
  await main.getByRole('link', { name: 'Pridať vozidlo' }).click();
  await expect(main.locator('h1')).toHaveText('Nové vozidlo');
  await expect(main).toContainText(company);
  const vinField = page.getByLabel('VIN');
  await vinField.fill(vin.slice(0, 16));
  await page.getByLabel('Značka').fill('Volkswagen');
  await page.getByLabel('Model').fill('Golf');
  await page.getByRole('button', { name: 'Uložiť vozidlo' }).click();
  await expect(vinField).toHaveAccessibleDescription('VIN musí mať presne 17 znakov');
  await expect(vinField).toHaveValue(vin.slice(0, 16));
  await vinField.fill(`${vin.slice(0, 16)}O`);
  await page.getByRole('button', { name: 'Uložiť vozidlo' }).click();
  await expect(vinField).toHaveAccessibleDescription('VIN smie obsahovať len písmená A–Z a číslice 0–9, bez I, O a Q');

  // Typed the way it is read off a document, it is saved in capitals without spaces and hyphens.
  await vinField.fill(`${vin.slice(0, 3)} ${vin.slice(3, 9)}-${vin.slice(9)}`.toLowerCase());
  await page.getByLabel('ŠPZ').fill('BA123AB');
  await page.getByRole('button', { name: 'Uložiť vozidlo' }).click();
  await expect(page).toHaveURL(customerUrl);
  await expect(main.getByRole('row', { name: new RegExp(vin) })).toContainText('BA123AB');

  // The same vehicle shows in Vozidlá with its owner and opens its detail.
  await page.getByRole('navigation', { name: 'Hlavné menu' }).getByRole('link', { name: 'Vozidlá' }).click();
  const row = main.getByRole('row', { name: new RegExp(vin) });
  await expect(row).toContainText('BA123AB');
  await expect(row).toContainText(company);
  await row.getByRole('link', { name: vin }).click();
  await expect(main.locator('h1')).toHaveText('Volkswagen Golf');
  await expect(main).toContainText(vin);
  await main.getByRole('link', { name: company }).click();
  await expect(page).toHaveURL(customerUrl);

  // A second vehicle with the same VIN is refused, however it is typed.
  await main.getByRole('link', { name: 'Pridať vozidlo' }).click();
  await vinField.fill(vin.toLowerCase());
  await page.getByLabel('Značka').fill('Škoda');
  await page.getByLabel('Model').fill('Octavia');
  await page.getByRole('button', { name: 'Uložiť vozidlo' }).click();
  await expect(vinField).toHaveAccessibleDescription('Vozidlo s týmto VIN už existuje');
  await page.goto(customerUrl);
  await expect(main.getByRole('row', { name: new RegExp(vin) })).toHaveCount(1);
  await expect(main).not.toContainText('Octavia');
});

test('the admin adds a person without company fields, and the list starts with the newest customer', async ({ page }) => {
  // All specs share one database, and this one also runs repeated: its two customers carry a tag, so the list is read by identity.
  const tag = runTag();
  const [first, second] = [`Prvá Osobová ${tag}`, `Druhá Osobová ${tag}`];
  await signIn(page);
  await addCustomer(page, first);
  await expect(page.locator('main')).not.toContainText('IČO');
  await addCustomer(page, second);

  await page.getByRole('navigation', { name: 'Hlavné menu' }).getByRole('link', { name: 'Zákazníci' }).click();
  // Retries until the list has rendered: the navigation from the detail page is client-side, and a plain read of the links would see the detail page.
  await expect(page.locator('main').getByRole('link', { name: tag })).toHaveText([second, first]);

  await page.locator('main').getByRole('link', { name: first }).click();
  await expect(page.locator('main h1')).toHaveText(first);
});

test('a customer form submitted after the session ended is refused and saves nothing', async ({ page, browser, baseURL }) => {
  test.slow(); // two sign-ins and an ended session; under --repeat-each the workers share one server and it took 26 s
  const name = `Nemal by sa uložiť ${runTag()}`;
  await signIn(page);
  await page.goto('/zakaznici/novy');
  await page.getByLabel('Názov').fill(name);
  await endSessionBehindThePage(page, browser, baseURL);

  // The proxy only sees a cookie, so only the Server Action itself can refuse.
  await page.getByRole('button', { name: 'Uložiť zákazníka' }).click();
  await expect(page).toHaveURL(/\/login$/);

  await signIn(page);
  await page.goto('/zakaznici');
  await expect(page.locator('main')).not.toContainText(name);
});

test('a vehicle form submitted after the session ended is refused and saves nothing', async ({ page, browser, baseURL }) => {
  test.slow(); // two sign-ins and an ended session; under --repeat-each the workers share one server and it took 26 s
  const tag = runTag();
  const vin = vinOf(tag);
  await signIn(page);
  await addCustomer(page, `Majiteľ bez auta ${tag}`);
  await page.locator('main').getByRole('link', { name: 'Pridať vozidlo' }).click();
  await page.getByLabel('VIN').fill(vin);
  await page.getByLabel('Značka').fill('Škoda');
  await page.getByLabel('Model').fill('Fabia');
  await endSessionBehindThePage(page, browser, baseURL);

  await page.getByRole('button', { name: 'Uložiť vozidlo' }).click();
  await expect(page).toHaveURL(/\/login$/);

  await signIn(page);
  await page.goto('/vozidla');
  await expect(page.locator('main')).not.toContainText(vin);
});
