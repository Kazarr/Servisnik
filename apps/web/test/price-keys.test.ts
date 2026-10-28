import { expect, test } from 'vitest';
import { findPriceKeys } from './support/price-keys.ts';

// The helper is a check (testing-strategy): one response that passes, and responses that fail with the exact list of keys.

const list = [
  {
    id: '1',
    number: 'Z2026-0001',
    status: 'received',
    customer: { id: '2', name: 'Firma s.r.o.' },
    vehicle: { vin: 'WVWZZZ1JZ3W386752', make: 'Volkswagen', model: 'Golf', licensePlate: 'BA123AB', network: 'internet', summary: 'ok' },
    completedOn: new Date('2026-07-15'),
  },
];

test('a response with no price key passes', () => {
  expect(findPriceKeys(list)).toEqual([]);
  expect(findPriceKeys([])).toEqual([]);
  expect(findPriceKeys(null)).toEqual([]);
});

test('a price field added to the response is found, whatever its depth', () => {
  const withPrice = [{ ...list[0], vehicle: { ...list[0]!.vehicle, items: [{ name: 'Olej', unitPriceCents: 4000 }] } }];

  expect(findPriceKeys(withPrice)).toEqual(['$[0].vehicle.items[0].unitPriceCents']);
});

test('prices, sums, VAT, margins, discounts and invoices are found by their English and Slovak names, in any spelling of the key', () => {
  const keys = ['totals', 'amounts', 'vatRate', 'purchase_price', 'sale-price', 'margin', 'markup', 'discount', 'invoice', 'Marža', 'cenaSDph', 'zľava', 'hourlyRate'];

  expect(findPriceKeys(Object.fromEntries(keys.map((key) => [key, 1])))).toEqual(keys.map((key) => `$.${key}`));
});

test('a price key is reported once, not its whole subtree', () => {
  expect(findPriceKeys({ id: '1', totals: { net: 1, vat: 2, gross: 3 } })).toEqual(['$.totals']);
});
