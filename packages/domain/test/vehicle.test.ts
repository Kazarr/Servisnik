import { describe, expect, test } from 'vitest';
import { firstVehicleYear, fuels, lastVehicleYear, parseLicensePlate, parseMileageKm, parseVehicle, parseVin } from '../src/vehicle/index.ts';

const vin = 'WVWZZZ1JZ3W386752';
const currentYear = 2026;

describe('VIN', () => {
  test('a valid VIN is accepted as it is', () => {
    expect(parseVin(vin)).toEqual({ ok: true, vin });
  });

  test.each([
    ['small letters', 'wvwzzz1jz3w386752'],
    ['spaces', 'WVW ZZZ1JZ 3W386752'],
    ['hyphens', 'WVW-ZZZ1JZ-3W386752'],
    ['all of it, around the edges too', ' wvw zzz1jz-3w386752 '],
    ['a tab, a line break and a hyphen mixed in', 'wvw\tzzz1jz\n3w-386752'],
  ])('%s are stripped and the VIN is stored in capitals', (_what, typed) => {
    expect(parseVin(typed)).toEqual({ ok: true, vin });
  });

  test.each([
    ['16 characters', 'WVWZZZ1JZ3W38675'],
    ['18 characters', 'WVWZZZ1JZ3W3867521'],
    ['nothing', ''],
    ['only spaces and hyphens', ' - '],
  ])('%s is rejected for its length', (_what, typed) => {
    expect(parseVin(typed)).toEqual({ ok: false, error: 'length' });
  });

  // 1 is what is meant by I, and 0 by O and Q: the error is told apart so that the form can say so.
  test.each(['I', 'O', 'Q', 'i', 'o', 'q'])('%s is rejected as one of the letters a VIN never has', (letter) => {
    expect(parseVin(`WVWZZZ1JZ3W38675${letter}`)).toEqual({ ok: false, error: 'confusable' });
    expect(parseVin(`${letter}VWZZZ1JZ3W386752`)).toEqual({ ok: false, error: 'confusable' });
  });

  test('a VIN of the wrong length with an O is told off for the O', () => {
    expect(parseVin('WVWZZZ1JZ3W3867O')).toEqual({ ok: false, error: 'confusable' });
  });

  test.each([
    ['a punctuation mark', 'WVWZZZ1JZ3W38675!'],
    ['a letter with a diacritic', 'WVWZZZ1JZ3W38675Ž'],
    // toUpperCase turns this one into a plain S, so the check has to look at what was typed.
    ['a letter that upper-cases to A-Z', 'WVWZZZ1JZ3W38675ſ'],
  ])('%s is rejected, only A-Z and 0-9 make a VIN', (_what, typed) => {
    expect(parseVin(typed)).toEqual({ ok: false, error: 'characters' });
  });
});

describe('ŠPZ', () => {
  test.each([
    ['small letters, a space and a hyphen', 'ba-123 ab', 'BA123AB'],
    ['capitals as they are', 'BA123AB', 'BA123AB'],
    ['spaces around the edges', '  KE 456 CD  ', 'KE456CD'],
    ['hyphens only', 'tn-789-ef', 'TN789EF'],
  ])('%s: stored in capitals without spaces and hyphens', (_what, typed, stored) => {
    expect(parseLicensePlate(typed)).toBe(stored);
  });

  test.each(['', '   ', ' - '])('"%s" is no ŠPZ at all', (typed) => {
    expect(parseLicensePlate(typed)).toBeNull();
  });
});

describe('Vehicle', () => {
  const input = { vin: 'wvw zzz1jz-3w386752', licensePlate: ' ba-123 ab ', make: ' Volkswagen ', model: ' Golf ' };
  const parse = (overrides: Partial<Parameters<typeof parseVehicle>[0]> = {}) => parseVehicle({ ...input, ...overrides }, currentYear);

  test('a vehicle is stored with its VIN and ŠPZ normalised and the other fields trimmed', () => {
    expect(parse()).toEqual({
      ok: true,
      vehicle: { vin, licensePlate: 'BA123AB', make: 'Volkswagen', model: 'Golf', year: null, fuel: null, mileageKm: null, note: null },
    });
  });

  test('the ŠPZ is optional', () => {
    expect(parse({ licensePlate: '  ' })).toMatchObject({ ok: true, vehicle: { licensePlate: null } });
  });

  test('a vehicle with every field is stored as numbers and a fuel from the list', () => {
    expect(parse({ year: '2015', fuel: 'diesel', mileageKm: '123 456', note: ' Nová spojka ' })).toEqual({
      ok: true,
      vehicle: { vin, licensePlate: 'BA123AB', make: 'Volkswagen', model: 'Golf', year: 2015, fuel: 'diesel', mileageKm: 123456, note: 'Nová spojka' },
    });
  });

  test('a VIN that is not valid fails the vehicle with the reason', () => {
    expect(parse({ vin: 'WVWZZZ1JZ3W38675' })).toEqual({ ok: false, errors: { vin: 'length' } });
    expect(parse({ vin: 'WVWZZZ1JZ3W38675O' })).toEqual({ ok: false, errors: { vin: 'confusable' } });
  });

  test.each(['make', 'model'] as const)('the %s is required', (field) => {
    expect(parse({ [field]: '   ' })).toEqual({ ok: false, errors: { [field]: 'required' } });
  });

  test('every problem is reported at once', () => {
    expect(parseVehicle({ vin: '', licensePlate: '', make: '', model: '', year: '1949', fuel: 'steam', mileageKm: '-1' }, currentYear)).toEqual({
      ok: false,
      errors: { vin: 'length', make: 'required', model: 'required', year: 'invalid', fuel: 'invalid', mileageKm: 'invalid' },
    });
  });

  describe('year', () => {
    test('the years run from 1950 to the year after the current one', () => {
      expect(firstVehicleYear).toBe(1950);
      expect(lastVehicleYear(currentYear)).toBe(2027);
    });

    test.each(['1950', '2026', '2027'])('%s is a year', (year) => {
      expect(parse({ year })).toMatchObject({ ok: true, vehicle: { year: Number(year) } });
    });

    test('a blank year is no year', () => {
      expect(parse({ year: '  ' })).toMatchObject({ ok: true, vehicle: { year: null } });
    });

    test.each(['1949', '2028', '0', '20x5', '2015.5', '-2015', '15'])('%s is not a year', (year) => {
      expect(parse({ year })).toEqual({ ok: false, errors: { year: 'invalid' } });
    });

    test('the last year moves with the current year', () => {
      expect(parseVehicle({ ...input, year: '2028' }, 2027)).toMatchObject({ ok: true, vehicle: { year: 2028 } });
    });
  });

  describe('fuel', () => {
    test('the fuels are petrol, diesel, hybrid, electric, LPG, CNG and other', () => {
      expect(fuels).toEqual(['petrol', 'diesel', 'hybrid', 'electric', 'lpg', 'cng', 'other']);
    });

    test.each(fuels)('%s is a fuel', (fuel) => {
      expect(parse({ fuel })).toMatchObject({ ok: true, vehicle: { fuel } });
    });

    test('a blank fuel is no fuel', () => {
      expect(parse({ fuel: '' })).toMatchObject({ ok: true, vehicle: { fuel: null } });
    });

    test.each(['benzín', 'Diesel', 'steam'])('%s is not on the list', (fuel) => {
      expect(parse({ fuel })).toEqual({ ok: false, errors: { fuel: 'invalid' } });
    });
  });

  describe('kilometres', () => {
    test.each([
      ['0', 0],
      ['123456', 123456],
      ['123 456', 123456],
      ['00000001', 1],
      ['9999999', 9_999_999],
    ])('%s km is stored as %i', (typed, stored) => {
      expect(parse({ mileageKm: typed })).toMatchObject({ ok: true, vehicle: { mileageKm: stored } });
    });

    test('blank kilometres are no kilometres', () => {
      expect(parse({ mileageKm: ' ' })).toMatchObject({ ok: true, vehicle: { mileageKm: null } });
    });

    test.each(['-1', '1.5', '1,5', '10 000 km', '10000000'])('%s km is not a whole number from 0 to 9 999 999', (typed) => {
      expect(parse({ mileageKm: typed })).toEqual({ ok: false, errors: { mileageKm: 'invalid' } });
    });
  });

  test('a blank note is no note', () => {
    expect(parse({ note: '  ' })).toMatchObject({ ok: true, vehicle: { note: null } });
  });
});

describe('Stav km', () => {
  test.each([
    ['0', 0],
    ['123456', 123456],
    [' 123 456 ', 123456],
    ['00000001', 1],
    ['9 999 999', 9_999_999],
  ])('"%s" is %i', (typed, km) => {
    expect(parseMileageKm(typed)).toBe(km);
  });

  test.each(['', '  ', '-1', '1.5', '1,5', '10 000 km', '10000000', '10 000 000'])('"%s" is not a whole number from 0 to 9 999 999', (typed) => {
    expect(parseMileageKm(typed)).toBeNull();
  });
});
