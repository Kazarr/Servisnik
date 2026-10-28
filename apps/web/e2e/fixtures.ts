import { expect, test as base, type Browser, type Page } from '@playwright/test';
import { randomBytes } from 'node:crypto';
import { watchPage } from './page-problems.ts';

export { expect };

/**
 * A tag for the data of one test. All specs, workers and `--repeat-each` runs share one database, so a test
 * puts its tag in the names and unique keys it creates and asserts only the rows that carry it.
 */
export const runTag = () => randomBytes(3).toString('hex');

/** A VIN no other test has used: the 11 characters of `prefix`, then the tag in capitals (hex digits are never I, O or Q). */
export const vinOf = (tag: string, prefix = 'TMBZZZ5JZ3W') => `${prefix}${tag.toUpperCase()}`;

/** `page` that fails its test on a console error, an uncaught page exception or an HTTP 5xx (see page-problems.ts). */
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

/** Adds a customer through the form and waits for its detail page. */
export async function addCustomer(page: Page, name: string, type: 'Osoba' | 'Firma' = 'Osoba') {
  await page.goto('/zakaznici/novy');
  await page.getByLabel(type, { exact: true }).check();
  await page.getByLabel('Názov', { exact: false }).fill(name);
  await page.getByRole('button', { name: 'Uložiť zákazníka' }).click();
  await expect(page.locator('main h1')).toHaveText(name);
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
