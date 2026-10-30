import { afterAll, beforeAll, beforeEach, expect, test, vi } from 'vitest';
import CustomerPage from '../src/app/(app)/zakaznici/[id]/page.tsx';
import EditCustomerPage from '../src/app/(app)/zakaznici/[id]/upravit/page.tsx';
import NewCustomerPage from '../src/app/(app)/zakaznici/novy/page.tsx';
import CustomersPage from '../src/app/(app)/zakaznici/page.tsx';
import type { Database } from '../src/db/index.ts';
import { savedIn, vin } from './support/customer-vehicle.ts';
import { createTestDb } from './support/db.ts';
import { areaValue, input, labelOf, valueOf } from './support/form-markup.ts';
import { detailsOf, hrefOf, linksIn, rowsOf } from './support/page-markup.ts';
import { renderPage } from './support/render-page.ts';
import { truncateTables } from './support/reset.ts';

// Zákazníci a vozidlá (spec #67), the pages of the Zákazníci: the list with its search and its pages, the detail with his
// Vozidlá and Zákazky, and the form that edits him. The pages are async Server Components; each is called here as the function
// it is, over the real DAL and the database of this file, and what it returns is rendered (render-page.ts). The searches and
// the pages of the DAL are in customer-search.test.ts, what a form answers when it is sent in customer-forms.test.ts;
// e2e/customers-vehicles.spec.ts walks one path through the browser.

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

const { person, company, vehicleOf, orderOn } = savedIn(() => ctx.db);

const listPage = async (searchParams: { q?: string; strana?: string } = {}) => renderPage(await CustomersPage({ searchParams: Promise.resolve(searchParams) }));
const detailPage = async (id: string) => renderPage(await CustomerPage({ params: Promise.resolve({ id }) }));
const editPage = async (id: string) => renderPage(await EditCustomerPage({ params: Promise.resolve({ id }) }));
const newPage = async () => renderPage(await NewCustomerPage());

/** The label of each field of a Zákazník that every type has, by the name of the field, and the fields only a firma has. */
const personFields = { name: 'Názov (pri osobe meno a priezvisko)', street: 'Ulica', city: 'Mesto', postalCode: 'PSČ', phone: 'Telefón', email: 'E-mail', note: 'Poznámka' };
const companyFields = { ico: 'IČO', dic: 'DIČ', icDph: 'IČ DPH' };
/** What labels each of these fields on the page, by the name of the field. */
const labelsOn = (html: string, names: string[]) => Object.fromEntries(names.map((name) => [name, labelOf(html, name)]));

/** The `value` of each radio of the type of a Zákazník that is checked. */
const checkedTypes = (html: string) =>
  [...html.matchAll(/<input[^>]*\sname="type"[^>]*>/g)].filter(([radio]) => /\schecked/.test(radio)).map(([radio]) => /\svalue="([^"]*)"/.exec(radio)![1]);

test('the list shows each customer with his type, IČO, phone and e-mail, and his name leads to his detail', async () => {
  const novak = await person('Ján Novák');
  const kovac = await company('Autodoprava Kováč s.r.o.', '36396567', { phone: '+421 905 123 456', email: 'info@kovac.sk' });

  const html = await listPage();

  expect(rowsOf(html)).toEqual([
    ['Autodoprava Kováč s.r.o.', 'Firma', '36396567', '+421 905 123 456', 'info@kovac.sk'],
    ['Ján Novák', 'Osoba', '', '', ''],
  ]);
  expect(hrefOf(html, 'Autodoprava Kováč s.r.o.')).toBe(`/zakaznici/${kovac}`);
  expect(hrefOf(html, 'Ján Novák')).toBe(`/zakaznici/${novak}`);
});

test('the list of an empty system says so, and a search that finds nobody says for what, and the field keeps what was typed', async () => {
  expect(await listPage()).toContain('<p>Zatiaľ tu nič nie je.</p>');

  await person('Ján Novák');
  const html = await listPage({ q: 'nikto' });

  expect(html).toContain('<p>Nič sa nenašlo pre „nikto“.</p>');
  expect(rowsOf(html)).toEqual([]);
  expect(valueOf(html, 'q')).toBe('nikto');
});

test('the search is a form that sends what is typed as ?q= to the list, in a field called "Hľadať zákazníka"', async () => {
  const html = await listPage();

  expect(html).toMatch(/<form[^>]*\srole="search"[^>]*\saction="\/zakaznici"/);
  expect(labelOf(html, 'q')).toBe('Hľadať zákazníka');
  expect(input(html, 'q')).toContain('type="search"');
  expect(html).toContain('>Hľadať</button>');
});

test('the list opens the form of a new customer', async () => {
  expect(hrefOf(await listPage(), 'Pridať zákazníka')).toBe('/zakaznici/novy');
});

test('the page of a new customer is headed so, and its form starts as an osoba, with the fields an osoba has', async () => {
  const html = await newPage();

  expect(html).toContain('<h1>Nový zákazník</h1>');
  expect(checkedTypes(html)).toEqual(['person']);
  expect(input(html, 'id')).toBeNull();
  expect(labelsOn(html, Object.keys(personFields))).toEqual(personFields);
  for (const name of Object.keys(companyFields)) expect(input(html, name), name).toBeNull();
});

/** 26 customers named "Pager 01" to "Pager 26", saved in neither the order of the list nor its reverse, and one that no search of "pager" finds. */
async function pagerCustomers() {
  const names = Array.from({ length: 26 }, (_, i) => `Pager ${String(i + 1).padStart(2, '0')}`);
  for (const name of [...names.filter((_, i) => i % 2), ...names.filter((_, i) => !(i % 2))]) await person(name);
  await person('Kováč');
  return names;
}
const names = (html: string) => rowsOf(html).map(([name]) => name);

test('the list is alphabetical, 25 to a page, and the first page leads on to the second inside the search', async () => {
  const pager = await pagerCustomers();

  const html = await listPage({ q: 'pager' });

  expect(names(html)).toEqual(pager.slice(0, 25));
  expect(html).toContain('Strana 1 z 2');
  expect(linksIn(html).map(({ text }) => text)).not.toContain('Predchádzajúca');
  expect(hrefOf(html, 'Nasledujúca')).toBe('/zakaznici?q=pager&strana=2');
  expect(valueOf(html, 'q')).toBe('pager');
});

test('the second page holds the rest and leads back inside the search, and its field keeps the search', async () => {
  const pager = await pagerCustomers();

  const html = await listPage({ q: 'pager', strana: '2' });

  expect(names(html)).toEqual([pager[25]]);
  expect(html).toContain('Strana 2 z 2');
  expect(linksIn(html).map(({ text }) => text)).not.toContain('Nasledujúca');
  expect(hrefOf(html, 'Predchádzajúca')).toBe('/zakaznici?q=pager');
  expect(valueOf(html, 'q')).toBe('pager');
});

test('the pages of the list without a search are addressed by ?strana= alone', async () => {
  await pagerCustomers();

  expect(hrefOf(await listPage(), 'Nasledujúca')).toBe('/zakaznici?strana=2');
  expect(hrefOf(await listPage({ strana: '2' }), 'Predchádzajúca')).toBe('/zakaznici');
});

test('the detail of a firma shows every field it has, and the IČO and DIČ and IČ DPH of a firma only', async () => {
  const id = await company('Autodoprava Kováč s.r.o.', '36396567', {
    dic: '2020123456',
    icDph: 'CZ12345678',
    street: 'Hlavná 1',
    city: 'Bratislava',
    postalCode: '81101',
    phone: '0905 123 456',
    email: 'info@kovac.sk',
    note: 'Platí v hotovosti',
  });

  const html = await detailPage(id);

  expect(html).toContain('<h1>Autodoprava Kováč s.r.o.</h1>');
  expect(detailsOf(html)).toEqual([
    ['Typ', 'Firma'],
    ['IČO', '36396567'],
    ['DIČ', '2020123456'],
    ['IČ DPH', 'CZ12345678'],
    ['Ulica', 'Hlavná 1'],
    ['Mesto', 'Bratislava'],
    ['PSČ', '81101'],
    ['Telefón', '0905 123 456'],
    ['E-mail', 'info@kovac.sk'],
    ['Poznámka', 'Platí v hotovosti'],
  ]);
});

test('the detail of an osoba with only a name shows no company field and no field that is empty', async () => {
  const html = await detailPage(await person('Ján Novák'));

  expect(detailsOf(html)).toEqual([['Typ', 'Osoba']]);
  expect(html).not.toContain('IČO');
});

test('the detail opens the form that edits the customer, and the form of a new Vozidlo for him as the Majiteľ', async () => {
  const id = await person('Ján Novák');

  const html = await detailPage(id);

  expect(hrefOf(html, 'Upraviť')).toBe(`/zakaznici/${id}/upravit`);
  expect(hrefOf(html, 'Pridať vozidlo')).toBe(`/vozidla/novy?zakaznik=${id}`);
});

test('the detail lists the vehicles of the customer with their ŠPZ, and each leads to its detail', async () => {
  const id = await person('Ján Novák');
  const vehicleId = await vehicleOf(id);

  const html = await detailPage(id);

  expect(rowsOf(html)).toEqual([[vin, 'BA123AB', 'Volkswagen', 'Golf']]);
  expect(hrefOf(html, vin)).toBe(`/vozidla/${vehicleId}`);
});

test("the detail lists the Zákazky made for the customer, and a Zákazka of another customer on his vehicle only on that customer's detail", async () => {
  const ownerId = await person('Ján Novák');
  const otherId = await person('Iný Zákazník');
  const vehicleId = await vehicleOf(ownerId);
  const own = await orderOn(vehicleId); // made for the Majiteľ, who is the customer unless another is named
  const foreign = await orderOn(vehicleId, otherId);

  const owners = await detailPage(ownerId);
  const others = await detailPage(otherId);

  // The Majiteľ has the Vozidlo and the Zákazka made for him, under the heading of the Zákazky; the one made for the other customer on his Vozidlo is not on his detail.
  expect(owners).toContain('<h2>Zákazky</h2>');
  expect(rowsOf(owners)).toEqual([
    [vin, 'BA123AB', 'Volkswagen', 'Golf'],
    [own.number, 'Ján Novák', `Volkswagen Golf, ${vin}`, 'Prijatá', ''],
  ]);
  expect(owners).not.toContain(foreign.number);
  expect(hrefOf(owners, own.number)).toBe(`/zakazky/${own.id}`);
  // The other customer has no Vozidlo and the Zákazka made for him, which names the Vozidlo.
  expect(others).toContain('Zatiaľ žiadne vozidlo.');
  expect(rowsOf(others)).toEqual([[foreign.number, 'Iný Zákazník', `Volkswagen Golf, ${vin}`, 'Prijatá', '']]);
  expect(others).not.toContain(own.number);
  expect(hrefOf(others, foreign.number)).toBe(`/zakazky/${foreign.id}`);
});

test('the form that edits a firma starts from every field it has saved, and names the customer it saves', async () => {
  const id = await company('Autodoprava Kováč s.r.o.', '36396567', {
    dic: '2020123456',
    icDph: 'SK2020123456',
    street: 'Hlavná 1',
    city: 'Bratislava',
    postalCode: '81101',
    phone: '0905 123 456',
    email: 'info@kovac.sk',
    note: 'Platí v hotovosti',
  });

  const html = await editPage(id);

  expect(html).toContain('<h1>Upraviť zákazníka</h1>');
  expect(checkedTypes(html)).toEqual(['company']);
  expect(valueOf(html, 'id')).toBe(id);
  const fields = ['name', 'ico', 'dic', 'icDph', 'street', 'city', 'postalCode', 'phone', 'email'].map((name) => [name, valueOf(html, name)]);
  expect(fields).toEqual([
    ['name', 'Autodoprava Kováč s.r.o.'],
    ['ico', '36396567'],
    ['dic', '2020123456'],
    ['icDph', 'SK2020123456'],
    ['street', 'Hlavná 1'],
    ['city', 'Bratislava'],
    ['postalCode', '81101'],
    ['phone', '0905 123 456'],
    ['email', 'info@kovac.sk'],
  ]);
  expect(areaValue(html, 'note')).toBe('Platí v hotovosti');
  // Each field has a label of its own, the one the admin reads.
  expect(labelsOn(html, [...Object.keys(personFields), ...Object.keys(companyFields)])).toEqual({ ...personFields, ...companyFields });
});

test('the form that edits an osoba starts as an osoba, with no field of a firma', async () => {
  const html = await editPage(await person('Ján Novák'));

  expect(checkedTypes(html)).toEqual(['person']);
  expect(valueOf(html, 'name')).toBe('Ján Novák');
  for (const name of ['ico', 'dic', 'icDph']) expect(input(html, name), name).toBeNull();
});
