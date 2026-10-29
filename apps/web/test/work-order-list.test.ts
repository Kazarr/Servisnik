import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { expect, test } from 'vitest';
import { listHref } from '../src/app/(app)/zakazky/list-href.ts';
import { WorkOrderFilter } from '../src/app/(app)/zakazky/work-order-filter.tsx';
import { WorkOrderList } from '../src/app/(app)/zakazky/work-order-list.tsx';

// The page of Zákazky is an async Server Component, which Vitest cannot run (docs/adr/0001-stack.md).
// Its list and its filter are plain components, rendered here over temporary data.

type Order = Parameters<typeof WorkOrderList>[0]['orders'][number];

const order = (overrides: Partial<Order> = {}): Order => ({
  id: '7d1c0a3e-0000-4000-8000-000000000001',
  number: 'Z2026-0001',
  status: 'received',
  deadline: null,
  customer: { id: 'c1', name: 'Firma s.r.o.' },
  vehicle: { id: 'v1', vin: 'WVWZZZ1JZ3W386752', licensePlate: 'BA123AB', make: 'Volkswagen', model: 'Golf' },
  ...overrides,
});

const noon = new Date('2026-11-03T12:00:00Z'); // 3 November in Bratislava

const render = (role: 'admin' | 'mechanik', list: Order[] = [order()], now = noon, without?: 'vehicle') =>
  renderToStaticMarkup(createElement(WorkOrderList, { orders: list, role, now, without }));

/** The `<tr>` of the body that holds this number, as markup. */
function rowOf(html: string, number: string) {
  const found = new RegExp(`<tr[^>]*>(?:(?!</tr>).)*${number}(?:(?!</tr>).)*</tr>`).exec(html);
  if (!found) throw new Error(`No row for ${number}.`);
  return found[0];
}

test('the admin opens a Zákazka from its number', () => {
  const html = render('admin');

  expect(html).toContain('<a href="/zakazky/7d1c0a3e-0000-4000-8000-000000000001">Z2026-0001</a>');
});

// His detail of a Zákazka has no price (spec #95, Mechanik), so the number opens it for him too.
test('the mechanik sees the number, customer, vehicle and status, and opens the detail from the number', () => {
  const html = render('mechanik');

  expect(html).toContain('<a href="/zakazky/7d1c0a3e-0000-4000-8000-000000000001">Z2026-0001</a>');
  expect(html).toContain('<td>Firma s.r.o.</td>');
  expect(html).toContain('Volkswagen Golf, WVWZZZ1JZ3W386752');
  expect(html).toContain('<td>Prijatá</td>');
  expect(html.match(/<a /g)).toHaveLength(1);
});

test('the list on the detail of a vehicle leaves out the Vozidlo column and keeps the number, customer and status', () => {
  expect(render('admin')).toContain('<th scope="col">Vozidlo</th>');

  const html = render('admin', [order()], noon, 'vehicle');

  expect(html).not.toContain('Vozidlo');
  expect(html).not.toContain('Volkswagen');
  expect(html).not.toContain('WVWZZZ1JZ3W386752');
  expect(html).toContain('<a href="/zakazky/7d1c0a3e-0000-4000-8000-000000000001">Z2026-0001</a>');
  expect(html).toContain('<td>Firma s.r.o.</td>');
  expect(html).toContain('<td>Prijatá</td>');
});

test('an empty list tells the admin to add a Zákazka on the detail of a vehicle', () => {
  expect(render('admin', [])).toContain('Zatiaľ tu nič nie je. Zákazku založíte na detaile vozidla.');
});

test('an empty list does not tell the mechanik to add a Zákazka, which he may not', () => {
  const html = render('mechanik', []);

  expect(html).toContain('Zatiaľ tu nič nie je.');
  expect(html).not.toContain('Zákazku');
  expect(html).not.toContain('vozidla');
});

test('the list has a column for the Termín, the day as it reads in Slovak, and an empty cell when there is none', () => {
  const html = render('admin', [order({ deadline: '2026-11-05' }), order({ id: 'x', number: 'Z2026-0002' })]);

  expect(html).toContain('<th scope="col">Termín</th>');
  expect(rowOf(html, 'Z2026-0001')).toContain('<td>5. 11. 2026</td>');
  expect(rowOf(html, 'Z2026-0002')).toContain('<td></td>');
});

test('a Rozpracovaná Zákazka after its Termín is a red row with the label "Po termíne", and the label is text in the cell of the status', () => {
  const row = rowOf(render('admin', [order({ status: 'inProgress', deadline: '2026-11-02' })]), 'Z2026-0001');

  expect(row).toContain('class="row-late"');
  expect(row).toMatch(/<td>V práci <span class="mark mark-late">Po termíne<\/span><\/td>/);
});

test('a Zákazka that is Hotová is an orange row with the label "Na fakturáciu", whatever its Termín', () => {
  for (const deadline of [null, '2026-11-02', '2026-12-01']) {
    const row = rowOf(render('admin', [order({ status: 'done', deadline })]), 'Z2026-0001');

    expect(row, `Termín ${deadline}`).toContain('class="row-to-invoice"');
    expect(row, `Termín ${deadline}`).toMatch(/<td>Hotová <span class="mark mark-to-invoice">Na fakturáciu<\/span><\/td>/);
    expect(row, `Termín ${deadline}`).not.toContain('Po termíne');
  }
});

test.each([
  ['a Rozpracovaná Zákazka with its Termín today', order({ status: 'waitingForParts', deadline: '2026-11-03' })],
  ['a Rozpracovaná Zákazka with its Termín ahead', order({ status: 'received', deadline: '2026-11-04' })],
  ['a Rozpracovaná Zákazka with no Termín', order({ status: 'received' })],
  ['a Vyfakturovaná Zákazka with its Termín long past', order({ status: 'invoiced', deadline: '2020-01-01' })],
  ['a Zrušená Zákazka with its Termín long past', order({ status: 'cancelled', deadline: '2020-01-01' })],
])('%s is a row with no colour and no label', (_what, unmarked) => {
  const row = rowOf(render('admin', [unmarked]), 'Z2026-0001');

  expect(row).not.toContain('class=');
  expect(row).not.toContain('mark');
  expect(row).not.toContain('Po termíne');
  expect(row).not.toContain('Na fakturáciu');
});

test('a Termín of yesterday in Bratislava is late at half past midnight, when it is still today in UTC', () => {
  const justAfterMidnight = new Date('2026-11-03T23:30:00Z'); // 4 November in Bratislava
  const late = order({ status: 'received', deadline: '2026-11-03' });

  expect(rowOf(render('admin', [late], justAfterMidnight), 'Z2026-0001')).toContain('Po termíne');
  expect(rowOf(render('admin', [late], new Date('2026-11-03T22:30:00Z')), 'Z2026-0001')).not.toContain('Po termíne');
});

test('the mechanik sees both labels like the admin: the spec gives the rows no exception for a Rola', () => {
  const html = render('mechanik', [order({ status: 'inProgress', deadline: '2026-11-02' }), order({ id: 'y', number: 'Z2026-0002', status: 'done' })]);

  expect(rowOf(html, 'Z2026-0001')).toContain('class="row-late"');
  expect(rowOf(html, 'Z2026-0001')).toContain('>Po termíne</span>');
  expect(rowOf(html, 'Z2026-0002')).toContain('class="row-to-invoice"');
  expect(rowOf(html, 'Z2026-0002')).toContain('>Na fakturáciu</span>');
});

const renderEmpty = (role: 'admin' | 'mechanik', filter?: Parameters<typeof WorkOrderList>[0]['filter']) =>
  renderToStaticMarkup(createElement(WorkOrderList, { orders: [], role, now: noon, filter }));

test.each([
  ['the default filter, which leaves out the Zákazky that are Uzavretá', { status: 'unclosed', from: null, to: null }],
  ['one status', { status: 'done', from: null, to: null }],
  ['a period from', { status: 'all', from: '2026-10-01', to: null }],
  ['a period to', { status: 'all', from: null, to: '2026-10-31' }],
] as const)('an empty list under %s says that no Zákazka matches the filter, and does not tell to add one', (_what, filter) => {
  for (const role of ['admin', 'mechanik'] as const) {
    const html = renderEmpty(role, filter);

    expect(html, role).toContain('Žiadna zákazka nezodpovedá filtru.');
    expect(html, role).not.toContain('Zatiaľ tu nič nie je');
    expect(html, role).not.toContain('založíte');
  }
});

test('an empty list that nothing filters is an empty system, and the admin is told where to add a Zákazka', () => {
  expect(renderEmpty('admin', { status: 'all', from: null, to: null })).toContain('Zatiaľ tu nič nie je. Zákazku založíte na detaile vozidla.');
  expect(renderEmpty('mechanik', { status: 'all', from: null, to: null })).not.toContain('Žiadna zákazka nezodpovedá filtru.');
});

const defaults = { status: 'unclosed' as const, from: null, to: null };
const renderFilter = (filter: Parameters<typeof WorkOrderFilter>[0]['filter']) => renderToStaticMarkup(createElement(WorkOrderFilter, { filter }));

test('the filter is a form that goes to the list by GET, so the filter is in the address', () => {
  const html = renderFilter(defaults);

  expect(html).toMatch(/<form[^>]*\saction="\/zakazky"/);
  expect(html).not.toMatch(/<form[^>]*\smethod="post"/i);
  expect(html).toMatch(/<select[^>]*\sname="stav"/);
  expect(html).toMatch(/<input[^>]*\sname="od"[^>]*\stype="date"|<input[^>]*\stype="date"[^>]*\sname="od"/);
  expect(html).toMatch(/<input[^>]*\sname="do"[^>]*\stype="date"|<input[^>]*\stype="date"[^>]*\sname="do"/);
});

test('the filter of status offers Neuzavreté, Všetky and each status, and starts at Neuzavreté', () => {
  const html = renderFilter(defaults);

  const options = [...html.matchAll(/<option value="([^"]*)"([^>]*)>([^<]*)<\/option>/g)].map(([, value, attributes, label]) => [value, label, attributes!.includes('selected')]);
  expect(options).toEqual([
    ['unclosed', 'Neuzavreté', true],
    ['all', 'Všetky', false],
    ['received', 'Prijatá', false],
    ['inProgress', 'V práci', false],
    ['waitingForParts', 'Čaká na diely', false],
    ['done', 'Hotová', false],
    ['invoiced', 'Vyfakturovaná', false],
    ['cancelled', 'Zrušená', false],
  ]);
});

test('the filter shows the status and the days it was asked for', () => {
  const html = renderFilter({ status: 'done', from: '2026-10-01', to: '2026-10-31' });

  expect(html).toMatch(/<option value="done" selected[^>]*>Hotová<\/option>/);
  expect(html).not.toMatch(/<option value="unclosed" selected/);
  expect(html).toMatch(/<input[^>]*value="2026-10-01"/);
  expect(html).toMatch(/<input[^>]*value="2026-10-31"/);
});

test('the filter the list starts with offers no link to cancel it', () => {
  const html = renderFilter(defaults);

  expect(html).not.toContain('Zrušiť filter');
  expect(html).not.toContain('<a ');
});

test.each([
  ['one status', { status: 'done', from: null, to: null }],
  ['Všetky', { status: 'all', from: null, to: null }],
  ['a day from', { status: 'unclosed', from: '2026-10-01', to: null }],
  ['a day to', { status: 'unclosed', from: null, to: '2026-10-31' }],
  ['a period and one status', { status: 'cancelled', from: '2026-10-01', to: '2026-10-31' }],
] as const)('a filter of %s offers a link back to the list that starts at the default filter', (_what, filter) => {
  expect(renderFilter(filter)).toContain('<a href="/zakazky">Zrušiť filter</a>');
});

test('the address of a page of the list carries the filter, and leaves out what is the default', () => {
  expect(listHref(defaults, 1)).toBe('/zakazky');
  expect(listHref(defaults, 3)).toBe('/zakazky?strana=3');
  expect(listHref({ status: 'done', from: null, to: null }, 1)).toBe('/zakazky?stav=done');
  expect(listHref({ status: 'all', from: '2026-10-01', to: '2026-10-31' }, 2)).toBe('/zakazky?stav=all&od=2026-10-01&do=2026-10-31&strana=2');
  expect(listHref({ status: 'unclosed', from: null, to: '2026-10-31' }, 1)).toBe('/zakazky?do=2026-10-31');
});
