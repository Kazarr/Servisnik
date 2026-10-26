import { expect, test } from '@playwright/test';
import { signIn } from './fixtures.ts';

// Plain `test`, not the one from fixtures.ts: Chromium logs the 404 of the navigation as a console
// error, which the page fixture would fail on, and this test asks for the 404 on purpose.
test('an unknown address shows the not-found page in Slovak and leads back to the Zákazky', async ({ page }) => {
  await signIn(page);

  const response = await page.goto('/taka-stranka-neexistuje');

  expect(response!.status()).toBe(404);
  await expect(page.locator('main h1')).toHaveText('Stránka sa nenašla');
  await page.getByRole('link', { name: 'Späť na zákazky' }).click();
  await expect(page).toHaveURL(/\/zakazky$/);
});
