import type { Locator, Page } from '@playwright/test';
import { addCustomer, addVehicleAndOpen, endSessionBehindThePage, expect, runTag, signIn, test, vinOf } from './fixtures.ts';

/** Today in Europe/Bratislava as the app writes it, e.g. "26. 10. 2026". */
const today = () => new Date().toLocaleDateString('sk-SK', { timeZone: 'Europe/Bratislava' });
const year = () => new Date().toLocaleDateString('en-CA', { timeZone: 'Europe/Bratislava', year: 'numeric' });

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
async function numberOnTheDetail(page: Page) {
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
  for (const name of ['Prijatá', 'V práci', 'Čaká na diely', 'Pridať prácu']) await expect(button(name)).toHaveCount(0);
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
  const row = main.getByRole('row', { name: new RegExp(number) });
  // Hotová: the row is marked "Na fakturáciu" (the work order has no Termín, so its cell is empty).
  await expect(row.getByRole('cell')).toHaveText([number, owner, /Škoda Octavia/, 'Hotová Na fakturáciu', '']);
  await expect(row.getByText('Na fakturáciu')).toBeVisible();
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
  await page.goto('/zakazky');
  await expect(main.locator('h1')).toHaveText('Zákazky');
  await expect(main.getByRole('row', { name: new RegExp(number) })).toHaveCount(0);
  await page.goto('/zakazky?stav=cancelled');
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

/** The day `offset` days from today in Europe/Bratislava, as a date field carries it (`YYYY-MM-DD`). */
function dayFromToday(offset: number) {
  const day = new Date(`${new Date().toLocaleDateString('en-CA', { timeZone: 'Europe/Bratislava' })}T00:00:00Z`);
  day.setUTCDate(day.getUTCDate() + offset);
  return day.toISOString().slice(0, 10);
}

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
  await page.goto('/zakazky');
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
  await page.goto('/zakazky');
  await expect(row.getByRole('cell')).toHaveText([number, owner, /Škoda Octavia/, 'Hotová Na fakturáciu', written(yesterday)]);
  await expect(row).toHaveClass('row-to-invoice');
  await expect(row).toHaveCSS('background-color', await colourOf(page, '--color-warning-background'));
  await expect(row.getByText('Po termíne')).toHaveCount(0);
});
