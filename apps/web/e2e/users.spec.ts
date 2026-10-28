import { randomBytes } from 'node:crypto';
import type { Page } from '@playwright/test';
import { expect, runTag, signIn, signInAs, test } from './fixtures.ts';

/** The form for a new Používateľ is filled and sent as the admin would; `role` is the label of the option. */
async function sendUserForm(page: Page, user: { name: string; email: string; role: 'Admin' | 'Mechanik'; password: string }) {
  const section = page.getByRole('region', { name: 'Používatelia' });
  await section.getByLabel('Meno používateľa').fill(user.name);
  await section.getByLabel('E-mail používateľa').fill(user.email);
  await section.getByLabel('Rola používateľa').selectOption({ label: user.role });
  await section.getByLabel('Počiatočné heslo používateľa').fill(user.password);
  await section.getByRole('button', { name: 'Založiť používateľa' }).click();
}

test('the admin creates users in Nastavenia, refusals say why, and the new mechanik signs in and sees only Zákazky', async ({ page, browser, baseURL }) => {
  test.slow(); // the production build is shared by the workers; this one sends the form four times and signs in a user, which hashes a password
  const tag = runTag();
  const mechanik = { name: `Mechanik ${tag}`, email: `mechanik-${tag}@autoservis.test`, role: 'Mechanik', password: randomBytes(12).toString('base64url') } as const;
  const boss = { name: `Šéf ${tag}`, email: `sef-${tag}@autoservis.test`, role: 'Admin', password: randomBytes(12).toString('base64url') } as const;
  await signIn(page);

  await page.getByRole('navigation', { name: 'Hlavné menu' }).getByRole('link', { name: 'Nastavenia' }).click();
  await expect(page).toHaveURL(/\/nastavenia$/);
  const section = page.getByRole('region', { name: 'Používatelia' });
  await expect(section.getByRole('heading', { level: 2, name: 'Používatelia' })).toBeVisible();
  const row = (email: string) => section.getByRole('row').filter({ hasText: email });
  // The admin the global setup seeded is in the list.
  await expect(row(process.env.E2E_ADMIN_EMAIL!).getByRole('cell')).toHaveText(['Admin', process.env.E2E_ADMIN_EMAIL!, 'Admin', 'Aktívny']);

  // A password of 7 characters is refused with the reason; what was typed stays, the password does not.
  await sendUserForm(page, { ...mechanik, password: '1234567' });
  await expect(section.getByLabel('Počiatočné heslo používateľa')).toHaveAccessibleDescription('Heslo musí mať aspoň 8 znakov');
  await expect(section.getByLabel('Meno používateľa')).toHaveValue(mechanik.name);
  await expect(section.getByLabel('E-mail používateľa')).toHaveValue(mechanik.email);
  await expect(section.getByLabel('Počiatočné heslo používateľa')).toHaveValue('');
  await expect(row(mechanik.email)).toHaveCount(0);

  await sendUserForm(page, mechanik);
  await expect(section.getByRole('status')).toHaveText('Používateľ je založený.');
  await expect(row(mechanik.email).getByRole('cell')).toHaveText([mechanik.name, mechanik.email, 'Mechanik', 'Aktívny']);
  // The form is empty again, the password included.
  await expect(section.getByLabel('Meno používateľa')).toHaveValue('');
  await expect(section.getByLabel('Počiatočné heslo používateľa')).toHaveValue('');

  // The same e-mail in capitals is the same e-mail.
  await sendUserForm(page, { ...boss, email: mechanik.email.toUpperCase() });
  await expect(section.getByLabel('E-mail používateľa')).toHaveAccessibleDescription('Používateľ s týmto e-mailom už existuje');
  await expect(row(mechanik.email)).toHaveCount(1);

  // A role that is not the form's default is sent too.
  await sendUserForm(page, boss);
  await expect(section.getByRole('status')).toHaveText('Používateľ je založený.');
  await expect(row(boss.email).getByRole('cell')).toHaveText([boss.name, boss.email, 'Admin', 'Aktívny']);

  // The mechanik signs in on his own and has the list of Zákazky only; the pages of the admin lead back to it.
  const elsewhere = await browser.newContext({ baseURL });
  const mechanikPage = await elsewhere.newPage();
  await signInAs(mechanikPage, mechanik);
  await expect(mechanikPage.getByRole('navigation', { name: 'Hlavné menu' }).getByRole('link')).toHaveText(['Zákazky']);
  await expect(mechanikPage.locator('main h1')).toHaveText('Zákazky');
  await mechanikPage.goto('/nastavenia');
  await expect(mechanikPage).toHaveURL(/\/zakazky$/);
  await elsewhere.close();
});
