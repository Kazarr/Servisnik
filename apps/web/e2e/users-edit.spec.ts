import { randomBytes } from 'node:crypto';
import type { Page } from '@playwright/test';
import { expect, runTag, seedMechanik, signIn, signInAs, submitLogin, test } from './fixtures.ts';
import { openDatabase } from './records.ts';

let db: ReturnType<typeof openDatabase>;
test.beforeAll(() => {
  db = openDatabase();
});
test.afterAll(() => db.$client.end());

/** The row of the list in Nastavenia that holds this e-mail. */
const rowOf = (page: Page, email: string) => page.getByRole('region', { name: 'Používatelia' }).getByRole('row').filter({ hasText: email });

/** From the menu to Nastavenia, and from the list there to the page of the user with this e-mail. */
async function openUser(page: Page, email: string) {
  await page.getByRole('navigation', { name: 'Hlavné menu' }).getByRole('link', { name: 'Nastavenia' }).click();
  await rowOf(page, email).getByRole('link').click();
  await expect(page.locator('main h1')).toHaveText('Upraviť používateľa');
}

test('the admin changes a user, gives him a new password and sees it in the list; the Rola counts from the user\'s next page and the new password ends his sign-in', async ({
  page,
  browser,
  baseURL,
}) => {
  test.slow(); // the production build is shared by the workers; this one signs in three times and sends the forms twice
  const tag = runTag();
  const mechanik = await seedMechanik(db, tag);
  const renamed = { name: `Premenovaný ${tag}`, email: `premenovany-${tag}@autoservis.test` };
  const newPassword = randomBytes(12).toString('base64url');
  const elsewhere = await browser.newContext({ baseURL });
  const mechanikPage = await elsewhere.newPage();
  await signInAs(mechanikPage, mechanik);
  await expect(mechanikPage.getByRole('navigation', { name: 'Hlavné menu' }).getByRole('link')).toHaveText(['Zákazky']);
  await signIn(page);

  await openUser(page, mechanik.email);
  const data = page.getByRole('region', { name: 'Údaje používateľa' });
  await expect(data.getByLabel('Meno používateľa')).toHaveValue(mechanik.name);
  await expect(data.getByLabel('E-mail používateľa')).toHaveValue(mechanik.email);
  await expect(data.getByLabel('Rola používateľa')).toHaveValue('mechanik');

  // A Rola that is not the default one is sent too; the e-mail comes back as it is stored.
  await data.getByLabel('Meno používateľa').fill(renamed.name);
  await data.getByLabel('E-mail používateľa').fill(renamed.email.toUpperCase());
  await data.getByLabel('Rola používateľa').selectOption({ label: 'Admin' });
  await data.getByRole('button', { name: 'Uložiť údaje' }).click();
  await expect(data.getByRole('status')).toHaveText('Údaje sú uložené.');
  await expect(data.getByLabel('E-mail používateľa')).toHaveValue(renamed.email);

  // The Rola counts from his next page, with the sign-in he already has.
  await mechanikPage.goto('/zakazky');
  await expect(mechanikPage.getByRole('navigation', { name: 'Hlavné menu' }).getByRole('link')).toHaveText(['Zákazníci', 'Vozidlá', 'Zákazky', 'Cenník', 'Nastavenia']);

  // The new password ends his sign-in; he signs in again with it.
  const password = page.getByRole('region', { name: 'Nové heslo' });
  await password.getByLabel('Nové heslo používateľa').fill(newPassword);
  await password.getByRole('button', { name: 'Nastaviť nové heslo' }).click();
  await expect(password.getByRole('status')).toHaveText('Nové heslo je nastavené. Prihlásenia používateľa sú ukončené.');
  await expect(password.getByLabel('Nové heslo používateľa')).toHaveValue('');
  await mechanikPage.goto('/zakazky');
  await expect(mechanikPage).toHaveURL(/\/login$/);
  await submitLogin(mechanikPage, newPassword, renamed.email);
  await expect(mechanikPage).toHaveURL(/\/zakazky$/);
  await elsewhere.close();

  // The list shows him changed.
  await page.getByRole('link', { name: 'Späť na Nastavenia' }).click();
  await expect(rowOf(page, renamed.email).getByRole('cell')).toHaveText([renamed.name, renamed.email, 'Admin', 'Aktívny']);
});

test('the admin deactivates a mechanik, who lands on the login with the reason, and activates him again', async ({ page, browser, baseURL }) => {
  test.slow(); // the production build is shared by the workers; this one signs in four times
  const mechanik = await seedMechanik(db, runTag());
  const elsewhere = await browser.newContext({ baseURL });
  const mechanikPage = await elsewhere.newPage();
  await signInAs(mechanikPage, mechanik);
  await signIn(page);

  await openUser(page, mechanik.email);
  const status = page.getByRole('region', { name: 'Stav' });
  await expect(status).toContainText('Aktívny');
  await status.getByText('Deaktivovať', { exact: true }).click();
  await status.getByRole('button', { name: 'Potvrdiť deaktiváciu' }).click();
  await expect(status).toContainText('Deaktivovaný');
  await expect(status.getByRole('button', { name: 'Aktivovať' })).toBeVisible();

  // The list shows him as deactivated.
  await page.getByRole('link', { name: 'Späť na Nastavenia' }).click();
  await expect(rowOf(page, mechanik.email).getByRole('cell')).toHaveText([mechanik.name, mechanik.email, 'Mechanik', 'Deaktivovaný']);

  // His open sign-in ended: his next page is the login. With the right password he is told why.
  await mechanikPage.goto('/zakazky');
  await expect(mechanikPage).toHaveURL(/\/login$/);
  await submitLogin(mechanikPage, mechanik.password, mechanik.email);
  await expect(mechanikPage.locator('main').getByRole('alert')).toHaveText('Používateľ je deaktivovaný. Obráťte sa na admina.');
  await expect(mechanikPage).toHaveURL(/\/login$/);

  // Activated again, he signs in with the password he had.
  await openUser(page, mechanik.email);
  await status.getByRole('button', { name: 'Aktivovať' }).click();
  await expect(status).toContainText('Aktívny');
  await expect(status.getByText('Deaktivovať', { exact: true })).toBeVisible();
  await submitLogin(mechanikPage, mechanik.password, mechanik.email);
  await expect(mechanikPage).toHaveURL(/\/zakazky$/);
  await elsewhere.close();
});
