import { expect, test } from '@playwright/test';
import { watchPage } from './page-problems.ts';

// The `page` fixture of fixtures.ts is a check, so it gets its own test (testing-strategy). Plain `test`,
// because the fixture would fail these tests, and each asserts the exact list the fixture would fail on.
// The 5xx rule alone is tested in test/e2e-checks.test.ts: Chromium also logs a failed response as a
// console error, so a real 5xx always reports twice.
test.describe('the page fixture reports', () => {
  test('nothing for a clean page', async ({ page }) => {
    const problems = watchPage(page);

    await page.goto('/login');

    expect(problems).toEqual([]);
  });

  test('a console error', async ({ page }) => {
    const problems = watchPage(page);
    await page.goto('/login');

    await page.evaluate(() => console.error('boom'));

    await expect.poll(() => problems).toEqual(['console.error: boom']);
  });

  test('an uncaught page exception', async ({ page }) => {
    const problems = watchPage(page);
    await page.goto('/login');

    await page.evaluate(() => setTimeout(() => {
      throw new Error('boom');
    }));

    await expect.poll(() => problems).toEqual(['pageerror: boom']);
  });

  test('an HTTP 5xx', async ({ page, baseURL }) => {
    const problems = watchPage(page);
    await page.route('**/api/health', (route) => route.fulfill({ status: 503, body: 'down' }));

    await page.goto('/api/health');

    await expect
      .poll(() => problems)
      .toEqual([
        `HTTP 503: ${baseURL}/api/health`,
        'console.error: Failed to load resource: the server responded with a status of 503 (Service Unavailable)',
      ]);
  });
});
