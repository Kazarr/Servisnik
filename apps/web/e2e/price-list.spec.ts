import type { Locator } from '@playwright/test';
import { createPriceListItem } from '../src/dal/price-list.ts';
import { idOf } from '../test/support/id-of.ts';
import { expect, runTag, searchPriceList, signIn, test } from './fixtures.ts';
import { admin, openDatabase, seedWorkOrder } from './records.ts';

let db: ReturnType<typeof openDatabase>;
test.beforeAll(() => {
  db = openDatabase();
});
test.afterAll(() => db.$client.end());

/** The value next to a label in the detail list of a page. */
const detail = (main: Locator, label: string) => main.locator('.details > div').filter({ hasText: new RegExp(`^${label}`) }).locator('dd');

test('the admin adds a Diel to the Cenník with a Prirážka, finds it without diacritics and adds it to a Zákazka, where a later change of the Cenník leaves it alone', async ({ page }) => {
  test.slow(); // a seeded work order, two forms of the Cenník, a search and a click on a Zákazka; under --repeat-each the workers share one server
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
  await expect(form.getByLabel('Jednotka')).toHaveValue('ks');
  await expect(form.getByLabel('Množstvo')).toHaveCount(0);
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

  // "brzdova" finds "Brzdová", and so does the code in the other case. The list shows what the admin needs to know the item.
  const rows = main.locator('tbody tr');
  await searchPriceList(page, `brzdova ${tag}`);
  await expect(rows).toHaveCount(1);
  await expect(rows.first().getByRole('cell')).toHaveText(['Diel', code, name, 'ks', '20,00 €', '30,00 €', '23 %', /Upraviť/]);
  await searchPriceList(page, code.toLowerCase());
  await expect(rows).toHaveCount(1);
  await expect(rows.first()).toContainText(name);

  // A code is unique whatever its case: the second form stays, with the reason at the code and what was typed.
  await main.getByRole('link', { name: 'Pridať diel' }).click();
  const again = page.getByRole('form', { name: 'Pridať diel do cenníka' });
  await again.getByLabel('Kód').fill(code.toLowerCase());
  await again.getByLabel('Názov', { exact: true }).fill(`Iná doštička ${tag}`);
  await again.getByLabel('Predajná cena za jednotku bez DPH (€)').fill('5');
  await again.getByRole('button', { name: 'Pridať do cenníka' }).click();
  await expect(again.getByLabel('Kód')).toHaveAccessibleDescription(`Tento kód už má položka „${name}“`);
  await expect(again.getByLabel('Názov', { exact: true })).toHaveValue(`Iná doštička ${tag}`);
  await expect(page).toHaveURL(/\/cennik\/nova\/diel$/);

  // On a Zákazka the admin searches the Cenník and adds the item with one click: it is an item of quantity 1 with the values of the Cenník.
  await page.goto(`/zakazky/${order.orderId}`);
  await searchPriceList(page, `${tag} dosticka`);
  const results = main.getByRole('table', { name: 'Výsledky hľadania v cenníku' });
  await expect(results.getByRole('row', { name: new RegExp(code) })).toHaveCount(1);
  await results.getByRole('button', { name: `Pridať ${name}` }).click();
  const items = main.getByRole('table', { name: 'Položky zákazky' });
  const item = items.getByRole('row', { name: new RegExp(code) });
  await expect(item.getByRole('cell')).toHaveText([code, name, '1 ks', '20,00 €', '30,00 €', '23 %', '30,00 €', '6,90 €', '36,90 €', /Upraviť/]);
  await expect(detail(main, 'Marža')).toHaveText('10,00 € (33,3 %)');

  // Changing the item in the Cenník, and then deleting it, leaves the Zákazka as it is.
  await page.goto('/cennik');
  await searchPriceList(page, code);
  await rows.first().getByRole('link', { name: 'Upraviť' }).click();
  await expect(main.locator('h1')).toHaveText('Upraviť položku cenníka');
  await page.getByLabel('Názov', { exact: true }).fill(`${name} nová`);
  await page.getByLabel('Predajná cena za jednotku bez DPH (€)').fill('99');
  await page.getByRole('button', { name: 'Uložiť zmeny' }).click();
  await expect(page).toHaveURL(/\/cennik$/);
  await searchPriceList(page, `${tag} doštička nová`);
  await expect(rows.first().getByRole('cell')).toHaveText(['Diel', code, `${name} nová`, 'ks', '20,00 €', '99,00 €', '23 %', /Upraviť/]);
  await main.getByRole('button', { name: `Zmazať ${name} nová` }).click();
  await expect(rows).toHaveCount(0);

  await page.goto(`/zakazky/${order.orderId}`);
  await expect(item.getByRole('cell')).toHaveText([code, name, '1 ks', '20,00 €', '30,00 €', '23 %', '30,00 €', '6,90 €', '36,90 €', /Upraviť/]);
  await expect(detail(main, 'Marža')).toHaveText('10,00 € (33,3 %)');
});

test('the admin adds a Práca to the Cenník in hours and deletes it, and the list of the Cenník is 25 to a page', async ({ page }) => {
  test.slow(); // 26 items are saved before the pages are read; under --repeat-each the workers share one server
  const tag = runTag();
  // Named so that the list, which is by name, holds them in this order; the code is none, which any number of items may have.
  const names = Array.from({ length: 26 }, (_, i) => `Položka ${tag} ${String(i + 1).padStart(2, '0')}`);
  for (const name of names) idOf(await createPriceListItem(admin, { kind: 'part', name, unitPrice: '1' }, db));
  const main = page.locator('main');
  const rows = main.locator('tbody tr');
  await signIn(page);
  await page.goto('/cennik');

  await searchPriceList(page, `položka ${tag}`);
  await expect(rows).toHaveCount(25);
  await expect(rows.first()).toContainText(names[0]!);
  await expect(main).toContainText('Strana 1 z 2');
  await expect(main.getByRole('link', { name: 'Predchádzajúca' })).toHaveCount(0);
  await main.getByRole('link', { name: 'Nasledujúca' }).click();
  await expect(rows).toHaveCount(1);
  await expect(rows.first()).toContainText(names[25]!);
  await expect(main).toContainText('Strana 2 z 2');
  await expect(page.getByLabel('Hľadať v cenníku')).toHaveValue(`položka ${tag}`);
  await expect(page).toHaveURL(/strana=2/);

  // A Práca is in hours, has no Nákupná cena and no Prirážka, and its price is typed.
  const labour = `Výmena oleja ${tag}`;
  await page.goto('/cennik');
  await main.getByRole('link', { name: 'Pridať prácu' }).click();
  const form = page.getByRole('form', { name: 'Pridať prácu do cenníka' });
  await expect(form.getByLabel('Jednotka')).toHaveValue('h');
  await expect(form.getByLabel('Nákupná cena za jednotku bez DPH (€)')).toHaveCount(0);
  await expect(form.getByLabel('Prirážka (%)')).toHaveCount(0);
  await form.getByLabel('Názov', { exact: true }).fill(labour);
  await form.getByLabel('Predajná cena za jednotku bez DPH (€)').fill('40');
  await form.getByRole('button', { name: 'Pridať do cenníka' }).click();
  await expect(page).toHaveURL(/\/cennik$/);
  await searchPriceList(page, labour);
  await expect(rows).toHaveCount(1);
  await expect(rows.first().getByRole('cell')).toHaveText(['Práca', '', labour, 'h', '—', '40,00 €', '23 %', /Upraviť/]);

  await main.getByRole('button', { name: `Zmazať ${labour}` }).click();
  await expect(rows).toHaveCount(0);
  await expect(main).toContainText(`Nič sa nenašlo pre „${labour}“.`);
});
