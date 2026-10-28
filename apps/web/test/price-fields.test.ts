import { describe, expect, test } from 'vitest';
import { syncPriceFields, type PriceFields } from '../src/app/(app)/zakazky/[id]/price-fields.ts';

// The form of a Diel has a Nákupná cena, a Prirážka and a Predajná cena, of which the Prirážka is never saved. Changing
// one of them changes another, as the admin would work it out; every value below is worked out by hand.

const fields = (overrides: Partial<PriceFields>): PriceFields => ({ purchasePrice: '', markup: '', unitPrice: '', ...overrides });

describe('the Prirážka is changed', () => {
  test('25 % on 10 € makes the Predajná cena 12,50 €, and the Prirážka now leads', () => {
    expect(syncPriceFields('markup', fields({ purchasePrice: '10', markup: '25' }), 'unitPrice')).toEqual({
      fields: fields({ purchasePrice: '10', markup: '25', unitPrice: '12,50' }),
      leading: 'markup',
    });
  });

  test('a Prirážka with a decimal and a price in cents: 12,5 % on 3,33 € is 3,75 €', () => {
    expect(syncPriceFields('markup', fields({ purchasePrice: '3,33', markup: '12,5' }), 'markup').fields.unitPrice).toBe('3,75');
  });

  test('a Prirážka of 0 sells at the Nákupná cena, and a price that was there is replaced', () => {
    expect(syncPriceFields('markup', fields({ purchasePrice: '10', markup: '0', unitPrice: '99' }), 'markup').fields.unitPrice).toBe('10,00');
  });

  test.each(['', 'abc', '-5', '1,25', '12 %'])('a Prirážka of "%s" is not one, and the Predajná cena stays', (markup) => {
    expect(syncPriceFields('markup', fields({ purchasePrice: '10', markup, unitPrice: '99' }), 'markup').fields.unitPrice).toBe('99');
  });

  test.each(['', 'abc', '-5'])('without a usable Nákupná cena ("%s") the Predajná cena stays', (purchasePrice) => {
    expect(syncPriceFields('markup', fields({ purchasePrice, markup: '25', unitPrice: '99' }), 'markup').fields.unitPrice).toBe('99');
  });

  test('a price above the largest a Položka may have stays out of the field', () => {
    expect(syncPriceFields('markup', fields({ purchasePrice: '1000000', markup: '10', unitPrice: '5' }), 'markup').fields.unitPrice).toBe('5');
  });
});

describe('the Predajná cena is changed', () => {
  test('12,50 € on 10 € is a Prirážka of 25 %, and the Predajná cena now leads', () => {
    expect(syncPriceFields('unitPrice', fields({ purchasePrice: '10', markup: '0', unitPrice: '12,5' }), 'markup')).toEqual({
      fields: fields({ purchasePrice: '10', markup: '25', unitPrice: '12,5' }),
      leading: 'unitPrice',
    });
  });

  test('the Prirážka has one decimal: 4 € on 3 € is 33,3 %', () => {
    expect(syncPriceFields('unitPrice', fields({ purchasePrice: '3', unitPrice: '4' }), 'markup').fields.markup).toBe('33,3');
  });

  test('a price below the Nákupná cena is a negative Prirážka', () => {
    expect(syncPriceFields('unitPrice', fields({ purchasePrice: '10', unitPrice: '9' }), 'markup').fields.markup).toBe('-10');
  });

  test('a Nákupná cena of 0 has no Prirážka, and the field is emptied', () => {
    expect(syncPriceFields('unitPrice', fields({ purchasePrice: '0', markup: '25', unitPrice: '5' }), 'markup').fields.markup).toBe('');
  });

  test.each(['', 'abc', '-5', '1,005'])('a Predajná cena of "%s" is not one, and the Prirážka stays', (unitPrice) => {
    expect(syncPriceFields('unitPrice', fields({ purchasePrice: '10', markup: '25', unitPrice }), 'markup').fields.markup).toBe('25');
  });

  test.each(['', 'abc'])('without a usable Nákupná cena ("%s") the Prirážka stays', (purchasePrice) => {
    expect(syncPriceFields('unitPrice', fields({ purchasePrice, markup: '25', unitPrice: '5' }), 'markup').fields.markup).toBe('25');
  });
});

describe('the Nákupná cena is changed', () => {
  test('while the Prirážka leads, the Predajná cena follows: 25 % on 20 € is 25 €', () => {
    expect(syncPriceFields('purchasePrice', fields({ purchasePrice: '20', markup: '25', unitPrice: '12,50' }), 'markup')).toEqual({
      fields: fields({ purchasePrice: '20', markup: '25', unitPrice: '25,00' }),
      leading: 'markup',
    });
  });

  test('while the Predajná cena leads, the Prirážka follows and the price the admin typed stays: 12,50 € on 20 € is -37,5 %', () => {
    expect(syncPriceFields('purchasePrice', fields({ purchasePrice: '20', markup: '25', unitPrice: '12,50' }), 'unitPrice')).toEqual({
      fields: fields({ purchasePrice: '20', markup: '-37,5', unitPrice: '12,50' }),
      leading: 'unitPrice',
    });
  });

  test('a Nákupná cena that is emptied changes nothing else', () => {
    const typed = fields({ purchasePrice: '', markup: '25', unitPrice: '12,50' });
    expect(syncPriceFields('purchasePrice', typed, 'markup')).toEqual({ fields: typed, leading: 'markup' });
    expect(syncPriceFields('purchasePrice', typed, 'unitPrice')).toEqual({ fields: typed, leading: 'unitPrice' });
  });
});
