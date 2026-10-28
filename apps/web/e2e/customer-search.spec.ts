import { randomInt } from 'node:crypto';
import { addCustomer, expect, newIco, runTag, searchCustomers as search, signIn, test } from './fixtures.ts';

test('the admin finds a customer by a part of the name, the IČO, the e-mail or the phone, however they are written', async ({ page }) => {
  test.slow(); // two customers added through the form, then a dozen searches; under --repeat-each the workers share one server
  // All specs share one database, so every customer carries a tag and the checks look for it.
  const tag = runTag();
  const person = `Ján Novák ${tag}`;
  const company = `Autodoprava Kováč ${tag}`;
  const ico = newIco();
  const digits = String(randomInt(100_000_000, 1_000_000_000)); // nine digits, as after +421
  const main = page.locator('main');
  const rows = main.getByRole('link', { name: tag });
  await signIn(page);
  await addCustomer(page, person, 'Osoba', undefined, { phone: `+421 ${digits}`, email: `jan.${tag}@gmail.com` });
  await addCustomer(page, company, 'Firma', ico);

  await page.getByRole('navigation', { name: 'Hlavné menu' }).getByRole('link', { name: 'Zákazníci' }).click();

  // The name, in any case and without diacritics.
  await search(page, `novak ${tag}`);
  await expect(rows).toHaveText([person]);
  await search(page, `AUTODOPRAVA kovac ${tag}`);
  await expect(rows).toHaveText([company]);

  // A part of the IČO finds the firma, and the list shows what the admin searched by.
  await search(page, ico.slice(1, 7));
  await expect(main.getByRole('row', { name: new RegExp(company) })).toContainText(ico);

  // A part of the e-mail.
  await search(page, `jan.${tag}@`);
  await expect(rows).toHaveText([person]);
  await expect(main.getByRole('row', { name: new RegExp(person) })).toContainText(`jan.${tag}@gmail.com`);

  // The phone, stored as +421 and searched the way it is dictated.
  await search(page, `0${digits.slice(0, 3)} ${digits.slice(3, 6)} ${digits.slice(6)}`);
  await expect(main.getByRole('row', { name: new RegExp(person) })).toContainText(`+421 ${digits}`);

  // Nobody found says so, and the field keeps what was typed.
  await search(page, `nikto ${tag}`);
  await expect(main).toContainText(`Nič sa nenašlo pre „nikto ${tag}“.`);
  await expect(page.getByLabel('Hľadať zákazníka')).toHaveValue(`nikto ${tag}`);

  // A row leads to the customer.
  await search(page, `novak ${tag}`);
  await rows.click();
  await expect(main.locator('h1')).toHaveText(person);
});

test('the list is alphabetical, 25 to a page, and the pages of a search stay in the search', async ({ page }) => {
  test.slow(); // 26 customers are added through the form
  const tag = runTag();
  const names = Array.from({ length: 26 }, (_, i) => `Pager ${tag} ${String(i + 1).padStart(2, '0')}`);
  const main = page.locator('main');
  const rows = main.getByRole('link', { name: tag });
  await signIn(page);
  for (const name of [...names].reverse()) await addCustomer(page, name); // not in the order of the list

  await page.goto('/zakaznici');
  await search(page, `pager ${tag}`);
  await expect(rows).toHaveText(names.slice(0, 25));
  await expect(main).toContainText('Strana 1 z 2');
  await expect(main.getByRole('link', { name: 'Predchádzajúca' })).toHaveCount(0);

  await main.getByRole('link', { name: 'Nasledujúca' }).click();
  await expect(rows).toHaveText([names[25]!]);
  await expect(main).toContainText('Strana 2 z 2');
  await expect(main.getByRole('link', { name: 'Nasledujúca' })).toHaveCount(0);
  await expect(page.getByLabel('Hľadať zákazníka')).toHaveValue(`pager ${tag}`);
  await expect(page).toHaveURL(/strana=2/);

  await main.getByRole('link', { name: 'Predchádzajúca' }).click();
  await expect(rows).toHaveText(names.slice(0, 25));
  await expect(main).toContainText('Strana 1 z 2');
});
