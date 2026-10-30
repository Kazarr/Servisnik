import type { Locator, Page } from '@playwright/test';
import { detail, expect, runTag, signIn, test } from './fixtures.ts';

// One path through the Jazda radosti, as the ticket (#153) lists what the admin shows at the demo: he opens the section, sets the Ročník, adds Registrácie,
// changes one, approves one and filters the list. The rules behind it (what a Ročník and a Registrácia need, the counts, the filter, who may do it)
// are tested in the domain and the DAL. All specs share one database and there is one current Ročník, so the Registrácie of this spec carry a tag.

/** Adds a Registrácia through the form, from the list of the Jazda radosti, and waits until the list is shown again. */
async function register(page: Page, fields: { name: string; phone: string; email: string; make: string; model: string; licensePlate?: string; category: string }) {
  await page.locator('main').getByRole('link', { name: 'Pridať registráciu' }).click();
  await page.getByLabel('Meno a priezvisko').fill(fields.name);
  await page.getByLabel('Telefón').fill(fields.phone);
  await page.getByLabel('E-mail', { exact: true }).fill(fields.email);
  await page.getByLabel('Značka', { exact: true }).fill(fields.make);
  await page.getByLabel('Model', { exact: true }).fill(fields.model);
  if (fields.licensePlate) await page.getByLabel('ŠPZ').fill(fields.licensePlate);
  await page.getByLabel('Kategória').selectOption({ label: fields.category });
  await page.getByRole('button', { name: 'Uložiť registráciu' }).click();
  await expect(page).toHaveURL(/\/jazda-radosti$/);
}

/** What the cell of the contact says: the phone, then the e-mail, which the page puts on two lines. */
const contactOf = ({ phone, email }: { phone: string; email: string }) => new RegExp(`${phone.replace('+', '\\+')}\\s*${email.replaceAll('.', '\\.')}`);

/** The count of the Registrácie in a Stav, as the numbers above the list say it. */
const countOf = async (main: Locator, label: 'Nové' | 'Schválené' | 'Zamietnuté') => Number(await detail(main, label).textContent());

test('the admin opens the Jazda radosti, sets the Ročník, adds two Registrácie, changes one, approves it and filters the list', async ({ page }) => {
  test.slow(); // a Ročník, two Registrácie, a change, a click and a filter on a server that other workers share
  const tag = runTag();
  const eva = { name: `Eva ${tag}`, phone: '+421 000 000 101', email: `eva-${tag}@example.com`, make: 'Škoda', model: '110 R', licensePlate: 'pb 123 ab', category: 'Veterán' };
  const boris = { name: `Boris ${tag}`, phone: '+421 000 000 102', email: `boris-${tag}@example.com`, make: 'Nissan', model: 'GT-R', category: 'Superšport' };
  const today = new Date().toLocaleDateString('sk-SK', { timeZone: 'Europe/Bratislava' });
  const main = page.locator('main');
  await signIn(page);
  await page.getByRole('navigation', { name: 'Hlavné menu' }).getByRole('link', { name: 'Jazda radosti' }).click();
  await expect(main.locator('h1')).toHaveText('Jazda radosti');

  // The Ročník: the first time there is none and the link says "Zadať", later it says "Upraviť"; either way the form saves the one Ročník.
  await main.getByRole('link', { name: /^(Zadať|Upraviť) ročník$/ }).click();
  await page.getByLabel('Názov ročníka').fill('Jazda radosti 2026');
  await page.getByLabel('Dátum konania').fill('2026-10-10');
  await page.getByLabel('Miesto konania').fill('Považská Bystrica, centrum');
  await page.getByLabel('Uzávierka registrácií').fill('2026-10-09T15:00');
  await page.getByRole('button', { name: 'Uložiť ročník' }).click();
  await expect(page).toHaveURL(/\/jazda-radosti$/);
  await expect(detail(main, 'Názov')).toHaveText('Jazda radosti 2026');
  await expect(detail(main, 'Dátum konania')).toHaveText('10. 10. 2026');
  await expect(detail(main, 'Miesto konania')).toHaveText('Považská Bystrica, centrum');
  await expect(detail(main, 'Uzávierka registrácií')).toHaveText('9. 10. 2026 15:00');

  // Two Registrácie, typed in as from an e-mail: each is Nová, with its contact, its vehicle (the ŠPZ the way a Vozidlo has it), its Kategória and the day it was made.
  const newBefore = await countOf(main, 'Nové');
  await register(page, eva);
  await register(page, boris);
  const evaRow = main.getByRole('row', { name: new RegExp(eva.name) });
  const borisRow = main.getByRole('row', { name: new RegExp(boris.name) });
  await expect(evaRow.getByRole('cell')).toHaveText([eva.name, contactOf(eva), 'Škoda 110 R (PB123AB)', 'Veterán', 'Nová', today, /Upraviť/]);
  await expect(borisRow.getByRole('cell')).toHaveText([boris.name, contactOf(boris), 'Nissan GT-R', 'Superšport', 'Nová', today, /Upraviť/]);
  expect(await countOf(main, 'Nové')).toBe(newBefore + 2);

  // A Registrácia is changed from the list, and stays Nová.
  await evaRow.getByRole('link', { name: 'Upraviť' }).click();
  await expect(main.locator('h1')).toHaveText('Upraviť registráciu');
  await page.getByLabel('Model', { exact: true }).fill('110 LS');
  await page.getByRole('button', { name: 'Uložiť registráciu' }).click();
  await expect(page).toHaveURL(/\/jazda-radosti$/);
  await expect(evaRow.getByRole('cell').nth(2)).toHaveText('Škoda 110 LS (PB123AB)');
  await expect(evaRow.getByRole('cell').nth(4)).toHaveText('Nová');

  // One click approves it, and the counts above the list move with it.
  const approvedBefore = await countOf(main, 'Schválené');
  await evaRow.getByRole('button', { name: 'Schváliť' }).click();
  await expect(evaRow.getByRole('cell').nth(4)).toHaveText('Schválená');
  await expect(evaRow.getByRole('button', { name: 'Schváliť' })).toHaveCount(0);
  expect(await countOf(main, 'Schválené')).toBe(approvedBefore + 1);
  expect(await countOf(main, 'Nové')).toBe(newBefore + 1);

  // The filter keeps the Registrácie of a Kategória and a Stav, and the address carries it.
  await page.getByLabel('Kategória').selectOption({ label: 'Veterán' });
  await page.getByLabel('Stav').selectOption({ label: 'Schválená' });
  await page.getByRole('button', { name: 'Filtrovať' }).click();
  await expect(page).toHaveURL(/kategoria=veteran&stav=approved$/);
  await expect(evaRow).toHaveCount(1);
  await expect(borisRow).toHaveCount(0);
  await page.getByLabel('Kategória').selectOption({ label: 'Superšport' });
  await page.getByLabel('Stav').selectOption({ label: 'Nová' });
  await page.getByRole('button', { name: 'Filtrovať' }).click();
  await expect(page).toHaveURL(/kategoria=supersport&stav=new$/);
  await expect(borisRow).toHaveCount(1);
  await expect(evaRow).toHaveCount(0);
});
