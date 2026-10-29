import { randomUUID } from 'node:crypto';
import { sql } from 'drizzle-orm';
import { afterAll, beforeAll, beforeEach, expect, test } from 'vitest';
import { createCustomer } from '../src/dal/customers.ts';
import { getQuote } from '../src/dal/print-forms.ts';
import { createVehicle } from '../src/dal/vehicles.ts';
import { addItem, changeWorkOrderStatus, createWorkOrder } from '../src/dal/work-orders.ts';
import { admin } from './support/dal-users.ts';
import { createTestDb } from './support/db.ts';
import { idOf } from './support/id-of.ts';

// The data of the Cenová ponuka (GLOSSARY): the items of a Zákazka with their prices and the sums the domain makes of
// them, and nothing of what the autoservis paid or earns.

let ctx: Awaited<ReturnType<typeof createTestDb>>;
let ownerId: string;
let vehicleId: string;
beforeAll(async () => {
  ctx = await createTestDb();
});
afterAll(() => ctx.close());
beforeEach(async () => {
  await ctx.db.execute(sql`truncate customer, work_order_counter cascade`);
  await ctx.db.execute(sql`update workshop set vat_rates = '{23,19,5}', default_vat_rate = 23`);
  ownerId = idOf(await createCustomer(admin, { type: 'company', name: 'Firma s.r.o.', ico: '12345678' }, ctx.db));
  vehicleId = idOf(await createVehicle(admin, { ownerId, vin: 'WVWZZZ1JZ3W386752', licensePlate: 'BA123AB', make: 'Volkswagen', model: 'Golf' }, ctx.db));
});

const newWorkOrder = async (customerId?: string) =>
  idOf(await createWorkOrder(admin, { vehicleId, customerId, mileageKm: '123 456', customerRequest: 'Výmena oleja', note: 'Zákazník je dlžník' }, ctx.db));

test('the admin reads the number, the customer, the vehicle and the items with their prices, VAT rates and amounts', async () => {
  const id = await newWorkOrder();
  // 1,5 h at 40,00 € with VAT 23 %: 60,00 + 13,80. 3 ks at 9,99 € with VAT 19 %: 29,97 + 5,69 (5,6943 rounded).
  await addItem(admin, id, { kind: 'labour', name: 'Výmena oleja', quantity: '1,5', salePrice: '40', vatRate: '23' }, ctx.db);
  await addItem(admin, id, { kind: 'part', code: 'OF-1', name: 'Olejový filter', quantity: '3', unit: 'ks', purchasePrice: '5', salePrice: '9,99', vatRate: '19' }, ctx.db);

  const quote = await getQuote(admin, id, ctx.db);

  expect(quote).toEqual({
    number: expect.stringMatching(/^Z\d{4}-0001$/),
    customer: { name: 'Firma s.r.o.' },
    vehicle: { vin: 'WVWZZZ1JZ3W386752', licensePlate: 'BA123AB', make: 'Volkswagen', model: 'Golf' },
    items: [
      { code: null, name: 'Výmena oleja', quantityHundredths: 150, unit: 'h', salePriceCents: 4000, vatRate: 23, amounts: { net: 6000, vat: 1380, gross: 7380 } },
      { code: 'OF-1', name: 'Olejový filter', quantityHundredths: 300, unit: 'ks', salePriceCents: 999, vatRate: 19, amounts: { net: 2997, vat: 569, gross: 3566 } },
    ],
    totals: { net: 8997, vat: 1949, gross: 10946 },
  });
});

test('the totals are the sum of the items rounded one by one, not a rounding of the sums', async () => {
  const id = await newWorkOrder();
  // 0,10 € at 5 %: the VAT is 0,005 €, which an item rounds up to 0,01 €; the two together would be 0,01 € if rounded as one.
  await addItem(admin, id, { kind: 'part', name: 'Podložka', quantity: '1', salePrice: '0,10', vatRate: '5' }, ctx.db);
  await addItem(admin, id, { kind: 'part', name: 'Matica', quantity: '1', salePrice: '0,10', vatRate: '5' }, ctx.db);

  expect((await getQuote(admin, id, ctx.db))?.totals).toEqual({ net: 20, vat: 2, gross: 22 });
});

test('the items come in the order they were added', async () => {
  const id = await newWorkOrder();
  for (const name of ['Prvá', 'Druhá', 'Tretia', 'Štvrtá']) await addItem(admin, id, { kind: 'labour', name, quantity: '1', salePrice: '1' }, ctx.db);

  expect((await getQuote(admin, id, ctx.db))?.items.map((item) => item.name)).toEqual(['Prvá', 'Druhá', 'Tretia', 'Štvrtá']);
});

test('the quote has no purchase price and no margin anywhere in it, nor the internal note', async () => {
  const id = await newWorkOrder();
  await addItem(admin, id, { kind: 'part', code: 'OF-1', name: 'Olejový filter', quantity: '1', purchasePrice: '5', salePrice: '9', vatRate: '23' }, ctx.db);

  const quote = JSON.stringify(await getQuote(admin, id, ctx.db));

  expect(quote).not.toMatch(/purchase|margin|markup|nákup|marž/i);
  expect(quote).not.toContain('dlžník');
});

test('a Zákazka without items has an empty list and sums of nothing', async () => {
  expect(await getQuote(admin, await newWorkOrder(), ctx.db)).toMatchObject({ items: [], totals: { net: 0, vat: 0, gross: 0 } });
});

test('the customer is the one the Zákazka was made for, not the Majiteľ the vehicle has now', async () => {
  const otherId = idOf(await createCustomer(admin, { type: 'person', name: 'Iný Zákazník' }, ctx.db));

  expect((await getQuote(admin, await newWorkOrder(otherId), ctx.db))?.customer).toEqual({ name: 'Iný Zákazník' });
});

test('a Zákazka that is Hotová or Zrušená still has its quote: it is not limited by the state', async () => {
  const done = await newWorkOrder();
  await changeWorkOrderStatus(admin, done, { to: 'done' }, ctx.db);
  const cancelled = await newWorkOrder();
  await changeWorkOrderStatus(admin, cancelled, { to: 'cancelled', confirmed: true }, ctx.db);

  expect(await getQuote(admin, done, ctx.db)).not.toBeNull();
  expect(await getQuote(admin, cancelled, ctx.db)).not.toBeNull();
});

test('there is no quote for an id that is no Zákazka, a malformed id included', async () => {
  expect(await getQuote(admin, randomUUID(), ctx.db)).toBeNull();
  expect(await getQuote(admin, 'not-an-id', ctx.db)).toBeNull();
});
