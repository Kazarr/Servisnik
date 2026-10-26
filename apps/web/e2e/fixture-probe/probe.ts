import { test } from '../fixtures.ts';

// Two tests on the `page` fixture of fixtures.ts, run by fixtures.spec.ts, which reads how each ended.
// Not a *.spec.ts file, so the e2e run itself does not pick it up.
test('clean page', async ({ page }) => {
  await page.goto('about:blank');
});

test('page with a console error', async ({ page }) => {
  await page.goto('about:blank');

  const logged = page.waitForEvent('console');
  await page.evaluate(() => console.error('boom'));
  await logged;
});
