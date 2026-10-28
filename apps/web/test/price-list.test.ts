import type { PriceListItemInput } from '@servisnik/domain/price-list';
import { randomUUID } from 'node:crypto';
import { sql } from 'drizzle-orm';
import { afterAll, beforeAll, beforeEach, expect, test } from 'vitest';
import { createPriceListItem, deletePriceListItem, getPriceListItem, searchPriceList, updatePriceListItem } from '../src/dal/price-list.ts';
import { ForbiddenError, UnauthenticatedError } from '../src/dal/user.ts';
import { admin, mechanic } from './support/dal-users.ts';
import { createTestDb } from './support/db.ts';
import { idOf } from './support/id-of.ts';

let ctx: Awaited<ReturnType<typeof createTestDb>>;
beforeAll(async () => {
  ctx = await createTestDb();
});
afterAll(() => ctx.close());
beforeEach(async () => {
  await ctx.db.execute(sql`truncate price_list_item`);
  await ctx.db.execute(sql`update workshop set vat_rates = '{23,19,5}', default_vat_rate = 23`); // the rates the migration starts with; some tests change them
});

const brake: PriceListItemInput = { kind: 'part', code: 'BR-123', name: 'Brzdová doštička', unit: 'ks', purchasePrice: '20', unitPrice: '30', vatRate: '19' };
const oilChange: PriceListItemInput = { kind: 'labour', name: 'Výmena oleja', unit: 'h', unitPrice: '45,50', vatRate: '23' };

const add = async (input: PriceListItemInput) => idOf(await createPriceListItem(admin, input, ctx.db));
/** Names of the items a search finds, in the order it lists them. */
const found = async (query: string, page?: number) => (await searchPriceList(admin, { query, page }, ctx.db)).items.map((item) => item.name);
const rowCount = async () => (await ctx.db.execute(sql`select count(*)::int as n from price_list_item`)).rows[0]!.n;

test('only the admin reads or changes the Cenník: without a user or as a mechanik every function is refused, and nothing is written', async () => {
  const id = await add(brake);
  const before = await searchPriceList(admin, {}, ctx.db);

  for (const user of [null, mechanic]) {
    const refusal = user ? ForbiddenError : UnauthenticatedError;
    await expect(createPriceListItem(user, brake, ctx.db)).rejects.toBeInstanceOf(refusal);
    await expect(updatePriceListItem(user, id, brake, ctx.db)).rejects.toBeInstanceOf(refusal);
    await expect(deletePriceListItem(user, id, ctx.db)).rejects.toBeInstanceOf(refusal);
    await expect(searchPriceList(user, { query: 'brzd' }, ctx.db)).rejects.toBeInstanceOf(refusal);
    await expect(getPriceListItem(user, id, ctx.db)).rejects.toBeInstanceOf(refusal);
  }

  expect(await searchPriceList(admin, {}, ctx.db)).toEqual(before);
});

test('a Diel is saved with its code, name, unit, Nákupná cena, Predajná cena and VAT rate, and read back with its id', async () => {
  const id = await add({ ...brake, code: '  BR-123 ' });

  expect(await getPriceListItem(admin, id, ctx.db)).toEqual({
    id,
    kind: 'part',
    code: 'BR-123',
    name: 'Brzdová doštička',
    unit: 'ks',
    purchasePriceCents: 2000,
    unitPriceCents: 3000,
    vatRate: 19,
  });
});

test('a Práca is saved in hours with no code and no Nákupná cena, and the default VAT rate of Nastavenia when none is typed', async () => {
  await ctx.db.execute(sql`update workshop set vat_rates = '{23,19,5}', default_vat_rate = 19`);

  const id = await add({ kind: 'labour', name: 'Výmena oleja', unitPrice: '45,50', purchasePrice: '10' });

  expect(await getPriceListItem(admin, id, ctx.db)).toEqual({
    id,
    kind: 'labour',
    code: null,
    name: 'Výmena oleja',
    unit: 'h',
    purchasePriceCents: null,
    unitPriceCents: 4550,
    vatRate: 19,
  });
});

test('an item that breaks a rule is not saved, and every reason comes back', async () => {
  const result = await createPriceListItem(admin, { kind: 'part', name: ' ', unit: ' ', purchasePrice: 'x', unitPrice: '-1', vatRate: '20' }, ctx.db);

  expect(result).toEqual({ ok: false, errors: { name: 'required', unit: 'required', purchasePrice: 'invalid', unitPrice: 'invalid', vatRate: 'invalid' } });
  expect(await rowCount()).toBe(0);
});

test('a VAT rate that Nastavenia do not offer is refused, and one they offer is kept', async () => {
  await ctx.db.execute(sql`update workshop set vat_rates = '{20,10}', default_vat_rate = 20`);

  expect(await createPriceListItem(admin, { ...brake, vatRate: '19' }, ctx.db)).toEqual({ ok: false, errors: { vatRate: 'invalid' } });
  expect(await getPriceListItem(admin, await add({ ...brake, vatRate: '10' }), ctx.db)).toMatchObject({ vatRate: 10 });
});

// Kód: unique whatever the case, kept without the spaces round it, and none is allowed any number of times.

test('a code that another item has is refused, in any case and with spaces round it, and the item that has it comes back', async () => {
  const existing = await add(brake);

  for (const code of ['BR-123', 'br-123', ' Br-123 ']) {
    expect(await createPriceListItem(admin, { ...brake, code, name: 'Iná doštička' }, ctx.db), code).toEqual({
      ok: false,
      errors: { code: 'taken' },
      existing: { id: existing, name: 'Brzdová doštička' },
    });
  }
  expect(await rowCount()).toBe(1);
});

test('a code differs from another by a character, not only by its case', async () => {
  await add(brake);

  expect(await createPriceListItem(admin, { ...brake, code: 'BR-1234' }, ctx.db)).toMatchObject({ ok: true });
});

test('any number of items have no code', async () => {
  await add({ ...brake, code: '' });
  await add({ ...brake, code: '   ', name: 'Druhá' });
  await add(oilChange);

  expect(await rowCount()).toBe(3);
});

test('a Práca and a Diel cannot share a code either', async () => {
  await add(brake);

  expect(await createPriceListItem(admin, { ...oilChange, code: 'br-123' }, ctx.db)).toMatchObject({ ok: false, errors: { code: 'taken' } });
});

test('the database itself refuses a second code that differs from the first only in case, and takes two items with no code', async () => {
  const insert = (code: string | null) =>
    ctx.db.execute(
      sql`insert into price_list_item (kind, code, name, unit, unit_price_cents, vat_rate, search_code, search_name) values ('part', ${code}, 'Diel', 'ks', 100, 23, '', 'diel')`,
    );
  await insert('BR-123');

  await expect(insert('br-123')).rejects.toMatchObject({ cause: { constraint: 'price_list_item_code_idx' } });
  await insert(null);
  await insert(null);
});

test('two items saved at once with the same code: one is saved and the other is refused as taken', async () => {
  const results = await Promise.all([createPriceListItem(admin, brake, ctx.db), createPriceListItem(admin, { ...brake, name: 'Druhá' }, ctx.db)]);

  expect(results).toContainEqual(expect.objectContaining({ ok: true }));
  expect(results).toContainEqual(expect.objectContaining({ ok: false, errors: { code: 'taken' } }));
  expect(await rowCount()).toBe(1);
});

test('an item is changed: its code, name, unit, prices and VAT rate, where its kind stays', async () => {
  const id = await add(brake);

  const changed = await updatePriceListItem(
    admin,
    id,
    { code: 'BR-456', name: 'Brzdový kotúč', unit: 'sada', purchasePrice: '50', unitPrice: '80,50', vatRate: '5' },
    ctx.db,
  );

  expect(changed).toEqual({ ok: true });
  expect(await getPriceListItem(admin, id, ctx.db)).toEqual({
    id,
    kind: 'part',
    code: 'BR-456',
    name: 'Brzdový kotúč',
    unit: 'sada',
    purchasePriceCents: 5000,
    unitPriceCents: 8050,
    vatRate: 5,
  });
});

test('an item changed loses the code and the Nákupná cena that are left out, and is in the unit of its kind when none is typed', async () => {
  const id = await add(brake);

  await updatePriceListItem(admin, id, { name: 'Brzdová doštička', unitPrice: '30' }, ctx.db);

  expect(await getPriceListItem(admin, id, ctx.db)).toMatchObject({ code: null, purchasePriceCents: null, unit: 'ks' });
});

test('a Práca changed never gets a Nákupná cena, and a form that sends another kind does not change the kind', async () => {
  const id = await add(oilChange);

  await updatePriceListItem(admin, id, { ...brake, name: 'Výmena oleja', unitPrice: '40', purchasePrice: '10', vatRate: '23' }, ctx.db);

  expect(await getPriceListItem(admin, id, ctx.db)).toMatchObject({ kind: 'labour', purchasePriceCents: null, unitPriceCents: 4000 });
});

test('an item keeps its own code when it is changed, whatever the case, and takes no code another item has', async () => {
  const id = await add(brake);
  const other = await add({ ...brake, code: 'OL-5W30', name: 'Olej' });

  expect(await updatePriceListItem(admin, id, { ...brake, code: 'br-123', name: 'Premenovaná' }, ctx.db)).toEqual({ ok: true });
  expect(await updatePriceListItem(admin, id, { ...brake, code: ' ol-5w30 ' }, ctx.db)).toEqual({
    ok: false,
    errors: { code: 'taken' },
    existing: { id: other, name: 'Olej' },
  });
  expect(await getPriceListItem(admin, id, ctx.db)).toMatchObject({ code: 'br-123', name: 'Premenovaná' });
});

test('an item that keeps a VAT rate Nastavenia no longer offer can be changed, but cannot move to another they do not offer', async () => {
  const id = await add({ ...brake, vatRate: '5' });
  await ctx.db.execute(sql`update workshop set vat_rates = '{23,19}', default_vat_rate = 23`);

  expect(await updatePriceListItem(admin, id, { ...brake, vatRate: '5', name: 'Premenovaná' }, ctx.db)).toEqual({ ok: true });
  expect(await updatePriceListItem(admin, id, { ...brake, vatRate: '10' }, ctx.db)).toEqual({ ok: false, errors: { vatRate: 'invalid' } });
  expect(await getPriceListItem(admin, id, ctx.db)).toMatchObject({ vatRate: 5, name: 'Premenovaná' });
});

test('an item changed to something that breaks a rule is not changed, and every reason comes back', async () => {
  const id = await add(brake);
  const before = await getPriceListItem(admin, id, ctx.db);

  const result = await updatePriceListItem(admin, id, { name: '', unit: '', purchasePrice: 'x', unitPrice: 'x', vatRate: '20' }, ctx.db);

  expect(result).toEqual({ ok: false, errors: { name: 'required', unit: 'required', purchasePrice: 'invalid', unitPrice: 'invalid', vatRate: 'invalid' } });
  expect(await getPriceListItem(admin, id, ctx.db)).toEqual(before);
});

test('an item that does not exist, or an id that is not one, is unknown', async () => {
  const id = await add(brake);

  for (const unknown of [randomUUID(), 'polozka-1']) {
    expect(await updatePriceListItem(admin, unknown, brake, ctx.db)).toEqual({ ok: false, errors: { item: 'unknown' } });
    expect(await deletePriceListItem(admin, unknown, ctx.db)).toEqual({ ok: false, error: 'unknown' });
    expect(await getPriceListItem(admin, unknown, ctx.db)).toBeNull();
  }
  expect(await getPriceListItem(admin, id, ctx.db)).toMatchObject({ name: 'Brzdová doštička' });
});

test('an item is deleted and no longer found, and its code is free to be used again', async () => {
  const id = await add(brake);

  expect(await deletePriceListItem(admin, id, ctx.db)).toEqual({ ok: true });

  expect(await getPriceListItem(admin, id, ctx.db)).toBeNull();
  expect(await found('brzdova')).toEqual([]);
  expect(await createPriceListItem(admin, brake, ctx.db)).toMatchObject({ ok: true });
});

test('a second delete of the same item finds it gone', async () => {
  const id = await add(brake);

  await deletePriceListItem(admin, id, ctx.db);

  expect(await deletePriceListItem(admin, id, ctx.db)).toEqual({ ok: false, error: 'unknown' });
});

// Hľadanie: one field, a part of the code or of the name, whatever the case and the diacritics.

test('"brzdova" finds "Brzdová doštička", in any case and with or without diacritics, and a part of the name finds it anywhere in it', async () => {
  await add(brake);
  await add(oilChange);

  for (const query of ['brzdova', 'Brzdová', 'BRZDOVA', ' brzdova ', 'dosticka', 'DOŠTIČ', 'zdová doš']) expect(await found(query), query).toEqual(['Brzdová doštička']);
  expect(await found('olej')).toEqual(['Výmena oleja']);
  expect(await found('vymena')).toEqual(['Výmena oleja']);
});

test('a part of the code finds the item, in any case, and the diacritics of a code do not matter', async () => {
  await add({ ...brake, code: 'OL-5W30', name: 'Olej' });
  await add({ ...brake, code: 'Ž-1', name: 'Žiarovka' });
  await add({ kind: 'part', name: 'Tesnenie', unitPrice: '4' });

  for (const query of ['ol-5w', 'OL-5W30', '5w30']) expect(await found(query), query).toEqual(['Olej']);
  for (const query of ['z-1', 'Ž-1']) expect(await found(query), query).toEqual(['Žiarovka']);
});

test('the code and the name are searched apart: a text spanning the end of one and the start of the other finds nothing', async () => {
  await add({ ...brake, code: 'BR-1', name: 'Doštička' });

  expect(await found('br-1')).toEqual(['Doštička']);
  expect(await found('1 dost')).toEqual([]);
  expect(await found('1dost')).toEqual([]);
});

test('a % or an _ typed is the character itself, not a wildcard', async () => {
  for (const name of ['Olej 100% syntetický', 'Filter_A', 'Filter B']) await add({ kind: 'part', name, unitPrice: '1' });

  expect(await found('%')).toEqual(['Olej 100% syntetický']);
  expect(await found('_')).toEqual(['Filter_A']);
});

test('a Práca and a Diel are searched together', async () => {
  await add({ ...brake, name: 'Olej motorový', code: 'OL-1' });
  await add({ ...oilChange, name: 'Výmena oleja motorového' });

  expect(await found('motorov')).toEqual(['Olej motorový', 'Výmena oleja motorového']);
});

test('a search lists each item with its id, kind, code, name, unit, prices and VAT rate, and nothing of how it is searched', async () => {
  const id = await add(brake);

  expect((await searchPriceList(admin, { query: 'brzd' }, ctx.db)).items).toEqual([
    { id, kind: 'part', code: 'BR-123', name: 'Brzdová doštička', unit: 'ks', purchasePriceCents: 2000, unitPriceCents: 3000, vatRate: 19 },
  ]);
});

test('blank text lists every item, and so does no query', async () => {
  await add(brake);
  await add(oilChange);

  expect(await found('')).toEqual(['Brzdová doštička', 'Výmena oleja']);
  expect(await found('   ')).toEqual(['Brzdová doštička', 'Výmena oleja']);
  expect((await searchPriceList(admin, {}, ctx.db)).total).toBe(2);
});

test('items are listed by name in the Slovak alphabet: č after c, ch after h, and the diacritics only after the letters', async () => {
  for (const name of ['Zvon', 'Ihla', 'Čerpadlo', 'Chladič', 'Brzda', 'Žiarovka', 'Cívka', 'Hadica']) await add({ kind: 'part', name, unitPrice: '1' });

  expect(await found('')).toEqual(['Brzda', 'Cívka', 'Čerpadlo', 'Hadica', 'Chladič', 'Ihla', 'Zvon', 'Žiarovka']);
});

test('items with the same name are listed in a fixed order, so none is on two pages or on none', async () => {
  for (let i = 0; i < 30; i++) await add({ kind: 'part', name: 'Rovnaký názov', unitPrice: '1' });

  const first = (await searchPriceList(admin, { page: 1 }, ctx.db)).items.map((item) => item.id);
  const second = (await searchPriceList(admin, { page: 2 }, ctx.db)).items.map((item) => item.id);

  expect(new Set([...first, ...second]).size).toBe(30);
  expect(first).toHaveLength(25);
  expect(second).toHaveLength(5);
});

test('the list is 25 to a page, the search keeps to the pages of what it found, and a page past the last is the last', async () => {
  for (let i = 1; i <= 27; i++) await add({ kind: 'part', name: `Položka ${String(i).padStart(2, '0')}`, unitPrice: '1' });
  await add({ kind: 'part', name: 'Iná vec', unitPrice: '1' });

  const first = await searchPriceList(admin, { query: 'polozka' }, ctx.db);
  expect(first).toMatchObject({ page: 1, pageCount: 2, total: 27 });
  expect(first.items.map((item) => item.name)).toEqual(Array.from({ length: 25 }, (_, i) => `Položka ${String(i + 1).padStart(2, '0')}`));

  const second = await searchPriceList(admin, { query: 'polozka', page: 2 }, ctx.db);
  expect(second).toMatchObject({ page: 2, pageCount: 2, total: 27 });
  expect(second.items.map((item) => item.name)).toEqual(['Položka 26', 'Položka 27']);

  expect(await searchPriceList(admin, { query: 'polozka', page: 99 }, ctx.db)).toMatchObject({ page: 2 });
  expect(await searchPriceList(admin, { query: 'polozka', page: Number.NaN }, ctx.db)).toMatchObject({ page: 1 });
  expect(await searchPriceList(admin, { page: 3 }, ctx.db)).toMatchObject({ page: 2, pageCount: 2, total: 28 });
});

test('an item renamed is found under the new name and no longer under the old', async () => {
  const id = await add(brake);

  await updatePriceListItem(admin, id, { ...brake, name: 'Olejový filter', code: 'OF-1' }, ctx.db);

  expect(await found('brzdova')).toEqual([]);
  expect(await found('br-123')).toEqual([]);
  expect(await found('olejovy')).toEqual(['Olejový filter']);
  expect(await found('of-1')).toEqual(['Olejový filter']);
});
