import { describe, expect, test } from 'vitest';
import { parseLicensePlate, parseVehicleSearch, parseVin } from '../src/vehicle/index.ts';

const vin = 'WVWZZZ1JZ3W386752';

describe('Vehicle search: VIN and ŠPZ', () => {
  test.each([
    ['a part of a VIN in small letters', 'wvwzzz1', 'WVWZZZ1'],
    ['the last 6 characters of a VIN, in small letters', 'ab12cd', 'AB12CD'],
    ['a part of a VIN with spaces and hyphens', ' wvw zzz-1jz ', 'WVWZZZ1JZ'],
    ['a ŠPZ with a space', 'ba 123 ab', 'BA123AB'],
    ['a ŠPZ with a hyphen', 'ba-123-ab', 'BA123AB'],
    ['a ŠPZ without either', 'BA123AB', 'BA123AB'],
  ])('%s is looked for as %j', (_what, typed, code) => {
    expect(parseVehicleSearch(typed).code).toBe(code);
  });

  test('a part of the VIN is looked for the way the stored VIN is written', () => {
    const parsed = parseVin(vin);
    if (!parsed.ok) throw new Error('The VIN was expected to be valid.');

    expect(parsed.vin).toContain(parseVehicleSearch(' wvw zzz-1jz3w ').code);
    expect(parsed.vin.endsWith(parseVehicleSearch('386 752').code)).toBe(true);
  });

  test('a ŠPZ is looked for the way the stored ŠPZ is written', () => {
    expect(parseVehicleSearch(' ba-123 ab ').code).toBe(parseLicensePlate('BA123AB'));
  });
});

describe('Vehicle search: owner', () => {
  test.each([
    ['Ján Novák', 'jan novak'],
    ['NOVAK', 'novak'],
    ['  Ján \t  Novák\n', 'jan novak'],
    ['Autodoprava Kováč s.r.o.', 'autodoprava kovac s.r.o.'],
  ])('%j is looked for in the name of the owner as %j', (typed, ownerName) => {
    expect(parseVehicleSearch(typed).ownerName).toBe(ownerName);
  });
});

describe('Vehicle search: nothing typed', () => {
  test.each(['', '   ', '\t\n'])('%j looks for nothing', (typed) => {
    expect(parseVehicleSearch(typed)).toEqual({ code: '', ownerName: '' });
  });

  test('spaces and hyphens only look for no VIN or ŠPZ, which a part of a name may still contain', () => {
    expect(parseVehicleSearch(' - ')).toEqual({ code: '', ownerName: '-' });
  });
});
