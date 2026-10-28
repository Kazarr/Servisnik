import { describe, expect, test } from 'vitest';
import { normalizePhone, normalizeText, parseCustomerSearch, searchKeys } from '../src/customer/index.ts';

describe('Customer search: text', () => {
  test.each([
    ['Ján Novák', 'jan novak'],
    ['NOVAK', 'novak'],
    ['Ľudovít Štúr', 'ludovit stur'],
    ['Čech Ďurďa Ťapák Ňuňo Žiak Ôsmy Ľalia Ŕuža Ĺúbi Ä Ö Ü', 'cech durda tapak nuno ziak osmy lalia ruza lubi a o u'],
    ['Říha Ěž Ůž', 'riha ez uz'],
    ['  Ján \t  Novák\n', 'jan novak'],
    ['', ''],
  ])('%j is searched as %j', (typed, normalized) => {
    expect(normalizeText(typed)).toBe(normalized);
  });

  test('a letter that has no accent to drop stays', () => {
    expect(normalizeText('Straße Łódź')).toBe('straße łodz');
  });
});

describe('Customer search: phone', () => {
  test.each([
    ['0905 123 456', '905123456'],
    ['+421 905 123 456', '905123456'],
    ['+421905123456', '905123456'],
    ['00421 905 123 456', '905123456'],
    ['00421905123456', '905123456'],
    ['0905/123-456', '905123456'],
    ['905 123 456', '905123456'],
    ['02/123 456 78', '212345678'],
    ['+420 777 123 456', '420777123456'],
    ['', ''],
  ])('%j is searched as %j', (typed, normalized) => {
    expect(normalizePhone(typed)).toBe(normalized);
  });

  test('only a leading 0, 421 or 00421 is dropped', () => {
    expect(normalizePhone('905 421 001 100')).toBe('905421001100');
    expect(normalizePhone('0421')).toBe('421');
    expect(normalizePhone('004210')).toBe('0');
  });
});

describe('Customer search: what is typed', () => {
  test('a name is searched as text, and has no phone', () => {
    expect(parseCustomerSearch('Novák')).toEqual({ text: 'novak', ico: 'novak', phone: null });
  });

  test('a phone number is searched as text and as a phone', () => {
    expect(parseCustomerSearch('0905 123 456')).toEqual({ text: '0905 123 456', ico: '0905123456', phone: '905123456' });
  });

  test('an IČO typed in groups is searched without the spaces', () => {
    expect(parseCustomerSearch('36 396 567')).toMatchObject({ ico: '36396567' });
  });

  test('digits next to letters are not a phone number', () => {
    expect(parseCustomerSearch('Ján 2')).toEqual({ text: 'jan 2', ico: 'jan2', phone: null });
  });

  test.each(['+421', '0', '+', '00421'])('%j has no digits left to search a phone by', (typed) => {
    expect(parseCustomerSearch(typed).phone).toBeNull();
  });

  test.each(['', '   ', '\t\n'])('blank text %j searches for nothing', (typed) => {
    expect(parseCustomerSearch(typed)).toEqual({ text: '', ico: '', phone: null });
  });
});

describe('Customer search: what is stored', () => {
  test('the name, e-mail and phone are stored the way they are searched', () => {
    expect(searchKeys({ name: 'Ján  Novák', email: 'Jan.Novak@Firma.SK', phone: '+421 905 123 456' })).toEqual({
      searchName: 'jan novak',
      searchEmail: 'jan.novak@firma.sk',
      searchPhone: '905123456',
    });
  });

  test('a missing e-mail or phone is stored as nothing to find', () => {
    expect(searchKeys({ name: 'Firma s.r.o.', email: null, phone: null })).toEqual({
      searchName: 'firma s.r.o.',
      searchEmail: '',
      searchPhone: '',
    });
  });

  test('a phone stored in one notation is found by a phone typed in the other, and the other way round', () => {
    const stored = (phone: string) => searchKeys({ name: 'Ján Novák', email: null, phone }).searchPhone;

    expect(stored('+421 905 123 456')).toBe(parseCustomerSearch('0905 123 456').phone);
    expect(stored('0905 123 456')).toBe(parseCustomerSearch('+421 905 123 456').phone);
  });
});
