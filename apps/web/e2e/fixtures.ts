import { expect, test as base, type Browser, type Page } from '@playwright/test';
import { randomInt } from 'node:crypto';
import { watchPage } from './watch-page.ts';

export { expect };

/** `page` that fails its test on a console error, an uncaught page exception or an HTTP 5xx (see watch-page.ts). */
export const test = base.extend({
  page: async ({ page }, use) => {
    const problems = watchPage(page);

    await use(page);

    expect(problems, 'the page reported errors').toEqual([]);
  },
});

/** Submits the login form with the e-mail of the admin the global setup seeded; `password` is the admin's own unless a test wants a wrong one. */
export async function submitLogin(page: Page, password = process.env.E2E_ADMIN_PASSWORD!) {
  await page.goto('/login');
  await page.getByLabel('E-mail').fill(process.env.E2E_ADMIN_EMAIL!);
  await page.getByLabel('Heslo').fill(password);
  await page.getByRole('button', { name: 'Prihlásiť sa' }).click();
}

/** Signs in as the admin the global setup seeded and waits for the first page after the login. */
export async function signIn(page: Page) {
  await submitLogin(page);
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

/** Types `text` into the search field of the customer list and searches. */
export async function searchCustomers(page: Page, text: string) {
  await page.getByLabel('Hľadať zákazníka').fill(text);
  await page.getByRole('button', { name: 'Hľadať', exact: true }).click();
}

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
