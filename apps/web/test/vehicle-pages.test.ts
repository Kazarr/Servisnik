import { afterAll, beforeAll, beforeEach, expect, test, vi } from 'vitest';
import VehiclePage from '../src/app/(app)/vozidla/[id]/page.tsx';
import EditVehiclePage from '../src/app/(app)/vozidla/[id]/upravit/page.tsx';
import NewVehiclePage from '../src/app/(app)/vozidla/novy/page.tsx';
import VehiclesPage from '../src/app/(app)/vozidla/page.tsx';
import type { Database } from '../src/db/index.ts';
import { savedIn } from './support/customer-vehicle.ts';
import { createTestDb } from './support/db.ts';
import { input, options, valueOf } from './support/form-markup.ts';
import { detailsOf, hrefOf, linksIn, rowsOf } from './support/page-markup.ts';
import { renderPage } from './support/render-page.ts';
import { truncateTables } from './support/reset.ts';

// Zákazníci a vozidlá (spec #67), the pages of the Vozidlá: the list with its search and its pages, the detail, the form of a
// new Vozidlo, which comes after the search for its Majiteľ, and the form that edits it. The pages are async Server Components;
// each is called here as the function it is, over the real DAL and the database of this file, and what it returns is rendered
// (render-page.ts). The searches and the pages of the DAL are in vehicle-search.test.ts, what a form answers when it is sent in
// vehicle-forms.test.ts; e2e/customers-vehicles.spec.ts walks one path through the browser.

const { handed } = vi.hoisted(() => ({ handed: { db: null as unknown as Database } }));
vi.mock('../src/dal/current-user.ts', async () => {
  const { admin } = await import('./support/dal-users.ts');
  return { currentUser: async () => admin, currentUserWith: async () => admin };
});
vi.mock('../src/db/index.ts', async (importOriginal) => ({ ...(await importOriginal<typeof import('../src/db/index.ts')>()), getDb: () => handed.db }));

let ctx: Awaited<ReturnType<typeof createTestDb>>;
beforeAll(async () => {
  ctx = await createTestDb();
  handed.db = ctx.db;
});
afterAll(() => ctx.close());
beforeEach(async () => {
  await truncateTables(ctx.db, 'customer');
});

const { person, vehicleOf } = savedIn(() => ctx.db);

const listPage = async (searchParams: { q?: string; strana?: string } = {}) => renderPage(await VehiclesPage({ searchParams: Promise.resolve(searchParams) }));
const detailPage = async (id: string) => renderPage(await VehiclePage({ params: Promise.resolve({ id }) }));
const editPage = async (id: string) => renderPage(await EditVehiclePage({ params: Promise.resolve({ id }) }));
const newPage = async (searchParams: { zakaznik?: string; q?: string } = {}) => renderPage(await NewVehiclePage({ searchParams: Promise.resolve(searchParams) }));

/** The cells of a row with the numbers' groups of digits written with the spaces the page puts between them, whichever space it is. */
const spaced = (rows: string[][]) => rows.map((row) => row.map((cell) => cell.replace(/\s/g, ' ')));

test('the list shows each vehicle with its VIN, ŠPZ, značka, model and owner, and the VIN leads to its detail', async () => {
  const novak = await person('Ján Novák');
  const kovac = await person('Peter Kováč');
  const golf = await vehicleOf(novak, { vin: 'WVWZZZ1JZ3W386752', licensePlate: 'BA123AB', make: 'Volkswagen', model: 'Golf' });
  await vehicleOf(kovac, { vin: 'VF1ZZZ5JZ3W000003', licensePlate: '', make: 'Renault', model: 'Clio' });

  const html = await listPage();

  // The newest first; a vehicle without a ŠPZ has an empty cell.
  expect(rowsOf(html)).toEqual([
    ['VF1ZZZ5JZ3W000003', '', 'Renault', 'Clio', 'Peter Kováč'],
    ['WVWZZZ1JZ3W386752', 'BA123AB', 'Volkswagen', 'Golf', 'Ján Novák'],
  ]);
  expect(hrefOf(html, 'WVWZZZ1JZ3W386752')).toBe(`/vozidla/${golf}`);
});

test('the list of an empty system says so, and a search that finds nobody says for what, and the field keeps what was typed', async () => {
  expect(await listPage()).toContain('<p>Zatiaľ tu nič nie je.</p>');

  await vehicleOf(await person('Ján Novák'));
  const html = await listPage({ q: 'nikto' });

  expect(html).toContain('<p>Nič sa nenašlo pre „nikto“.</p>');
  expect(rowsOf(html)).toEqual([]);
  expect(valueOf(html, 'q')).toBe('nikto');
});

test('the search is a form that sends what is typed as ?q= to the list, in a field called "Hľadať vozidlo"', async () => {
  const html = await listPage();

  expect(html).toMatch(/<form[^>]*\srole="search"[^>]*\saction="\/vozidla"/);
  expect(html).toContain('<label for="q">Hľadať vozidlo</label>');
  expect(input(html, 'q')).toContain('type="search"');
  expect(html).toContain('>Hľadať</button>');
});

/** 26 vehicles of one owner, saved in the order of their VINs, and a newer one of another owner that no search of the first owner's name finds. */
async function pagerVehicles() {
  const owner = await person('Pager Majiteľ');
  const vins = Array.from({ length: 26 }, (_, i) => `WVWZZZ1JZ3W3867${String(i + 1).padStart(2, '0')}`);
  for (const each of vins) await vehicleOf(owner, { vin: each });
  await vehicleOf(await person('Iný majiteľ'), { vin: 'WVWZZZ1JZ3W386799' });
  return [...vins].reverse();
}
const vinsOf = (html: string) => rowsOf(html).map(([each]) => each);

test('the list is the newest first, 25 to a page, and the first page leads on to the second inside the search', async () => {
  const newestFirst = await pagerVehicles();

  const html = await listPage({ q: 'pager' });

  expect(vinsOf(html)).toEqual(newestFirst.slice(0, 25));
  expect(html).toContain('Strana 1 z 2');
  expect(linksIn(html).map(({ text }) => text)).not.toContain('Predchádzajúca');
  expect(hrefOf(html, 'Nasledujúca')).toBe('/vozidla?q=pager&strana=2');
  expect(valueOf(html, 'q')).toBe('pager');
});

test('the second page holds the rest and leads back inside the search, and its field keeps the search', async () => {
  const newestFirst = await pagerVehicles();

  const html = await listPage({ q: 'pager', strana: '2' });

  expect(vinsOf(html)).toEqual([newestFirst[25]]);
  expect(html).toContain('Strana 2 z 2');
  expect(linksIn(html).map(({ text }) => text)).not.toContain('Nasledujúca');
  expect(hrefOf(html, 'Predchádzajúca')).toBe('/vozidla?q=pager');
  expect(valueOf(html, 'q')).toBe('pager');
});

test('the pages of the list without a search are addressed by ?strana= alone', async () => {
  await pagerVehicles();

  expect(hrefOf(await listPage(), 'Nasledujúca')).toBe('/vozidla?strana=2');
  expect(hrefOf(await listPage({ strana: '2' }), 'Predchádzajúca')).toBe('/vozidla');
});

test('the detail shows the vehicle as a heading and every field it has, with its owner, and opens the Prepis, the edit and a new Zákazka', async () => {
  const ownerId = await person('Ján Novák');
  const id = await vehicleOf(ownerId, {
    vin: 'WVWZZZ1JZ3W386752',
    licensePlate: 'ba-123 ab',
    make: 'Volkswagen',
    model: 'Golf',
    year: '2015',
    fuel: 'diesel',
    mileageKm: '123 456',
    note: 'Nová spojka',
  });

  const html = await detailPage(id);

  expect(html).toContain('<h1>Volkswagen Golf</h1>');
  expect(spaced(detailsOf(html))).toEqual([
    ['VIN', 'WVWZZZ1JZ3W386752'],
    ['ŠPZ', 'BA123AB'],
    ['Rok výroby', '2015'],
    ['Palivo', 'Nafta'],
    ['Stav km', '123 456 km'],
    ['Poznámka', 'Nová spojka'],
    ['Majiteľ', 'Ján Novák · Prepísať na iného zákazníka'],
  ]);
  expect(hrefOf(html, 'Ján Novák')).toBe(`/zakaznici/${ownerId}`);
  expect(hrefOf(html, 'Prepísať na iného zákazníka')).toBe(`/vozidla/${id}/prepis`);
  expect(hrefOf(html, 'Upraviť')).toBe(`/vozidla/${id}/upravit`);
  expect(hrefOf(html, 'Nová zákazka')).toBe(`/zakazky/nova?vozidlo=${id}`);
});

test('the detail of a vehicle with only what it must have shows no field that is empty, and 0 km is a stav km', async () => {
  const only = await vehicleOf(await person('Ján Novák'));
  const driven = await vehicleOf(await person('Peter Kováč'), { vin: 'TMBZZZ5JZ3W000002', mileageKm: '0' });

  expect(detailsOf(await detailPage(only)).map(([label]) => label)).toEqual(['VIN', 'ŠPZ', 'Majiteľ']);
  expect(detailsOf(await detailPage(driven))).toContainEqual(['Stav km', '0 km']);
});

test('the form of a new vehicle comes after its owner: without one it has no VIN field, but the search for him, which leads to the form for each owner it finds', async () => {
  const [owner, other] = [await person('Majiteľ Vozidla'), await person('Iný Majiteľ')];
  await person('Peter Kováč');

  const html = await newPage({ q: 'majitel' });

  expect(html).toContain('<h1>Nové vozidlo</h1>');
  expect(input(html, 'vin')).toBeNull();
  expect(html).toContain('<label for="q">Hľadať majiteľa</label>');
  expect(html).toMatch(/<form[^>]*\srole="search"[^>]*\saction="\/vozidla\/novy"/);
  expect(valueOf(html, 'q')).toBe('majitel');
  // Every customer the search finds, alphabetically, and no other.
  expect(rowsOf(html)).toEqual([
    ['Iný Majiteľ', 'Osoba', ''],
    ['Majiteľ Vozidla', 'Osoba', ''],
  ]);
  expect(hrefOf(html, 'Majiteľ Vozidla')).toBe(`/vozidla/novy?zakaznik=${owner}`);
  expect(hrefOf(html, 'Iný Majiteľ')).toBe(`/vozidla/novy?zakaznik=${other}`);
});

test('the pages of the search for an owner stay in the search', async () => {
  for (let i = 1; i <= 26; i++) await person(`Majiteľ ${String(i).padStart(2, '0')}`);

  expect(hrefOf(await newPage({ q: 'majitel' }), 'Nasledujúca')).toBe('/vozidla/novy?q=majitel&strana=2');
});

test('the form of a new vehicle for an owner who was picked names him as the Majiteľ, has no search for him, and carries him with the form', async () => {
  const ownerId = await person('Ján Novák');

  const html = await newPage({ zakaznik: ownerId });

  expect(html).toContain('Majiteľ: <strong>Ján Novák</strong>');
  expect(hrefOf(html, 'Zmeniť majiteľa')).toBe('/vozidla/novy');
  expect(html).not.toContain('Hľadať majiteľa');
  expect(valueOf(html, 'ownerId')).toBe(ownerId);
  for (const name of ['vin', 'licensePlate', 'make', 'model', 'year', 'mileageKm']) expect(input(html, name), name).not.toBeNull();
  expect(valueOf(html, 'vin')).toBe('');
});

test('the form that edits a vehicle starts from every field it has saved, names its Majiteľ without letting him be changed, and names the vehicle it saves', async () => {
  const ownerId = await person('Ján Novák');
  const id = await vehicleOf(ownerId, {
    vin: 'WVWZZZ1JZ3W386752',
    licensePlate: 'ba-123 ab',
    make: 'Volkswagen',
    model: 'Golf',
    year: '2015',
    fuel: 'diesel',
    mileageKm: '123 456',
    note: 'Nová spojka',
  });

  const html = await editPage(id);

  expect(html).toContain('<h1>Upraviť vozidlo</h1>');
  expect(html).toContain('Majiteľ: <strong>Ján Novák</strong>');
  expect(input(html, 'ownerId')).toBeNull();
  expect(valueOf(html, 'id')).toBe(id);
  const fields = ['vin', 'licensePlate', 'make', 'model', 'year', 'mileageKm'].map((name) => [name, valueOf(html, name)]);
  expect(fields).toEqual([
    ['vin', 'WVWZZZ1JZ3W386752'],
    ['licensePlate', 'BA123AB'],
    ['make', 'Volkswagen'],
    ['model', 'Golf'],
    ['year', '2015'],
    ['mileageKm', '123456'],
  ]);
  expect(options(html, 'fuel').selected).toEqual(['diesel']);
  expect(html).toMatch(/<textarea[^>]*\sname="note"[^>]*>Nová spojka<\/textarea>/);
});

test('the form that edits a vehicle without a ŠPZ, a year or a note starts with those empty, not with "null"', async () => {
  const html = await editPage(await vehicleOf(await person('Ján Novák'), { licensePlate: '' }));

  expect(html).not.toMatch(/value="null"|>null</);
  expect(valueOf(html, 'licensePlate')).toBe('');
  expect(valueOf(html, 'year')).toBe('');
  expect(valueOf(html, 'mileageKm')).toBe('');
  expect(options(html, 'fuel').selected).toEqual(['']);
});
