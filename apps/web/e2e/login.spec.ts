import { expect, signIn, test } from './fixtures.ts';

const menuLabels = ['Zákazníci', 'Vozidlá', 'Zákazky'];

for (const path of ['/', '/zakaznici', '/vozidla', '/zakazky']) {
  test(`without a session ${path} leads to the login page`, async ({ page }) => {
    await page.goto(path);

    await expect(page).toHaveURL(/\/login$/);
    await expect(page.locator('main h1')).toHaveText('Prihlásenie');
  });
}

test('a wrong password keeps the user on the login page with a message', async ({ page }) => {
  await page.goto('/login');
  await page.getByLabel('E-mail').fill(process.env.E2E_ADMIN_EMAIL!);
  await page.getByLabel('Heslo').fill('nespravne-heslo');
  await page.getByRole('button', { name: 'Prihlásiť sa' }).click();

  await expect(page.getByRole('alert')).toHaveText('Nesprávny e-mail alebo heslo.');
  await expect(page).toHaveURL(/\/login$/);
  await expect(page.getByLabel('E-mail')).toHaveValue(process.env.E2E_ADMIN_EMAIL!);
});

test('the admin signs in, sees the menu on the left and signs out', async ({ page, context }) => {
  await signIn(page);

  const menu = page.getByRole('navigation', { name: 'Hlavné menu' });
  await expect(menu.getByRole('link')).toHaveText(menuLabels);
  const menuBox = await menu.boundingBox();
  const contentBox = await page.locator('main').boundingBox();
  expect(menuBox!.x + menuBox!.width).toBeLessThanOrEqual(contentBox!.x);

  await menu.getByRole('link', { name: 'Vozidlá' }).click();
  await expect(page).toHaveURL(/\/vozidla$/);
  await expect(page.locator('main h1')).toHaveText('Vozidlá');
  await expect(menu.getByRole('link', { name: 'Vozidlá' })).toHaveAttribute('aria-current', 'page');

  const signedInCookies = await context.cookies();
  await page.getByRole('button', { name: 'Odhlásiť sa' }).click();
  await expect(page).toHaveURL(/\/login$/);

  // Put the old cookie back: proxy.ts lets it through, so only the page's own check can turn it away.
  await context.addCookies(signedInCookies);
  await page.goto('/zakazky');
  await expect(page).toHaveURL(/\/login$/);
});

test('the layout stays usable at 768 px', async ({ page }) => {
  await page.setViewportSize({ width: 768, height: 1024 });
  await signIn(page);

  await expect(page.getByRole('navigation', { name: 'Hlavné menu' })).toBeInViewport({ ratio: 1 });
  await expect(page.locator('main')).toBeInViewport({ ratio: 1 });
  const overflows = await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth);
  expect(overflows).toBe(false);
});

test('/api/health answers 200 while the database is up', async ({ request }) => {
  const response = await request.get('/api/health');

  expect(response.status()).toBe(200);
  expect(await response.json()).toEqual({ status: 'ok' });
});
