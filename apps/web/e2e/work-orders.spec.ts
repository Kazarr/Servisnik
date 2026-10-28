import type { Locator, Page } from '@playwright/test';
import {
  addCustomer,
  addVehicleAndOpen,
  dayFromToday,
  endSessionBehindThePage,
  expect,
  fillIntake,
  numberOnTheDetail,
  runTag,
  signIn,
  startWorkOrder,
  test,
  vinOf,
} from './fixtures.ts';
import { openDatabase, seedWorkOrder } from './records.ts';

let db: ReturnType<typeof openDatabase>;
test.beforeAll(() => {
  db = openDatabase();
});
test.afterAll(() => db.$client.end());

/** Today in Europe/Bratislava as the app writes it, e.g. "26. 10. 2026". */
const today = () => new Date().toLocaleDateString('sk-SK', { timeZone: 'Europe/Bratislava' });
const year = () => new Date().toLocaleDateString('en-CA', { timeZone: 'Europe/Bratislava', year: 'numeric' });

/** The running number of a work order number, e.g. 12 for "Z2026-0012". */
const sequenceOf = (number: string) => Number(number.split('-')[1]);

/** The value next to a label in the detail list of a page. */
const detail = (main: Locator, label: string) => main.locator('.details > div').filter({ hasText: new RegExp(`^${label}`) }).locator('dd');

/** On a work order's detail: the form with this name; the Práca and the Diel each have one. */
const formNamed = (page: Page, name: 'Pridať prácu' | 'Pridať diel') => page.locator('main').getByRole('form', { name });

async function addLabour(page: Page, fields: { name: string; quantity: string; unitPrice: string }) {
  const form = formNamed(page, 'Pridať prácu');
  await form.getByLabel('Názov', { exact: true }).fill(fields.name);
  await form.getByLabel('Množstvo', { exact: true }).fill(fields.quantity);
  await form.getByLabel('Predajná cena za jednotku bez DPH (€)').fill(fields.unitPrice);
  await form.getByRole('button', { name: 'Pridať prácu' }).click();
}

test('the admin adds a work order to a vehicle, then adds work, sees the amounts and marks it done', async ({ page }) => {
  test.slow(); // the longest flow; under --repeat-each the workers share one server
  // All specs share one database, and this one also runs repeated: its customer and VIN carry a tag, and the order is read by its own number.
  const tag = runTag();
  const [owner, vin] = [`Majiteľ Prvej Zákazky ${tag}`, vinOf(tag)];
  await signIn(page);
  await addCustomer(page, owner);
  await addVehicleAndOpen(page, vin);
  const main = page.locator('main');
  const vehicleUrl = page.url();
  await expect(main).toContainText('Zatiaľ žiadna zákazka.');

  // The customer is the owner of the vehicle unless another is chosen.
  await startWorkOrder(page);
  await expect(page.getByLabel('Zákazník', { exact: true }).locator('option:checked')).toHaveText(owner);
  await fillIntake(page, '123 456', 'Výmena oleja a kontrola bŕzd');

  await expect(page).toHaveURL(/\/zakazky\/[0-9a-f-]{36}$/);
  const orderUrl = page.url();
  const number = await numberOnTheDetail(page);
  expect(number).toMatch(new RegExp(`^Z${year()}-`));
  await expect(detail(main, 'Stav')).toHaveText('Prijatá');
  await expect(detail(main, 'Zákazník')).toHaveText(owner);
  await expect(detail(main, 'Vozidlo')).toContainText('Škoda Octavia');
  await expect(detail(main, 'Vozidlo')).toContainText(vin);
  await expect(detail(main, 'Kilometre pri príjme')).toHaveText('123 456 km');
  await expect(detail(main, 'Požiadavka zákazníka')).toHaveText('Výmena oleja a kontrola bŕzd');
  await expect(main).not.toContainText('Dátum dokončenia');

  // A Rozpracovaná Zákazka offers the search of the Cenník beside the forms for work and parts.
  await expect(main.getByRole('search')).toHaveCount(1);

  // The VAT rate starts at 23 %. A work item that is not one stays on the form, with the reason at the field.
  const labourForm = formNamed(page, 'Pridať prácu');
  await expect(labourForm.getByLabel('Sadzba DPH (%)')).toHaveValue('23');
  await expect(labourForm.getByLabel('Jednotka')).toHaveValue('h');
  await addLabour(page, { name: 'Výmena oleja', quantity: '0', unitPrice: '40' });
  await expect(labourForm.getByLabel('Množstvo', { exact: true })).toHaveAccessibleDescription('Množstvo musí byť väčšie ako 0, najviac na 2 desatinné miesta');
  await expect(labourForm.getByLabel('Názov', { exact: true })).toHaveValue('Výmena oleja');
  await expect(main.getByRole('row', { name: /Výmena oleja/ })).toHaveCount(0);

  await labourForm.getByLabel('Množstvo', { exact: true }).fill('1,5');
  await labourForm.getByRole('button', { name: 'Pridať prácu' }).click();
  const oil = main.getByRole('row', { name: /Výmena oleja/ });
  await expect(oil.getByRole('cell')).toHaveText(['', 'Výmena oleja', '1,5 h', '—', '40,00 €', '23 %', '60,00 €', '13,80 €', '73,80 €', /Upraviť/]);
  await expect(labourForm.getByLabel('Názov', { exact: true })).toHaveValue('');
  await expect(labourForm.getByLabel('Sadzba DPH (%)')).toHaveValue('23');

  // A fractional quantity: 0,25 h at 33,33 € is 8,33 € (rounded once per item), and the totals add the rounded items.
  await addLabour(page, { name: 'Kontrola bŕzd', quantity: '0,25', unitPrice: '33,33' });
  await expect(main.getByRole('row', { name: /Kontrola bŕzd/ }).getByRole('cell')).toHaveText([
    '', 'Kontrola bŕzd', '0,25 h', '—', '33,33 €', '23 %', '8,33 €', '1,92 €', '10,25 €', /Upraviť/,
  ]);
  await expect(main.getByRole('row', { name: /Spolu/ }).getByRole('cell')).toHaveText(['68,33 €', '15,72 €', '84,05 €']);
  // Work has no Nákupná cena, so all of its price is Marža and no Diel is missing a price.
  await expect(detail(main, 'Nákup dielov bez DPH')).toHaveText('0,00 €');
  await expect(detail(main, 'Marža')).toHaveText('68,33 € (100,0 %)');
  await expect(main).not.toContainText('Marža je neúplná');

  // The buttons are the transitions the current status allows: never the status it is in. Prijatá → V práci → Čaká na diely, and work can still be added.
  const button = (name: string) => main.getByRole('button', { name, exact: true });
  await expect(button('Prijatá')).toHaveCount(0);
  await button('V práci').click();
  await expect(detail(main, 'Stav')).toHaveText('V práci');
  await expect(button('V práci')).toHaveCount(0);
  await expect(button('Prijatá')).toBeVisible();
  await button('Čaká na diely').click();
  await expect(detail(main, 'Stav')).toHaveText('Čaká na diely');
  await expect(button('Čaká na diely')).toHaveCount(0);
  await expect(button('Pridať prácu')).toBeVisible();
  await expect(main).not.toContainText('Dátum dokončenia');

  await main.getByRole('button', { name: 'Označiť ako hotovú' }).click();
  await expect(detail(main, 'Stav')).toHaveText('Hotová');
  await expect(detail(main, 'Dátum dokončenia')).toHaveText(today());
  await expect(main.getByRole('button', { name: 'Označiť ako hotovú' })).toHaveCount(0);
  // A Hotová Zákazka offers no way to add, edit or delete an item, and no search of the Cenník to add one from.
  await expect(main.getByRole('form')).toHaveCount(0);
  await expect(main.getByRole('search')).toHaveCount(0);
  await expect(main.getByRole('link', { name: 'Upraviť' })).toHaveCount(0);
  await expect(main.getByRole('button', { name: /^Zmazať/ })).toHaveCount(0);
  for (const name of ['Prijatá', 'V práci', 'Čaká na diely', 'Pridať prácu', 'Pridať diel']) await expect(button(name)).toHaveCount(0);
  await expect(main.locator('summary')).toHaveCount(0);
  await expect(main.getByRole('row', { name: /Spolu/ }).getByRole('cell')).toHaveText(['68,33 €', '15,72 €', '84,05 €']);

  // The vehicle lists its work order, in any state, with the customer it was made for, and the list of work orders shows it too.
  await page.goto(vehicleUrl);
  await expect(main.getByRole('row', { name: new RegExp(number) }).getByRole('cell')).toHaveText([number, owner, 'Hotová Na fakturáciu', '']);
  await expect(main).not.toContainText('Zatiaľ žiadna zákazka.');
  await expect(main).not.toContainText(/otvoren/i); // GLOSSARY lists "otvorená" under Avoid
  await main.getByRole('link', { name: number }).click();
  await expect(page).toHaveURL(orderUrl);
  await page.getByRole('navigation', { name: 'Hlavné menu' }).getByRole('link', { name: 'Zákazky' }).click();
  await expect(page).toHaveURL(/\/zakazky$/);
  await page.goto(`/zakazky?stav=done&od=${dayFromToday(0)}`);
  const row = main.getByRole('row', { name: new RegExp(number) });
  // Hotová: the row is marked "Na fakturáciu" (the work order has no Termín, so its cell is empty).
  await expect(row.getByRole('cell')).toHaveText([number, owner, /Škoda Octavia/, 'Hotová Na fakturáciu', '']);
  await expect(row.getByText('Na fakturáciu')).toBeVisible();
  await row.getByRole('link', { name: number }).click();
  await expect(page).toHaveURL(orderUrl);
});

test('the admin adds a part with a markup and sees the margin, then completes its purchase price, changes it and deletes it', async ({ page }) => {
  test.slow(); // a seeded work order, three forms and a page for the edit; under --repeat-each the workers share one server
  const order = await seedWorkOrder(db, runTag());
  await signIn(page);
  await page.goto(`/zakazky/${order.orderId}`);
  const main = page.locator('main');
  const form = formNamed(page, 'Pridať diel');
  const purchasePrice = form.getByLabel('Nákupná cena za jednotku bez DPH (€)');
  const markup = form.getByLabel('Prirážka (%)');
  const salePrice = form.getByLabel('Predajná cena za jednotku bez DPH (€)');

  // A new Diel is in pieces and starts with the Prirážka of Nastavenia (0 %, which no spec changes).
  await expect(form.getByLabel('Jednotka')).toHaveValue('ks');
  await expect(markup).toHaveValue('0');
  await form.getByLabel('Kód').fill('OL-5W30');
  await form.getByLabel('Názov', { exact: true }).fill('Olej 5W-30');
  await form.getByLabel('Množstvo', { exact: true }).fill('2');
  await form.getByLabel('Jednotka').fill('l');
  // The Nákupná cena makes the Predajná cena from the Prirážka. Typing before the page is interactive is lost, so this retries.
  await expect(async () => {
    await purchasePrice.fill('10');
    await expect(salePrice).toHaveValue('10,00', { timeout: 1000 });
  }).toPass();
  await markup.fill('25');
  await expect(salePrice).toHaveValue('12,50');
  // A Predajná cena makes the Prirážka, to one decimal.
  await salePrice.fill('15');
  await expect(markup).toHaveValue('50');
  await salePrice.fill('13,33');
  await expect(markup).toHaveValue('33,3');
  await markup.fill('25');
  await expect(salePrice).toHaveValue('12,50');
  await form.getByRole('button', { name: 'Pridať diel' }).click();

  const oil = main.getByRole('row', { name: /Olej 5W-30/ });
  await expect(oil.getByRole('cell')).toHaveText(['OL-5W30', 'Olej 5W-30', '2 l', '10,00 €', '12,50 €', '23 %', '25,00 €', '5,75 €', '30,75 €', /Upraviť/]);
  await expect(form.getByLabel('Názov', { exact: true })).toHaveValue('');
  await expect(markup).toHaveValue('0');
  await expect(form.getByLabel('Jednotka')).toHaveValue('ks');
  await expect(detail(main, 'Nákup dielov bez DPH')).toHaveText('20,00 €');
  await expect(detail(main, 'Marža')).toHaveText('5,00 € (20,0 %)');
  await expect(main).not.toContainText('Marža je neúplná');

  // A Diel without a Nákupná cena counts as 0, and the page says how many are missing one.
  await form.getByLabel('Názov', { exact: true }).fill('Tesnenie');
  await form.getByLabel('Množstvo', { exact: true }).fill('1');
  await salePrice.fill('4');
  await form.getByRole('button', { name: 'Pridať diel' }).click();
  const gasket = main.getByRole('row', { name: /Tesnenie/ });
  await expect(gasket.getByRole('cell')).toHaveText(['', 'Tesnenie', '1 ks', '—', '4,00 €', '23 %', '4,00 €', '0,92 €', '4,92 €', /Upraviť/]);
  await expect(main.getByRole('row', { name: /Spolu/ }).getByRole('cell')).toHaveText(['29,00 €', '6,67 €', '35,67 €']);
  await expect(detail(main, 'Marža')).toHaveText('9,00 € (31,0 %)');
  await expect(main.getByRole('status')).toHaveText('Marža je neúplná: 1 diel bez nákupnej ceny');

  // The item is edited on a page of its own, with its Prirážka worked out once a Nákupná cena is typed.
  await gasket.getByRole('link', { name: 'Upraviť' }).click();
  await expect(page).toHaveURL(/\/zakazky\/[0-9a-f-]{36}\/polozky\/[0-9a-f-]{36}$/);
  await expect(main.locator('h1')).toHaveText('Upraviť položku');
  await expect(page.getByLabel('Názov', { exact: true })).toHaveValue('Tesnenie');
  await expect(page.getByLabel('Prirážka (%)')).toHaveValue('');
  await expect(async () => {
    await page.getByLabel('Nákupná cena za jednotku bez DPH (€)').fill('3');
    await expect(page.getByLabel('Prirážka (%)')).toHaveValue('33,3', { timeout: 1000 });
  }).toPass();
  await expect(page.getByLabel('Predajná cena za jednotku bez DPH (€)')).toHaveValue('4,00');
  await page.getByRole('button', { name: 'Uložiť zmeny' }).click();
  await expect(page).toHaveURL(`/zakazky/${order.orderId}`);
  await expect(main.getByRole('row', { name: /Tesnenie/ }).getByRole('cell')).toHaveText(['', 'Tesnenie', '1 ks', '3,00 €', '4,00 €', '23 %', '4,00 €', '0,92 €', '4,92 €', /Upraviť/]);
  await expect(detail(main, 'Nákup dielov bez DPH')).toHaveText('23,00 €');
  await expect(detail(main, 'Marža')).toHaveText('6,00 € (20,7 %)');
  await expect(main.getByRole('status')).toHaveCount(0);

  await main.getByRole('button', { name: 'Zmazať Olej 5W-30' }).click();
  await expect(main.getByRole('row', { name: /Olej 5W-30/ })).toHaveCount(0);
  await expect(detail(main, 'Nákup dielov bez DPH')).toHaveText('3,00 €');
  await expect(detail(main, 'Marža')).toHaveText('1,00 € (25,0 %)');
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
  const firstNumber = await numberOnTheDetail(page);
  const first = sequenceOf(firstNumber);

  // The vehicle still belongs to its owner, who is the default of the next work order.
  await page.goto(vehicleUrl);
  await startWorkOrder(page);
  await expect(page.getByLabel('Zákazník', { exact: true }).locator('option:checked')).toHaveText(owner);
  await fillIntake(page, '10', 'Druhý príjem');
  await expect(detail(main, 'Zákazník')).toHaveText(owner);
  // Workers share the year's counter, so only the order is checked; no gaps: apps/web/test/work-orders.test.ts.
  const secondNumber = await numberOnTheDetail(page);
  expect(sequenceOf(secondNumber)).toBeGreaterThan(first);

  // The vehicle lists both, the newest first, each with its own customer: the first one's is not the owner.
  await page.goto(vehicleUrl);
  const rows = main.locator('tbody tr');
  await expect(rows).toHaveCount(2);
  await expect(rows.nth(0).getByRole('cell')).toHaveText([secondNumber, owner, 'Prijatá', '']);
  await expect(rows.nth(1).getByRole('cell')).toHaveText([firstNumber, other, 'Prijatá', '']);
});

test('the admin cancels a work order only after confirming; it keeps its number, is locked and stays in the history of the vehicle', async ({ page }) => {
  test.slow(); // a customer, a vehicle, a work order and the cancelling; under --repeat-each the workers share one server
  const tag = runTag();
  const owner = `Majiteľ Zrušenej Zákazky ${tag}`;
  await signIn(page);
  await addCustomer(page, owner);
  await addVehicleAndOpen(page, vinOf(tag));
  const main = page.locator('main');
  const vehicleUrl = page.url();
  await startWorkOrder(page);
  await fillIntake(page, '1 000', 'Nezmyselná oprava');
  const number = await numberOnTheDetail(page);
  const orderUrl = page.url();

  // Opening the confirmation sends nothing: the work order is still Prijatá and can still be worked on.
  await main.locator('summary', { hasText: 'Zrušiť zákazku' }).click();
  await expect(main.getByRole('button', { name: 'Potvrdiť zrušenie' })).toBeVisible();
  await expect(detail(main, 'Stav')).toHaveText('Prijatá');
  await expect(main.getByRole('button', { name: 'Pridať prácu' })).toBeVisible();

  await main.getByRole('button', { name: 'Potvrdiť zrušenie' }).click();
  await expect(detail(main, 'Stav')).toHaveText('Zrušená');
  await expect(main.locator('h1')).toHaveText(number);
  await expect(main.locator('summary')).toHaveCount(0);
  for (const name of ['Prijatá', 'V práci', 'Čaká na diely', 'Označiť ako hotovú', 'Potvrdiť zrušenie', 'Pridať prácu']) {
    await expect(main.getByRole('button', { name, exact: true })).toHaveCount(0);
  }

  // The vehicle keeps it in its history, as Zrušená. The list of work orders that are not closed does not show it,
  // but the list of the cancelled ones does, with its number and no mark.
  await page.goto(vehicleUrl);
  await expect(main.getByRole('row', { name: new RegExp(number) }).getByRole('cell')).toHaveText([number, owner, 'Zrušená', '']);
  await page.goto(`/zakazky?od=${dayFromToday(0)}`);
  await expect(main.locator('h1')).toHaveText('Zákazky');
  await expect(main.getByRole('row', { name: new RegExp(number) })).toHaveCount(0);
  await page.goto(`/zakazky?stav=cancelled&od=${dayFromToday(0)}`);
  const row = main.getByRole('row', { name: new RegExp(number) });
  await expect(row.getByRole('cell')).toHaveText([number, owner, /Škoda Octavia/, 'Zrušená', '']);
  await row.getByRole('link', { name: number }).click();
  await expect(page).toHaveURL(orderUrl);
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

test('the work order forms and the buttons for an item and for done, used after the session ended, are refused and change nothing', async ({ page, browser, baseURL }) => {
  test.slow(); // five sign-ins and four ended sessions; under --repeat-each the workers share one server
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
  const labourForm = formNamed(page, 'Pridať prácu');
  await labourForm.getByLabel('Názov', { exact: true }).fill('Nemala by sa pridať');
  await labourForm.getByLabel('Množstvo', { exact: true }).fill('1');
  await labourForm.getByLabel('Predajná cena za jednotku bez DPH (€)').fill('10');
  await endSessionBehindThePage(page, browser, baseURL);
  await labourForm.getByRole('button', { name: 'Pridať prácu' }).click();
  await expect(page).toHaveURL(/\/login$/);
  await signIn(page);
  await page.goto(orderUrl);
  await expect(main.getByRole('row', { name: /Nemala by sa pridať/ })).toHaveCount(0);

  // Deleting an item.
  await addLabour(page, { name: 'Zostane', quantity: '1', unitPrice: '10' });
  await expect(main.getByRole('row', { name: /Zostane/ })).toHaveCount(1);
  await endSessionBehindThePage(page, browser, baseURL);
  await main.getByRole('button', { name: 'Zmazať Zostane' }).click();
  await expect(page).toHaveURL(/\/login$/);
  await signIn(page);
  await page.goto(orderUrl);
  await expect(main.getByRole('row', { name: /Zostane/ })).toHaveCount(1);

  await endSessionBehindThePage(page, browser, baseURL);
  await main.getByRole('button', { name: 'Označiť ako hotovú' }).click();
  await expect(page).toHaveURL(/\/login$/);
  await signIn(page);
  await page.goto(orderUrl);
  await expect(detail(main, 'Stav')).toHaveText('Prijatá');
});

/** A day `YYYY-MM-DD` as the app writes it, e.g. "26. 10. 2026". */
const written = (day: string) => new Date(`${day}T00:00:00Z`).toLocaleDateString('sk-SK', { timeZone: 'UTC' });

/** What the colour of a design token comes out as in the page, e.g. "rgb(253, 236, 234)". The tokens are the source of the expected colours. */
const colourOf = (page: Page, token: string) =>
  page.evaluate((name) => {
    const probe = document.createElement('span');
    probe.style.backgroundColor = `var(${name})`;
    document.body.append(probe);
    const colour = getComputedStyle(probe).backgroundColor;
    probe.remove();
    return colour;
  }, token);

test('the Termín and the note are set at intake and edited while the work order is Rozpracovaná; a late one is a red row, a done one an orange row and cannot be edited', async ({
  page,
}) => {
  test.slow(); // a customer, a vehicle, a work order, an edit, two lists and the done button; under --repeat-each the workers share one server
  const tag = runTag();
  const owner = `Majiteľ Termínu ${tag}`;
  await signIn(page);
  await addCustomer(page, owner);
  await addVehicleAndOpen(page, vinOf(tag));
  const main = page.locator('main');
  const [ahead, yesterday] = [dayFromToday(5), dayFromToday(-1)];

  // The form of a new work order takes the Termín and the note, and the detail shows them.
  await startWorkOrder(page);
  await page.getByLabel('Termín', { exact: true }).fill(ahead);
  await page.getByLabel('Poznámka (interná)').fill('Zákazník príde po 16:00');
  await fillIntake(page, '1 000', 'Výmena oleja');
  const number = await numberOnTheDetail(page);
  const orderUrl = page.url();
  await expect(detail(main, 'Termín')).toHaveText(written(ahead));
  await expect(detail(main, 'Poznámka')).toHaveText('Zákazník príde po 16:00');

  // The edit form starts with what is saved, and a header that is not one stays on the form with the reason and what was typed.
  await main.getByRole('link', { name: 'Upraviť zákazku' }).click();
  await expect(main.locator('h1')).toHaveText('Upraviť zákazku');
  await expect(page.getByLabel('Kilometre pri príjme')).toHaveValue('1000');
  await expect(page.getByLabel('Požiadavka zákazníka')).toHaveValue('Výmena oleja');
  await expect(page.getByLabel('Termín', { exact: true })).toHaveValue(ahead);
  await expect(page.getByLabel('Poznámka (interná)')).toHaveValue('Zákazník príde po 16:00');
  await page.getByLabel('Požiadavka zákazníka').fill('  ');
  await page.getByLabel('Kilometre pri príjme').fill('150 000');
  await page.getByRole('button', { name: 'Uložiť zákazku' }).click();
  await expect(page.getByLabel('Požiadavka zákazníka')).toHaveAccessibleDescription('Vyplňte požiadavku zákazníka');
  await expect(page.getByLabel('Kilometre pri príjme')).toHaveValue('150 000');

  // A header that is saved: a Termín that has passed, no note any more.
  await page.getByLabel('Požiadavka zákazníka').fill('Výmena brzdových kotúčov');
  await page.getByLabel('Termín', { exact: true }).fill(yesterday);
  await page.getByLabel('Poznámka (interná)').fill('');
  await page.getByRole('button', { name: 'Uložiť zákazku' }).click();
  await expect(page).toHaveURL(orderUrl);
  await expect(detail(main, 'Kilometre pri príjme')).toHaveText('150 000 km');
  await expect(detail(main, 'Požiadavka zákazníka')).toHaveText('Výmena brzdových kotúčov');
  await expect(detail(main, 'Termín')).toHaveText(written(yesterday));
  await expect(main).not.toContainText('Poznámka');

  // In the list the work order is a red row with the label "Po termíne", a text the colour does not have to carry.
  await page.goto(`/zakazky?stav=received&od=${dayFromToday(0)}`);
  const row = main.getByRole('row', { name: new RegExp(number) });
  await expect(row.getByRole('cell')).toHaveText([number, owner, /Škoda Octavia/, 'Prijatá Po termíne', written(yesterday)]);
  await expect(row).toHaveClass('row-late');
  await expect(row).toHaveCSS('background-color', await colourOf(page, '--color-danger-background'));
  const label = row.getByText('Po termíne');
  await expect(label).toBeVisible();
  await expect(label).toHaveCSS('border-top-style', 'none');
  // Forced colours drop the background colours; the label is drawn with a border in a system colour then.
  await page.emulateMedia({ forcedColors: 'active' });
  await expect(label).toBeVisible();
  await expect(label).toHaveCSS('border-top-style', 'solid');
  await page.emulateMedia({ forcedColors: 'none' });

  // Hotová: the same work order is an orange row "Na fakturáciu", not a red one, and it cannot be edited any more.
  await row.getByRole('link', { name: number }).click();
  await expect(page).toHaveURL(orderUrl);
  await main.getByRole('button', { name: 'Označiť ako hotovú' }).click();
  await expect(detail(main, 'Stav')).toHaveText('Hotová');
  await expect(main.getByRole('link', { name: 'Upraviť zákazku' })).toHaveCount(0);
  await page.goto(`${orderUrl}/upravit`);
  await expect(page).toHaveURL(orderUrl);
  await page.goto(`/zakazky?stav=done&od=${dayFromToday(0)}`);
  await expect(row.getByRole('cell')).toHaveText([number, owner, /Škoda Octavia/, 'Hotová Na fakturáciu', written(yesterday)]);
  await expect(row).toHaveClass('row-to-invoice');
  await expect(row).toHaveCSS('background-color', await colourOf(page, '--color-warning-background'));
  await expect(row.getByText('Po termíne')).toHaveCount(0);
});
