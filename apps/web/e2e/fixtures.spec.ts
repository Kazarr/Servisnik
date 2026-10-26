import { test } from './fixtures.ts';

// The `page` fixture is a check, so it gets its own test (testing-strategy): each scenario below must
// make a test fail, and test.fail() turns that failure into a pass. A clean page passing is
// shown by every spec that uses the fixture. The 5xx scenario also trips the console rule (see
// fixtures.ts), so it does not prove the 5xx rule alone.
test.describe('the page fixture fails a test on', () => {
  test.fail('a console error', async ({ page }) => {
    await page.goto('/login');
    await page.evaluate(() => console.error('boom'));
  });

  test.fail('an uncaught page exception', async ({ page }) => {
    await page.goto('/login');
    const thrown = page.waitForEvent('pageerror');
    await page.evaluate(() => {
      setTimeout(() => {
        throw new Error('boom');
      });
    });
    await thrown;
  });

  test.fail('an HTTP 5xx', async ({ page }) => {
    await page.route('**/api/health', (route) => route.fulfill({ status: 503, body: 'down' }));
    await page.goto('/api/health');
  });
});
