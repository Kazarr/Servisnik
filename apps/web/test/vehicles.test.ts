import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { parseLicensePlate } from '@servisnik/domain/vehicle';
import { sql } from 'drizzle-orm';
import { afterAll, beforeAll, beforeEach, expect, test } from 'vitest';
import { createCustomer, getCustomer } from '../src/dal/customers.ts';
import { ForbiddenError, UnauthenticatedError } from '../src/dal/user.ts';
import { createVehicle, getVehicle, listVehicles, updateVehicle } from '../src/dal/vehicles.ts';
import { createWorkOrder, getWorkOrder } from '../src/dal/work-orders.ts';
import { admin, mechanic } from './support/dal-users.ts';
import { createTestDb } from './support/db.ts';
import { idOf } from './support/id-of.ts';

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

/** What the edit form sends: a vehicle without its owner, which only a Prepis changes. */
const golfFields = (overrides: Partial<Parameters<typeof updateVehicle>[2]> = {}) => {
  const { ownerId: _owner, ...fields } = golf();
  return { ...fields, ...overrides };
};

test('without a user every function rejects, and nothing is written', async () => {
  const saved = idOf(await createVehicle(admin, golf(), ctx.db));
  const before = await listVehicles(admin, ctx.db);

  await expect(createVehicle(null, golf({ vin: 'WVWZZZ1JZ3W000001' }), ctx.db)).rejects.toBeInstanceOf(UnauthenticatedError);
  await expect(updateVehicle(null, saved, golfFields({ vin: 'WVWZZZ1JZ3W000001' }), ctx.db)).rejects.toBeInstanceOf(UnauthenticatedError);
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

test('a field error, and a VIN that is taken, are answered before an owner that does not exist', async () => {
  idOf(await createVehicle(admin, golf(), ctx.db));
  const nobody = randomUUID();

  // Every input below also names an owner that does not exist, or one that is not an id.
  await expect(createVehicle(admin, golf({ ownerId: nobody, vin: 'WVWZZZ1JZ3W38675O' }), ctx.db)).resolves.toEqual({
    ok: false,
    errors: { vin: 'confusable' },
  });
  await expect(createVehicle(admin, golf({ ownerId: 'zakaznik-1', vin: 'WVWZZZ1JZ3W38675O' }), ctx.db)).resolves.toEqual({
    ok: false,
    errors: { vin: 'confusable' },
  });
  await expect(createVehicle(admin, golf({ ownerId: nobody }), ctx.db)).resolves.toMatchObject({ ok: false, errors: { vin: 'taken' } });
  expect(await listVehicles(admin, ctx.db)).toHaveLength(1);
});

test('a vehicle is saved with its VIN and ŠPZ normalised and read back with its owner', async () => {
  const id = idOf(await createVehicle(admin, golf({ vin: 'wvw zzz1jz-3w386752', licensePlate: ' ba-123 ab ' }), ctx.db));

  expect(await getVehicle(admin, id, ctx.db)).toMatchObject({
    id,
    vin,
    licensePlate: 'BA123AB',
    make: 'Volkswagen',
    model: 'Golf',
    year: null,
    fuel: null,
    mileageKm: null,
    note: null,
    owner: { id: ownerId, name: 'Firma s.r.o.' },
  });
  const blank = idOf(await createVehicle(admin, golf({ vin: 'TMBZZZ5JZ3W000002', licensePlate: ' ' }), ctx.db));
  expect(await getVehicle(admin, blank, ctx.db)).toMatchObject({ licensePlate: null });
});

test('the year, fuel, kilometres and note of a vehicle are saved and read back', async () => {
  const id = idOf(await createVehicle(admin, { ...golf(), year: '2015', fuel: 'diesel', mileageKm: '123 456', note: ' Nová spojka ' }, ctx.db));

  expect(await getVehicle(admin, id, ctx.db)).toMatchObject({ year: 2015, fuel: 'diesel', mileageKm: 123456, note: 'Nová spojka' });
});

test('a vehicle that breaks a rule is not saved, and every reason comes back', async () => {
  const result = await createVehicle(admin, golf({ vin: 'WVWZZZ1JZ3W38675O' }), ctx.db);
  const blank = await createVehicle(admin, { ...golf(), make: '', model: ' ' }, ctx.db);
  const details = await createVehicle(admin, { ...golf(), year: '1949', fuel: 'steam', mileageKm: '-5' }, ctx.db);
  const future = await createVehicle(admin, { ...golf(), year: '3000' }, ctx.db);

  expect(result).toEqual({ ok: false, errors: { vin: 'confusable' } });
  expect(blank).toEqual({ ok: false, errors: { make: 'required', model: 'required' } });
  expect(details).toEqual({ ok: false, errors: { year: 'invalid', fuel: 'invalid', mileageKm: 'invalid' } });
  expect(future).toEqual({ ok: false, errors: { year: 'invalid' } });
  expect(await listVehicles(admin, ctx.db)).toEqual([]);
});

test('a second vehicle with the same VIN is not saved, however the VIN is typed and whoever owns it, and the answer names the first', async () => {
  const other = idOf(await createCustomer(admin, { type: 'person', name: 'Ján Novák' }, ctx.db));
  const first = idOf(await createVehicle(admin, golf(), ctx.db));

  const again = await createVehicle(admin, golf({ ownerId: other, vin: 'wvw-zzz1jz-3w386752' }), ctx.db);

  expect(again).toEqual({
    ok: false,
    errors: { vin: 'taken' },
    existing: { id: first, make: 'Volkswagen', model: 'Golf', owner: { id: ownerId, name: 'Firma s.r.o.' } },
  });
  expect(await listVehicles(admin, ctx.db)).toHaveLength(1);
});

test('two attempts at the same VIN at once save exactly one vehicle', async () => {
  const attempts = await Promise.all(Array.from({ length: 5 }, () => createVehicle(admin, golf(), ctx.db)));

  const saved = attempts.filter((attempt) => attempt.ok);
  expect(saved).toHaveLength(1);
  expect(attempts.filter((attempt) => !attempt.ok)).toEqual(
    Array(4).fill({
      ok: false,
      errors: { vin: 'taken' },
      existing: { id: idOf(saved[0]!), make: 'Volkswagen', model: 'Golf', owner: { id: ownerId, name: 'Firma s.r.o.' } },
    }),
  );
  expect(await listVehicles(admin, ctx.db)).toHaveLength(1);
});

test('two vehicles with the same ŠPZ are both saved, however it is typed', async () => {
  const first = idOf(await createVehicle(admin, golf({ licensePlate: 'BA123AB' }), ctx.db));
  const second = idOf(await createVehicle(admin, golf({ vin: 'TMBZZZ5JZ3W000002', licensePlate: 'ba-123 ab' }), ctx.db));

  expect(await getVehicle(admin, first, ctx.db)).toMatchObject({ licensePlate: 'BA123AB' });
  expect(await getVehicle(admin, second, ctx.db)).toMatchObject({ licensePlate: 'BA123AB' });
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

test('the VIN of a saved vehicle is corrected, its owner and Zákazky stay with it', async () => {
  const id = idOf(await createVehicle(admin, golf({ vin: 'WVWZZZ1JZ3W386725' }), ctx.db)); // the last two digits swapped
  const created = await createWorkOrder(admin, { vehicleId: id, mileageKm: '1000', customerRequest: 'Výmena oleja' }, ctx.db);
  if (!created.ok) throw new Error('The Zákazka was expected to be saved.');

  const result = await updateVehicle(admin, id, golfFields({ vin: 'wvw zzz1jz-3w386752' }), ctx.db);

  expect(result).toEqual({ ok: true });
  expect(await getVehicle(admin, id, ctx.db)).toMatchObject({ id, vin, owner: { id: ownerId } });
  expect(await getWorkOrder(admin, created.id, ctx.db)).toMatchObject({ vehicle: { id, vin } });
  expect(await listVehicles(admin, ctx.db)).toHaveLength(1);
});

test('a vehicle saved again with every field replaces them all, and a blank one clears what was there', async () => {
  const id = idOf(await createVehicle(admin, { ...golf(), year: '2015', fuel: 'diesel', mileageKm: '123 456', note: 'Nová spojka' }, ctx.db));

  expect(await updateVehicle(admin, id, golfFields({ make: 'Škoda', model: 'Octavia', licensePlate: 'ke-456 cd', year: '2020', fuel: 'petrol', mileageKm: '5', note: 'Servis' }), ctx.db)).toEqual({ ok: true });
  expect(await getVehicle(admin, id, ctx.db)).toMatchObject({ make: 'Škoda', model: 'Octavia', licensePlate: 'KE456CD', year: 2020, fuel: 'petrol', mileageKm: 5, note: 'Servis' });

  expect(await updateVehicle(admin, id, golfFields({ licensePlate: '', year: '', fuel: '', mileageKm: '', note: '' }), ctx.db)).toEqual({ ok: true });
  expect(await getVehicle(admin, id, ctx.db)).toMatchObject({ licensePlate: null, year: null, fuel: null, mileageKm: null, note: null });
});

test('a vehicle saved again with its own VIN, however typed, is no duplicate of itself', async () => {
  const id = idOf(await createVehicle(admin, golf(), ctx.db));

  expect(await updateVehicle(admin, id, golfFields({ vin: 'wvwzzz1jz3w386752', model: 'Passat' }), ctx.db)).toEqual({ ok: true });

  expect(await getVehicle(admin, id, ctx.db)).toMatchObject({ vin, model: 'Passat' });
});

test('a corrected vehicle keeps the rules: a VIN that is not valid, or that another vehicle has, changes nothing', async () => {
  const id = idOf(await createVehicle(admin, golf(), ctx.db));
  const other = idOf(await createVehicle(admin, golf({ vin: 'TMBZZZ5JZ3W000002', licensePlate: 'KE456CD' }), ctx.db));
  const before = await listVehicles(admin, ctx.db);

  expect(await updateVehicle(admin, id, golfFields({ vin: 'WVWZZZ1JZ3W38675' }), ctx.db)).toEqual({ ok: false, errors: { vin: 'length' } });
  expect(await updateVehicle(admin, id, golfFields({ vin: 'WVWZZZ1JZ3W38675O' }), ctx.db)).toEqual({ ok: false, errors: { vin: 'confusable' } });
  expect(await updateVehicle(admin, id, golfFields({ make: ' ' }), ctx.db)).toEqual({ ok: false, errors: { make: 'required' } });
  expect(await updateVehicle(admin, id, golfFields({ vin: ' tmb-zzz5jz3w000002' }), ctx.db)).toEqual({
    ok: false,
    errors: { vin: 'taken' },
    existing: { id: other, make: 'Volkswagen', model: 'Golf', owner: { id: ownerId, name: 'Firma s.r.o.' } },
  });

  expect(await listVehicles(admin, ctx.db)).toEqual(before);
});

test('two vehicles corrected to the same VIN at once: exactly one gets it', async () => {
  const first = idOf(await createVehicle(admin, golf({ vin: 'WVWZZZ1JZ3W000001' }), ctx.db));
  const second = idOf(await createVehicle(admin, golf({ vin: 'WVWZZZ1JZ3W000002' }), ctx.db));

  const results = await Promise.all([first, second].map((id) => updateVehicle(admin, id, golfFields({ vin: 'WVWZZZ1JZ3W000003' }), ctx.db)));

  expect(results.filter((result) => result.ok)).toHaveLength(1);
  expect(results.filter((result) => !result.ok)).toEqual([expect.objectContaining({ errors: { vin: 'taken' } })]);
  const vins = (await listVehicles(admin, ctx.db)).map((listed) => listed.vin);
  expect(vins.filter((listed) => listed === 'WVWZZZ1JZ3W000003')).toHaveLength(1);
});

test('a vehicle that does not exist, or an id that is not one, is not corrected', async () => {
  const before = await listVehicles(admin, ctx.db);

  await expect(updateVehicle(admin, randomUUID(), golfFields(), ctx.db)).resolves.toEqual({ ok: false, errors: { vehicle: 'unknown' } });
  await expect(updateVehicle(admin, 'vozidlo-1', golfFields(), ctx.db)).resolves.toEqual({ ok: false, errors: { vehicle: 'unknown' } });

  expect(await listVehicles(admin, ctx.db)).toEqual(before);
});

test('the migration gives the ŠPZ of the vehicles that exist before it the form the domain gives it', async () => {
  // Plates as the vehicles saved before the ŠPZ was normalised hold them: as typed, and trimmed at best.
  const nbsp = String.fromCharCode(0xa0);
  const thinSpace = String.fromCharCode(0x2009);
  const before = ['ba-123 ab', 'BA123AB', 'ke 456 cd', 'tn-789-ef', `zv${nbsp}111${nbsp}gh`, `Ľ-1${thinSpace}x`, '-', ''];
  for (const [i, plate] of before.entries()) {
    await ctx.db.execute(
      sql`insert into vehicle (vin, owner_id, license_plate, make, model) values (${`WVWZZZ1JZ3W00001${i}`}, ${ownerId}, ${plate}, 'Škoda', 'Fabia')`,
    );
  }

  // The file's own UPDATE, as the migrator runs it.
  const migration = readFileSync(new URL('../drizzle/0005_vehicle_details.sql', import.meta.url), 'utf8');
  const normalise = migration.split('--> statement-breakpoint').find((statement) => statement.includes('UPDATE "vehicle"'));
  await ctx.db.execute(sql.raw(normalise!.replace(/^--.*$/gm, '')));

  const stored = await ctx.db.execute<{ vin: string; license_plate: string | null }>(sql`select vin, license_plate from vehicle order by vin`);
  expect(stored.rows.map((row) => row.license_plate)).toEqual(before.map(parseLicensePlate));
});
