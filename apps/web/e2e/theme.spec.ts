import { appCss, cssRgb, hexesOf, tokensOf, translucentOf } from '../test/support/css-tokens.ts';
import { expect, signIn, test } from './fixtures.ts';

// The demo theme (ticket #150): black glossy pages, white text in Outfit and a gold accent. The values are the tokens of
// globals.css, read from the file, so a new shade changes the CSS and this spec follows. The theme touches no data and no row
// that specs share, so the specs here may run beside any other.

const tokens = tokensOf(appCss);
const colour = (name: string) => cssRgb(hexesOf(tokens[name]!)[0]!);
/** Whether a computed `background-image` is the gradient the token names: a gradient, through every colour that the token lists. */
const paints = (computed: string, name: string) => /gradient\(/.test(computed) && hexesOf(tokens[name]!).every((rgb) => computed.includes(cssRgb(rgb)));
const styleOf = (page: import('@playwright/test').Page, selector: string, property: string) =>
  page.locator(selector).first().evaluate((element, property) => getComputedStyle(element).getPropertyValue(property), property);

test('the login page is black and glossy with white text, set in Outfit that the app serves itself', async ({ page }) => {
  const fontRequests: string[] = [];
  page.on('request', (request) => request.resourceType() === 'font' && fontRequests.push(request.url()));
  await page.goto('/login');
  await page.evaluate(() => document.fonts.ready);

  const body = page.locator('body');
  await expect(body).toHaveCSS('background-color', colour('--color-background'));
  await expect(body).toHaveCSS('color', colour('--color-text'));
  await expect(body).toHaveCSS('background-attachment', 'fixed');
  expect(paints(await styleOf(page, 'body', 'background-image'), '--gloss-background')).toBe(true);

  // `document.fonts.check()` is true for a family nobody declared, so the faces that were loaded are read, and where from.
  const loaded = await page.evaluate(() => [...document.fonts].filter((face) => face.status === 'loaded').map(({ family, weight }) => ({ family, weight })));
  expect(loaded.length).toBeGreaterThan(0);
  for (const { family } of loaded) expect(family).toMatch(/Outfit/);
  expect(loaded.map(({ weight }) => weight)).toEqual(expect.arrayContaining(['400', '800'])); // the text and the title
  expect(await styleOf(page, 'body', 'font-family')).toMatch(/Outfit/);
  expect(fontRequests.length).toBeGreaterThan(0);
  for (const url of fontRequests) expect(new URL(url).origin, url).toBe(new URL(page.url()).origin);
});

test('a page of the app has glossy surfaces, gold buttons and a current menu item, and the headings are heavy', async ({ page }) => {
  await signIn(page);
  await page.evaluate(() => document.fonts.ready);

  expect(paints(await styleOf(page, '.sidebar', 'background-image'), '--gloss-surface')).toBe(true);
  const { rgb, alpha } = translucentOf(tokens['--gloss-highlight']!)[0]!; // the light edge on top of a surface
  expect(await styleOf(page, '.sidebar', 'box-shadow')).toContain(`rgba(${rgb.join(', ')}, ${alpha})`);
  expect(await styleOf(page, 'main h1', 'font-weight')).toBe('800');
  const signOut = page.getByRole('button', { name: 'Odhlásiť sa' });
  expect(paints(await signOut.evaluate((button) => getComputedStyle(button).backgroundImage), '--gloss-accent')).toBe(true);
  await expect(signOut).toHaveCSS('color', colour('--color-accent-text'));
  const current = page.getByRole('navigation', { name: 'Hlavné menu' }).locator('[aria-current="page"]');
  expect(paints(await current.evaluate((link) => getComputedStyle(link).backgroundImage), '--gloss-accent')).toBe(true);
  // A link has the gold of the accent, not the blue a browser gives it, which cannot be read on black.
  await page.goto('/nastavenia');
  await expect(page.locator('main section a').first()).toHaveCSS('color', colour('--color-accent'));
});
