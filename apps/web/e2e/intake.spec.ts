import { appCss, cssRgb, hexesOf, tokensOf } from '../test/support/css-tokens.ts';
import { detail, expect, fillIntake, fillVehicle, newIco, runTag, signIn, startWorkOrder, test, vinOf } from './fixtures.ts';

// The rules of the intake (km, atomicity, the owner, a taken VIN or IČO) are proven by the domain, the Data
// Access Layer and the parts of the form (apps/web/test); this is the path through the browser.

const tokens = tokensOf(appCss);
const colour = (name: string) => cssRgb(hexesOf(tokens[name]!)[0]!);

test('the admin takes in a new vehicle with a new customer from Zákazky in one form, and kilometres lower than its Stav km are warned of', async ({ page }) => {
  test.slow(); // sign-in, a long form and the pages after it; under --repeat-each the workers share one server
  const tag = runTag();
  const [owner, vin] = [`Nový Majiteľ Príjmu ${tag}`, vinOf(tag)];
  await signIn(page);
  const main = page.locator('main');

  await startWorkOrder(page);
  await main.getByRole('link', { name: 'Nové vozidlo' }).click();
  await main.getByRole('link', { name: 'Nový zákazník' }).click();
  await page.getByLabel('Firma', { exact: true }).check();
  await page.getByLabel('Názov (pri osobe meno a priezvisko)').fill(owner);
  await page.getByLabel('IČO', { exact: true }).fill(newIco());
  await fillVehicle(page, vin);
  await expect(page.getByLabel('Stav km')).toHaveCount(0); // the kilometres at intake are it
  await fillIntake(page, '45 000', 'Výmena oleja');

  await expect(page).toHaveURL(/\/zakazky\/[0-9a-f-]{36}$/);
  await expect(main.locator('h1')).toHaveText(/^Z\d{4}-\d{4}$/);
  await expect(detail(main, 'Stav')).toHaveText('Prijatá');
  await expect(detail(main, 'Zákazník')).toHaveText(owner);
  await expect(detail(main, 'Vozidlo')).toContainText('Škoda Octavia');
  await expect(detail(main, 'Vozidlo')).toContainText(vin);
  await expect(detail(main, 'Kilometre pri príjme')).toHaveText('45 000 km');

  // The new customer is the Majiteľ of the new vehicle, whose Stav km are the kilometres at intake.
  await main.getByRole('link', { name: 'Škoda Octavia' }).click();
  await expect(detail(main, 'Majiteľ').getByRole('link', { name: owner })).toBeVisible();
  await expect(detail(main, 'Stav km')).toHaveText('45 000 km');

  // The next Zákazka of that vehicle, with fewer kilometres, is saved, and the page says so instead of opening it.
  await startWorkOrder(page);
  await fillIntake(page, '40 000', 'Tachometer bol vymenený');
  const notice = main.getByRole('status');
  await expect(notice).toContainText('nižšie ako stav km vozidla (45 000 km)');
  await expect(notice.getByRole('link', { name: /^Z\d{4}-\d{4}$/ })).toBeVisible();
  // A notice is no error: its bar is the warning colour, not the danger colour of an error (ticket #145).
  await expect(notice).toHaveCSS('border-left-color', colour('--color-warning'));
  await expect(notice).not.toHaveCSS('border-left-color', colour('--color-danger'));
});
