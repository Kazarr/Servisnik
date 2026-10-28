import type { Locator, Page } from '@playwright/test';
import { addCustomer, endSessionBehindThePage, expect, runTag, signIn, test, vinOf } from './fixtures.ts';

/** Today in Europe/Bratislava as the app writes it, e.g. "26. 10. 2026". */
const today = () => new Date().toLocaleDateString('sk-SK', { timeZone: 'Europe/Bratislava' });
const year = () => new Date().toLocaleDateString('en-CA', { timeZone: 'Europe/Bratislava', year: 'numeric' });

/** From a customer's detail: adds a vehicle and opens its detail. */
async function addVehicleAndOpen(page: Page, vin: string) {
  await page.locator('main').getByRole('link', { name: 'Pridať vozidlo' }).click();
  await page.getByLabel('VIN').fill(vin);
  await page.getByLabel('Značka').fill('Škoda');
  await page.getByLabel('Model').fill('Octavia');
  await page.getByRole('button', { name: 'Uložiť vozidlo' }).click();
  await page.locator('main').getByRole('link', { name: vin }).click();
  await expect(page.locator('main h1')).toHaveText('Škoda Octavia');
}

/** On a vehicle's detail: opens the form for a new work order. */
async function startWorkOrder(page: Page) {
  await page.locator('main').getByRole('link', { name: 'Nová zákazka' }).click();
  await expect(page.locator('main h1')).toHaveText('Nová zákazka');
}

async function fillIntake(page: Page, mileage: string, request: string) {
  await page.getByLabel('Kilometre pri príjme').fill(mileage);
  await page.getByLabel('Požiadavka zákazníka').fill(request);
  await page.getByRole('button', { name: 'Uložiť zákazku' }).click();
}

/** On a work order's detail: its number, read once the heading shows one (a plain read right after the navigation would see the page before). */
async function numberOfOpenOrder(page: Page) {
  const heading = page.locator('main h1');
  await expect(heading).toHaveText(/^Z\d{4}-\d{4}$/);
  return (await heading.textContent())!;
}

/** The running number of a work order number, e.g. 12 for "Z2026-0012". */
const sequenceOf = (number: string) => Number(number.split('-')[1]);

/** The value next to a label in the detail list of a page. */
const detail = (main: Locator, label: string) => main.locator('.details > div').filter({ hasText: new RegExp(`^${label}`) }).locator('dd');

async function addLabour(page: Page, fields: { name: string; quantity: string; unitPrice: string }) {
  await page.getByLabel('Názov', { exact: true }).fill(fields.name);
  await page.getByLabel('Množstvo (h)').fill(fields.quantity);
  await page.getByLabel('Cena za jednotku bez DPH (€)').fill(fields.unitPrice);
  await page.getByRole('button', { name: 'Pridať prácu' }).click();
}

test('the admin opens a work order on a vehicle, adds work, sees the amounts and marks it done', async ({ page }) => {
  test.slow(); // the longest flow; under --repeat-each the workers share one server
  // All specs share one database, and this one also runs repeated: its customer and VIN carry a tag, and the order is read by its own number.
  const tag = runTag();
  const [owner, vin] = [`Majiteľ Prvej Zákazky ${tag}`, vinOf(tag)];
  await signIn(page);
  await addCustomer(page, owner);
  await addVehicleAndOpen(page, vin);
  const main = page.locator('main');
  const vehicleUrl = page.url();
  await expect(main).not.toContainText('Otvorené zákazky');

  // The customer is the owner of the vehicle unless another is chosen.
  await startWorkOrder(page);
  await expect(page.getByLabel('Zákazník', { exact: true }).locator('option:checked')).toHaveText(owner);
  await fillIntake(page, '123 456', 'Výmena oleja a kontrola bŕzd');

  await expect(page).toHaveURL(/\/zakazky\/[0-9a-f-]{36}$/);
  const orderUrl = page.url();
  const number = await numberOfOpenOrder(page);
  expect(number).toMatch(new RegExp(`^Z${year()}-`));
  await expect(detail(main, 'Stav')).toHaveText('Prijatá');
  await expect(detail(main, 'Zákazník')).toHaveText(owner);
  await expect(detail(main, 'Vozidlo')).toContainText('Škoda Octavia');
  await expect(detail(main, 'Vozidlo')).toContainText(vin);
  await expect(detail(main, 'Kilometre pri príjme')).toHaveText('123 456 km');
  await expect(detail(main, 'Požiadavka zákazníka')).toHaveText('Výmena oleja a kontrola bŕzd');
  await expect(main).not.toContainText('Dátum dokončenia');

  // The VAT rate starts at 23 %. A work item that is not one stays on the form, with the reason at the field.
  await expect(page.getByLabel('Sadzba DPH (%)')).toHaveValue('23');
  await addLabour(page, { name: 'Výmena oleja', quantity: '0', unitPrice: '40' });
  await expect(page.getByLabel('Množstvo (h)')).toHaveAccessibleDescription('Množstvo musí byť väčšie ako 0, najviac na 2 desatinné miesta');
  await expect(page.getByLabel('Názov', { exact: true })).toHaveValue('Výmena oleja');
  await expect(main.getByRole('row', { name: /Výmena oleja/ })).toHaveCount(0);

  await page.getByLabel('Množstvo (h)').fill('1,5');
  await page.getByRole('button', { name: 'Pridať prácu' }).click();
  const oil = main.getByRole('row', { name: /Výmena oleja/ });
  await expect(oil.getByRole('cell')).toHaveText(['Výmena oleja', '1,5 h', '40,00 €', '23 %', '60,00 €', '13,80 €', '73,80 €']);
  await expect(page.getByLabel('Názov', { exact: true })).toHaveValue('');
  await expect(page.getByLabel('Sadzba DPH (%)')).toHaveValue('23');

  // A fractional quantity: 0,25 h at 33,33 € is 8,33 € (rounded once per item), and the totals add the rounded items.
  await addLabour(page, { name: 'Kontrola bŕzd', quantity: '0,25', unitPrice: '33,33' });
  await expect(main.getByRole('row', { name: /Kontrola bŕzd/ }).getByRole('cell')).toHaveText([
    'Kontrola bŕzd', '0,25 h', '33,33 €', '23 %', '8,33 €', '1,92 €', '10,25 €',
  ]);
  await expect(main.getByRole('row', { name: /Spolu/ }).getByRole('cell')).toHaveText(['68,33 €', '15,72 €', '84,05 €']);

  await main.getByRole('button', { name: 'Označiť ako hotovú' }).click();
  await expect(detail(main, 'Stav')).toHaveText('Hotová');
  await expect(detail(main, 'Dátum dokončenia')).toHaveText(today());
  await expect(main.getByRole('button', { name: 'Označiť ako hotovú' })).toHaveCount(0);
  await expect(main.getByRole('button', { name: 'Pridať prácu' })).toHaveCount(0);
  await expect(main.getByRole('row', { name: /Spolu/ }).getByRole('cell')).toHaveText(['68,33 €', '15,72 €', '84,05 €']);

  // The vehicle links to its open work order, and the list of work orders shows it.
  await page.goto(vehicleUrl);
  await main.getByRole('link', { name: number }).click();
  await expect(page).toHaveURL(orderUrl);
  await page.getByRole('navigation', { name: 'Hlavné menu' }).getByRole('link', { name: 'Zákazky' }).click();
  const row = main.getByRole('row', { name: new RegExp(number) });
  await expect(row.getByRole('cell')).toHaveText([number, owner, /Škoda Octavia/, 'Hotová']);
  await row.getByRole('link', { name: number }).click();
  await expect(page).toHaveURL(orderUrl);
});

test('a work order for another customer than the owner keeps that customer, and a later one gets a higher number', async ({ page }) => {
  test.slow(); // two customers, a vehicle and two work orders; under --repeat-each the workers share one server
  const tag = runTag();
  const [other, owner] = [`Iný Zákazník Zákazky ${tag}`, `Majiteľ Druhej Zákazky ${tag}`];
  await signIn(page);
  await addCustomer(page, other);
  await addCustomer(page, owner);
  await addVehicleAndOpen(page, vinOf(tag));
  const main = page.locator('main');
  const vehicleUrl = page.url();

  await startWorkOrder(page);
  await page.getByLabel('Zákazník', { exact: true }).selectOption({ label: other });
  await fillIntake(page, '0', 'Prvý príjem');
  await expect(detail(main, 'Zákazník')).toHaveText(other);
  const first = sequenceOf(await numberOfOpenOrder(page));

  // The vehicle still belongs to its owner, who is the default of the next work order.
  await page.goto(vehicleUrl);
  await startWorkOrder(page);
  await expect(page.getByLabel('Zákazník', { exact: true }).locator('option:checked')).toHaveText(owner);
  await fillIntake(page, '10', 'Druhý príjem');
  await expect(detail(main, 'Zákazník')).toHaveText(owner);
  // Workers share the year's counter, so only the order is checked; no gaps: apps/web/test/work-orders.test.ts.
  expect(sequenceOf(await numberOfOpenOrder(page))).toBeGreaterThan(first);
});

test('a work order form with a bad kilometre count stays on the form, with the reason and what was typed', async ({ page }) => {
  const tag = runTag();
  await signIn(page);
  await addCustomer(page, `Majiteľ Zlých Kilometrov ${tag}`);
  await addVehicleAndOpen(page, vinOf(tag));

  await startWorkOrder(page);
  await fillIntake(page, '-5', '  ');

  await expect(page.getByLabel('Kilometre pri príjme')).toHaveAccessibleDescription('Zadajte kilometre ako celé číslo, 0 alebo viac');
  await expect(page.getByLabel('Požiadavka zákazníka')).toHaveAccessibleDescription('Vyplňte požiadavku zákazníka');
  await expect(page.getByLabel('Kilometre pri príjme')).toHaveValue('-5');
  await expect(page).toHaveURL(/\/zakazky\/nova\?vozidlo=/);
});

test('the work order forms and the done button, used after the session ended, are refused and change nothing', async ({ page, browser, baseURL }) => {
  test.slow(); // four sign-ins and three ended sessions; under --repeat-each the workers share one server
  const tag = runTag();
  const owner = `Majiteľ Bez Relácie ${tag}`;
  await signIn(page);
  await addCustomer(page, owner);
  await addVehicleAndOpen(page, vinOf(tag));
  const main = page.locator('main');
  const vehicleUrl = page.url();

  // A new work order.
  await startWorkOrder(page);
  await page.getByLabel('Kilometre pri príjme').fill('500');
  await page.getByLabel('Požiadavka zákazníka').fill('Nemala by sa uložiť');
  await endSessionBehindThePage(page, browser, baseURL);
  await page.getByRole('button', { name: 'Uložiť zákazku' }).click();
  await expect(page).toHaveURL(/\/login$/);
  await signIn(page);
  await page.goto('/zakazky');
  await expect(main).not.toContainText(owner);

  // New work on an existing one, and marking it done.
  await page.goto(vehicleUrl);
  await startWorkOrder(page);
  await fillIntake(page, '500', 'Uloží sa');
  await expect(page).toHaveURL(/\/zakazky\/[0-9a-f-]{36}$/);
  const orderUrl = page.url();
  await page.getByLabel('Názov', { exact: true }).fill('Nemala by sa pridať');
  await page.getByLabel('Množstvo (h)').fill('1');
  await page.getByLabel('Cena za jednotku bez DPH (€)').fill('10');
  await endSessionBehindThePage(page, browser, baseURL);
  await page.getByRole('button', { name: 'Pridať prácu' }).click();
  await expect(page).toHaveURL(/\/login$/);
  await signIn(page);
  await page.goto(orderUrl);
  await expect(main.getByRole('row', { name: /Nemala by sa pridať/ })).toHaveCount(0);

  await endSessionBehindThePage(page, browser, baseURL);
  await main.getByRole('button', { name: 'Označiť ako hotovú' }).click();
  await expect(page).toHaveURL(/\/login$/);
  await signIn(page);
  await page.goto(orderUrl);
  await expect(detail(main, 'Stav')).toHaveText('Prijatá');
});
