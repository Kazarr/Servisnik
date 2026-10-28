import { expect, runTag, signIn, test } from './fixtures.ts';

// All specs and workers share one database, hence one set of Údaje autoservisu. Only this file writes them, in order in one worker,
// and the first test fills in every field, so what it saves does not depend on what an earlier run left.

const label = {
  name: 'Názov autoservisu',
  street: 'Ulica',
  city: 'Mesto',
  postalCode: 'PSČ',
  ico: 'IČO',
  dic: 'DIČ',
  icDph: 'IČ DPH',
  vatPayerType: 'Platiteľ DPH',
  iban: 'IBAN',
  phone: 'Telefón',
  email: 'E-mail',
  commercialRegister: 'Zápis v obchodnom registri',
} as const;

test('the admin fills in Údaje autoservisu, saves them, and they are there after a reload, tidied up as the domain stores them', async ({ page }) => {
  const name = `Autoservis ${runTag()}`;
  await signIn(page);
  await page.getByRole('navigation', { name: 'Hlavné menu' }).getByRole('link', { name: 'Nastavenia' }).click();
  const main = page.locator('main');
  await expect(main.getByRole('heading', { level: 2, name: 'Údaje autoservisu' })).toBeVisible();

  await page.getByLabel(label.name, { exact: true }).fill(name);
  await page.getByLabel(label.street, { exact: true }).fill('Hlavná 1');
  await page.getByLabel(label.city, { exact: true }).fill('Bratislava');
  await page.getByLabel(label.postalCode, { exact: true }).fill('811 01');
  await page.getByLabel(label.ico, { exact: true }).fill('12345678');
  await page.getByLabel(label.dic, { exact: true }).fill('2020123456');
  await page.getByLabel(label.icDph, { exact: true }).fill('SK2020123456');
  await page.getByLabel(label.vatPayerType, { exact: true }).selectOption('Registrovaný podľa §7');
  await page.getByLabel(label.iban, { exact: true }).fill('sk31 1200 0000 1987 4263 7541');
  await page.getByLabel(label.phone, { exact: true }).fill('+421 905 123 456');
  await page.getByLabel(label.email, { exact: true }).fill('info@novak.sk');
  await page.getByLabel(label.commercialRegister, { exact: true }).fill('Okresný súd Bratislava I, oddiel Sro, vložka 12345/B');
  await main.getByRole('button', { name: 'Uložiť údaje autoservisu' }).click();

  await expect(main.getByRole('status')).toHaveText('Údaje autoservisu sú uložené.');
  const stored = async () => {
    await expect(page.getByLabel(label.name, { exact: true })).toHaveValue(name);
    await expect(page.getByLabel(label.postalCode, { exact: true })).toHaveValue('81101');
    await expect(page.getByLabel(label.vatPayerType, { exact: true })).toHaveValue('section7');
    await expect(page.getByLabel(label.iban, { exact: true })).toHaveValue('SK3112000000198742637541');
    await expect(page.getByLabel(label.commercialRegister, { exact: true })).toHaveValue('Okresný súd Bratislava I, oddiel Sro, vložka 12345/B');
  };
  await stored();
  await page.reload();
  await stored();
});

test('values that break a rule are refused next to their fields, and everything typed stays in the form', async ({ page }) => {
  await signIn(page);
  await page.goto('/nastavenia');
  const main = page.locator('main');
  const field = (name: keyof typeof label) => page.getByLabel(label[name], { exact: true });
  const savedName = await field('name').inputValue();

  await field('name').fill('');
  await field('street').fill('Dlhá 2');
  await field('postalCode').fill('8110');
  await field('ico').fill('1234567');
  await field('dic').fill('202012345');
  await field('icDph').fill('SK');
  await field('vatPayerType').selectOption('Platiteľ');
  await field('iban').fill('SK3112000000198742637542');
  await field('email').fill('info@novak');
  await main.getByRole('button', { name: 'Uložiť údaje autoservisu' }).click();

  await expect(field('name')).toHaveAccessibleDescription('Vyplňte názov autoservisu');
  await expect(field('postalCode')).toHaveAccessibleDescription('PSČ má mať presne 5 číslic');
  await expect(field('ico')).toHaveAccessibleDescription('IČO má mať presne 8 číslic');
  await expect(field('dic')).toHaveAccessibleDescription('DIČ má mať presne 10 číslic');
  await expect(field('icDph')).toHaveAccessibleDescription(/^IČ DPH začína kódom krajiny/);
  await expect(field('iban')).toHaveAccessibleDescription(/^IBAN nie je platný/);
  await expect(field('email')).toHaveAccessibleDescription('Zadajte e-mail v tvare meno@domena.sk');
  await expect(main.getByRole('status')).toHaveCount(0);
  // What was typed is still there, the select too.
  await expect(field('street')).toHaveValue('Dlhá 2');
  await expect(field('postalCode')).toHaveValue('8110');
  await expect(field('iban')).toHaveValue('SK3112000000198742637542');
  await expect(field('vatPayerType')).toHaveValue('payer');

  // A platiteľ DPH with no IČ DPH is told that, and nothing was saved.
  await field('name').fill('Autoservis bez IČ DPH');
  await field('postalCode').fill('');
  await field('ico').fill('');
  await field('dic').fill('');
  await field('iban').fill('');
  await field('email').fill('');
  await field('icDph').fill('');
  await main.getByRole('button', { name: 'Uložiť údaje autoservisu' }).click();
  await expect(field('icDph')).toHaveAccessibleDescription('Platiteľ DPH musí mať IČ DPH');
  await expect(field('name')).toHaveValue('Autoservis bez IČ DPH');

  await page.reload();
  await expect(field('name')).toHaveValue(savedName);
});
