import { describe, expect, test } from 'vitest';
import {
  amountsOf,
  canAddItems,
  formatWorkOrderNumber,
  isClosed,
  localDate,
  localYear,
  parseLabour,
  parseVatRate,
  parseWorkOrder,
  totalsOf,
  transition,
  workOrderStatuses,
  type TransitionTrigger,
  type WorkOrderStatus,
} from '../src/work-order/index.ts';

describe('Zákazka number', () => {
  test.each([
    [2026, 1, 'Z2026-0001'],
    [2026, 42, 'Z2026-0042'],
    [2026, 9999, 'Z2026-9999'],
    [2027, 1, 'Z2027-0001'],
  ])('year %i, sequence %i is %s', (year, sequence, number) => {
    expect(formatWorkOrderNumber(year, sequence)).toBe(number);
  });

  test('a sequence beyond four places is kept whole, never cut', () => {
    expect(formatWorkOrderNumber(2026, 10000)).toBe('Z2026-10000');
  });

  test.each([0, -1, 1.5, Number.NaN])('sequence %s is not a sequence', (sequence) => {
    expect(() => formatWorkOrderNumber(2026, sequence)).toThrow(RangeError);
  });
});

// The autoservis works in Europe/Bratislava: UTC+1 in winter, UTC+2 in summer.
describe('dates in Europe/Bratislava', () => {
  test.each([
    ['winter, an hour before midnight', '2026-12-31T22:59:59Z', '2026-12-31'],
    ['winter, midnight has come, the new year with it', '2026-12-31T23:00:00Z', '2027-01-01'],
    ['summer, two hours before midnight', '2026-06-30T21:59:59Z', '2026-06-30'],
    ['summer, midnight has come', '2026-06-30T22:00:00Z', '2026-07-01'],
    ['the day the clocks go forward, just before', '2026-03-28T23:59:59Z', '2026-03-29'],
  ])('%s: %s is %s', (_what, instant, date) => {
    expect(localDate(new Date(instant))).toBe(date);
  });

  test('the year follows the local date, not UTC', () => {
    expect(localYear(new Date('2026-12-31T23:30:00Z'))).toBe(2027);
    expect(localYear(new Date('2026-12-31T22:30:00Z'))).toBe(2026);
  });
});

describe('status transitions', () => {
  const allowed: [WorkOrderStatus, WorkOrderStatus, TransitionTrigger][] = [
    ['received', 'done', 'user'],
    ['done', 'invoiced', 'invoice'],
  ];
  const triggers: TransitionTrigger[] = ['user', 'invoice'];
  const every = workOrderStatuses.flatMap((from) => workOrderStatuses.flatMap((to) => triggers.map((by) => [from, to, by] as const)));
  const forbidden = every.filter(([from, to, by]) => !allowed.some(([f, t, b]) => f === from && t === to && b === by));

  test('Prijatá becomes Hotová by the user, and the Dátum dokončenia is the day in Europe/Bratislava', () => {
    // 23:30 UTC on New Year's Eve is already 1 January in Bratislava.
    expect(transition('received', 'done', 'user', new Date('2026-12-31T23:30:00Z'))).toEqual({
      ok: true,
      status: 'done',
      completedOn: '2027-01-01',
    });
  });

  test('Hotová becomes Vyfakturovaná by the invoice, and the Dátum dokončenia stays as it was', () => {
    expect(transition('done', 'invoiced', 'invoice', new Date('2026-12-31T23:30:00Z'))).toEqual({ ok: true, status: 'invoiced' });
  });

  test('these two are the only transitions: the other 16 of 18 are refused', () => {
    expect(every).toHaveLength(18);
    expect(forbidden).toHaveLength(16);
    for (const [from, to, by] of forbidden) {
      expect(transition(from, to, by, new Date()), `${from} -> ${to} by ${by}`).toEqual({ ok: false, error: 'not-allowed' });
    }
  });

  test('Hotová cannot be reached again, so the Dátum dokončenia is never overwritten', () => {
    expect(transition('done', 'done', 'user', new Date())).toEqual({ ok: false, error: 'not-allowed' });
  });
});

describe('what a status allows', () => {
  test.each([
    ['received', false],
    ['done', false],
    ['invoiced', true],
  ] as const)('%s is closed: %s', (status, closed) => {
    expect(isClosed(status)).toBe(closed);
  });

  test.each([
    ['received', true],
    ['done', false],
    ['invoiced', false],
  ] as const)('items can be added in %s: %s', (status, allowed) => {
    expect(canAddItems(status)).toBe(allowed);
  });
});

// Money is whole cents and the quantity is in hundredths (150 = 1,5 h). Every expected value below
// is worked out by hand: the exact amount, then rounded half up to the cent.
const labour = (quantityHundredths: number, unitPriceCents: number, vatRate = 23) => ({ quantityHundredths, unitPriceCents, vatRate });

describe('amounts of an item', () => {
  test('1,5 h at 40 € without VAT, VAT 23 %', () => {
    expect(amountsOf(labour(150, 4000))).toEqual({ net: 6000, vat: 1380, gross: 7380 });
  });

  test('a fractional quantity: 0,25 h at 33,33 € is 8,3325 €, so 8,33 €, and its VAT 1,9159 € is 1,92 €', () => {
    expect(amountsOf(labour(25, 3333))).toEqual({ net: 833, vat: 192, gross: 1025 });
  });

  test('the net amount rounds half up: 0,5 h at 0,01 € is half a cent, so one cent', () => {
    expect(amountsOf(labour(50, 1))).toEqual({ net: 1, vat: 0, gross: 1 });
  });

  test('the VAT is taken from the rounded net, once: 0,99 h at 0,50 € is 0,495 €, so 0,50 €, and VAT is 0,115 €, so 0,12 €', () => {
    // VAT taken from the unrounded 0,495 € would be 0,11385 €, so 0,11 €.
    expect(amountsOf(labour(99, 50))).toEqual({ net: 50, vat: 12, gross: 62 });
  });

  test.each([
    [0, 0, 6000],
    [5, 300, 6300],
    [19, 1140, 7140],
  ])('VAT rate %i %% on 60 € is %i cents, so %i cents with VAT', (vatRate, vat, gross) => {
    expect(amountsOf(labour(100, 6000, vatRate))).toEqual({ net: 6000, vat, gross });
  });
});

describe('totals of a Zákazka', () => {
  test('a Zákazka with no item is worth nothing', () => {
    expect(totalsOf([])).toEqual({ net: 0, vat: 0, gross: 0 });
  });

  test('totals are the sum of the rounded items', () => {
    expect(totalsOf([labour(150, 4000), labour(25, 3333)])).toEqual({ net: 6833, vat: 1572, gross: 8405 });
  });

  test('the VAT is not taken again from the total: two items of 0,50 € have VAT 0,24 €, not 0,23 €', () => {
    expect(totalsOf([labour(99, 50), labour(99, 50)])).toEqual({ net: 100, vat: 24, gross: 124 });
  });

  test('items with different rates each keep their own', () => {
    expect(totalsOf([labour(100, 6000, 23), labour(100, 6000, 0), labour(100, 6000, 5)])).toEqual({
      net: 18000,
      vat: 1680,
      gross: 19680,
    });
  });
});

describe('a Zákazka as the admin types it', () => {
  test.each([
    ['0', 0],
    ['123456', 123456],
    ['123 456', 123456],
    [' 9999999 ', 9999999],
  ])('kilometres "%s" are %i, and the Zákazka is these two values and nothing else', (typed, km) => {
    expect(parseWorkOrder({ mileageKm: typed, customerRequest: 'Servis' })).toEqual({
      ok: true,
      workOrder: { mileageKm: km, customerRequest: 'Servis' },
    });
  });

  test('the request is kept trimmed', () => {
    expect(parseWorkOrder({ mileageKm: '0', customerRequest: ' Výmena oleja a filtrov ' })).toMatchObject({
      ok: true,
      workOrder: { customerRequest: 'Výmena oleja a filtrov' },
    });
  });

  test.each(['', '-1', '1,5', '12a', '10000000', 'veľa'])('kilometres "%s" are refused', (typed) => {
    expect(parseWorkOrder({ mileageKm: typed, customerRequest: 'Servis' })).toEqual({ ok: false, errors: { mileageKm: 'invalid' } });
  });

  test('a request is required, and every reason comes back at once', () => {
    expect(parseWorkOrder({ mileageKm: '1000', customerRequest: ' ' })).toEqual({ ok: false, errors: { customerRequest: 'required' } });
    expect(parseWorkOrder({ mileageKm: '', customerRequest: '' })).toEqual({
      ok: false,
      errors: { mileageKm: 'invalid', customerRequest: 'required' },
    });
  });
});

// The one rule for a VAT rate typed anywhere: on a Práca, and in the list of rates of Nastavenia.
describe('a VAT rate as it is typed', () => {
  test.each([
    ['0', 0],
    ['5', 5],
    ['23', 23],
    ['100', 100],
    ['007', 7],
    [' 23 ', 23],
  ])('"%s" is %i', (typed, rate) => {
    expect(parseVatRate(typed)).toBe(rate);
  });

  test.each(['', ' ', '101', '1000', '-1', '2,5', '2.5', '23 %', '2 3', 'plná', '99999999999999999999999'])('"%s" is not a whole percentage from 0 to 100', (typed) => {
    expect(parseVatRate(typed)).toBeNull();
  });
});

describe('a work item (Práca) as the admin types it', () => {
  const typed = { name: ' Výmena oleja ', quantity: '1,5', unitPrice: '40', vatRate: '23' };
  // The default VAT rate comes from Nastavenia: the domain is handed it.
  const refused = (overrides: Partial<typeof typed>) => parseLabour({ ...typed, ...overrides }, 23);

  test('is a labour item in hours, with the quantity in hundredths and the price in cents', () => {
    expect(parseLabour(typed, 23)).toEqual({
      ok: true,
      item: { kind: 'labour', name: 'Výmena oleja', quantityHundredths: 150, unit: 'h', unitPriceCents: 4000, vatRate: 23 },
    });
  });

  test('the VAT rate is the default rate the domain is given unless typed otherwise', () => {
    const { vatRate: _typed, ...withoutRate } = typed;
    expect(parseLabour(withoutRate, 19)).toMatchObject({ ok: true, item: { vatRate: 19 } });
    expect(parseLabour(withoutRate, 5)).toMatchObject({ ok: true, item: { vatRate: 5 } });
    expect(refused({ vatRate: '5' })).toMatchObject({ ok: true, item: { vatRate: 5 } });
    expect(refused({ vatRate: '0' })).toMatchObject({ ok: true, item: { vatRate: 0 } });
  });

  // 1,15 * 100 is 114.99999999999999 as a float: the digits are read, never multiplied.
  test.each([
    ['1,15', 115],
    ['0,29', 29],
    ['2.3', 230],
    ['0,05', 5],
    [' 12 ', 1200],
    ['99999,99', 9999999],
  ])('quantity "%s" is %i hundredths', (quantity, hundredths) => {
    expect(refused({ quantity })).toMatchObject({ ok: true, item: { quantityHundredths: hundredths } });
  });

  test.each([
    ['40,5', 4050],
    ['40.50', 4050],
    ['33,33', 3333],
    ['0', 0],
    ['1 000 000', 100000000],
  ])('unit price "%s" is %i cents', (unitPrice, cents) => {
    expect(refused({ unitPrice })).toMatchObject({ ok: true, item: { unitPriceCents: cents } });
  });

  test.each(['', '0', '0,00', '-1', '1,505', '1,2,3', 'hodina', '100000'])('quantity "%s" is refused', (quantity) => {
    expect(refused({ quantity })).toEqual({ ok: false, errors: { quantity: 'invalid' } });
  });

  test.each(['', '-5', '40,505', '40 €', 'drahé', '1000000,01'])('unit price "%s" is refused', (unitPrice) => {
    expect(refused({ unitPrice })).toEqual({ ok: false, errors: { unitPrice: 'invalid' } });
  });

  test.each(['', '-1', '101', '2,5', '23 %', '2 3', 'plná'])('VAT rate "%s" is refused', (vatRate) => {
    expect(refused({ vatRate })).toEqual({ ok: false, errors: { vatRate: 'invalid' } });
  });

  test('a name is required, and every reason comes back at once', () => {
    expect(refused({ name: '  ' })).toEqual({ ok: false, errors: { name: 'required' } });
    expect(refused({ name: '', quantity: '0', unitPrice: '', vatRate: 'x' })).toEqual({
      ok: false,
      errors: { name: 'required', quantity: 'invalid', unitPrice: 'invalid', vatRate: 'invalid' },
    });
  });
});
