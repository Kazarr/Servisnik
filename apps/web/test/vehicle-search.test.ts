import { sql } from 'drizzle-orm';
import { afterAll, beforeAll, beforeEach, expect, test } from 'vitest';
import { createCustomer, updateCustomer } from '../src/dal/customers.ts';
import { ForbiddenError, UnauthenticatedError } from '../src/dal/user.ts';
import { createVehicle, searchVehicles } from '../src/dal/vehicles.ts';
import { admin, mechanic } from './support/dal-users.ts';
import { createTestDb } from './support/db.ts';
import { idOf } from './support/id-of.ts';
import { truncateTables } from './support/reset.ts';

let ctx: Awaited<ReturnType<typeof createTestDb>>;
beforeAll(async () => {
  ctx = await createTestDb();
});
afterAll(() => ctx.close());
beforeEach(() => truncateTables(ctx.db, 'customer'));

const customer = async (name: string) => idOf(await createCustomer(admin, { type: 'person', name }, ctx.db));

/** A valid VIN of its own for every `n`. */
const vinOf = (n: number) => `TMBZZZ5JZ3W${String(n).padStart(6, '0')}`;

type Fields = { vin: string; licensePlate?: string; make?: string; model?: string };

async function add(ownerId: string, { vin, licensePlate = '', make = 'Škoda', model = 'Octavia' }: Fields) {
  return idOf(await createVehicle(admin, { ownerId, vin, licensePlate, make, model }, ctx.db));
}

const found = async (query: string, page?: number) => (await searchVehicles(admin, { query, page }, ctx.db)).vehicles.map((vehicle) => vehicle.vin);

test('only an admin searches: without a user or as a mechanik the search is refused', async () => {
  await add(await customer('Ján Novák'), { vin: vinOf(1) });

  await expect(searchVehicles(null, { query: 'novak' }, ctx.db)).rejects.toBeInstanceOf(UnauthenticatedError);
  await expect(searchVehicles(mechanic, { query: 'novak' }, ctx.db)).rejects.toBeInstanceOf(ForbiddenError);
  await expect(searchVehicles(mechanic, {}, ctx.db)).rejects.toBeInstanceOf(ForbiddenError);
});

test('the last 6 characters of a VIN find the vehicle, however they are written', async () => {
  const owner = await customer('Ján Novák');
  await add(owner, { vin: 'WVWZZZ1JZ3W38AB52' });
  await add(owner, { vin: 'WVWZZZ1JZ3W386752' });

  for (const query of ['386752', ' 386 752 ', '3-86752']) expect(await found(query), query).toEqual(['WVWZZZ1JZ3W386752']);
  for (const query of ['ab52', 'AB52', 'W38ab52', 'w38 ab52']) expect(await found(query), query).toEqual(['WVWZZZ1JZ3W38AB52']);
});

test('a part of the VIN is found anywhere in it, not only at its end', async () => {
  const owner = await customer('Ján Novák');
  await add(owner, { vin: 'WVWZZZ1JZ3W386752' });
  await add(owner, { vin: 'TMBZZZ5JZ3W000101' });

  expect(await found('wvwzzz')).toEqual(['WVWZZZ1JZ3W386752']);
  expect(await found('zzz1jz')).toEqual(['WVWZZZ1JZ3W386752']);
  expect(await found('3w38')).toEqual(['WVWZZZ1JZ3W386752']);
  expect(new Set(await found('ZZZ'))).toEqual(new Set(['WVWZZZ1JZ3W386752', 'TMBZZZ5JZ3W000101']));
});

test('a ŠPZ is found with a space, with a hyphen, without either, in any case, and by a part of it', async () => {
  const owner = await customer('Ján Novák');
  await add(owner, { vin: vinOf(1), licensePlate: 'ba-123 ab' });
  await add(owner, { vin: vinOf(2), licensePlate: 'KE456CD' });
  await add(owner, { vin: vinOf(3) });

  for (const query of ['BA123AB', 'ba123ab', 'BA 123 AB', 'ba-123-ab', ' ba-123 ab ', '123 ab', 'a123']) expect(await found(query), query).toEqual([vinOf(1)]);
  expect(await found('ke 456')).toEqual([vinOf(2)]);
});

test('vehicles with the same ŠPZ are all found by it', async () => {
  const owner = await customer('Ján Novák');
  await add(owner, { vin: vinOf(1), licensePlate: 'BA123AB' });
  await add(owner, { vin: vinOf(2), licensePlate: 'ba-123 ab' });

  expect((await found('ba 123 ab')).sort()).toEqual([vinOf(1), vinOf(2)]);
});

test('a part of the name of the owner finds his vehicles, in any case and with or without diacritics', async () => {
  const novak = await customer('Ján Novák');
  const kovac = await customer('Peter Kováč');
  await add(novak, { vin: vinOf(1), licensePlate: 'BA111AA' });
  await add(novak, { vin: vinOf(2), licensePlate: 'BA222BB' });
  await add(kovac, { vin: vinOf(3), licensePlate: 'BA333CC' });

  for (const query of ['novak', 'Novák', 'NOVAK', 'ján nov', 'jan novak', '  novak ', 'Ján   Novák']) {
    expect((await found(query)).sort(), query).toEqual([vinOf(1), vinOf(2)]);
  }
  expect(await found('kovac')).toEqual([vinOf(3)]);
  expect(await found('kováč')).toEqual([vinOf(3)]);
});

test('a name is found by any part of it, not only by its start, the name of a firma too', async () => {
  const firma = idOf(await createCustomer(admin, { type: 'company', name: 'Autodoprava Kováč s.r.o.', ico: '12345678' }, ctx.db));
  await add(firma, { vin: vinOf(1) });
  await add(await customer('Ján Novák'), { vin: vinOf(2) });

  expect(await found('doprava')).toEqual([vinOf(1)]);
  expect(await found('s.r.o')).toEqual([vinOf(1)]);
});

test('the vehicle of a Zákazník who is renamed is found under the new name and no longer under the old', async () => {
  const owner = await customer('Ján Novák');
  await add(owner, { vin: vinOf(1) });

  expect(await updateCustomer(admin, owner, { type: 'person', name: 'Peter Kováč' }, ctx.db)).toEqual({ ok: true });

  expect(await found('novak')).toEqual([]);
  expect(await found('kovac')).toEqual([vinOf(1)]);
});

test('a vehicle without a ŠPZ is found by its VIN and its owner, and a search by ŠPZ does not mistake it for a match', async () => {
  const owner = await customer('Ján Novák');
  await add(owner, { vin: vinOf(1) });
  await add(owner, { vin: vinOf(2), licensePlate: 'BA123AB' });

  expect(await found('000001')).toEqual([vinOf(1)]);
  expect(await found('ba123')).toEqual([vinOf(2)]);
  expect((await found('novak')).sort()).toEqual([vinOf(1), vinOf(2)]);
});

test('the search returns the VIN, ŠPZ, značka, model and owner of each vehicle, and its id', async () => {
  const owner = await customer('Ján Novák');
  const id = await add(owner, { vin: 'WVWZZZ1JZ3W386752', licensePlate: 'ba-123 ab', make: 'Volkswagen', model: 'Golf' });
  await add(await customer('Peter Kováč'), { vin: vinOf(2) });

  const { vehicles } = await searchVehicles(admin, { query: '386752' }, ctx.db);

  expect(vehicles).toEqual([
    expect.objectContaining({
      id,
      vin: 'WVWZZZ1JZ3W386752',
      licensePlate: 'BA123AB',
      make: 'Volkswagen',
      model: 'Golf',
      owner: { id: owner, name: 'Ján Novák' },
    }),
  ]);
});

test('what is typed is plain text: a % or an _ is no wildcard', async () => {
  await add(await customer('100% Servis'), { vin: vinOf(1), licensePlate: 'BA_11AB' });
  await add(await customer('Ján Novák'), { vin: vinOf(2), licensePlate: 'BA111AB' });

  expect(await found('%')).toEqual([vinOf(1)]);
  expect(await found('100%')).toEqual([vinOf(1)]);
  expect(await found('ba_11')).toEqual([vinOf(1)]);
  expect(await found('_')).toEqual([vinOf(1)]);
  expect(await found('ba_1')).toEqual([vinOf(1)]);
  expect(await found('b%1')).toEqual([]);
});

test('a search that finds nobody gives an empty page', async () => {
  await add(await customer('Ján Novák'), { vin: vinOf(1) });

  expect(await searchVehicles(admin, { query: 'nikto' }, ctx.db)).toEqual({ vehicles: [], page: 1, pageCount: 1, total: 0 });
});

test('a blank search lists every vehicle, the newest first', async () => {
  const owner = await customer('Ján Novák');
  for (const n of [1, 2, 3]) await add(owner, { vin: vinOf(n) });

  expect(await found('')).toEqual([vinOf(3), vinOf(2), vinOf(1)]);
  expect(await found('   ')).toEqual([vinOf(3), vinOf(2), vinOf(1)]);
  expect((await searchVehicles(admin, {}, ctx.db)).vehicles.map((vehicle) => vehicle.vin)).toEqual([vinOf(3), vinOf(2), vinOf(1)]);
});

test('vehicles come 25 to a page, and no vehicle is on two pages or on none', async () => {
  const owner = await customer('Ján Novák');
  const vins = Array.from({ length: 60 }, (_, i) => vinOf(i + 1));
  for (const vin of vins) await add(owner, { vin });
  const newestFirst = [...vins].reverse();

  const [one, two, three] = await Promise.all([1, 2, 3].map((page) => searchVehicles(admin, { page }, ctx.db)));

  expect(one).toMatchObject({ page: 1, pageCount: 3, total: 60 });
  expect(two).toMatchObject({ page: 2, pageCount: 3, total: 60 });
  expect(three).toMatchObject({ page: 3, pageCount: 3, total: 60 });
  expect(one!.vehicles.map((vehicle) => vehicle.vin)).toEqual(newestFirst.slice(0, 25));
  expect(two!.vehicles.map((vehicle) => vehicle.vin)).toEqual(newestFirst.slice(25, 50));
  expect(three!.vehicles.map((vehicle) => vehicle.vin)).toEqual(newestFirst.slice(50));
});

test('exactly 25 vehicles fit on one page', async () => {
  const owner = await customer('Ján Novák');
  for (let i = 1; i <= 25; i++) await add(owner, { vin: vinOf(i) });

  const result = await searchVehicles(admin, {}, ctx.db);

  expect(result).toMatchObject({ page: 1, pageCount: 1, total: 25 });
  expect(result.vehicles).toHaveLength(25);
  expect(await found('', 2)).toHaveLength(25);
});

test('vehicles saved at the same moment come in the order of their id, so no page repeats or skips one', async () => {
  const owner = await customer('Ján Novák');
  for (let i = 1; i <= 30; i++) await add(owner, { vin: vinOf(i) });
  await ctx.db.execute(sql`update vehicle set created_at = now()`);

  const ids = async (page: number) => (await searchVehicles(admin, { page }, ctx.db)).vehicles.map((vehicle) => vehicle.id);
  const listed = [...(await ids(1)), ...(await ids(2))];

  expect(new Set(listed).size).toBe(30);
  // The ids are random, so the order the rows were saved in is not their order.
  expect(listed).toEqual([...listed].sort());
});

test('the pages of a search hold only what it finds', async () => {
  const novak = await customer('Ján Novák');
  const kovac = await customer('Peter Kováč');
  const novakVins = Array.from({ length: 30 }, (_, i) => vinOf(i + 1));
  for (const vin of novakVins) await add(novak, { vin });
  for (let i = 101; i <= 140; i++) await add(kovac, { vin: vinOf(i) });
  const newestFirst = [...novakVins].reverse();

  const one = await searchVehicles(admin, { query: 'novak', page: 1 }, ctx.db);
  const two = await searchVehicles(admin, { query: 'novak', page: 2 }, ctx.db);

  expect(one).toMatchObject({ page: 1, pageCount: 2, total: 30 });
  expect(two).toMatchObject({ page: 2, pageCount: 2, total: 30 });
  expect(one.vehicles.map((vehicle) => vehicle.vin)).toEqual(newestFirst.slice(0, 25));
  expect(two.vehicles.map((vehicle) => vehicle.vin)).toEqual(newestFirst.slice(25));
});

test('a page that does not exist is the nearest one that does', async () => {
  const owner = await customer('Ján Novák');
  for (let i = 1; i <= 30; i++) await add(owner, { vin: vinOf(i) });

  // Past the last page is the last page; anything that is not a page number is the first.
  for (const page of [3, 99]) {
    const result = await searchVehicles(admin, { page }, ctx.db);
    expect(result.page, String(page)).toBe(2);
    expect(result.vehicles, String(page)).toHaveLength(5);
  }
  for (const page of [0, -1, 2.5, Number.NaN]) {
    const result = await searchVehicles(admin, { page }, ctx.db);
    expect(result.page, String(page)).toBe(1);
    expect(result.vehicles, String(page)).toHaveLength(25);
  }
});
