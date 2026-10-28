import { test } from '../fixtures.ts';

// Tests on the `page` and `context` fixtures of fixtures.ts, run by fixtures.spec.ts, which reads how each ended.
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

test('second page of the context with a console error', async ({ page, context }) => {
  await page.goto('about:blank');
  const second = await context.newPage();
  await second.goto('about:blank');

  const logged = second.waitForEvent('console');
  await second.evaluate(() => console.error('boom on the second page'));
  await logged;
});
