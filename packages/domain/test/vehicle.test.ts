import { describe, expect, test } from 'vitest';
import { parseVehicle, parseVin } from '../src/vehicle/index.ts';

const vin = 'WVWZZZ1JZ3W386752';

describe('VIN', () => {
  test('a valid VIN is accepted as it is', () => {
    expect(parseVin(vin)).toEqual({ ok: true, vin });
  });

  test.each([
    ['small letters', 'wvwzzz1jz3w386752'],
    ['spaces', 'WVW ZZZ1JZ 3W386752'],
    ['hyphens', 'WVW-ZZZ1JZ-3W386752'],
    ['all of it, around the edges too', ' wvw zzz1jz-3w386752 '],
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

  test.each(['I', 'O', 'Q', 'i', 'o', 'q'])('%s is rejected, 1 and 0 are what is meant', (letter) => {
    expect(parseVin(`WVWZZZ1JZ3W38675${letter}`)).toEqual({ ok: false, error: 'characters' });
    expect(parseVin(`${letter}VWZZZ1JZ3W386752`)).toEqual({ ok: false, error: 'characters' });
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

describe('Vehicle', () => {
  const input = { vin: 'wvw zzz1jz-3w386752', licensePlate: ' BA123AB ', make: ' Volkswagen ', model: ' Golf ' };

  test('a vehicle is stored with its VIN normalised and the other fields trimmed', () => {
    expect(parseVehicle(input)).toEqual({
      ok: true,
      vehicle: { vin, licensePlate: 'BA123AB', make: 'Volkswagen', model: 'Golf' },
    });
  });

  test('the ŠPZ is optional', () => {
    expect(parseVehicle({ ...input, licensePlate: '  ' })).toMatchObject({ ok: true, vehicle: { licensePlate: null } });
  });

  test('a VIN that is not valid fails the vehicle with the reason', () => {
    expect(parseVehicle({ ...input, vin: 'WVWZZZ1JZ3W38675' })).toEqual({ ok: false, errors: { vin: 'length' } });
  });

  test.each(['make', 'model'] as const)('the %s is required', (field) => {
    expect(parseVehicle({ ...input, [field]: '   ' })).toEqual({ ok: false, errors: { [field]: 'required' } });
  });

  test('every problem is reported at once', () => {
    expect(parseVehicle({ vin: '', licensePlate: '', make: '', model: '' })).toEqual({
      ok: false,
      errors: { vin: 'length', make: 'required', model: 'required' },
    });
  });
});
