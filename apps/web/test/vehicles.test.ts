import { randomUUID } from 'node:crypto';
import { sql } from 'drizzle-orm';
import { afterAll, beforeAll, beforeEach, expect, test } from 'vitest';
import { createCustomer, getCustomer } from '../src/dal/customers.ts';
import { ForbiddenError, UnauthenticatedError } from '../src/dal/user.ts';
import { createVehicle, getVehicle, listVehicles } from '../src/dal/vehicles.ts';
import { admin, idOf, mechanic } from './support/dal.ts';
import { createTestDb } from './support/db.ts';

const vin = 'WVWZZZ1JZ3W386752';

let ctx: Awaited<ReturnType<typeof createTestDb>>;
let ownerId: string;
beforeAll(async () => {
  ctx = await createTestDb();
});
afterAll(() => ctx.close());
beforeEach(async () => {
  await ctx.db.execute(sql`truncate customer cascade`);
  ownerId = idOf(await createCustomer(admin, { type: 'company', name: 'Firma s.r.o.', ico: '12345678' }, ctx.db));
});

const golf = (overrides: { ownerId?: string; vin?: string; licensePlate?: string } = {}) => ({
  ownerId,
  vin,
  licensePlate: 'BA123AB',
  make: 'Volkswagen',
  model: 'Golf',
  ...overrides,
});

test('without a user every function rejects, and nothing is written', async () => {
  const saved = idOf(await createVehicle(admin, golf(), ctx.db));
  const before = await listVehicles(admin, ctx.db);

  await expect(createVehicle(null, golf({ vin: 'WVWZZZ1JZ3W000001' }), ctx.db)).rejects.toBeInstanceOf(UnauthenticatedError);
  await expect(listVehicles(null, ctx.db)).rejects.toBeInstanceOf(UnauthenticatedError);
  await expect(getVehicle(null, saved, ctx.db)).rejects.toBeInstanceOf(UnauthenticatedError);

  expect(await listVehicles(admin, ctx.db)).toEqual(before);
});

test('a mechanik cannot add a vehicle, and nothing is written', async () => {
  await expect(createVehicle(mechanic, golf(), ctx.db)).rejects.toBeInstanceOf(ForbiddenError);

  expect(await listVehicles(admin, ctx.db)).toEqual([]);
});

test('a vehicle for an owner that does not exist, or an id that is not one, is not saved', async () => {
  const unknown = { ok: false, errors: { owner: 'unknown' } };

  await expect(createVehicle(admin, golf({ ownerId: randomUUID() }), ctx.db)).resolves.toEqual(unknown);
  await expect(createVehicle(admin, golf({ ownerId: 'zakaznik-1' }), ctx.db)).resolves.toEqual(unknown);
  expect(await listVehicles(admin, ctx.db)).toEqual([]);
});

test('a vehicle is saved with its VIN normalised and read back with its owner', async () => {
  const id = idOf(await createVehicle(admin, golf({ vin: 'wvw zzz1jz-3w386752', licensePlate: ' ' }), ctx.db));

  expect(await getVehicle(admin, id, ctx.db)).toMatchObject({
    id,
    vin,
    licensePlate: null,
    make: 'Volkswagen',
    model: 'Golf',
    owner: { id: ownerId, name: 'Firma s.r.o.' },
  });
});

test('a vehicle that breaks a rule is not saved, and every reason comes back', async () => {
  const result = await createVehicle(admin, golf({ vin: 'WVWZZZ1JZ3W38675O' }), ctx.db);
  const blank = await createVehicle(admin, { ...golf(), make: '', model: ' ' }, ctx.db);

  expect(result).toEqual({ ok: false, errors: { vin: 'characters' } });
  expect(blank).toEqual({ ok: false, errors: { make: 'required', model: 'required' } });
  expect(await listVehicles(admin, ctx.db)).toEqual([]);
});

test('a second vehicle with the same VIN is not saved, however the VIN is typed and whoever owns it', async () => {
  const other = idOf(await createCustomer(admin, { type: 'person', name: 'Ján Novák' }, ctx.db));
  idOf(await createVehicle(admin, golf(), ctx.db));

  const again = await createVehicle(admin, golf({ ownerId: other, vin: 'wvw-zzz1jz-3w386752' }), ctx.db);

  expect(again).toEqual({ ok: false, errors: { vin: 'taken' } });
  expect(await listVehicles(admin, ctx.db)).toHaveLength(1);
});

test('two attempts at the same VIN at once save exactly one vehicle', async () => {
  const attempts = await Promise.all(Array.from({ length: 5 }, () => createVehicle(admin, golf(), ctx.db)));

  expect(attempts.filter((attempt) => attempt.ok)).toHaveLength(1);
  expect(attempts.filter((attempt) => !attempt.ok)).toEqual(Array(4).fill({ ok: false, errors: { vin: 'taken' } }));
  expect(await listVehicles(admin, ctx.db)).toHaveLength(1);
});

test('vehicles are listed from the newest with VIN, ŠPZ and owner', async () => {
  const other = idOf(await createCustomer(admin, { type: 'person', name: 'Ján Novák' }, ctx.db));
  idOf(await createVehicle(admin, golf(), ctx.db));
  idOf(await createVehicle(admin, golf({ ownerId: other, vin: 'TMBZZZ5JZ3W000002', licensePlate: 'KE456CD' }), ctx.db));

  const list = await listVehicles(admin, ctx.db);

  expect(list.map(({ vin, licensePlate, owner }) => ({ vin, licensePlate, owner: owner.name }))).toEqual([
    { vin: 'TMBZZZ5JZ3W000002', licensePlate: 'KE456CD', owner: 'Ján Novák' },
    { vin, licensePlate: 'BA123AB', owner: 'Firma s.r.o.' },
  ]);
});

test("a customer's detail lists the vehicles they own and no one else's", async () => {
  const other = idOf(await createCustomer(admin, { type: 'person', name: 'Ján Novák' }, ctx.db));
  idOf(await createVehicle(admin, golf(), ctx.db));
  idOf(await createVehicle(admin, golf({ ownerId: other, vin: 'TMBZZZ5JZ3W000002' }), ctx.db));

  const detail = await getCustomer(admin, ownerId, ctx.db);

  expect(detail?.vehicles.map((vehicle) => vehicle.vin)).toEqual([vin]);
});

test('a vehicle that does not exist, or an id that is not one, reads as nothing', async () => {
  await expect(getVehicle(admin, randomUUID(), ctx.db)).resolves.toBeNull();
  await expect(getVehicle(admin, 'vozidlo-1', ctx.db)).resolves.toBeNull();
});
