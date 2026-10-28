import { expect, runTag, signIn, test } from './fixtures.ts';
import { openDatabase, seedWorkOrder } from './records.ts';

let db: ReturnType<typeof openDatabase>;
test.beforeAll(() => {
  db = openDatabase();
});
test.afterAll(() => db.$client.end());

// All specs and workers share one database, hence one set of rates. These specs leave the VAT rates and the default as
// the migration made them (other specs expect 23 %) and set the same hourly rate every time, which no other spec reads.

test('the admin opens Nastavenia from the menu, sets the hourly rate, and the form for new work starts from it', async ({ page }) => {
  test.slow(); // the production build is shared by the workers; this one opens three pages and saves
  const order = await seedWorkOrder(db, runTag());
  await signIn(page);

  await page.getByRole('navigation', { name: 'Hlavné menu' }).getByRole('link', { name: 'Nastavenia' }).click();
  await expect(page).toHaveURL(/\/nastavenia$/);
  const main = page.locator('main');
  await expect(main.locator('h1')).toHaveText('Nastavenia');
  await expect(main.getByRole('heading', { level: 2, name: 'Sadzby' })).toBeVisible();
  await expect(page.getByLabel('Sadzby DPH (%), jedna na riadok')).toHaveValue('23\n19\n5');
  await expect(page.getByLabel('Predvolená sadzba DPH (%)')).toHaveValue('23');
  await expect(page.getByLabel('Prirážka na diely (%)')).toHaveValue('0');

  await page.getByLabel('Hodinová sadzba bez DPH (€; prázdna sa nepredvyplní)').fill('45,5');
  await main.getByRole('button', { name: 'Uložiť sadzby' }).click();
  await expect(main.getByRole('status')).toHaveText('Sadzby sú uložené.');
  await expect(page.getByLabel('Hodinová sadzba bez DPH (€; prázdna sa nepredvyplní)')).toHaveValue('45,50');
  await page.reload();
  await expect(page.getByLabel('Hodinová sadzba bez DPH (€; prázdna sa nepredvyplní)')).toHaveValue('45,50');

  // The form for new work starts with the default VAT rate and the hourly rate, and adds work at that price.
  await page.goto(`/zakazky/${order.orderId}`);
  await expect(page.getByLabel('Sadzba DPH (%)')).toHaveValue('23');
  await expect(page.getByLabel('Cena za jednotku bez DPH (€)')).toHaveValue('45,50');
  await page.getByLabel('Názov', { exact: true }).fill('Výmena oleja');
  await page.getByLabel('Množstvo (h)').fill('1');
  await page.getByRole('button', { name: 'Pridať prácu' }).click();
  await expect(main.getByRole('row', { name: /Výmena oleja/ }).getByRole('cell')).toHaveText(['Výmena oleja', '1 h', '45,50 €', '23 %', '45,50 €', '10,47 €', '55,97 €']);
  await expect(page.getByLabel('Cena za jednotku bez DPH (€)')).toHaveValue('45,50');
});

test('removing the default rate or the last one, or a rate twice, is refused with the reason and the rates stay as they were', async ({ page }) => {
  await signIn(page);
  await page.goto('/nastavenia');
  const main = page.locator('main');
  const vatRates = page.getByLabel('Sadzby DPH (%), jedna na riadok');
  const save = main.getByRole('button', { name: 'Uložiť sadzby' });

  // 23 is the default and is gone from the list.
  await vatRates.fill('19\n5');
  await save.click();
  await expect(page.getByLabel('Predvolená sadzba DPH (%)')).toHaveAccessibleDescription(
    'Predvolená sadzba musí byť v zozname. Ak ju chcete odobrať, vyberte najprv inú predvolenú.',
  );
  await expect(vatRates).toHaveValue('19\n5');
  await expect(main.getByRole('status')).toHaveCount(0);

  await vatRates.fill('');
  await save.click();
  await expect(vatRates).toHaveAccessibleDescription('Zadajte aspoň jednu sadzbu DPH');

  await vatRates.fill('23\n19\n23');
  await save.click();
  await expect(vatRates).toHaveAccessibleDescription('Sadzba DPH je v zozname dvakrát');

  await page.reload();
  await expect(vatRates).toHaveValue('23\n19\n5');
});
