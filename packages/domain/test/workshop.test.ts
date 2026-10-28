import { describe, expect, test } from 'vitest';
import { parseWorkshopDetails, vatPayerTypes, type WorkshopDetailsInput } from '../src/workshop/index.ts';

// Údaje autoservisu as the admin types them in Nastavenia: every value as text, the platiteľ DPH as one of its three names.
const nothing: WorkshopDetailsInput = {
  name: 'Autoservis Novák s.r.o.',
  street: '',
  city: '',
  postalCode: '',
  ico: '',
  dic: '',
  icDph: '',
  vatPayerType: 'nonPayer',
  iban: '',
  phone: '',
  email: '',
  commercialRegister: '',
};
const parse = (overrides: Partial<WorkshopDetailsInput>) => parseWorkshopDetails({ ...nothing, ...overrides });

// IBANs that are valid by an independent calculation (mod 97 of the digits, letters as 10..35), not by the code under test.
const validIbans = ['SK3112000000198742637541', 'DE89370400440532013000', 'GB82WEST12345698765432', 'CZ6508000000192000145399'];

describe('Údaje autoservisu', () => {
  test('need only a name: everything else typed blank is stored as nothing', () => {
    expect(parseWorkshopDetails({ ...nothing, name: ' Autoservis Novák ' })).toEqual({
      ok: true,
      details: {
        name: 'Autoservis Novák',
        street: null,
        city: null,
        postalCode: null,
        ico: null,
        dic: null,
        icDph: null,
        vatPayerType: 'nonPayer',
        iban: null,
        phone: null,
        email: null,
        commercialRegister: null,
      },
    });
  });

  test('are stored trimmed, with the PSČ without a space and the IBAN without spaces and in capitals', () => {
    expect(
      parse({
        street: ' Hlavná 1 ',
        city: ' Bratislava ',
        postalCode: ' 811 01 ',
        ico: ' 12345678 ',
        dic: ' 2020123456 ',
        icDph: ' SK2020123456 ',
        vatPayerType: 'payer',
        iban: ' sk31 1200 0000 1987 4263 7541 ',
        phone: ' +421 905 123 456 ',
        email: ' info@novak.sk ',
        commercialRegister: ' Okresný súd Bratislava I, oddiel Sro, vložka 12345/B ',
      }),
    ).toEqual({
      ok: true,
      details: {
        name: 'Autoservis Novák s.r.o.',
        street: 'Hlavná 1',
        city: 'Bratislava',
        postalCode: '81101',
        ico: '12345678',
        dic: '2020123456',
        icDph: 'SK2020123456',
        vatPayerType: 'payer',
        iban: 'SK3112000000198742637541',
        phone: '+421 905 123 456',
        email: 'info@novak.sk',
        commercialRegister: 'Okresný súd Bratislava I, oddiel Sro, vložka 12345/B',
      },
    });
  });

  test.each(['', '   '])('the name is required, not %j', (name) => {
    expect(parse({ name })).toEqual({ ok: false, errors: { name: 'required' } });
  });

  test('a phone number and the entry in the commercial register are free text', () => {
    expect(parse({ phone: 'po 17:00 na 0905/123 456', commercialRegister: 'Živnostenský register OÚ Žilina, č. 123-45678' })).toMatchObject({
      ok: true,
      details: { phone: 'po 17:00 na 0905/123 456', commercialRegister: 'Živnostenský register OÚ Žilina, č. 123-45678' },
    });
  });

  test('every reason they are refused is reported at once', () => {
    expect(parse({ name: ' ', ico: '1', dic: '2', icDph: '3', postalCode: '4', email: '5', iban: '6', vatPayerType: 'x' })).toEqual({
      ok: false,
      errors: { name: 'required', ico: 'format', dic: 'format', icDph: 'format', postalCode: 'format', email: 'format', iban: 'invalid', vatPayerType: 'invalid' },
    });
  });
});

// The formats are the Zákazník area's (packages/domain/src/customer), tested there in full: one wrong and one right value per field show that they are applied here.
describe('the formats the Zákazník area has', () => {
  test.each([
    ['ico', '1234567'],
    ['dic', '202012345'],
    ['icDph', 'sk2020123456'],
    ['postalCode', '8110'],
    ['email', 'info@novak'],
  ] as const)('refuse the %s %j', (field, value) => {
    expect(parse({ [field]: value })).toEqual({ ok: false, errors: { [field]: 'format' } });
  });

  test.each([
    ['ico', '12345678'],
    ['dic', '2020123456'],
    ['icDph', 'SK2020123456'],
    ['postalCode', '81101'],
    ['email', 'info@novak.sk'],
  ] as const)('accept the %s %j', (field, value) => {
    expect(parse({ [field]: value })).toMatchObject({ ok: true, details: { [field]: value } });
  });
});

describe('the IBAN', () => {
  test.each(validIbans)('%s is valid', (iban) => {
    expect(parse({ iban })).toMatchObject({ ok: true, details: { iban } });
  });

  test('is checked after the spaces are taken out and the letters made capital', () => {
    expect(parse({ iban: 'de89 3704 0044 0532 0130 00' })).toMatchObject({ ok: true, details: { iban: 'DE89370400440532013000' } });
  });

  // One digit typed wrong, two digits swapped, a check digit that does not belong to the rest and a letter changed: the mod 97 catches each.
  test.each(['SK3112000000198742637542', 'SK3112000000198742637451', 'SK3012000000198742637541', 'GB82WEST12345698765433', 'GB82WEST12345698765431'])(
    '%s has a mistake in the checksum',
    (iban) => {
      expect(parse({ iban })).toEqual({ ok: false, errors: { iban: 'invalid' } });
    },
  );

  test.each(['SK31', 'SK3112000', '3112000000198742637541', 'SK31-1200-0000-1987-4263-7541', 'SK31120000001987426375411234567890123456'])(
    '%j is not the shape of an IBAN, whatever its checksum',
    (iban) => {
      expect(parse({ iban })).toEqual({ ok: false, errors: { iban: 'invalid' } });
    },
  );

  test('is optional: blank is no IBAN', () => {
    expect(parse({ iban: '  ' })).toMatchObject({ ok: true, details: { iban: null } });
  });
});

describe('the platiteľ DPH', () => {
  test('is one of three: platiteľ, neplatiteľ and registrovaný podľa §7', () => {
    expect([...vatPayerTypes]).toEqual(['payer', 'nonPayer', 'section7']);
  });

  test.each(['nonPayer', 'section7'] as const)('%s needs no IČ DPH', (vatPayerType) => {
    expect(parse({ vatPayerType, icDph: '' })).toMatchObject({ ok: true, details: { vatPayerType, icDph: null } });
  });

  test.each(['', '   '])('a platiteľ with the IČ DPH %j is refused', (icDph) => {
    expect(parse({ vatPayerType: 'payer', icDph })).toEqual({ ok: false, errors: { icDph: 'required' } });
  });

  test('a platiteľ with an IČ DPH is accepted', () => {
    expect(parse({ vatPayerType: 'payer', icDph: 'SK2020123456' })).toMatchObject({ ok: true, details: { vatPayerType: 'payer', icDph: 'SK2020123456' } });
  });

  test('a platiteľ whose IČ DPH is in the wrong format is told that, not that it is missing', () => {
    expect(parse({ vatPayerType: 'payer', icDph: 'SK' })).toEqual({ ok: false, errors: { icDph: 'format' } });
  });

  test.each(['', 'platiteľ', 'Payer', 'registered'])('%j is not a platiteľ DPH', (vatPayerType) => {
    expect(parse({ vatPayerType })).toEqual({ ok: false, errors: { vatPayerType: 'invalid' } });
  });

  // 'x' is no type of platiteľ DPH, so nothing is said about the missing IČ DPH: that would be a second error for one mistake.
  test('a value that is none of the three is not also judged as a platiteľ', () => {
    expect(parse({ vatPayerType: 'x', icDph: '' })).toEqual({ ok: false, errors: { vatPayerType: 'invalid' } });
  });
});
