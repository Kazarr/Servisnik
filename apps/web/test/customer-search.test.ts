import { searchKeys } from '@servisnik/domain/customer';
import { readFileSync } from 'node:fs';
import { sql } from 'drizzle-orm';
import { afterAll, beforeAll, beforeEach, expect, test } from 'vitest';
import { createCustomer, searchCustomers, updateCustomer } from '../src/dal/customers.ts';
import { ForbiddenError, UnauthenticatedError, type User } from '../src/dal/user.ts';
import { createTestDb } from './support/db.ts';

const admin: User = { id: 'user-1', email: 'admin@autoservis.test', name: 'Admin', role: 'admin' };
const mechanic: User = { id: 'user-2', email: 'mechanik@autoservis.test', name: 'Mechanik', role: 'mechanik' };

let ctx: Awaited<ReturnType<typeof createTestDb>>;
beforeAll(async () => {
  ctx = await createTestDb();
});
afterAll(() => ctx.close());
beforeEach(() => ctx.db.execute(sql`truncate customer cascade`));

type Input = Parameters<typeof createCustomer>[1];

async function add(input: Input) {
  const result = await createCustomer(admin, input, ctx.db);
  if (!result.ok) throw new Error('The customer was expected to be saved.');
  return result.id;
}

/** `names` in an order that is neither alphabetical nor its reverse, so a list that came out oldest first or newest first would not pass as alphabetical. */
const scrambled = (names: string[]) => [...names.filter((_, i) => i % 2), ...names.filter((_, i) => !(i % 2))];

const found = async (query: string, page?: number) =>
  (await searchCustomers(admin, { query, page }, ctx.db)).customers.map((customer) => customer.name);

test('only an admin searches: without a user or as a mechanik the search is refused', async () => {
  await add({ type: 'person', name: 'Ján Novák' });

  await expect(searchCustomers(null, { query: 'novak' }, ctx.db)).rejects.toBeInstanceOf(UnauthenticatedError);
  await expect(searchCustomers(mechanic, { query: 'novak' }, ctx.db)).rejects.toBeInstanceOf(ForbiddenError);
  await expect(searchCustomers(mechanic, {}, ctx.db)).rejects.toBeInstanceOf(ForbiddenError);
});

test('"novak" finds "Ján Novák", in any case and with or without diacritics', async () => {
  await add({ type: 'person', name: 'Ján Novák' });
  await add({ type: 'person', name: 'Peter Kováč' });

  for (const query of ['novak', 'Novák', 'NOVAK', 'ján nov', 'jan novak', '  novak ', 'Ján   Novák']) {
    expect(await found(query), query).toEqual(['Ján Novák']);
  }
  expect(await found('kovac')).toEqual(['Peter Kováč']);
  expect(await found('kováč')).toEqual(['Peter Kováč']);
});

test('a name is found by any part of it, not only by its start', async () => {
  await add({ type: 'company', name: 'Autodoprava Kováč s.r.o.', ico: '12345678' });

  expect(await found('doprava')).toEqual(['Autodoprava Kováč s.r.o.']);
  expect(await found('s.r.o')).toEqual(['Autodoprava Kováč s.r.o.']);
});

test('a part of the IČO finds the firma, with the fields the list shows', async () => {
  const id = await add({ type: 'company', name: 'Firma s.r.o.', ico: '36396567', phone: '+421 905 123 456', email: 'info@firma.sk', dic: '2020123456' });
  await add({ type: 'company', name: 'Iná firma', ico: '12345678' });
  await add({ type: 'person', name: 'Ján Novák' });

  expect((await searchCustomers(admin, { query: '39656' }, ctx.db)).customers).toEqual([
    { id, type: 'company', name: 'Firma s.r.o.', ico: '36396567', phone: '+421 905 123 456', email: 'info@firma.sk' },
  ]);
  expect(await found('36396567')).toEqual(['Firma s.r.o.']);
  expect(await found('36 396 567')).toEqual(['Firma s.r.o.']);
});

test('a part of the e-mail finds the customer, whatever its case', async () => {
  await add({ type: 'person', name: 'Ján Novák', email: 'Jan.Novak@Gmail.com' });
  await add({ type: 'person', name: 'Peter Kováč', email: 'peter@firma.sk' });

  expect(await found('gmail')).toEqual(['Ján Novák']);
  expect(await found('JAN.NOVAK@')).toEqual(['Ján Novák']);
  expect(await found('@firma.sk')).toEqual(['Peter Kováč']);
});

test('a phone is found however it is written, and the other way round', async () => {
  await add({ type: 'person', name: 'Ján Novák', phone: '+421 905 123 456' });
  await add({ type: 'person', name: 'Peter Kováč', phone: '0911/222-333' });
  await add({ type: 'person', name: 'Eva Bez Telefónu' });

  for (const query of ['0905 123 456', '+421905123456', '00421 905 123 456', '905123456', '0905', '123 456']) {
    expect(await found(query), query).toEqual(['Ján Novák']);
  }
  for (const query of ['+421 911 222 333', '0911222333', '911 222']) {
    expect(await found(query), query).toEqual(['Peter Kováč']);
  }
});

test('digits next to letters are looked for in the name, not as a phone number', async () => {
  await add({ type: 'person', name: 'Ján Novák 2', phone: '0905 123 456' });
  await add({ type: 'person', name: 'Peter Kováč', phone: '0911 222 333' });

  // Read as a phone number "2" would find both, each has a 2 in its phone.
  expect(await found('novák 2')).toEqual(['Ján Novák 2']);
  expect(await found('kováč 2')).toEqual([]);
});

test('a search that finds nobody gives an empty page', async () => {
  await add({ type: 'person', name: 'Ján Novák' });

  expect(await searchCustomers(admin, { query: 'nikto' }, ctx.db)).toEqual({ customers: [], page: 1, pageCount: 1, total: 0 });
});

test('a blank search lists every customer alphabetically, in the Slovak alphabet, whatever the case', async () => {
  const typed = ['Žilina s.r.o.', 'Zoltán', 'čech', 'Chovan', 'Janko Hruška', 'Adam', 'Čierny', 'Ábel', 'de Luca', 'Ján Novák', 'Hruška', 'Dvořák', 'Cyril', 'Boris'];
  for (const name of typed) await add({ type: 'person', name });

  // The Slovak alphabet has č after c and ch after h, and a word ends before a longer one that starts the same ("Ján Novák", "Janko").
  const expected = ['Ábel', 'Adam', 'Boris', 'Cyril', 'čech', 'Čierny', 'de Luca', 'Dvořák', 'Hruška', 'Chovan', 'Ján Novák', 'Janko Hruška', 'Zoltán', 'Žilina s.r.o.'];
  expect(await found('')).toEqual(expected);
  expect(await found('   ')).toEqual(expected);
  expect((await searchCustomers(admin, {}, ctx.db)).customers.map((customer) => customer.name)).toEqual(expected);
});

test('customers with the same name keep their order from page to page', async () => {
  for (let i = 0; i < 30; i++) await add({ type: 'person', name: 'Ján Novák' });

  const ids = async (page: number) => (await searchCustomers(admin, { page }, ctx.db)).customers.map((customer) => customer.id);
  const [first, second] = [await ids(1), await ids(2)];

  expect(new Set([...first, ...second]).size).toBe(30);
  expect(await ids(1)).toEqual(first);
});

test('customers come 25 to a page, and no customer is on two pages or on none', async () => {
  const names = Array.from({ length: 60 }, (_, i) => `Zákazník ${String(i + 1).padStart(2, '0')}`);
  for (const name of scrambled(names)) await add({ type: 'person', name });

  const [one, two, three] = await Promise.all([1, 2, 3].map((page) => searchCustomers(admin, { page }, ctx.db)));

  expect(one).toMatchObject({ page: 1, pageCount: 3, total: 60 });
  expect(two).toMatchObject({ page: 2, pageCount: 3, total: 60 });
  expect(three).toMatchObject({ page: 3, pageCount: 3, total: 60 });
  expect(one!.customers.map((customer) => customer.name)).toEqual(names.slice(0, 25));
  expect(two!.customers.map((customer) => customer.name)).toEqual(names.slice(25, 50));
  expect(three!.customers.map((customer) => customer.name)).toEqual(names.slice(50));
});

test('exactly 25 customers fit on one page', async () => {
  for (let i = 0; i < 25; i++) await add({ type: 'person', name: `Zákazník ${i}` });

  const result = await searchCustomers(admin, {}, ctx.db);

  expect(result).toMatchObject({ page: 1, pageCount: 1, total: 25 });
  expect(result.customers).toHaveLength(25);
  expect(await found('', 2)).toHaveLength(25);
});

test('the pages of a search hold only what it finds', async () => {
  const novaks = Array.from({ length: 30 }, (_, i) => `Novák ${String(i + 1).padStart(2, '0')}`);
  for (const name of scrambled(novaks)) await add({ type: 'person', name });
  for (let i = 0; i < 40; i++) await add({ type: 'person', name: `Kováč ${i}` });

  const one = await searchCustomers(admin, { query: 'novak', page: 1 }, ctx.db);
  const two = await searchCustomers(admin, { query: 'novak', page: 2 }, ctx.db);

  expect(one).toMatchObject({ page: 1, pageCount: 2, total: 30 });
  expect(two).toMatchObject({ page: 2, pageCount: 2, total: 30 });
  expect(one.customers.map((customer) => customer.name)).toEqual(novaks.slice(0, 25));
  expect(two.customers.map((customer) => customer.name)).toEqual(novaks.slice(25));
});

test('a page that does not exist is the nearest one that does', async () => {
  for (let i = 0; i < 30; i++) await add({ type: 'person', name: `Zákazník ${String(i).padStart(2, '0')}` });

  // Past the last page is the last page; anything that is not a page number is the first.
  for (const page of [3, 99]) {
    const result = await searchCustomers(admin, { page }, ctx.db);
    expect(result.page, String(page)).toBe(2);
    expect(result.customers, String(page)).toHaveLength(5);
  }
  for (const page of [0, -1, 2.5, Number.NaN]) {
    const result = await searchCustomers(admin, { page }, ctx.db);
    expect(result.page, String(page)).toBe(1);
    expect(result.customers, String(page)).toHaveLength(25);
  }
});

test('an edit moves the customer in the search: the old name is not found, the new one is', async () => {
  const id = await add({ type: 'company', name: 'Ján Novák', ico: '36396567', email: 'jan@novak.sk', phone: '0905 123 456' });

  const edited = { type: 'person', name: 'Peter Kováč', email: 'peter@kovac.sk', phone: '0911 222 333' } as const;
  expect(await updateCustomer(admin, id, edited, ctx.db)).toEqual({ ok: true });

  for (const gone of ['novak', '36396567', '0905 123 456']) expect(await found(gone), gone).toEqual([]);
  for (const kept of ['kovac', 'peter@kovac', '+421 911 222 333']) expect(await found(kept), kept).toEqual(['Peter Kováč']);
});

test('the migration gives the customers that exist before it the keys the domain gives them', async () => {
  // Rows as the migration meets them: saved before the search keys existed, so the keys are still empty.
  const before = [
    { name: 'Szőke', email: null, phone: null },
    { name: 'Novák', email: null, phone: null }, // a plain a and a combining acute, as a Mac or a copy from a PDF writes it
    { name: ' Ján  Novák\t\n', email: null, phone: null }, // non-breaking spaces, a tab and a line break
    { name: 'ČECH Žďár Ľalia Ôsmy Ŕuža', email: 'Jan.Novák@Firma.SK', phone: '+421 905 123 456' },
    { name: 'Říha Ůž Ø Straße Łódź', email: 'ŠČEPÁN@žďár.cz', phone: '0905/123-456' },
    { name: 'Peter Kováč', email: null, phone: '00421 911 222 333' },
    { name: 'Eva', email: null, phone: '٣٤٥ 0911' }, // Arabic-Indic digits are no digits of a phone
  ];
  for (const { name, email, phone } of before) {
    await ctx.db.execute(
      sql`insert into customer (type, name, email, phone, search_name, search_email, search_phone) values ('person', ${name}, ${email}, ${phone}, '', '', '')`,
    );
  }

  // The file's own UPDATE, as the migrator runs it.
  const migration = readFileSync(new URL('../drizzle/0004_customer_search_keys.sql', import.meta.url), 'utf8');
  const backfill = migration.split('--> statement-breakpoint').find((statement) => statement.includes('UPDATE "customer"'));
  await ctx.db.execute(sql.raw(backfill!.replace(/^--.*$/gm, '')));

  const keyed = await ctx.db.execute<{ name: string; search_name: string; search_email: string; search_phone: string }>(
    sql`select name, search_name, search_email, search_phone from customer`,
  );
  const keysOf = (name: string) => keyed.rows.find((row) => row.name === name)!;
  expect(keysOf('Szőke').search_name).toBe('szoke');
  expect(keysOf('Novák').search_name).toBe('novak');
  expect(keysOf(' Ján  Novák\t\n').search_name).toBe('jan novak');
  for (const { name, email, phone } of before) {
    const { searchName, searchEmail, searchPhone } = searchKeys({ name, email, phone });
    expect(keysOf(name), name).toEqual({ name, search_name: searchName, search_email: searchEmail, search_phone: searchPhone });
  }
});
