import { randomBytes } from 'node:crypto';
import type { Page } from '@playwright/test';
import { seedUser } from '../test/support/users.ts';
import { expect, runTag, signInAs, submitLogin, test } from './fixtures.ts';
import { openDatabase } from './records.ts';

let db: ReturnType<typeof openDatabase>;
test.beforeAll(() => {
  db = openDatabase();
});
test.afterAll(() => db.$client.end());

/** Fills the form of the change of the password and sends it. The fields come back empty after a send, so every call fills all three. */
async function sendPasswordForm(page: Page, { current, next, again }: { current: string; next: string; again: string }) {
  await page.getByLabel('Súčasné heslo').fill(current);
  await page.getByLabel('Nové heslo', { exact: true }).fill(next);
  await page.getByLabel('Nové heslo znova').fill(again);
  await page.getByRole('button', { name: 'Zmeniť heslo' }).click();
}

// Both roles may do it, the mechanik although every other page leads him back to Zákazky.
for (const role of ['admin', 'mechanik'] as const) {
  test(`the ${role} changes his own password from the link at his e-mail: refusals say why, the other sign-in ends and this one stays`, async ({
    page,
    browser,
    baseURL,
  }) => {
    // A user of its own: the shared admin's password must not change under the other specs.
    const account = { email: `heslo-${role}-${runTag()}@autoservis.test`, password: randomBytes(12).toString('base64url') };
    await seedUser(db, { ...account, role });
    const newPassword = randomBytes(12).toString('base64url');
    await signInAs(page, account);
    const elsewhere = await browser.newContext({ baseURL });
    const otherPage = await elsewhere.newPage();
    await signInAs(otherPage, account);

    await page.getByRole('link', { name: account.email }).click();
    await expect(page).toHaveURL(/\/heslo$/);
    await expect(page.locator('main h1')).toHaveText('Zmena hesla');

    const alerts = page.locator('main').getByRole('alert');
    await sendPasswordForm(page, { current: 'nespravne-heslo', next: newPassword, again: newPassword });
    await expect(alerts).toHaveText('Súčasné heslo nie je správne');
    await sendPasswordForm(page, { current: account.password, next: '1234567', again: '1234567' });
    await expect(alerts).toHaveText('Nové heslo musí mať aspoň 8 znakov');
    await sendPasswordForm(page, { current: account.password, next: 'a'.repeat(129), again: 'a'.repeat(129) });
    await expect(alerts).toHaveText('Nové heslo smie mať najviac 128 znakov');
    await sendPasswordForm(page, { current: account.password, next: newPassword, again: `${newPassword}!` });
    await expect(alerts).toHaveText('Zopakované heslo sa nezhoduje s novým heslom');
    // Nothing changed so far: the other sign-in still works.
    await otherPage.goto('/zakazky');
    await expect(otherPage).toHaveURL(/\/zakazky$/);

    await sendPasswordForm(page, { current: account.password, next: newPassword, again: newPassword });
    await expect(page.locator('main').getByRole('status')).toHaveText('Heslo bolo zmenené. Ostatné prihlásenia sú odhlásené.');
    await expect(alerts).toHaveCount(0);

    // The sign-in he is in stays, the other one ends.
    await page.goto('/zakazky');
    await expect(page).toHaveURL(/\/zakazky$/);
    await otherPage.goto('/zakazky');
    await expect(otherPage).toHaveURL(/\/login$/);
    await elsewhere.close();

    // The old password no longer signs in, the new one does.
    await page.getByRole('button', { name: 'Odhlásiť sa' }).click();
    await expect(page).toHaveURL(/\/login$/);
    await submitLogin(page, account.password, account.email);
    await expect(page.locator('main').getByRole('alert')).toHaveText('Nesprávny e-mail alebo heslo.');
    await signInAs(page, { email: account.email, password: newPassword });
  });
}
