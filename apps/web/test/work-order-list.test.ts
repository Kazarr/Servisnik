import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { expect, test } from 'vitest';
import { WorkOrderList } from '../src/app/(app)/zakazky/work-order-list.tsx';

// The page of Zákazky is an async Server Component, which Vitest cannot run (docs/adr/0001-stack.md).
// Its list is a plain component, rendered here over temporary data.

const orders = [
  {
    id: '7d1c0a3e-0000-4000-8000-000000000001',
    number: 'Z2026-0001',
    status: 'received' as const,
    customer: { id: 'c1', name: 'Firma s.r.o.' },
    vehicle: { id: 'v1', vin: 'WVWZZZ1JZ3W386752', licensePlate: 'BA123AB', make: 'Volkswagen', model: 'Golf' },
  },
];

const render = (role: 'admin' | 'mechanik', list = orders) => renderToStaticMarkup(createElement(WorkOrderList, { orders: list, role }));

test('the admin opens a Zákazka from its number', () => {
  const html = render('admin');

  expect(html).toContain('<a href="/zakazky/7d1c0a3e-0000-4000-8000-000000000001">Z2026-0001</a>');
});

test('the mechanik sees the number, customer, vehicle and status, and the number is only text', () => {
  const html = render('mechanik');

  expect(html).toContain('<td>Z2026-0001</td>');
  expect(html).toContain('<td>Firma s.r.o.</td>');
  expect(html).toContain('Volkswagen Golf, WVWZZZ1JZ3W386752');
  expect(html).toContain('<td>Prijatá</td>');
  expect(html).not.toContain('<a');
  expect(html).not.toContain('href');
});

test('an empty list tells the admin to open a Zákazka on the detail of a vehicle', () => {
  expect(render('admin', [])).toContain('Zatiaľ tu nič nie je. Zákazku založíte na detaile vozidla.');
});

test('an empty list does not tell the mechanik to open a Zákazka, which he may not', () => {
  const html = render('mechanik', []);

  expect(html).toContain('Zatiaľ tu nič nie je.');
  expect(html).not.toContain('Zákazku');
  expect(html).not.toContain('vozidla');
});
