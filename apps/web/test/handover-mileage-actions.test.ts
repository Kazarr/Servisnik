import { afterAll, beforeAll, beforeEach, expect, test, vi } from 'vitest';
import { saveHandoverMileage } from '../src/app/(app)/zakazky/actions.ts';
import { createCustomer } from '../src/dal/customers.ts';
import { createVehicle } from '../src/dal/vehicles.ts';
import { changeWorkOrderStatus, createWorkOrder, getWorkOrder } from '../src/dal/work-orders.ts';
import type { Database } from '../src/db/index.ts';
import { admin } from './support/dal-users.ts';
import { createTestDb } from './support/db.ts';
import { digestOf } from './support/digest-of.ts';
import { form } from './support/form-data.ts';
import { idOf } from './support/id-of.ts';
import { truncateTables } from './support/reset.ts';

// The Server Action of the form of the Kilometre pri odovzdaní (GLOSSARY, #164), called as the admin's form calls it: what it answers
// for kilometres that are saved, lower than at intake, refused, or sent for a Zákazka that cannot take them. The DAL is the real
// one, over the database of this file; who may call it is in forbidden.test.ts.

const { handed } = vi.hoisted(() => ({ handed: { db: null as unknown as Database } }));
vi.mock('../src/dal/current-user.ts', async () => ({ currentUser: async () => (await import('./support/dal-users.ts')).admin }));
vi.mock('../src/db/index.ts', async (importOriginal) => ({ ...(await importOriginal<typeof import('../src/db/index.ts')>()), getDb: () => handed.db }));
// A saved entry asks Next.js to draw the page again, which outside a request has nothing to do.
vi.mock('next/cache', () => ({ revalidatePath: () => undefined }));

let ctx: Awaited<ReturnType<typeof createTestDb>>;
let vehicleId: string;
beforeAll(async () => {
  ctx = await createTestDb();
  handed.db = ctx.db;
});
afterAll(() => ctx.close());
beforeEach(async () => {
  await truncateTables(ctx.db, 'customer', 'work_order_counter');
  const ownerId = idOf(await createCustomer(admin, { type: 'person', name: 'Ján Novák' }, ctx.db));
  vehicleId = idOf(await createVehicle(admin, { ownerId, vin: 'WVWZZZ1JZ3W386752', licensePlate: '', make: 'Volkswagen', model: 'Golf' }, ctx.db));
});

/** A Zákazka made at 100 000 km, and taken to Hotová unless `done` says otherwise. */
async function newOrder(done = true) {
  const id = idOf(await createWorkOrder(admin, { vehicleId, mileageKm: '100 000', customerRequest: 'Výmena oleja' }, ctx.db));
  if (done) await changeWorkOrderStatus(admin, id, { to: 'done' }, ctx.db);
  return id;
}
const handoverKm = async (id: string) => (await getWorkOrder(admin, id, ctx.db))?.handoverMileageKm;
const sent = (workOrderId: string, handoverMileageKm: string) => form({ workOrderId, handoverMileageKm });

test('kilometres at handover are saved and the form keeps what was typed, with no warning', async () => {
  const id = await newOrder();

  const answer = await saveHandoverMileage(null, sent(id, '100 450'));

  expect(answer).toEqual({ values: { handoverMileageKm: '100 450' }, errors: {} });
  expect(await handoverKm(id)).toBe(100450);
});

test('kilometres lower than at intake are saved, and the form is told to warn, naming the kilometres at intake and the Stav km of the vehicle that stays', async () => {
  const id = await newOrder();

  const answer = await saveHandoverMileage(null, sent(id, '90 000'));

  expect(answer).toEqual({ values: { handoverMileageKm: '90 000' }, errors: {}, lowerThanIntake: { intakeKm: 100000, vehicleMileageKm: 100000 } });
  expect(await handoverKm(id)).toBe(90000);
});

test('a blank entry clears the kilometres at handover', async () => {
  const id = await newOrder();
  await saveHandoverMileage(null, sent(id, '100 450'));

  const answer = await saveHandoverMileage(null, sent(id, ''));

  expect(answer).toEqual({ values: { handoverMileageKm: '' }, errors: {} });
  expect(await handoverKm(id)).toBeNull();
});

test('kilometres that are not a number come back to the form with the reason at the field and what was typed, and are not saved', async () => {
  const id = await newOrder();

  const answer = await saveHandoverMileage(null, sent(id, '12,5'));

  expect(answer).toEqual({ values: { handoverMileageKm: '12,5' }, errors: { handoverMileageKm: 'Zadajte kilometre ako celé číslo, 0 alebo viac' } });
  expect(await handoverKm(id)).toBeNull();
});

test('kilometres sent for a Zákazka that is not Hotová or Vyfakturovaná are refused with a message on the form, and change nothing', async () => {
  const id = await newOrder(false);

  const answer = await saveHandoverMileage(null, sent(id, '100 450'));

  expect(answer).toEqual({
    values: { handoverMileageKm: '100 450' },
    errors: { form: 'Kilometre pri odovzdaní sa dajú zadať len na zákazke v stave Hotová alebo Vyfakturovaná' },
  });
  expect(await handoverKm(id)).toBeNull();
});

test('kilometres sent for a Zákazka that does not exist are a page that does not exist', async () => {
  const digest = await digestOf(saveHandoverMileage(null, sent('3f0c8c1e-6a52-4a39-9c52-0d4a4b6c1f10', '100 450')));

  expect(digest).toMatch(/^NEXT_HTTP_ERROR_FALLBACK;404/);
});
