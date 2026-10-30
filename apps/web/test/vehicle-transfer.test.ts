import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, beforeEach, expect, test } from 'vitest';
import { createCustomer, getCustomer } from '../src/dal/customers.ts';
import { createVehicle, getVehicle, searchVehicles, transferOwnership } from '../src/dal/vehicles.ts';
import { createWorkOrder, getWorkOrder, listWorkOrdersOfCustomer, listWorkOrdersOfVehicle } from '../src/dal/work-orders.ts';
import { admin } from './support/dal-users.ts';
import { createTestDb } from './support/db.ts';
import { idOf } from './support/id-of.ts';
import { truncateTables } from './support/reset.ts';
import { savedInOrder } from './support/saved-in-order.ts';

// The Prepis of a Vozidlo (GLOSSARY): it changes the Majiteľ and nothing else, and the Zákazky stay with
// the Vozidlo and with the Zákazník they were made for (spec #67). Against a real PostgreSQL.

let ctx: Awaited<ReturnType<typeof createTestDb>>;
let ownerId: string;
let buyerId: string;
let vehicleId: string;
beforeAll(async () => {
  ctx = await createTestDb();
});
afterAll(() => ctx.close());
beforeEach(async () => {
  await truncateTables(ctx.db, 'customer');
  ownerId = idOf(await createCustomer(admin, { type: 'company', name: 'Firma s.r.o.', ico: '12345678' }, ctx.db));
  buyerId = idOf(await createCustomer(admin, { type: 'person', name: 'Ján Novák' }, ctx.db));
  vehicleId = idOf(
    await createVehicle(
      admin,
      { ownerId, vin: 'WVWZZZ1JZ3W386752', licensePlate: 'BA123AB', make: 'Volkswagen', model: 'Golf', year: '2015', fuel: 'diesel', mileageKm: '123 456', note: 'Nová spojka' },
      ctx.db,
    ),
  );
});

/** The admin transfers the vehicle to `to`, as the form of its detail does: from the owner that detail showed. */
const transfer = (to: string, from = ownerId, id = vehicleId) => transferOwnership(admin, id, { fromOwnerId: from, toOwnerId: to }, ctx.db);

const intake = (overrides: { customerId?: string } = {}) => ({ vehicleId, mileageKm: '1000', customerRequest: 'Výmena oleja', ...overrides });

test('a Prepis gives the vehicle to the new owner and changes nothing else of it', async () => {
  const before = await getVehicle(admin, vehicleId, ctx.db);

  expect(await transfer(buyerId)).toEqual({ ok: true });

  expect(await getVehicle(admin, vehicleId, ctx.db)).toEqual({ ...before, owner: { id: buyerId, name: 'Ján Novák' } });
});

test('after a Prepis the vehicle is among the vehicles of the new owner and gone from the old one, whose other vehicles stay', async () => {
  const staying = idOf(await createVehicle(admin, { ownerId, vin: 'TMBZZZ5JZ3W000002', licensePlate: '', make: 'Škoda', model: 'Fabia' }, ctx.db));

  await transfer(buyerId);

  expect((await getCustomer(admin, ownerId, ctx.db))?.vehicles.map(({ id }) => id)).toEqual([staying]);
  expect((await getCustomer(admin, buyerId, ctx.db))?.vehicles.map(({ id }) => id)).toEqual([vehicleId]);
  const idsOf = async (query: string) => (await searchVehicles(admin, { query }, ctx.db)).vehicles.map(({ id }) => id);
  expect(await idsOf('novak')).toEqual([vehicleId]); // found by the name of the new owner
  expect(await idsOf('firma')).toEqual([staying]); // and no longer by the name of the old one
});

test('after a Prepis every Zákazka of the vehicle is still its Zákazka, unchanged and with the customer it was made for', async () => {
  const other = idOf(await createCustomer(admin, { type: 'person', name: 'Peter Horváth' }, ctx.db));
  const ownOrder = idOf(await createWorkOrder(admin, intake(), ctx.db)); // for the owner of the vehicle
  const foreignOrder = idOf(await createWorkOrder(admin, intake({ customerId: other }), ctx.db)); // for someone else, on the same vehicle
  await savedInOrder(ctx.db, 'work_order', [ownOrder, foreignOrder]);
  const before = [await getWorkOrder(admin, ownOrder, ctx.db), await getWorkOrder(admin, foreignOrder, ctx.db)];

  await transfer(buyerId);

  expect([await getWorkOrder(admin, ownOrder, ctx.db), await getWorkOrder(admin, foreignOrder, ctx.db)]).toEqual(before);
  expect((await listWorkOrdersOfVehicle(admin, vehicleId, ctx.db)).map(({ id, customer }) => [id, customer.id])).toEqual([
    [foreignOrder, other],
    [ownOrder, ownerId],
  ]);
  expect((await listWorkOrdersOfCustomer(admin, ownerId, ctx.db)).map(({ id }) => id)).toEqual([ownOrder]);
  expect(await listWorkOrdersOfCustomer(admin, buyerId, ctx.db)).toEqual([]);
});

test('a Prepis to the owner the vehicle has is refused, and the vehicle stays as it is', async () => {
  const before = await getVehicle(admin, vehicleId, ctx.db);

  await expect(transfer(ownerId)).resolves.toEqual({ ok: false, errors: { owner: 'same' } });

  expect(await getVehicle(admin, vehicleId, ctx.db)).toEqual(before);
});

test('a Prepis to a customer that does not exist, or an id that is not one, is refused and changes nothing', async () => {
  const before = await getVehicle(admin, vehicleId, ctx.db);
  const unknown = { ok: false, errors: { owner: 'unknown' } };

  await expect(transfer(randomUUID())).resolves.toEqual(unknown);
  await expect(transfer('zakaznik-1')).resolves.toEqual(unknown);

  expect(await getVehicle(admin, vehicleId, ctx.db)).toEqual(before);
});

test('a Prepis of a vehicle that does not exist, or an id that is not one, is refused', async () => {
  const unknown = { ok: false, errors: { vehicle: 'unknown' } };

  await expect(transfer(buyerId, ownerId, randomUUID())).resolves.toEqual(unknown);
  await expect(transfer(buyerId, ownerId, 'vozidlo-1')).resolves.toEqual(unknown);
});

test('a Prepis confirmed for an owner the vehicle no longer has is refused as changed, whoever the new owner is', async () => {
  const third = idOf(await createCustomer(admin, { type: 'person', name: 'Peter Horváth' }, ctx.db));
  await transfer(buyerId); // another admin was first
  const before = await getVehicle(admin, vehicleId, ctx.db);
  const changed = { ok: false, errors: { owner: 'changed' } };

  await expect(transfer(third)).resolves.toEqual(changed); // from the owner it showed, who is not the owner any more
  await expect(transfer(ownerId, third)).resolves.toEqual(changed); // from a customer the vehicle never had
  await expect(transfer(third, 'zakaznik-1')).resolves.toEqual(changed); // from something that is not even an id

  expect(await getVehicle(admin, vehicleId, ctx.db)).toEqual(before);
  expect(before).toMatchObject({ owner: { id: buyerId } });
});

test('Prepisy of the same vehicle at once, each from the owner it showed: exactly one gets through', async () => {
  const buyers = [buyerId, ...(await Promise.all(['Peter Horváth', 'Eva Malá', 'Jozef Veľký', 'Anna Stredná'].map(async (name) => idOf(await createCustomer(admin, { type: 'person', name }, ctx.db)))))];

  const results = await Promise.all(buyers.map((buyer) => transfer(buyer)));

  expect(results.filter((result) => result.ok)).toHaveLength(1);
  expect(results.filter((result) => !result.ok)).toEqual(Array(4).fill({ ok: false, errors: { owner: 'changed' } }));
  const winner = buyers[results.findIndex((result) => result.ok)];
  expect(await getVehicle(admin, vehicleId, ctx.db)).toMatchObject({ owner: { id: winner } });
});
