import { describe, expect, test } from 'vitest';
import { parseCustomer } from '../src/customer/index.ts';

const company = { ico: '12345678', dic: '2020123456', icDph: 'SK2020123456' };
const contact = { street: 'Hlavná 1', city: 'Bratislava', postalCode: '81101', email: 'info@firma.sk' };

describe('Customer', () => {
  test('a company is stored with its IČO, DIČ, IČ DPH, address and e-mail', () => {
    expect(parseCustomer({ type: 'company', name: 'Firma s.r.o.', ...company, ...contact })).toEqual({
      ok: true,
      customer: { type: 'company', name: 'Firma s.r.o.', ...company, ...contact },
    });
  });

  test('a person never has company fields, whatever was sent', () => {
    expect(parseCustomer({ type: 'person', name: 'Ján Novák', ...company, ...contact })).toEqual({
      ok: true,
      customer: { type: 'person', name: 'Ján Novák', ico: null, dic: null, icDph: null, ...contact },
    });
  });

  test('every field is trimmed and a blank optional one is stored as nothing', () => {
    expect(
      parseCustomer({ type: 'company', name: '  Firma s.r.o.  ', ico: ' 12345678 ', dic: '', street: '   ' }),
    ).toEqual({
      ok: true,
      customer: {
        type: 'company',
        name: 'Firma s.r.o.',
        ico: '12345678',
        dic: null,
        icDph: null,
        street: null,
        city: null,
        postalCode: null,
        email: null,
      },
    });
  });

  test.each(['person', 'company'] as const)('the name of a %s is required', (type) => {
    expect(parseCustomer({ type, name: '   ' })).toEqual({ ok: false, errors: { name: 'required' } });
  });
});
