import type { Rates } from '@servisnik/domain/settings';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { expect, test } from 'vitest';
import { ItemFields } from '../src/app/(app)/item-fields.tsx';
import { ItemForm, type EditedItem } from '../src/app/(app)/zakazky/[id]/item-form.tsx';
import { input, options } from './support/form-markup.ts';

// The page of a Zákazka is an async Server Component, which Vitest cannot run (docs/adr/0001-stack.md).
// The form for an item is a plain component, rendered here over the rates the page hands it and the item it edits.

const orderId = '7d1c0a3e-0000-4000-8000-000000000001';
const startingRates: Rates = { vatRates: [23, 19, 5], defaultVatRate: 23, hourlyRateCents: 4550, markupPercent: 25 };

const addTo = (kind: 'labour' | 'part', rates: Partial<Rates> = {}) =>
  renderToStaticMarkup(createElement(ItemForm, { rates: { ...startingRates, ...rates }, target: { workOrderId: orderId, kind } }));
const edit = (item: EditedItem, rates: Partial<Rates> = {}) =>
  renderToStaticMarkup(createElement(ItemForm, { rates: { ...startingRates, ...rates }, target: { item } }));

const oilCan: EditedItem = {
  id: '7d1c0a3e-0000-4000-8000-0000000000aa',
  kind: 'part',
  code: 'OL-5W30',
  name: 'Olej 5W-30',
  quantityHundredths: 150,
  unit: 'l',
  purchasePriceCents: 1000,
  unitPriceCents: 1250,
  vatRate: 19,
};

test.each([19, 5, 0])('the VAT rate starts as the default rate of Nastavenia, chosen from their rates: %i', (defaultVatRate) => {
  const html = addTo('labour', { vatRates: [23, 19, 5, 0], defaultVatRate });

  expect(options(html, 'vatRate')).toEqual({ values: ['23', '19', '5', '0'], selected: [String(defaultVatRate)] });
});

test('a Práca starts in hours, with the hourly rate of Nastavenia as its price, and has no Nákupná cena and no Prirážka', () => {
  const html = addTo('labour');

  expect(input(html, 'unit')).toContain('value="h"');
  expect(input(html, 'unitPrice')).toContain('value="45,50"');
  expect(input(html, 'purchasePrice')).toBeNull();
  expect(input(html, 'markup')).toBeNull();
});

test('without an hourly rate the price of a Práca starts empty, and an hourly rate of 0 € is a price, not none', () => {
  expect(input(addTo('labour', { hourlyRateCents: null }), 'unitPrice')).toContain('value=""');
  expect(input(addTo('labour', { hourlyRateCents: 0 }), 'unitPrice')).toContain('value="0,00"');
});

test('a Diel starts in pieces, with the Prirážka of Nastavenia, and no price and no Nákupná cena', () => {
  const html = addTo('part');

  expect(input(html, 'unit')).toContain('value="ks"');
  expect(input(html, 'markup')).toContain('value="25"');
  expect(input(html, 'purchasePrice')).toContain('value=""');
  expect(input(html, 'unitPrice')).toContain('value=""');
});

test.each([[7, '7'], [0, '0'], [150, '150']])('the Prirážka of a new Diel is the one of Nastavenia: %i %%', (markupPercent, typed) => {
  expect(input(addTo('part', { markupPercent }), 'markup')).toContain(`value="${typed}"`);
});

test('the form of a Diel and of a Práca each send their own kind, to the Zákazka they were rendered for', () => {
  expect(addTo('part')).toContain(`name="workOrderId" value="${orderId}"`);
  expect(addTo('part')).toContain('name="kind" value="part"');
  expect(addTo('labour')).toContain('name="kind" value="labour"');
});

test('the form of an item starts with what the item has, the Prirážka worked out from its two prices', () => {
  const html = edit(oilCan);

  expect(input(html, 'code')).toContain('value="OL-5W30"');
  expect(input(html, 'name')).toContain('value="Olej 5W-30"');
  expect(input(html, 'quantity')).toContain('value="1,5"');
  expect(input(html, 'unit')).toContain('value="l"');
  expect(input(html, 'purchasePrice')).toContain('value="10,00"');
  expect(input(html, 'unitPrice')).toContain('value="12,50"');
  expect(input(html, 'markup')).toContain('value="25"');
  expect(options(html, 'vatRate').selected).toEqual(['19']);
  expect(html).toContain(`name="itemId" value="${oilCan.id}"`);
  expect(html).not.toContain('name="workOrderId"');
});

test('the Prirážka of an item is shown with its one decimal, and a Diel without a Nákupná cena has none', () => {
  expect(input(edit({ ...oilCan, purchasePriceCents: 300, unitPriceCents: 400 }), 'markup')).toContain('value="33,3"');
  const html = edit({ ...oilCan, purchasePriceCents: null });
  expect(input(html, 'purchasePrice')).toContain('value=""');
  expect(input(html, 'markup')).toContain('value=""');
});

test('the form of a Práca shows an empty code when it has none, and has no Nákupná cena', () => {
  const html = edit({ ...oilCan, kind: 'labour', code: null, purchasePriceCents: null, unit: 'h' });

  expect(input(html, 'code')).toContain('value=""');
  expect(input(html, 'purchasePrice')).toBeNull();
});

test('an item keeps a VAT rate that Nastavenia no longer offer, as a choice beside the rates they do', () => {
  const html = edit({ ...oilCan, vatRate: 7 }, { vatRates: [23, 19, 5] });

  expect(options(html, 'vatRate')).toEqual({ values: ['23', '19', '5', '7'], selected: ['7'] });
});

// A refused form shows the reason at the field with useActionState, which renderToStaticMarkup does not run, so the fields are rendered over the errors they are handed.
test('a Prirážka the form refused is shown with its reason at its field, tied to it for a screen reader', () => {
  const html = renderToStaticMarkup(
    createElement(ItemFields, {
      kind: 'part',
      prefix: 'part',
      value: () => '',
      errors: { markup: 'Prirážka nesedí s cenami' },
      vatRates: [23],
      syncPrices: () => () => undefined,
    }),
  );

  expect(input(html, 'markup')).toContain('aria-invalid="true"');
  expect(input(html, 'markup')).toContain('aria-describedby="part-markup-error"');
  expect(html).toContain('<p id="part-markup-error" role="alert" class="error">Prirážka nesedí s cenami</p>');
  expect(input(html, 'purchasePrice')).not.toContain('aria-invalid');
});
