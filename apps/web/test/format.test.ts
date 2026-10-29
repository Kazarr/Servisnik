import { markupFromSalePrice, parseItem, parseMarkup, parseUnitPrice } from '@servisnik/domain/work-order';
import { expect, test } from 'vitest';
import { formatEuroInput, formatMarkupInput, formatPartCount, formatPercent, formatQuantityInput } from '../src/format.ts';

// A price in a field of a form: what the admin reads there is what the domain reads back.

test.each([
  [4000, '40,00'],
  [4550, '45,50'],
  [5, '0,05'],
  [0, '0,00'],
  [100_000_000, '1000000,00'],
])('%i cents are "%s" in a field', (cents, typed) => {
  expect(formatEuroInput(cents)).toBe(typed);
});

test('no price is an empty field', () => {
  expect(formatEuroInput(null)).toBe('');
  expect(formatEuroInput(0)).toBe('0,00');
});

test.each([0, 1, 99, 100, 4550, 3333, 100_000_000])('%i cents typed in a field are read as %i cents again', (cents) => {
  expect(parseUnitPrice(formatEuroInput(cents))).toBe(cents);
});

// A quantity and a Prirážka in a field of a form, as a price is: the domain reads back what the admin sees.

test.each([
  [150, '1,5'],
  [400, '4'],
  [25, '0,25'],
  [1, '0,01'],
  [105, '1,05'],
  [9_999_999, '99999,99'],
])('%i hundredths are "%s" in a field', (hundredths, typed) => {
  expect(formatQuantityInput(hundredths)).toBe(typed);
  const item = parseItem({ kind: 'part', name: 'Diel', quantity: typed, salePrice: '1' }, { defaultVatRate: 23, vatRates: [23] });
  expect(item).toMatchObject({ ok: true, item: { quantityHundredths: hundredths } });
});

test.each([
  [250, '25'],
  [125, '12,5'],
  [0, '0'],
  [5, '0,5'],
  [10_000_000, '1000000'],
  [-100, '-10'],
  [-3, '-0,3'],
])('%i tenths of a percent are "%s" in a field', (tenths, typed) => {
  expect(formatMarkupInput(tenths)).toBe(typed);
});

test('no Prirážka is an empty field, and a Prirážka typed in a field is read as the same tenths again, a negative one too', () => {
  expect(formatMarkupInput(null)).toBe('');
  for (const tenths of [0, 5, 125, 250, 10_000, 9_999_999, -3, -100, -1000]) expect(parseMarkup(formatMarkupInput(tenths))).toBe(tenths);
});

// The form shows the Prirážka that two prices make; what it shows must be a Prirážka it reads, or the field refuses its own value.
test.each([
  ['the cheapest Nákupná cena and the dearest Predajná cena', 1, 100_000_000],
  ['the dearest Nákupná cena sold for nothing', 100_000_000, 0],
  ['a sale a cent below the purchase price', 100_000_000, 99_999_999],
  ['a sale below the purchase price', 1000, 900],
  ['a sale at the purchase price', 1000, 1000],
  ['a sale a third above', 300, 400],
])('the Prirážka of %s is read back as it is shown', (_what, purchasePriceCents, salePriceCents) => {
  const tenths = markupFromSalePrice(purchasePriceCents, salePriceCents)!;

  expect(parseMarkup(formatMarkupInput(tenths))).toBe(tenths);
});

test.each([
  [765, '76,5 %'],
  [200, '20,0 %'],
  [1000, '100,0 %'],
  [0, '0,0 %'],
  [-250, '-25,0 %'],
  [12_345, '1 234,5 %'],
])('%i tenths of a percent read as "%s" on a page', (tenths, text) => {
  expect(formatPercent(tenths).replaceAll(' ', ' ')).toBe(text);
});

test.each([
  [1, '1 diel'],
  [2, '2 diely'],
  [3, '3 diely'],
  [4, '4 diely'],
  [5, '5 dielov'],
  [11, '11 dielov'],
  [22, '22 dielov'],
  [100, '100 dielov'],
])('%i Diely read as "%s"', (count, text) => {
  expect(formatPartCount(count)).toBe(text);
});
