import { detail, expect, runTag, searchPriceList, signIn, test } from './fixtures.ts';
import { openDatabase, seedWorkOrder } from './records.ts';

let db: ReturnType<typeof openDatabase>;
test.beforeAll(() => {
  db = openDatabase();
});
test.afterAll(() => db.$client.end());

// One path through the Cenník, as the walking skeleton has one through the Zákazka. The rules behind it (a unique code,
// the copy that a later change of the Cenník leaves alone, the pages, the VAT rate) are tested in the DAL and the domain.
test('the admin adds a Diel to the Cenník with a Prirážka, finds it without diacritics and adds it to a Zákazka with one click', async ({ page }) => {
  test.slow(); // a seeded work order, a form of the Cenník, two searches and a click on a Zákazka; under --repeat-each the workers share one server
  // All specs share one database and a code is unique, so this one carries a tag in its code and its name.
  const tag = runTag();
  const order = await seedWorkOrder(db, tag);
  const [code, name] = [`BR-${tag.toUpperCase()}`, `Brzdová ${tag} doštička`];
  const main = page.locator('main');
  await signIn(page);
  await page.getByRole('navigation', { name: 'Hlavné menu' }).getByRole('link', { name: 'Cenník' }).click();
  await expect(main.locator('h1')).toHaveText('Cenník');

  // A Diel: the Nákupná cena and the Prirážka make the Predajná cena, as on a Zákazka. Typing before the page is interactive is lost, so this retries.
  await main.getByRole('link', { name: 'Pridať diel' }).click();
  const form = page.getByRole('form', { name: 'Pridať diel do cenníka' });
  const purchasePrice = form.getByLabel('Nákupná cena za jednotku bez DPH (€)');
  const markup = form.getByLabel('Prirážka (%)');
  const salePrice = form.getByLabel('Predajná cena za jednotku bez DPH (€)');
  await form.getByLabel('Kód').fill(code);
  await form.getByLabel('Názov', { exact: true }).fill(name);
  await expect(async () => {
    await purchasePrice.fill('20');
    await expect(salePrice).toHaveValue('20,00', { timeout: 1000 });
  }).toPass();
  await markup.fill('50');
  await expect(salePrice).toHaveValue('30,00');
  await form.getByRole('button', { name: 'Pridať do cenníka' }).click();
  await expect(page).toHaveURL(/\/cennik$/);

  // "brzdova" finds "Brzdová". The list shows what the admin needs to know the item.
  const rows = main.locator('tbody tr');
  await searchPriceList(page, `brzdova ${tag}`);
  await expect(rows).toHaveCount(1);
  await expect(rows.first().getByRole('cell')).toHaveText(['Diel', code, name, 'ks', '20,00 €', '30,00 €', '23 %', /Upraviť/]);

  // On a Zákazka the admin searches the Cenník and adds the item with one click: it is an item of quantity 1 with the values of the Cenník.
  await page.goto(`/zakazky/${order.orderId}`);
  await searchPriceList(page, `${tag} dosticka`);
  const results = main.getByRole('table', { name: 'Výsledky hľadania v cenníku' });
  await expect(results.getByRole('row', { name: new RegExp(code) })).toHaveCount(1);
  await results.getByRole('button', { name: `Pridať ${name}` }).click();
  const item = main.getByRole('table', { name: 'Položky zákazky' }).getByRole('row', { name: new RegExp(code) });
  await expect(item.getByRole('cell')).toHaveText([code, name, '1 ks', '20,00 €', '30,00 €', '23 %', '30,00 €', '6,90 €', '36,90 €', /Upraviť/]);
  await expect(detail(main, 'Marža')).toHaveText('10,00 € (33,3 %)');
});
