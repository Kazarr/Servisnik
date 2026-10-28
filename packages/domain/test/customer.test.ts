import { describe, expect, test } from 'vitest';
import { parseCustomer } from '../src/customer/index.ts';

const company = { ico: '12345678', dic: '2020123456', icDph: 'SK2020123456' };
const contact = { street: 'Hlavná 1', city: 'Bratislava', postalCode: '81101', phone: '0905 123 456', email: 'info@firma.sk', note: 'Platí v hotovosti' };
const nothing = { dic: null, icDph: null, street: null, city: null, postalCode: null, phone: null, email: null, note: null };

describe('Customer', () => {
  test('a company is stored with its IČO, DIČ, IČ DPH, address, contact and note', () => {
    expect(parseCustomer({ type: 'company', name: 'Firma s.r.o.', ...company, ...contact })).toEqual({
      ok: true,
      customer: { type: 'company', name: 'Firma s.r.o.', ...company, ...contact },
    });
  });

  test('a person needs only a name', () => {
    expect(parseCustomer({ type: 'person', name: 'Ján Novák' })).toEqual({
      ok: true,
      customer: { type: 'person', name: 'Ján Novák', ico: null, ...nothing },
    });
  });

  test('a company needs only a name and an IČO', () => {
    expect(parseCustomer({ type: 'company', name: 'Firma s.r.o.', ico: '12345678' })).toEqual({
      ok: true,
      customer: { type: 'company', name: 'Firma s.r.o.', ico: '12345678', ...nothing },
    });
  });

  test('a person never has company fields, whatever was sent', () => {
    expect(parseCustomer({ type: 'person', name: 'Ján Novák', ...company, ...contact })).toEqual({
      ok: true,
      customer: { type: 'person', name: 'Ján Novák', ico: null, dic: null, icDph: null, ...contact },
    });
  });

  test('company fields sent for a person are dropped before they are checked', () => {
    expect(parseCustomer({ type: 'person', name: 'Ján Novák', ico: 'abc', dic: '1', icDph: '2' })).toEqual({
      ok: true,
      customer: { type: 'person', name: 'Ján Novák', ico: null, ...nothing },
    });
  });

  test('every field is trimmed and a blank optional one is stored as nothing', () => {
    expect(
      parseCustomer({ type: 'company', name: '  Firma s.r.o.  ', ico: ' 12345678 ', dic: '', street: '   ', phone: ' 0905 ', note: ' \n ' }),
    ).toEqual({
      ok: true,
      customer: { type: 'company', name: 'Firma s.r.o.', ico: '12345678', ...nothing, phone: '0905' },
    });
  });

  test.each(['person', 'company'] as const)('the name of a %s is required', (type) => {
    expect(parseCustomer({ type, name: '   ', ico: '12345678' })).toEqual({ ok: false, errors: { name: 'required' } });
  });

  test.each([undefined, '', '   '])('the IČO of a company is required, not %j', (ico) => {
    expect(parseCustomer({ type: 'company', name: 'Firma s.r.o.', ico })).toEqual({ ok: false, errors: { ico: 'required' } });
  });

  test.each(['1234567', '123456789', '1234567A', '12 345 678', '１２３４５６７８'])('the IČO %j is not 8 digits', (ico) => {
    expect(parseCustomer({ type: 'company', name: 'Firma s.r.o.', ico })).toEqual({ ok: false, errors: { ico: 'format' } });
  });

  test('the check digit of an IČO is not checked', () => {
    expect(parseCustomer({ type: 'company', name: 'Firma s.r.o.', ico: '12345679' }).ok).toBe(true);
  });

  test.each(['202012345', '20201234567', '202012345A', '2020 12345'])('the DIČ %j is not 10 digits', (dic) => {
    expect(parseCustomer({ type: 'company', name: 'Firma s.r.o.', ico: '12345678', dic })).toEqual({ ok: false, errors: { dic: 'format' } });
  });

  test.each(['SK2020123456', 'CZ12345678', 'SK12', 'ATU12345678', 'DE123456789012'])('the IČ DPH %j has a country code', (icDph) => {
    expect(parseCustomer({ type: 'company', name: 'Firma s.r.o.', ico: '12345678', icDph })).toMatchObject({ ok: true, customer: { icDph } });
  });

  test.each(['2020123456', 'S2020123456', 'sk2020123456', 'SK1', 'SK1234567890123', 'SK 2020123456', 'SK-2020123456'])(
    'the IČ DPH %j is not a country code and 2 to 12 letters or digits',
    (icDph) => {
      expect(parseCustomer({ type: 'company', name: 'Firma s.r.o.', ico: '12345678', icDph })).toEqual({ ok: false, errors: { icDph: 'format' } });
    },
  );

  test('a PSČ is stored without a space', () => {
    expect(parseCustomer({ type: 'person', name: 'Ján Novák', postalCode: '811 01' })).toMatchObject({ ok: true, customer: { postalCode: '81101' } });
  });

  test.each(['8110', '811011', '8110A', '81 1 0'])('the PSČ %j is not 5 digits', (postalCode) => {
    expect(parseCustomer({ type: 'person', name: 'Ján Novák', postalCode })).toEqual({ ok: false, errors: { postalCode: 'format' } });
  });

  test.each(['info', 'info@', '@firma.sk', 'info@firma', 'in fo@firma.sk', 'info@@firma.sk'])('the e-mail %j is not an e-mail', (email) => {
    expect(parseCustomer({ type: 'person', name: 'Ján Novák', email })).toEqual({ ok: false, errors: { email: 'format' } });
  });

  test('every reason a customer is refused is reported at once', () => {
    expect(
      parseCustomer({ type: 'company', name: ' ', ico: '1', dic: '2', icDph: '3', postalCode: '4', email: '5' }),
    ).toEqual({
      ok: false,
      errors: { name: 'required', ico: 'format', dic: 'format', icDph: 'format', postalCode: 'format', email: 'format' },
    });
  });

  test('a phone number is free text', () => {
    expect(parseCustomer({ type: 'person', name: 'Ján Novák', phone: 'po 17:00 na 0905/123 456' })).toMatchObject({
      ok: true,
      customer: { phone: 'po 17:00 na 0905/123 456' },
    });
  });
});
