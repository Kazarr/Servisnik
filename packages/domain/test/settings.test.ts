import { describe, expect, test } from 'vitest';
import { maxMarkupPercent, parseRates, type RatesInput } from '../src/settings/index.ts';

// The rates part of Nastavenia as the admin types it: the VAT rates one per line, the other values as text.
const typed: RatesInput = { vatRates: '23\n19\n5', defaultVatRate: '23', hourlyRate: '', markup: '0' };
const parse = (overrides: Partial<RatesInput>) => parseRates({ ...typed, ...overrides });

describe('rates as the admin types them', () => {
  test('are the VAT rates in the order typed, the default one, the hourly rate in cents (none when left empty) and the markup', () => {
    expect(parseRates(typed)).toEqual({
      ok: true,
      rates: { vatRates: [23, 19, 5], defaultVatRate: 23, hourlyRateCents: null, markupPercent: 0 },
    });
    expect(parse({ vatRates: '5\n23', defaultVatRate: '5', hourlyRate: '45,5', markup: '30' })).toEqual({
      ok: true,
      rates: { vatRates: [5, 23], defaultVatRate: 5, hourlyRateCents: 4550, markupPercent: 30 },
    });
  });

  test('may leave out blank lines and spaces around a rate', () => {
    expect(parse({ vatRates: ' 23 \r\n\r\n 19\n\n' })).toMatchObject({ ok: true, rates: { vatRates: [23, 19] } });
  });
});

describe('VAT rates', () => {
  test.each([['0'], ['100'], ['0\n100'], ['007']])('"%s" is a list of whole percentages from 0 to 100', (vatRates) => {
    expect(parse({ vatRates, defaultVatRate: vatRates.split('\n')[0]! })).toMatchObject({ ok: true });
  });

  test.each(['101', '-1', '2,5', '2.5', '23 %', 'dvadsaťtri', '1 000', '23\n101', '23\n-1'])('"%s" is refused as not a whole percentage from 0 to 100', (vatRates) => {
    expect(parse({ vatRates })).toEqual({ ok: false, errors: { vatRates: 'invalid' } });
  });

  test.each(['', '  ', '\n\n', ' \r\n '])('"%j" is refused: at least one rate is needed', (vatRates) => {
    expect(parse({ vatRates })).toEqual({ ok: false, errors: { vatRates: 'required' } });
  });

  test('a rate twice, even typed differently, is refused', () => {
    expect(parse({ vatRates: '23\n19\n23' })).toEqual({ ok: false, errors: { vatRates: 'duplicate' } });
    expect(parse({ vatRates: '5\n05' })).toEqual({ ok: false, errors: { vatRates: 'duplicate' } });
  });

  test('a rate that is wrong is reported before a duplicate', () => {
    expect(parse({ vatRates: '23\n23\n101' })).toEqual({ ok: false, errors: { vatRates: 'invalid' } });
  });
});

describe('the default VAT rate', () => {
  test('is one of the rates in the list', () => {
    expect(parse({ defaultVatRate: '19' })).toMatchObject({ ok: true, rates: { defaultVatRate: 19 } });
    expect(parse({ defaultVatRate: '5' })).toMatchObject({ ok: true, rates: { defaultVatRate: 5 } });
  });

  test('that the list no longer has, as when the default rate is removed, is refused', () => {
    expect(parse({ vatRates: '19\n5', defaultVatRate: '23' })).toEqual({ ok: false, errors: { defaultVatRate: 'not-in-list' } });
  });

  test('may be changed together with the list, so the old default can go', () => {
    expect(parse({ vatRates: '19\n5', defaultVatRate: '19' })).toMatchObject({ ok: true, rates: { vatRates: [19, 5], defaultVatRate: 19 } });
  });

  test.each(['', '-1', '101', '2,5', '2 3', 'x'])('"%s" is refused as not a whole percentage', (defaultVatRate) => {
    expect(parse({ defaultVatRate })).toEqual({ ok: false, errors: { defaultVatRate: 'invalid' } });
  });

  test('is not judged against a list that is itself refused', () => {
    expect(parse({ vatRates: '', defaultVatRate: '23' })).toEqual({ ok: false, errors: { vatRates: 'required' } });
    expect(parse({ vatRates: '23\n23', defaultVatRate: '5' })).toEqual({ ok: false, errors: { vatRates: 'duplicate' } });
  });
});

describe('the hourly rate', () => {
  test.each([
    ['40', 4000],
    ['40,5', 4050],
    ['40.50', 4050],
    ['0', 0],
    ['0,01', 1],
    ['1 000', 100_000],
    ['1000000', 100_000_000],
  ])('"%s €" is %i cents', (hourlyRate, cents) => {
    expect(parse({ hourlyRate })).toMatchObject({ ok: true, rates: { hourlyRateCents: cents } });
  });

  test.each(['', '  '])('"%s" (left empty) means there is none, and 0 € is not that', (hourlyRate) => {
    expect(parse({ hourlyRate })).toMatchObject({ ok: true, rates: { hourlyRateCents: null } });
    expect(parse({ hourlyRate: '0' })).toMatchObject({ ok: true, rates: { hourlyRateCents: 0 } });
  });

  // The hourly rate fills in the price of a Práca, so it may not be a price the form for a Práca would refuse.
  test.each(['-1', '40,505', '1000000,01', 'x', '40 €'])('"%s" is refused', (hourlyRate) => {
    expect(parse({ hourlyRate })).toEqual({ ok: false, errors: { hourlyRate: 'invalid' } });
  });
});

describe('the markup on parts', () => {
  test.each([
    ['0', 0],
    ['1', 1],
    ['25', 25],
    [String(maxMarkupPercent), maxMarkupPercent],
  ])('%s %% is a whole percentage', (markup, percent) => {
    expect(parse({ markup })).toMatchObject({ ok: true, rates: { markupPercent: percent } });
  });

  // An empty markup does not arise (ledger Q18 of #117): it is 0 %.
  test.each(['', '-1', '2,5', 'x', String(maxMarkupPercent + 1)])('"%s" is refused', (markup) => {
    expect(parse({ markup })).toEqual({ ok: false, errors: { markup: 'invalid' } });
  });
});

test('every mistake comes back at once, each at its own field', () => {
  expect(parseRates({ vatRates: '23\n23', defaultVatRate: 'x', hourlyRate: '-1', markup: '' })).toEqual({
    ok: false,
    errors: { vatRates: 'duplicate', defaultVatRate: 'invalid', hourlyRate: 'invalid', markup: 'invalid' },
  });
});
