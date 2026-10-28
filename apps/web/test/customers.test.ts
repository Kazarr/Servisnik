import { randomUUID } from 'node:crypto';
import { sql } from 'drizzle-orm';
import { afterAll, beforeAll, beforeEach, expect, test } from 'vitest';
import { createCustomer, getCustomer, listCustomers, updateCustomer } from '../src/dal/customers.ts';
import { ForbiddenError, UnauthenticatedError } from '../src/dal/user.ts';
import { admin, mechanic } from './support/dal-users.ts';
import { createTestDb } from './support/db.ts';
import { idOf } from './support/id-of.ts';

let ctx: Awaited<ReturnType<typeof createTestDb>>;
beforeAll(async () => {
  ctx = await createTestDb();
});
afterAll(() => ctx.close());
beforeEach(() => ctx.db.execute(sql`truncate customer cascade`));

test('without a user every function rejects, and nothing is written', async () => {
  const saved = idOf(await createCustomer(admin, { type: 'person', name: 'Ján Novák' }, ctx.db));
  const before = await listCustomers(admin, ctx.db);

  await expect(createCustomer(null, { type: 'person', name: 'Cudzí' }, ctx.db)).rejects.toBeInstanceOf(UnauthenticatedError);
  await expect(updateCustomer(null, saved, { type: 'person', name: 'Cudzí' }, ctx.db)).rejects.toBeInstanceOf(UnauthenticatedError);
  await expect(listCustomers(null, ctx.db)).rejects.toBeInstanceOf(UnauthenticatedError);
  await expect(getCustomer(null, saved, ctx.db)).rejects.toBeInstanceOf(UnauthenticatedError);

  expect(await listCustomers(admin, ctx.db)).toEqual(before);
});

test('a mechanik is refused by every function, and nothing is written', async () => {
  const saved = idOf(await createCustomer(admin, { type: 'person', name: 'Ján Novák' }, ctx.db));
  const before = await listCustomers(admin, ctx.db);

  await expect(createCustomer(mechanic, { type: 'person', name: 'Cudzí' }, ctx.db)).rejects.toBeInstanceOf(ForbiddenError);
  await expect(updateCustomer(mechanic, saved, { type: 'person', name: 'Cudzí' }, ctx.db)).rejects.toBeInstanceOf(ForbiddenError);
  await expect(listCustomers(mechanic, ctx.db)).rejects.toBeInstanceOf(ForbiddenError);
  await expect(getCustomer(mechanic, saved, ctx.db)).rejects.toBeInstanceOf(ForbiddenError);

  expect(await listCustomers(admin, ctx.db)).toEqual(before);
});

test('a company is saved and read back with all its fields', async () => {
  const input = {
    type: 'company',
    name: 'Firma s.r.o.',
    ico: '12345678',
    dic: '2020123456',
    icDph: 'SK2020123456',
    street: 'Hlavná 1',
    city: 'Bratislava',
    postalCode: '81101',
    phone: '0905 123 456',
    email: 'info@firma.sk',
    note: 'Platí na faktúru',
  } as const;

  const id = idOf(await createCustomer(admin, input, ctx.db));

  expect(await getCustomer(admin, id, ctx.db)).toMatchObject({ id, ...input, vehicles: [] });
});

test('a person is saved without company fields even when they were sent', async () => {
  const id = idOf(
    await createCustomer(admin, { type: 'person', name: 'Ján Novák', ico: '12345678', dic: '2020123456', icDph: 'SK2020123456' }, ctx.db),
  );

  expect(await getCustomer(admin, id, ctx.db)).toMatchObject({ type: 'person', name: 'Ján Novák', ico: null, dic: null, icDph: null });
});

test('a customer the domain refuses is not saved', async () => {
  const invalid = [
    { input: { type: 'company', name: '  ', ico: '12345678' }, errors: { name: 'required' } },
    { input: { type: 'company', name: 'Firma s.r.o.' }, errors: { ico: 'required' } },
    { input: { type: 'company', name: 'Firma s.r.o.', ico: '1234567' }, errors: { ico: 'format' } },
    { input: { type: 'company', name: 'Firma s.r.o.', ico: '12345678', dic: '123' }, errors: { dic: 'format' } },
    { input: { type: 'company', name: 'Firma s.r.o.', ico: '12345678', icDph: '2020123456' }, errors: { icDph: 'format' } },
    { input: { type: 'person', name: 'Ján Novák', postalCode: '8110' }, errors: { postalCode: 'format' } },
    { input: { type: 'person', name: 'Ján Novák', email: 'novak' }, errors: { email: 'format' } },
  ] as const;

  for (const { input, errors } of invalid) {
    expect(await createCustomer(admin, input, ctx.db)).toEqual({ ok: false, errors });
  }
  expect(await listCustomers(admin, ctx.db)).toEqual([]);
});

test('an IČ DPH of another country is saved', async () => {
  const id = idOf(await createCustomer(admin, { type: 'company', name: 'Česká firma', ico: '12345678', icDph: 'CZ12345678' }, ctx.db));

  expect(await getCustomer(admin, id, ctx.db)).toMatchObject({ icDph: 'CZ12345678' });
});

test('a second firma with the same IČO is not saved, and the first is named', async () => {
  const first = idOf(await createCustomer(admin, { type: 'company', name: 'Prvá s.r.o.', ico: '12345678' }, ctx.db));

  const result = await createCustomer(admin, { type: 'company', name: 'Druhá s.r.o.', ico: '12345678' }, ctx.db);

  expect(result).toEqual({ ok: false, errors: { ico: 'taken' }, existing: { id: first, name: 'Prvá s.r.o.' } });
  expect((await listCustomers(admin, ctx.db)).map((customer) => customer.name)).toEqual(['Prvá s.r.o.']);
});

test('firmy saved at once with the same IČO: only one gets through', async () => {
  const results = await Promise.all(
    ['A', 'B', 'C', 'D', 'E'].map((name) => createCustomer(admin, { type: 'company', name: `Firma ${name}`, ico: '12345678' }, ctx.db)),
  );

  expect(results.filter((result) => result.ok)).toHaveLength(1);
  expect(results.filter((result) => !result.ok)).toEqual(Array(4).fill(expect.objectContaining({ errors: { ico: 'taken' } })));
  expect(await listCustomers(admin, ctx.db)).toHaveLength(1);
});

test('two customers with the same name are both saved', async () => {
  idOf(await createCustomer(admin, { type: 'person', name: 'Ján Novák' }, ctx.db));
  idOf(await createCustomer(admin, { type: 'person', name: 'Ján Novák' }, ctx.db));
  idOf(await createCustomer(admin, { type: 'company', name: 'Ján Novák', ico: '12345678' }, ctx.db));
  idOf(await createCustomer(admin, { type: 'company', name: 'Ján Novák', ico: '87654321' }, ctx.db));

  expect(await listCustomers(admin, ctx.db)).toHaveLength(4);
});

test('customers are listed from the newest', async () => {
  for (const name of ['Prvý', 'Druhý', 'Tretí']) {
    idOf(await createCustomer(admin, { type: 'person', name }, ctx.db));
  }

  expect((await listCustomers(admin, ctx.db)).map((customer) => customer.name)).toEqual(['Tretí', 'Druhý', 'Prvý']);
});

test('a customer that does not exist, or an id that is not one, reads as nothing', async () => {
  await expect(getCustomer(admin, randomUUID(), ctx.db)).resolves.toBeNull();
  await expect(getCustomer(admin, 'zakaznik-1', ctx.db)).resolves.toBeNull();
});

test('an edit replaces every field', async () => {
  const id = idOf(await createCustomer(admin, { type: 'company', name: 'Firma s.r.o.', ico: '12345678', city: 'Žilina', note: 'Starý údaj' }, ctx.db));

  const edited = { type: 'company', name: 'Nová firma s.r.o.', ico: '87654321', dic: '2020123456', street: 'Nová 2', phone: '+421905123456' } as const;
  expect(await updateCustomer(admin, id, edited, ctx.db)).toEqual({ ok: true });

  expect(await getCustomer(admin, id, ctx.db)).toMatchObject({ id, ...edited, city: null, note: null });
});

test('changing a firma to an osoba removes its IČO, DIČ and IČ DPH', async () => {
  const company = { type: 'company', name: 'Ján Novák', ico: '12345678', dic: '2020123456', icDph: 'SK2020123456' } as const;
  const id = idOf(await createCustomer(admin, company, ctx.db));

  expect(await updateCustomer(admin, id, { ...company, type: 'person' }, ctx.db)).toEqual({ ok: true });

  expect(await getCustomer(admin, id, ctx.db)).toMatchObject({ type: 'person', ico: null, dic: null, icDph: null });
  // The IČO is free again.
  idOf(await createCustomer(admin, { type: 'company', name: 'Iná firma', ico: '12345678' }, ctx.db));
});

test('a firma keeps its own IČO when it is edited', async () => {
  const id = idOf(await createCustomer(admin, { type: 'company', name: 'Firma s.r.o.', ico: '12345678' }, ctx.db));

  expect(await updateCustomer(admin, id, { type: 'company', name: 'Firma a.s.', ico: '12345678' }, ctx.db)).toEqual({ ok: true });

  expect(await getCustomer(admin, id, ctx.db)).toMatchObject({ name: 'Firma a.s.', ico: '12345678' });
});

test('an edit to the IČO of another firma is not saved, and that firma is named', async () => {
  const other = idOf(await createCustomer(admin, { type: 'company', name: 'Prvá s.r.o.', ico: '12345678' }, ctx.db));
  const id = idOf(await createCustomer(admin, { type: 'company', name: 'Druhá s.r.o.', ico: '87654321' }, ctx.db));

  const result = await updateCustomer(admin, id, { type: 'company', name: 'Druhá s.r.o.', ico: '12345678' }, ctx.db);

  expect(result).toEqual({ ok: false, errors: { ico: 'taken' }, existing: { id: other, name: 'Prvá s.r.o.' } });
  expect(await getCustomer(admin, id, ctx.db)).toMatchObject({ ico: '87654321' });
});

test('an edit the domain refuses changes nothing', async () => {
  const id = idOf(await createCustomer(admin, { type: 'company', name: 'Firma s.r.o.', ico: '12345678' }, ctx.db));

  const result = await updateCustomer(admin, id, { type: 'company', name: 'Zmenená', ico: '123', email: 'zle' }, ctx.db);

  expect(result).toEqual({ ok: false, errors: { ico: 'format', email: 'format' } });
  expect(await getCustomer(admin, id, ctx.db)).toMatchObject({ name: 'Firma s.r.o.', ico: '12345678', email: null });
});

test('an edit of a customer that does not exist, or of an id that is not one, saves nothing', async () => {
  const unknown = { ok: false, errors: { customer: 'unknown' } };

  await expect(updateCustomer(admin, randomUUID(), { type: 'person', name: 'Nikto' }, ctx.db)).resolves.toEqual(unknown);
  await expect(updateCustomer(admin, 'zakaznik-1', { type: 'person', name: 'Nikto' }, ctx.db)).resolves.toEqual(unknown);
  expect(await listCustomers(admin, ctx.db)).toEqual([]);
});
