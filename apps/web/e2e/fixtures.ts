import { expect, test as base, type Browser, type Page } from '@playwright/test';
import { randomBytes, randomInt } from 'node:crypto';
import { watchPage } from './watch-page.ts';

export { expect };

/**
 * A tag for the data of one test. All specs, workers and `--repeat-each` runs share one database, so a test
 * puts its tag in the names and unique keys it creates and asserts only the rows that carry it.
 */
export const runTag = () => randomBytes(3).toString('hex');

/** A VIN unique per tag (24 random bits): the 11 characters of `prefix`, then the tag in capitals (hex digits are never I, O or Q). */
export const vinOf = (tag: string, prefix = 'TMBZZZ5JZ3W') => `${prefix}${tag.toUpperCase()}`;

/**
 * `context` that fails its test on a console error, an uncaught page exception or an HTTP 5xx (see
 * watch-page.ts) of any page that opens in it: the `page` fixture, a `context.newPage()` of the test
 * and a popup alike.
 */
export const test = base.extend({
  context: async ({ context }, use) => {
    const problems: string[][] = [];
    context.on('page', (page) => problems.push(watchPage(page)));

    await use(context);

    expect(problems.flat(), 'a page reported errors').toEqual([]);
  },
});

/**
 * Submits the login form with the e-mail and password of the admin the global setup seeded, unless
 * a test names another user or wants a wrong password.
 */
export async function submitLogin(page: Page, password = process.env.E2E_ADMIN_PASSWORD!, email = process.env.E2E_ADMIN_EMAIL!) {
  await page.goto('/login');
  await page.getByLabel('E-mail').fill(email);
  await page.getByLabel('Heslo').fill(password);
  await page.getByRole('button', { name: 'Prihlásiť sa' }).click();
}

/** Signs in as the admin the global setup seeded and waits for the first page after the login. */
export async function signIn(page: Page) {
  await submitLogin(page);
  await expect(page).toHaveURL(/\/zakazky$/);
}

/** Signs in as a user the spec created (see test/support/users.ts) and waits for the first page after the login. */
export async function signInAs(page: Page, { email, password }: { email: string; password: string }) {
  await submitLogin(page, password, email);
  await expect(page).toHaveURL(/\/zakazky$/);
}

/** All specs share one database and an IČO is unique, so every firma takes a random one of its own. */
export const newIco = () => String(randomInt(10_000_000, 100_000_000));

/** Adds a customer through the form and waits for its detail page. A Firma gets `ico`, a new one unless given; `contact` fills the phone and e-mail. */
export async function addCustomer(
  page: Page,
  name: string,
  type: 'Osoba' | 'Firma' = 'Osoba',
  ico = newIco(),
  contact: { phone?: string; email?: string } = {},
) {
  await page.goto('/zakaznici/novy');
  await page.getByLabel(type, { exact: true }).check();
  await page.getByLabel('Názov', { exact: false }).fill(name);
  if (type === 'Firma') await page.getByLabel('IČO', { exact: true }).fill(ico);
  if (contact.phone) await page.getByLabel('Telefón', { exact: true }).fill(contact.phone);
  if (contact.email) await page.getByLabel('E-mail', { exact: true }).fill(contact.email);
  await page.getByRole('button', { name: 'Uložiť zákazníka' }).click();
  await expect(page.locator('main h1')).toHaveText(name);
}

/** From a customer's detail: opens the form for a new vehicle and fills VIN, make and model. The form is not sent. */
export async function fillVehicleForm(page: Page, vin: string, make = 'Škoda', model = 'Octavia') {
  await page.locator('main').getByRole('link', { name: 'Pridať vozidlo' }).click();
  await page.getByLabel('VIN').fill(vin);
  await page.getByLabel('Značka').fill(make);
  await page.getByLabel('Model').fill(model);
}

/** From a customer's detail: adds a vehicle through the form and opens its detail. */
export async function addVehicleAndOpen(page: Page, vin: string, make = 'Škoda', model = 'Octavia') {
  await fillVehicleForm(page, vin, make, model);
  await page.getByRole('button', { name: 'Uložiť vozidlo' }).click();
  await page.locator('main').getByRole('link', { name: vin }).click();
  await expect(page.locator('main h1')).toHaveText(`${make} ${model}`);
}

/**
 * Types `text` into the search field called `label`, searches, and waits until the page of that
 * search has loaded, so what the caller asserts next cannot be true of the page of the search before.
 * `text` must differ from what the list was last searched for, or there is no new page to wait for.
 */
async function searchList(page: Page, label: string, text: string) {
  await page.getByLabel(label).fill(text);
  await page.getByRole('button', { name: 'Hľadať', exact: true }).click();
  await page.waitForURL((url) => url.searchParams.get('q') === text);
}

/** Searches the list of customers for `text` (see searchList). */
export const searchCustomers = (page: Page, text: string) => searchList(page, 'Hľadať zákazníka', text);

/** Searches the list of vehicles for `text` (see searchList). */
export const searchVehicles = (page: Page, text: string) => searchList(page, 'Hľadať vozidlo', text);

/** Searches the Cenník, on its own page or in the section of a Zákazka, for `text` (see searchList). */
export const searchPriceList = (page: Page, text: string) => searchList(page, 'Hľadať v cenníku', text);

/** Ends the admin's session on the server, as another tab or an expiry would, while `page` stays open. */
export async function endSessionBehindThePage(page: Page, browser: Browser, baseURL: string | undefined) {
  const elsewhere = await browser.newContext({ baseURL });
  await elsewhere.addCookies(await page.context().cookies());
  const otherTab = await elsewhere.newPage();
  await otherTab.goto('/zakazky');
  await otherTab.getByRole('button', { name: 'Odhlásiť sa' }).click();
  await expect(otherTab).toHaveURL(/\/login$/);
  await elsewhere.close();
}
