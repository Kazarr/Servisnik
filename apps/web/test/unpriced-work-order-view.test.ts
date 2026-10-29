import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { expect, test } from 'vitest';
import { UnpricedWorkOrderView } from '../src/app/(app)/zakazky/[id]/unpriced-work-order-view.tsx';
import type { UnpricedWorkOrder } from '../src/dal/unpriced-work-order.ts';

// The detail of a Zákazka for the mechanik (spec #95, Mechanik). The page is an async Server Component, which Vitest cannot run
// (docs/adr/0001-stack.md); what it draws for him is this plain component, over the shape the Data Access Layer gives him
// (test/unpriced-work-order.test.ts). e2e/mechanik.spec.ts follows it in a browser.

const id = '7d1c0a3e-0000-4000-8000-000000000001';

const order: UnpricedWorkOrder = {
  id,
  number: 'Z2026-0001',
  status: 'inProgress',
  customer: { name: 'Firma s.r.o.' },
  vehicle: { vin: 'WVWZZZ1JZ3W386752', licensePlate: 'BA123AB', make: 'Volkswagen', model: 'Golf' },
  mileageKm: 123456,
  customerRequest: 'Výmena oleja\nKontrola bŕzd',
  deadline: '2026-12-01',
  note: 'Zákazník príde po štvrtej',
  items: [
    { kind: 'labour', code: null, name: 'Výmena oleja', quantityHundredths: 150, unit: 'h' },
    { kind: 'part', code: 'OF-1', name: 'Olejový filter', quantityHundredths: 200, unit: 'ks' },
  ],
};

const render = (shown: UnpricedWorkOrder = order) => renderToStaticMarkup(createElement(UnpricedWorkOrderView, { order: shown, role: 'mechanik' }));

/** What a person reads of the markup: no tags, one space between the words. */
const textOf = (html: string) => html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ');

test('the mechanik reads the number, status, Termín, customer, vehicle with its ŠPZ, kilometres, request and note', () => {
  const html = render();
  const text = textOf(html);

  expect(html).toContain('<h1>Z2026-0001</h1>');
  expect(text).toContain('Stav V práci');
  expect(text).toContain('Termín 1. 12. 2026');
  expect(text).toContain('Zákazník Firma s.r.o.');
  expect(text).toContain('Vozidlo Volkswagen Golf (WVWZZZ1JZ3W386752)');
  expect(text).toContain('ŠPZ BA123AB');
  expect(text).toContain('Kilometre pri príjme 123 456 km');
  expect(text).toContain('Požiadavka zákazníka Výmena oleja Kontrola bŕzd');
  expect(text).toContain('Poznámka Zákazník príde po štvrtej');
});

test('a Zákazka without a Termín, a note or a ŠPZ shows none of them', () => {
  const text = textOf(render({ ...order, deadline: null, note: null, vehicle: { ...order.vehicle, licensePlate: null } }));

  expect(text).not.toContain('Termín');
  expect(text).not.toContain('Poznámka');
  expect(text).not.toContain('ŠPZ');
});

test('the items are listed with their kind, code, name, quantity and unit, and with nothing else', () => {
  const html = render();
  const table = /<table[^>]*>.*<\/table>/s.exec(html)![0];

  expect(table).toContain('aria-label="Položky zákazky"');
  expect(textOf(table.slice(table.indexOf('<thead'), table.indexOf('</thead>')))).toBe(' Typ Kód Názov Množstvo ');
  const rows = [...table.matchAll(/<tr>(.*?)<\/tr>/gs)].slice(1).map((row) => textOf(row[1]!).trim());
  expect(rows).toEqual(['Práca Výmena oleja 1,5 h', 'Diel OF-1 Olejový filter 2 ks']);
});

test('a Zákazka without items says so, and has no table', () => {
  const html = render({ ...order, items: [] });

  expect(textOf(html)).toContain('Zatiaľ žiadna položka.');
  expect(html).not.toContain('<table');
});

test('the page shows no price, sum, VAT or margin, no euro sign, and no column or label for one', () => {
  const text = textOf(render());

  expect(text).not.toContain('€');
  for (const word of ['cena', 'Cena', 'DPH', 'Marža', 'Nákup', 'Spolu', 'zľava', 'Zľava', 'Faktúra']) expect(text, word).not.toContain(word);
});

// The component draws the fields it is given by name, so a priced Zákazka passed to it by mistake (the type of the full answer has everything
// the shape of the mechanik has) still shows no price.
test('a price that comes along with the Zákazka is not drawn', () => {
  const priced = {
    ...order,
    totals: { net: 77777, vat: 17888, gross: 95665 },
    margin: { purchaseNet: 33333, cents: 44444, percentTenths: 570, partsWithoutPurchasePrice: 0 },
    items: order.items.map((item) => ({ ...item, salePriceCents: 77777, purchasePriceCents: 33333, vatRate: 23, amounts: { net: 77777, vat: 17888, gross: 95665 } })),
  };

  const html = render(priced);

  expect(html).not.toMatch(/77777|777,77|33333|333,33|44444|444,44|95665|956,65|23 %/);
  expect(html).not.toContain('€');
});

test('the page has no form, button or field: the mechanik changes nothing on a Zákazka', () => {
  const html = render();

  for (const tag of ['<form', '<button', '<input', '<select', '<textarea', '<details']) expect(html, tag).not.toContain(tag);
});

test('the only links are the one to the zákazkový list: no edit, no item, no customer, no vehicle, no cenová ponuka and no protokol', () => {
  const html = render();

  expect([...html.matchAll(/href="([^"]*)"/g)].map((link) => link[1])).toEqual([`/zakazky/${id}/zakazkovy-list`]);
});
