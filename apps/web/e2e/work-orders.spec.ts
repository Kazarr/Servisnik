import type { Locator, Page } from '@playwright/test';
import { addCustomer, endSessionBehindThePage, expect, signIn, test } from './fixtures.ts';

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

/** The value next to a label in the detail list of a page. */
const detail = (main: Locator, label: string) => main.locator('.details > div').filter({ hasText: new RegExp(`^${label}`) }).locator('dd');

async function addLabour(page: Page, fields: { name: string; quantity: string; unitPrice: string }) {
  await page.getByLabel('Názov', { exact: true }).fill(fields.name);
  await page.getByLabel('Množstvo (h)').fill(fields.quantity);
  await page.getByLabel('Cena za jednotku bez DPH (€)').fill(fields.unitPrice);
  await page.getByRole('button', { name: 'Pridať prácu' }).click();
}

test('the admin opens a work order on a vehicle, adds work, sees the amounts and marks it done', async ({ page }) => {
  await signIn(page);
  await addCustomer(page, 'Majiteľ Prvej Zákazky');
  await addVehicleAndOpen(page, 'TMBZZZ5JZ3W000101');
  const main = page.locator('main');
  const vehicleUrl = page.url();
  await expect(main).not.toContainText('Otvorené zákazky');

  // The customer is the owner of the vehicle unless another is chosen.
  await startWorkOrder(page);
  await expect(page.getByLabel('Zákazník', { exact: true }).locator('option:checked')).toHaveText('Majiteľ Prvej Zákazky');
  await fillIntake(page, '123 456', 'Výmena oleja a kontrola bŕzd');

  await expect(page).toHaveURL(/\/zakazky\/[0-9a-f-]{36}$/);
  await expect(main.locator('h1')).toHaveText(new RegExp(`^Z${year()}-\\d{4}$`));
  const orderUrl = page.url();
  const number = (await main.locator('h1').textContent())!;
  await expect(detail(main, 'Stav')).toHaveText('Prijatá');
  await expect(detail(main, 'Zákazník')).toHaveText('Majiteľ Prvej Zákazky');
  await expect(detail(main, 'Vozidlo')).toContainText('Škoda Octavia');
  await expect(detail(main, 'Vozidlo')).toContainText('TMBZZZ5JZ3W000101');
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
  await expect(row.getByRole('cell')).toHaveText([number, 'Majiteľ Prvej Zákazky', /Škoda Octavia/, 'Hotová']);
  await row.getByRole('link', { name: number }).click();
  await expect(page).toHaveURL(orderUrl);
});

test('a work order for another customer than the owner keeps that customer, and the next number follows', async ({ page }) => {
  await signIn(page);
  await addCustomer(page, 'Iný Zákazník Zákazky');
  await addCustomer(page, 'Majiteľ Druhej Zákazky');
  await addVehicleAndOpen(page, 'TMBZZZ5JZ3W000102');
  const main = page.locator('main');
  const vehicleUrl = page.url();

  await startWorkOrder(page);
  await page.getByLabel('Zákazník', { exact: true }).selectOption({ label: 'Iný Zákazník Zákazky' });
  await fillIntake(page, '0', 'Prvý príjem');
  await expect(detail(main, 'Zákazník')).toHaveText('Iný Zákazník Zákazky');
  const first = Number((await main.locator('h1').textContent())!.split('-')[1]);

  // The vehicle still belongs to its owner, who is the default of the next work order.
  await page.goto(vehicleUrl);
  await startWorkOrder(page);
  await expect(page.getByLabel('Zákazník', { exact: true }).locator('option:checked')).toHaveText('Majiteľ Druhej Zákazky');
  await fillIntake(page, '10', 'Druhý príjem');
  await expect(detail(main, 'Zákazník')).toHaveText('Majiteľ Druhej Zákazky');
  expect(Number((await main.locator('h1').textContent())!.split('-')[1])).toBe(first + 1);
});

test('a work order form with a bad kilometre count stays on the form, with the reason and what was typed', async ({ page }) => {
  await signIn(page);
  await addCustomer(page, 'Majiteľ Zlých Kilometrov');
  await addVehicleAndOpen(page, 'TMBZZZ5JZ3W000103');

  await startWorkOrder(page);
  await fillIntake(page, '-5', '  ');

  await expect(page.getByLabel('Kilometre pri príjme')).toHaveAccessibleDescription('Zadajte kilometre ako celé číslo, 0 alebo viac');
  await expect(page.getByLabel('Požiadavka zákazníka')).toHaveAccessibleDescription('Vyplňte požiadavku zákazníka');
  await expect(page.getByLabel('Kilometre pri príjme')).toHaveValue('-5');
  await expect(page).toHaveURL(/\/zakazky\/nova\?vozidlo=/);
});

test('the work order forms and the done button, used after the session ended, are refused and change nothing', async ({ page, browser, baseURL }) => {
  await signIn(page);
  await addCustomer(page, 'Majiteľ Bez Relácie');
  await addVehicleAndOpen(page, 'TMBZZZ5JZ3W000104');
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
  await expect(main).not.toContainText('Majiteľ Bez Relácie');

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
