import { sql } from 'drizzle-orm';
import { afterAll, beforeAll, beforeEach, expect, test } from 'vitest';
import { createCustomer } from '../src/dal/customers.ts';
import { getRates, saveRates } from '../src/dal/settings.ts';
import { createVehicle } from '../src/dal/vehicles.ts';
import { addItem, createWorkOrder, getWorkOrder } from '../src/dal/work-orders.ts';
import { workshop } from '../src/db/schema.ts';
import { admin } from './support/dal-users.ts';
import { createTestDb } from './support/db.ts';
import { idOf } from './support/id-of.ts';

// The rates part of Nastavenia (GLOSSARY): the VAT rates with the default one, the hourly rate and the markup on parts.
// Who may read and write them is the table in dal-access.test.ts.

const startingRates = { vatRates: [23, 19, 5], defaultVatRate: 23, hourlyRateCents: null, markupPercent: 0 };
const startingInput = { vatRates: '23\n19\n5', defaultVatRate: '23', hourlyRate: '', markup: '0' };

let ctx: Awaited<ReturnType<typeof createTestDb>>;
let migrated: { rows: number; rates: Awaited<ReturnType<typeof getRates>> };
beforeAll(async () => {
  ctx = await createTestDb();
  migrated = { rows: await ctx.db.$count(workshop), rates: await getRates(admin, ctx.db) };
});
afterAll(() => ctx.close());
// Every test starts from the rates the migration created.
beforeEach(async () => {
  await ctx.db.execute(sql`truncate customer, work_order_counter cascade`);
  expect(await saveRates(admin, startingInput, ctx.db)).toMatchObject({ ok: true });
});

test('a new database has the one row of the autoservis: VAT rates 23, 19 and 5, 23 the default, no hourly rate and a markup of 0 %', () => {
  expect(migrated).toEqual({ rows: 1, rates: startingRates });
});

test('rates the admin saves are what everybody reads next, in the order typed', async () => {
  const saved = await saveRates(admin, { vatRates: '5\n20\n0', defaultVatRate: '20', hourlyRate: '45,5', markup: '30' }, ctx.db);

  const expected = { vatRates: [5, 20, 0], defaultVatRate: 20, hourlyRateCents: 4550, markupPercent: 30 };
  expect(saved).toEqual({ ok: true, rates: expected });
  expect(await getRates(admin, ctx.db)).toEqual(expected);
  expect(await ctx.db.$count(workshop)).toBe(1);
});

test('an empty hourly rate clears the one saved before', async () => {
  await saveRates(admin, { ...startingInput, hourlyRate: '40' }, ctx.db);
  expect((await getRates(admin, ctx.db)).hourlyRateCents).toBe(4000);

  await saveRates(admin, { ...startingInput, hourlyRate: '' }, ctx.db);

  expect((await getRates(admin, ctx.db)).hourlyRateCents).toBeNull();
});

test('rates that break a rule are not saved, and every reason comes back', async () => {
  const result = await saveRates(admin, { vatRates: '23\n23', defaultVatRate: 'x', hourlyRate: '-1', markup: '' }, ctx.db);

  expect(result).toEqual({
    ok: false,
    errors: { vatRates: 'duplicate', defaultVatRate: 'invalid', hourlyRate: 'invalid', markup: 'invalid' },
  });
  expect(await getRates(admin, ctx.db)).toEqual(startingRates);
});

test('removing the default rate, or the last one, is refused with the reason and changes nothing', async () => {
  const defaultRemoved = await saveRates(admin, { ...startingInput, vatRates: '19\n5' }, ctx.db);
  const lastRemoved = await saveRates(admin, { ...startingInput, vatRates: '' }, ctx.db);

  expect(defaultRemoved).toEqual({ ok: false, errors: { defaultVatRate: 'not-in-list' } });
  expect(lastRemoved).toEqual({ ok: false, errors: { vatRates: 'required' } });
  expect(await getRates(admin, ctx.db)).toEqual(startingRates);
});

test('the default rate is replaced in the same save that removes the old one', async () => {
  const result = await saveRates(admin, { ...startingInput, vatRates: '19\n5', defaultVatRate: '19' }, ctx.db);

  expect(result).toMatchObject({ ok: true });
  expect(await getRates(admin, ctx.db)).toEqual({ ...startingRates, vatRates: [19, 5], defaultVatRate: 19 });
});

const labour = { kind: 'labour', name: 'Výmena oleja', quantity: '1', unitPrice: '40' } as const;
async function workOrderWithLabour(vatRate?: string) {
  const ownerId = idOf(await createCustomer(admin, { type: 'person', name: 'Ján Novák' }, ctx.db));
  const vehicleId = idOf(await createVehicle(admin, { ownerId, vin: 'WVWZZZ1JZ3W386752', licensePlate: '', make: 'Volkswagen', model: 'Golf' }, ctx.db));
  const orderId = idOf(await createWorkOrder(admin, { vehicleId, mileageKm: '1', customerRequest: 'Olej' }, ctx.db));
  idOf(await addItem(admin, orderId, { ...labour, vatRate }, ctx.db));
  return orderId;
}

test('work keeps the VAT rate it was added with when that rate is removed from the list', async () => {
  const orderId = await workOrderWithLabour('5');

  await saveRates(admin, { ...startingInput, vatRates: '23\n19' }, ctx.db);

  expect((await getWorkOrder(admin, orderId, ctx.db))?.items).toMatchObject([{ vatRate: 5, amounts: { net: 4000, vat: 200, gross: 4200 } }]);
});

test('work added without a VAT rate gets the default rate of Nastavenia as it is now', async () => {
  await saveRates(admin, { ...startingInput, defaultVatRate: '19' }, ctx.db);

  const orderId = await workOrderWithLabour();

  expect((await getWorkOrder(admin, orderId, ctx.db))?.items).toMatchObject([{ vatRate: 19 }]);
});

// The domain checks these too; the database is the last guard, and the migration's single row must stay single.
test.each([
  ['a second row', sql`insert into workshop (id, vat_rates, default_vat_rate) values (2, '{23}', 23)`, 'workshop_single_row_check'],
  ['a default rate that is not in the list', sql`update workshop set default_vat_rate = 7`, 'workshop_default_vat_rate_check'],
  ['no rates at all', sql`update workshop set vat_rates = '{}'`, 'workshop_default_vat_rate_check'],
  ['a rate above 100', sql`update workshop set vat_rates = '{23,101}'`, 'workshop_vat_rates_check'],
  ['a negative hourly rate', sql`update workshop set hourly_rate_cents = -1`, 'workshop_hourly_rate_cents_check'],
  ['a negative markup', sql`update workshop set markup_percent = -1`, 'workshop_markup_percent_check'],
])('the database refuses %s', async (_what, statement, constraint) => {
  await expect(ctx.db.execute(statement)).rejects.toMatchObject({ cause: { constraint } });

  expect(await getRates(admin, ctx.db)).toEqual(startingRates);
});
