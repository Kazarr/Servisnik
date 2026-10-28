import { randomBytes, randomInt } from 'node:crypto';
import type { Page } from '@playwright/test';
import { addCustomer, expect, signIn, test } from './fixtures.ts';

/** All specs share one database and an IČO is unique, so every run takes its own. */
const newIco = () => String(randomInt(10_000_000, 100_000_000));

const save = (page: Page) => page.getByRole('button', { name: 'Uložiť zákazníka' }).click();

test('the admin is told at the field what is wrong, and a second firma with the same IČO leads to the first', async ({ page }) => {
  const tag = randomBytes(3).toString('hex');
  const [firstName, secondName] = [`Prvá Firma ${tag}`, `Druhá Firma ${tag}`];
  const ico = newIco();
  const main = page.locator('main');
  const field = (label: string) => page.getByLabel(label, { exact: true });
  await signIn(page);
  await page.goto('/zakaznici/novy');
  await field('Firma').check();

  // A firma needs an IČO.
  await page.getByLabel('Názov').fill(firstName);
  await save(page);
  await expect(field('IČO')).toHaveAccessibleDescription('Vyplňte IČO firmy');

  // Every format is refused at its own field, and what was typed stays.
  await field('IČO').fill('1234567');
  await field('DIČ').fill('202012345');
  await field('IČ DPH').fill('2020123456');
  await field('PSČ').fill('8110');
  await field('E-mail').fill('info@firma');
  await save(page);
  await expect(field('IČO')).toHaveAccessibleDescription('IČO má mať presne 8 číslic');
  await expect(field('DIČ')).toHaveAccessibleDescription('DIČ má mať presne 10 číslic');
  await expect(field('IČ DPH')).toHaveAccessibleDescription(
    'IČ DPH začína kódom krajiny (2 veľké písmená) a pokračuje 2 až 12 písmenami alebo číslicami, napríklad SK2020123456',
  );
  await expect(field('PSČ')).toHaveAccessibleDescription('PSČ má mať presne 5 číslic');
  await expect(field('E-mail')).toHaveAccessibleDescription('Zadajte e-mail v tvare meno@domena.sk');
  await expect(field('IČO')).toHaveValue('1234567');
  await expect(page.getByLabel('Názov')).toHaveValue(firstName);

  // A Czech IČ DPH passes, and a PSČ with a space is stored without it.
  await field('IČO').fill(ico);
  await field('DIČ').fill('2020123456');
  await field('IČ DPH').fill('CZ12345678');
  await field('PSČ').fill('811 01');
  await field('E-mail').fill('info@firma.sk');
  await save(page);
  await expect(main.locator('h1')).toHaveText(firstName);
  for (const shown of [ico, '2020123456', 'CZ12345678', '81101', 'info@firma.sk']) await expect(main).toContainText(shown);
  const firstUrl = page.url();

  // A second firma with that IČO is not saved, and the form leads to the first.
  await page.goto('/zakaznici/novy');
  await field('Firma').check();
  await page.getByLabel('Názov').fill(secondName);
  await field('IČO').fill(ico);
  await save(page);
  await expect(field('IČO')).toHaveAccessibleDescription(`Firma s týmto IČO už existuje: ${firstName}`);
  await expect(main.getByRole('link', { name: secondName })).toHaveCount(0);
  await main.getByRole('link', { name: firstName }).click();
  await expect(page).toHaveURL(firstUrl);
});

test('the admin adds a firma with only a name and an IČO, and two customers with the same name', async ({ page }) => {
  const tag = randomBytes(3).toString('hex');
  const name = `Ján Novák ${tag}`;
  await signIn(page);

  await page.goto('/zakaznici/novy');
  await page.getByLabel('Firma', { exact: true }).check();
  await page.getByLabel('Názov').fill(name);
  await page.getByLabel('IČO', { exact: true }).fill(newIco());
  await save(page);
  await expect(page.locator('main h1')).toHaveText(name);
  const company = page.url();

  await addCustomer(page, name);
  expect(page.url()).not.toBe(company);
  await addCustomer(page, name);
});

test('the admin edits a customer, and a firma changed to an osoba loses its IČO, DIČ and IČ DPH', async ({ page }) => {
  const tag = randomBytes(3).toString('hex');
  const [oldName, newName] = [`Stará Firma ${tag}`, `Ján Novák ${tag}`];
  const ico = newIco();
  const main = page.locator('main');
  const field = (label: string) => page.getByLabel(label, { exact: true });
  await signIn(page);
  await page.goto('/zakaznici/novy');
  await field('Firma').check();
  await page.getByLabel('Názov').fill(oldName);
  await field('IČO').fill(ico);
  await field('DIČ').fill('2020123456');
  await field('IČ DPH').fill('SK2020123456');
  await field('Telefón').fill('0905 123 456');
  await field('Poznámka').fill('Platí v hotovosti');
  await save(page);
  await expect(main.locator('h1')).toHaveText(oldName);
  for (const shown of [ico, '2020123456', 'SK2020123456', '0905 123 456', 'Platí v hotovosti']) await expect(main).toContainText(shown);

  await main.getByRole('link', { name: 'Upraviť' }).click();
  await expect(main.locator('h1')).toHaveText('Upraviť zákazníka');
  await expect(field('Firma')).toBeChecked();
  await expect(page.getByLabel('Názov')).toHaveValue(oldName);
  await expect(field('IČO')).toHaveValue(ico);
  await expect(field('IČ DPH')).toHaveValue('SK2020123456');
  await expect(field('Poznámka')).toHaveValue('Platí v hotovosti');

  await field('Osoba').check();
  for (const label of ['IČO', 'DIČ', 'IČ DPH']) await expect(field(label)).toHaveCount(0);
  await page.getByLabel('Názov').fill(newName);
  await save(page);

  await expect(main.locator('h1')).toHaveText(newName);
  await expect(main).toContainText('Platí v hotovosti');
  for (const gone of [ico, '2020123456', 'SK2020123456']) await expect(main).not.toContainText(gone);

  // The IČO is free again.
  await page.goto('/zakaznici/novy');
  await field('Firma').check();
  await page.getByLabel('Názov').fill(`Nová Firma ${tag}`);
  await field('IČO').fill(ico);
  await save(page);
  await expect(main.locator('h1')).toHaveText(`Nová Firma ${tag}`);
});
