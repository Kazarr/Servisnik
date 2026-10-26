import { expect, test as base, type Page } from '@playwright/test';

export { expect };

/**
 * `page` that fails its test on a console error, an uncaught page exception or an HTTP 5xx.
 * Chromium also logs every failed response as a console error, so the 5xx rule overlaps with the
 * first one; it stays because it names the status and URL.
 */
export const test = base.extend({
  page: async ({ page }, use) => {
    const problems: string[] = [];
    page.on('console', (message) => {
      if (message.type() === 'error') problems.push(`console.error: ${message.text()}`);
    });
    page.on('pageerror', (error) => problems.push(`pageerror: ${error.message}`));
    page.on('response', (response) => {
      if (response.status() >= 500) problems.push(`HTTP ${response.status()}: ${response.url()}`);
    });

    await use(page);

    expect(problems, 'the page reported errors').toEqual([]);
  },
});

/** Signs in as the admin the global setup seeded and waits for the first page after the login. */
export async function signIn(page: Page) {
  await page.goto('/login');
  await page.getByLabel('E-mail').fill(process.env.E2E_ADMIN_EMAIL!);
  await page.getByLabel('Heslo').fill(process.env.E2E_ADMIN_PASSWORD!);
  await page.getByRole('button', { name: 'Prihlásiť sa' }).click();
  await expect(page).toHaveURL(/\/zakazky$/);
}
