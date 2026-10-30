import { endSessionBehindThePage, expect, signIn, submitLogin, test } from './fixtures.ts';

const menuLabels = ['Zákazníci', 'Vozidlá', 'Zákazky', 'Cenník', 'Nastavenia'];

for (const path of ['/', '/zakaznici', '/vozidla', '/zakazky', '/nastavenia']) {
  test(`without a session ${path} leads to the login page`, async ({ page }) => {
    await page.goto(path);

    await expect(page).toHaveURL(/\/login$/);
    await expect(page.locator('main h1')).toHaveText('Prihlásenie');
  });
}

test('a wrong password keeps the user on the login page with a message', async ({ page }) => {
  await submitLogin(page, 'nespravne-heslo');

  await expect(page.locator('main').getByRole('alert')).toHaveText('Nesprávny e-mail alebo heslo.');
  await expect(page).toHaveURL(/\/login$/);
  await expect(page.getByLabel('E-mail')).toHaveValue(process.env.E2E_ADMIN_EMAIL!);
});

// Better Auth's default: 3 attempts in 10 seconds from one client address (test/attempt-limit.test.ts
// proves the rule, with the reset after 10 seconds); this proves the Server Action shows it.
test('the fourth attempt to sign in within 10 seconds is refused with a message, even with the right password', async ({ page }) => {
  const alert = page.locator('main').getByRole('alert');
  for (let attempt = 0; attempt < 3; attempt++) {
    await submitLogin(page, 'nespravne-heslo');
    await expect(alert).toHaveText('Nesprávny e-mail alebo heslo.');
  }

  await submitLogin(page);

  await expect(alert).toHaveText('Príliš veľa pokusov. Skúste to znova o chvíľu.');
  await expect(page).toHaveURL(/\/login$/);
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

  // Put the old cookie back: proxy.ts lets it through, so the session check in the app itself must refuse it.
  await context.addCookies(signedInCookies);
  await page.goto('/zakazky');
  await expect(page).toHaveURL(/\/login$/);
});

// The app is shown as Garage24Hub (ticket #156): in the title of every page, and as a quiet "powered by" on the login page and at the
// bottom of the menu, whether or not the autoservis has a logo (the logo spec has the menu without one).
test('the title, the login page and the menu name Garage24Hub', async ({ page }) => {
  await page.goto('/login');
  await expect(page).toHaveTitle('Prihlásenie – Garage24Hub');
  await expect(page.locator('main .powered-by')).toHaveText('powered by Garage24Hub');
  await expect(page.locator('body')).not.toContainText('Servisník');

  await signIn(page);
  await expect(page).toHaveTitle('Zákazky – Garage24Hub');
  await expect(page.locator('.sidebar .powered-by')).toHaveText('powered by Garage24Hub');
  await expect(page.locator('.sidebar')).not.toContainText('Servisník');
});

// Forced colors replace the background that marks the current item, so something else must mark it.
test('the current menu item is marked by an outline that forced colors keep', async ({ page }) => {
  await page.emulateMedia({ forcedColors: 'active' });
  await signIn(page);

  const menu = page.getByRole('navigation', { name: 'Hlavné menu' });
  const outline = (name: string) =>
    menu.getByRole('link', { name }).evaluate((link) => {
      const { outlineStyle, outlineWidth } = getComputedStyle(link);
      return { outlineStyle, outlineWidth };
    });
  const width = await page.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue('--border-width-strong').trim());

  expect(await outline('Zákazky')).toEqual({ outlineStyle: 'solid', outlineWidth: width });
  expect((await outline('Vozidlá')).outlineStyle).toBe('none');
});

test('a page checks the session itself when the user navigates from inside the app', async ({ page, browser, baseURL }) => {
  await signIn(page);

  await endSessionBehindThePage(page, browser, baseURL);

  // The layout does not run again on this navigation, the proxy sees a cookie: only the page can refuse.
  await page.getByRole('navigation', { name: 'Hlavné menu' }).getByRole('link', { name: 'Vozidlá' }).click();
  await expect(page).toHaveURL(/\/login$/);
});

test('the layout stays usable at 768 px', async ({ page }) => {
  await page.setViewportSize({ width: 768, height: 1024 });
  await signIn(page);

  await expect(page.getByRole('navigation', { name: 'Hlavné menu' })).toBeInViewport({ ratio: 1 });
  // The heading: the Zákazky list below it grows with every spec's data.
  await expect(page.locator('main h1')).toBeInViewport({ ratio: 1 });
  const overflows = await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth);
  expect(overflows).toBe(false);
});

test('/api/health answers 200 while the database is up', async ({ request }) => {
  const response = await request.get('/api/health');

  expect(response.status()).toBe(200);
  expect(await response.json()).toEqual({ status: 'ok' });
});
