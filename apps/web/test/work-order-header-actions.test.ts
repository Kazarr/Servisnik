import { afterAll, beforeAll, expect, test, vi } from 'vitest';
import { addWorkOrder, editWorkOrder } from '../src/app/(app)/zakazky/actions.ts';
import { createCustomer } from '../src/dal/customers.ts';
import { createVehicle } from '../src/dal/vehicles.ts';
import { changeWorkOrderStatus, createWorkOrder, getWorkOrder } from '../src/dal/work-orders.ts';
import type { Database } from '../src/db/index.ts';
import { admin } from './support/dal-users.ts';
import { createTestDb } from './support/db.ts';
import { idOf } from './support/id-of.ts';

// The Server Actions that save the header of a Zákazka, called as the admin's forms call them (docs/adr/0001-stack.md):
// what they answer for a header that cannot be saved, and where a saved one leads. What they answer a mechanik is
// in forbidden.test.ts. The DAL is the real one, over the database of this file.

const { handed } = vi.hoisted(() => ({ handed: { db: null as unknown as Database } }));
vi.mock('../src/dal/current-user.ts', async () => ({ currentUser: async () => (await import('./support/dal-users.ts')).admin }));
vi.mock('../src/db/index.ts', async (importOriginal) => ({ ...(await importOriginal<typeof import('../src/db/index.ts')>()), getDb: () => handed.db }));

let ctx: Awaited<ReturnType<typeof createTestDb>>;
let vehicleId: string;
beforeAll(async () => {
  ctx = await createTestDb();
  const ownerId = idOf(await createCustomer(admin, { type: 'person', name: 'Ján Novák' }, ctx.db));
  vehicleId = idOf(await createVehicle(admin, { ownerId, vin: 'WVWZZZ1JZ3W386752', licensePlate: '', make: 'Volkswagen', model: 'Golf' }, ctx.db));
});
afterAll(() => ctx.close());

function form(fields: Record<string, string>) {
  const data = new FormData();
  for (const [name, value] of Object.entries(fields)) data.set(name, value);
  return data;
}

const header = { mileageKm: '150000', customerRequest: 'Výmena brzdových kotúčov', deadline: '2026-08-01', note: 'Zákazník príde po 16:00' };

/** The digest Next puts on the error that `redirect()` and `notFound()` throw. */
const digestOf = async (call: Promise<unknown>) => {
  try {
    await call;
  } catch (error) {
    return (error as { digest?: string }).digest;
  }
  return undefined;
};

async function newOrder() {
  return idOf(await createWorkOrder(admin, { vehicleId, mileageKm: '1000', customerRequest: 'Výmena oleja' }, ctx.db));
}

test('the admin saves the header and goes on to the detail of the Zákazka', async () => {
  handed.db = ctx.db;
  const id = await newOrder();

  const digest = await digestOf(editWorkOrder(null, form({ id, ...header })));

  expect(digest).toMatch(new RegExp(`^NEXT_REDIRECT;.*/zakazky/${id};`));
  expect(await getWorkOrder(admin, id, ctx.db)).toMatchObject({ mileageKm: 150000, customerRequest: 'Výmena brzdových kotúčov', deadline: '2026-08-01', note: 'Zákazník príde po 16:00' });
});

test('a header with a Termín that is not a day comes back to the form with the reason at the field and what was typed', async () => {
  handed.db = ctx.db;
  const id = await newOrder();
  const typed = { ...header, mileageKm: '-5', customerRequest: ' ', deadline: '30. 2. 2026' };

  const answer = await editWorkOrder(null, form({ id, ...typed }));

  expect(answer).toEqual({
    values: typed,
    errors: {
      mileageKm: 'Zadajte kilometre ako celé číslo, 0 alebo viac',
      customerRequest: 'Vyplňte požiadavku zákazníka',
      deadline: 'Zadajte termín ako platný dátum',
    },
  });
  expect(await getWorkOrder(admin, id, ctx.db)).toMatchObject({ mileageKm: 1000, deadline: null, note: null });
});

test('a header sent for a Zákazka that is no longer Rozpracovaná is refused with a message on the form, and changes nothing', async () => {
  handed.db = ctx.db;
  const id = await newOrder();
  await changeWorkOrderStatus(admin, id, { to: 'done' }, ctx.db);

  const answer = await editWorkOrder(null, form({ id, ...header }));

  expect(answer).toEqual({ values: header, errors: { form: 'Zákazka už nie je rozpracovaná, jej hlavičku nemožno upraviť' } });
  expect(await getWorkOrder(admin, id, ctx.db)).toMatchObject({ mileageKm: 1000, deadline: null });
});

test('a header sent for a Zákazka that does not exist is a page that does not exist', async () => {
  handed.db = ctx.db;

  const digest = await digestOf(editWorkOrder(null, form({ id: '3f0c8c1e-6a52-4a39-9c52-0d4a4b6c1f10', ...header })));

  expect(digest).toMatch(/^NEXT_HTTP_ERROR_FALLBACK;404/);
});

test('the form of a new Zákazka saves the Termín and the note with it', async () => {
  handed.db = ctx.db;

  const digest = await digestOf(addWorkOrder(null, form({ vehicleId, ...header })));

  const id = /\/zakazky\/([0-9a-f-]{36});/.exec(digest ?? '')?.[1];
  expect(id).toBeDefined();
  expect(await getWorkOrder(admin, id!, ctx.db)).toMatchObject({ mileageKm: 150000, deadline: '2026-08-01', note: 'Zákazník príde po 16:00' });
});
