import { describe, expect, test } from 'vitest';
import { formatWorkOrderNumber, localDate, localYear } from '../src/work-order/index.ts';

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
