import type { Rates } from '@servisnik/domain/settings';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { expect, test } from 'vitest';
import { PriceListForm, type EditedPriceListItem } from '../src/app/(app)/cennik/price-list-form.tsx';
import { input, options } from './support/form-markup.ts';

// The pages of the Cenník are async Server Components, which Vitest cannot run (docs/adr/0001-stack.md). The form for an
// item is a plain component, rendered here over the rates the page hands it and the item it edits. It is the form of a
// Položka zákazky without a quantity, so what is its own is tested here and the Prirážka and the prices in item-form.test.ts.

const startingRates: Rates = { vatRates: [23, 19, 5], defaultVatRate: 23, hourlyRateCents: 4550, markupPercent: 25 };

const add = (kind: 'labour' | 'part', rates: Partial<Rates> = {}) =>
  renderToStaticMarkup(createElement(PriceListForm, { rates: { ...startingRates, ...rates }, target: { kind } }));
const edit = (item: EditedPriceListItem, rates: Partial<Rates> = {}) =>
  renderToStaticMarkup(createElement(PriceListForm, { rates: { ...startingRates, ...rates }, target: { item } }));

const brake: EditedPriceListItem = {
  id: '7d1c0a3e-0000-4000-8000-0000000000bb',
  kind: 'part',
  code: 'BR-123',
  name: 'Brzdová doštička',
  unit: 'ks',
  purchasePriceCents: 2000,
  salePriceCents: 3000,
  vatRate: 19,
};

test.each([19, 5, 0])('the VAT rate starts as the default rate of Nastavenia, chosen from their rates: %i', (defaultVatRate) => {
  const html = add('part', { vatRates: [23, 19, 5, 0], defaultVatRate });

  expect(options(html, 'vatRate')).toEqual({ values: ['23', '19', '5', '0'], selected: [String(defaultVatRate)] });
});

test('a Práca starts in hours with the hourly rate of Nastavenia as its price, and has no Nákupná cena and no Prirážka', () => {
  const html = add('labour');

  expect(input(html, 'unit')).toContain('value="h"');
  expect(input(html, 'salePrice')).toContain('value="45,50"');
  expect(input(html, 'purchasePrice')).toBeNull();
  expect(input(html, 'markup')).toBeNull();
});

test('without an hourly rate the price of a Práca starts empty, and an hourly rate of 0 € is a price, not none', () => {
  expect(input(add('labour', { hourlyRateCents: null }), 'salePrice')).toContain('value=""');
  expect(input(add('labour', { hourlyRateCents: 0 }), 'salePrice')).toContain('value="0,00"');
});

test('a Diel starts in pieces, with the Prirážka of Nastavenia, and no price and no Nákupná cena', () => {
  const html = add('part');

  expect(input(html, 'unit')).toContain('value="ks"');
  expect(input(html, 'markup')).toContain('value="25"');
  expect(input(html, 'purchasePrice')).toContain('value=""');
  expect(input(html, 'salePrice')).toContain('value=""');
});

test.each([[7, '7'], [0, '0'], [150, '150']])('the Prirážka of a new Diel is the one of Nastavenia: %i %%', (markupPercent, typed) => {
  expect(input(add('part', { markupPercent }), 'markup')).toContain(`value="${typed}"`);
});

test('the Cenník has no quantity: an item is in a quantity only on a Zákazka', () => {
  expect(input(add('part'), 'quantity')).toBeNull();
  expect(input(add('labour'), 'quantity')).toBeNull();
  expect(input(edit(brake), 'quantity')).toBeNull();
});

test('the form of a new item sends its kind and no item, and says what it adds', () => {
  const part = add('part');
  const labour = add('labour');

  expect(part).toContain('name="kind" value="part"');
  expect(labour).toContain('name="kind" value="labour"');
  expect(part).not.toContain('name="itemId"');
  expect(part).toContain('aria-label="Pridať diel do cenníka"');
  expect(labour).toContain('aria-label="Pridať prácu do cenníka"');
});

test('the form of an item starts with what the item has, the Prirážka worked out from its two prices', () => {
  const html = edit(brake);

  expect(input(html, 'code')).toContain('value="BR-123"');
  expect(input(html, 'name')).toContain('value="Brzdová doštička"');
  expect(input(html, 'unit')).toContain('value="ks"');
  expect(input(html, 'purchasePrice')).toContain('value="20,00"');
  expect(input(html, 'salePrice')).toContain('value="30,00"');
  expect(input(html, 'markup')).toContain('value="50"');
  expect(options(html, 'vatRate').selected).toEqual(['19']);
  expect(html).toContain(`name="itemId" value="${brake.id}"`);
  expect(html).toContain('name="kind" value="part"');
  expect(html).toContain('aria-label="Upraviť položku cenníka"');
});

test('the form of a Práca shows an empty code when it has none, and has no Nákupná cena', () => {
  const html = edit({ ...brake, kind: 'labour', code: null, purchasePriceCents: null, unit: 'h' });

  expect(input(html, 'code')).toContain('value=""');
  expect(input(html, 'purchasePrice')).toBeNull();
});

test('an item keeps a VAT rate that Nastavenia no longer offer, as a choice beside the rates they do', () => {
  const html = edit({ ...brake, vatRate: 7 }, { vatRates: [23, 19, 5] });

  expect(options(html, 'vatRate')).toEqual({ values: ['23', '19', '5', '7'], selected: ['7'] });
});
