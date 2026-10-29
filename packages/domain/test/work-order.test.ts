import { describe, expect, test } from 'vitest';
import {
  amountsOf,
  canEdit,
  canPrintHandover,
  formatWorkOrderNumber,
  isActive,
  isClosed,
  isDefaultListFilter,
  localDate,
  localYear,
  mileageAtIntake,
  parseListFilter,
  parseVatRate,
  parseWorkOrder,
  rowMark,
  statusesOf,
  totalsOf,
  transition,
  userTransitions,
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
  const active = ['received', 'inProgress', 'waitingForParts'] as const;
  const now = new Date('2026-12-31T23:30:00Z'); // already 1 January in Bratislava
  const between = active.flatMap((from) => active.filter((to) => to !== from).map((to) => [from, to] as const));

  // Every allowed transition, written out once. The number of all 6 x 6 x 2 combinations is pinned below.
  const allowed: [WorkOrderStatus, WorkOrderStatus, TransitionTrigger][] = [
    ...between.map(([from, to]) => [from, to, 'user'] as [WorkOrderStatus, WorkOrderStatus, TransitionTrigger]),
    ...active.map((from) => [from, 'done', 'user'] as [WorkOrderStatus, WorkOrderStatus, TransitionTrigger]),
    ...active.map((from) => [from, 'cancelled', 'user'] as [WorkOrderStatus, WorkOrderStatus, TransitionTrigger]),
    ['done', 'invoiced', 'invoice'],
  ];
  const triggers: TransitionTrigger[] = ['user', 'invoice'];
  const every = workOrderStatuses.flatMap((from) => workOrderStatuses.flatMap((to) => triggers.map((by) => [from, to, by] as const)));
  const forbidden = every.filter(([from, to, by]) => !allowed.some(([f, t, b]) => f === from && t === to && b === by));

  test('the statuses are the six of the glossary', () => {
    expect(workOrderStatuses).toEqual(['received', 'inProgress', 'waitingForParts', 'done', 'invoiced', 'cancelled']);
  });

  test.each(between)('%s becomes %s by the user, in any order, with no Dátum dokončenia', (from, to) => {
    expect(transition(from, to, 'user', now)).toEqual({ ok: true, status: to });
  });

  test.each(active)('%s becomes Hotová by the user, and the Dátum dokončenia is the day in Europe/Bratislava', (from) => {
    // 23:30 UTC on New Year's Eve is already 1 January in Bratislava.
    expect(transition(from, 'done', 'user', now)).toEqual({ ok: true, status: 'done', completedOn: '2027-01-01' });
  });

  test('every transition to Hotová carries the day of its own moment, so a later one overwrites an earlier one', () => {
    expect(transition('inProgress', 'done', 'user', new Date('2026-07-15T10:00:00Z'))).toMatchObject({ completedOn: '2026-07-15' });
    expect(transition('inProgress', 'done', 'user', new Date('2026-07-20T10:00:00Z'))).toMatchObject({ completedOn: '2026-07-20' });
  });

  test('Hotová becomes Vyfakturovaná by the invoice, and the Dátum dokončenia stays as it was', () => {
    expect(transition('done', 'invoiced', 'invoice', now)).toEqual({ ok: true, status: 'invoiced' });
  });

  test.each(active)('%s becomes Zrušená only once the user confirmed it, and keeps its Dátum dokončenia', (from) => {
    expect(transition(from, 'cancelled', 'user', now)).toEqual({ ok: false, error: 'confirmation-required' });
    expect(transition(from, 'cancelled', 'user', now, { confirmed: false })).toEqual({ ok: false, error: 'confirmation-required' });
    expect(transition(from, 'cancelled', 'user', now, { confirmed: true })).toEqual({ ok: true, status: 'cancelled' });
  });

  test('a transition that is refused and unconfirmed is refused, not asked to be confirmed', () => {
    // Zrušená from Hotová is for the ticket that returns a Zákazka to work; here it is not in the table.
    expect(transition('done', 'cancelled', 'user', now)).toEqual({ ok: false, error: 'not-allowed' });
    expect(transition('invoiced', 'cancelled', 'user', now)).toEqual({ ok: false, error: 'not-allowed' });
  });

  test('the allowed transitions are 13 of 72, and the other 59 are refused, confirmed or not', () => {
    expect(every).toHaveLength(72);
    expect(allowed).toHaveLength(13);
    expect(forbidden).toHaveLength(59);
    for (const [from, to, by] of forbidden) {
      expect(transition(from, to, by, now, { confirmed: true }), `${from} -> ${to} by ${by}, confirmed`).toEqual({ ok: false, error: 'not-allowed' });
      expect(transition(from, to, by, now), `${from} -> ${to} by ${by}`).toEqual({ ok: false, error: 'not-allowed' });
    }
  });

  test('Hotová is not reached from Hotová, so the Dátum dokončenia is not overwritten by a second click', () => {
    expect(transition('done', 'done', 'user', now)).toEqual({ ok: false, error: 'not-allowed' });
  });
});

describe('the buttons of a status', () => {
  test.each(['received', 'inProgress', 'waitingForParts'] as const)('%s offers the other two rozpracované statuses, Hotová, and Zrušená with its confirmation', (status) => {
    const others = (['received', 'inProgress', 'waitingForParts'] as const).filter((to) => to !== status);

    expect(userTransitions(status)).toEqual([
      ...others.map((to) => ({ to, confirm: false })),
      { to: 'done', confirm: false },
      { to: 'cancelled', confirm: true },
    ]);
  });

  test.each(['done', 'invoiced', 'cancelled'] as const)('%s offers no button: leaving it is for the invoice or a later ticket', (status) => {
    expect(userTransitions(status)).toEqual([]);
  });
});

describe('what a status allows', () => {
  test.each([
    ['received', true],
    ['inProgress', true],
    ['waitingForParts', true],
    ['done', false],
    ['invoiced', false],
    ['cancelled', false],
  ] as const)('%s is rozpracovaná: %s', (status, active) => {
    expect(isActive(status)).toBe(active);
  });

  test.each([
    ['received', false],
    ['inProgress', false],
    ['waitingForParts', false],
    ['done', false],
    ['invoiced', true],
    ['cancelled', true],
  ] as const)('%s is Uzavretá: %s', (status, closed) => {
    expect(isClosed(status)).toBe(closed);
  });

  test.each([
    ['received', true],
    ['inProgress', true],
    ['waitingForParts', true],
    ['done', false],
    ['invoiced', false],
    ['cancelled', false],
  ] as const)('items and the header can be edited in %s: %s', (status, allowed) => {
    expect(canEdit(status)).toBe(allowed);
  });

  // The customer takes the vehicle over when the work is done (decision of Kazarr, #139); Vyfakturovaná stays so that the protocol can be printed after the invoice.
  test('the odovzdávací protokol is printed in Hotová and Vyfakturovaná, and in no other status', () => {
    expect(workOrderStatuses.filter(canPrintHandover)).toEqual(['done', 'invoiced']);
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
    ['00000001', 1],
    [' 9999999 ', 9999999],
  ])('kilometres "%s" are %i, and a Zákazka without a Termín or a note has none', (typed, km) => {
    expect(parseWorkOrder({ mileageKm: typed, customerRequest: 'Servis' })).toEqual({
      ok: true,
      workOrder: { mileageKm: km, customerRequest: 'Servis', deadline: null, note: null },
    });
  });

  test('the Termín is a day, kept as typed in a date field, and the note is kept trimmed', () => {
    expect(parseWorkOrder({ mileageKm: '1', customerRequest: 'Servis', deadline: '2026-11-05', note: ' Zákazník čaká na diely z Nemecka ' })).toEqual({
      ok: true,
      workOrder: { mileageKm: 1, customerRequest: 'Servis', deadline: '2026-11-05', note: 'Zákazník čaká na diely z Nemecka' },
    });
  });

  test.each(['', '  '])('a blank Termín "%s" and a blank note are none', (blank) => {
    expect(parseWorkOrder({ mileageKm: '1', customerRequest: 'Servis', deadline: blank, note: blank })).toMatchObject({
      ok: true,
      workOrder: { deadline: null, note: null },
    });
  });

  test.each(['2028-02-29', '2026-12-31', '2026-01-01'])('the day %s is a Termín', (deadline) => {
    expect(parseWorkOrder({ mileageKm: '1', customerRequest: 'Servis', deadline })).toMatchObject({ ok: true, workOrder: { deadline } });
  });

  test.each(['2027-02-29', '2026-02-30', '2026-13-01', '2026-00-10', '2026-04-31', '5. 11. 2026', '2026-11-5', '0000-01-01', 'zajtra'])(
    'the Termín "%s" is not a day',
    (deadline) => {
      expect(parseWorkOrder({ mileageKm: '1', customerRequest: 'Servis', deadline })).toEqual({ ok: false, errors: { deadline: 'invalid' } });
    },
  );

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

// The one rule for a VAT rate typed anywhere: on a Položka zákazky, and in the list of rates of Nastavenia.
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
// How a row of the list of Zákazky looks (GLOSSARY: Termín). Today is the date in Europe/Bratislava.
describe('the mark of a row in the list', () => {
  const noon = new Date('2026-11-03T12:00:00Z'); // 3 November in Bratislava
  const yesterday = '2026-11-02';
  const today = '2026-11-03';
  const tomorrow = '2026-11-04';

  test.each(['received', 'inProgress', 'waitingForParts'] as const)('a Zákazka that is %s is late only when its Termín is before today', (status) => {
    expect(rowMark(status, yesterday, noon)).toBe('late');
    expect(rowMark(status, today, noon)).toBeNull();
    expect(rowMark(status, tomorrow, noon)).toBeNull();
    expect(rowMark(status, null, noon)).toBeNull();
  });

  test('a Zákazka that is Hotová is to be invoiced, whatever its Termín, and is not late', () => {
    for (const deadline of [yesterday, today, tomorrow, null]) expect(rowMark('done', deadline, noon), `Termín ${deadline}`).toBe('toInvoice');
  });

  test.each(['invoiced', 'cancelled'] as const)('a Zákazka that is %s has no mark, even with a Termín long past', (status) => {
    for (const deadline of ['2020-01-01', yesterday, today, null]) expect(rowMark(status, deadline, noon), `Termín ${deadline}`).toBeNull();
  });

  test.each([
    ['winter, an hour before midnight, the Termín is still today', '2026-12-31', '2026-12-31T22:59:59Z', null],
    ['winter, midnight has come, the Termín is yesterday', '2026-12-31', '2026-12-31T23:00:00Z', 'late'],
    ['summer, two hours before midnight, the Termín is still today', '2026-06-30', '2026-06-30T21:59:59Z', null],
    ['summer, midnight has come, the Termín is yesterday', '2026-06-30', '2026-06-30T22:00:00Z', 'late'],
    ['half past midnight in Bratislava is still the 3rd in UTC', '2026-11-03', '2026-11-03T23:30:00Z', 'late'],
  ] as const)('at the turn of the day: %s', (_what, deadline, instant, mark) => {
    expect(rowMark('inProgress', deadline, new Date(instant))).toBe(mark);
  });
});

describe('the filter of the list of Zákazky', () => {
  test('without a filter the list shows the Zákazky that are not Uzavretá, from any day', () => {
    expect(parseListFilter({})).toEqual({ status: 'unclosed', from: null, to: null });
  });

  test.each(['unclosed', 'all', 'received', 'inProgress', 'waitingForParts', 'done', 'invoiced', 'cancelled'])('the status "%s" is a filter', (status) => {
    expect(parseListFilter({ status })).toMatchObject({ status });
  });

  test.each(['', 'open', 'Hotová', 'DONE', 'received,done'])('the status "%s" is not a filter, so the default one applies', (status) => {
    expect(parseListFilter({ status })).toMatchObject({ status: 'unclosed' });
  });

  test('the period is the days from and to, as typed in a date field', () => {
    expect(parseListFilter({ from: '2026-10-01', to: '2026-10-31' })).toEqual({ status: 'unclosed', from: '2026-10-01', to: '2026-10-31' });
    expect(parseListFilter({ from: '2026-10-01' })).toMatchObject({ from: '2026-10-01', to: null });
    expect(parseListFilter({ to: '2026-10-31' })).toMatchObject({ from: null, to: '2026-10-31' });
  });

  test.each(['', '1. 10. 2026', '2026-02-30', 'dnes'])('the day "%s" is no bound of the period', (day) => {
    expect(parseListFilter({ from: day, to: day })).toMatchObject({ from: null, to: null });
  });

  test('the filter the list starts with, Neuzavreté from any day, is the default one', () => {
    expect(isDefaultListFilter({ status: 'unclosed', from: null, to: null })).toBe(true);
    expect(isDefaultListFilter(parseListFilter({}))).toBe(true);
  });

  test.each(['all', 'received', 'inProgress', 'waitingForParts', 'done', 'invoiced', 'cancelled'] as const)('the status "%s" makes the filter not the default one', (status) => {
    expect(isDefaultListFilter({ status, from: null, to: null })).toBe(false);
  });

  test.each([
    ['a day from', { from: '2026-10-01', to: null }],
    ['a day to', { from: null, to: '2026-10-31' }],
    ['a period', { from: '2026-10-01', to: '2026-10-31' }],
  ] as const)('%s makes the filter not the default one, though the status is Neuzavreté', (_what, period) => {
    expect(isDefaultListFilter({ status: 'unclosed', ...period })).toBe(false);
  });

  test('an address with nothing valid in it is the default filter', () => {
    expect(isDefaultListFilter(parseListFilter({ status: 'open', from: 'dnes', to: '2026-02-30' }))).toBe(true);
  });

  test('Neuzavreté are every status but Vyfakturovaná and Zrušená, Všetky are all six, anything else is itself', () => {
    expect(statusesOf('unclosed')).toEqual(['received', 'inProgress', 'waitingForParts', 'done']);
    expect(statusesOf('all')).toEqual(['received', 'inProgress', 'waitingForParts', 'done', 'invoiced', 'cancelled']);
    expect(statusesOf('waitingForParts')).toEqual(['waitingForParts']);
    expect(statusesOf('cancelled')).toEqual(['cancelled']);
  });
});

describe('kilometres at intake', () => {
  // Stav km of the vehicle before, kilometres on the Zákazka, Stav km of the vehicle after, whether to warn.
  test.each([
    ['higher than the vehicle has', 100_000, 100_001, 100_001, false],
    ['far higher than the vehicle has', 100_000, 250_000, 250_000, false],
    ['the same as the vehicle has', 100_000, 100_000, 100_000, false],
    ['lower than the vehicle has, by one', 100_000, 99_999, 100_000, true],
    ['lower than the vehicle has, far', 250_000, 10_000, 250_000, true],
    ['0, with the vehicle at 5 km', 5, 0, 5, true],
    ['given to a vehicle that has no Stav km yet', null, 120_000, 120_000, false],
    ['0, given to a vehicle that has no Stav km yet', null, 0, 0, false],
  ])('%s: the vehicle had %s, the Zákazka has %s, the vehicle then has %s, warning: %s', (_what, before, atIntake, after, warning) => {
    expect(mileageAtIntake(before, atIntake)).toEqual({ vehicleMileageKm: after, lowerThanVehicle: warning });
  });
});
