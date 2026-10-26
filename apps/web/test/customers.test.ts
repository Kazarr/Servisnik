import { randomUUID } from 'node:crypto';
import { sql } from 'drizzle-orm';
import { afterAll, beforeAll, beforeEach, expect, test } from 'vitest';
import { createCustomer, getCustomer, listCustomers } from '../src/dal/customers.ts';
import { UnauthenticatedError, type User } from '../src/dal/user.ts';
import { createTestDb } from './support/db.ts';

const admin: User = { id: 'user-1', email: 'admin@autoservis.test', name: 'Admin', role: 'admin' };

let ctx: Awaited<ReturnType<typeof createTestDb>>;
beforeAll(async () => {
  ctx = await createTestDb();
});
afterAll(() => ctx.close());
beforeEach(() => ctx.db.execute(sql`truncate customer cascade`));

function idOf(result: { ok: true; id: string } | { ok: false }) {
  if (!result.ok) throw new Error('The customer was expected to be saved.');
  return result.id;
}

test('without a user every function rejects, and nothing is written', async () => {
  const saved = idOf(await createCustomer(admin, { type: 'person', name: 'Ján Novák' }, ctx.db));
  const before = await listCustomers(admin, ctx.db);

  await expect(createCustomer(null, { type: 'person', name: 'Cudzí' }, ctx.db)).rejects.toBeInstanceOf(UnauthenticatedError);
  await expect(listCustomers(null, ctx.db)).rejects.toBeInstanceOf(UnauthenticatedError);
  await expect(getCustomer(null, saved, ctx.db)).rejects.toBeInstanceOf(UnauthenticatedError);

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
    email: 'info@firma.sk',
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

test('a customer without a name is not saved', async () => {
  const result = await createCustomer(admin, { type: 'company', name: '  ', ico: '12345678' }, ctx.db);

  expect(result).toEqual({ ok: false, errors: { name: 'required' } });
  expect(await listCustomers(admin, ctx.db)).toEqual([]);
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
