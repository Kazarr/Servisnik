import { describe, expect, test } from 'vitest';
import { syncPriceFields, type PriceFields } from '../src/app/(app)/price-fields.ts';

// The form of a Diel has a Nákupná cena, a Prirážka and a Predajná cena, of which the Prirážka is never saved. Changing
// one of them changes another, as the admin would work it out; every value below is worked out by hand.

const fields = (overrides: Partial<PriceFields>): PriceFields => ({ purchasePrice: '', markup: '', salePrice: '', ...overrides });

describe('the Prirážka is changed', () => {
  test('25 % on 10 € makes the Predajná cena 12,50 €, and the Prirážka now leads', () => {
    expect(syncPriceFields('markup', fields({ purchasePrice: '10', markup: '25' }), 'salePrice')).toEqual({
      fields: fields({ purchasePrice: '10', markup: '25', salePrice: '12,50' }),
      leading: 'markup',
    });
  });

  test('a Prirážka with a decimal and a price in cents: 12,5 % on 3,33 € is 3,75 €', () => {
    expect(syncPriceFields('markup', fields({ purchasePrice: '3,33', markup: '12,5' }), 'markup').fields.salePrice).toBe('3,75');
  });

  test('a Prirážka of 0 sells at the Nákupná cena, and a price that was there is replaced', () => {
    expect(syncPriceFields('markup', fields({ purchasePrice: '10', markup: '0', salePrice: '99' }), 'markup').fields.salePrice).toBe('10,00');
  });

  test.each(['', 'abc', '1,25', '12 %', '-100,1'])('a Prirážka of "%s" is not one, and the Predajná cena stays', (markup) => {
    expect(syncPriceFields('markup', fields({ purchasePrice: '10', markup, salePrice: '99' }), 'markup').fields.salePrice).toBe('99');
  });

  test('a negative Prirážka sells below the Nákupná cena, as the one the form shows for it is read back: -10 % on 10 € is 9,00 €', () => {
    expect(syncPriceFields('markup', fields({ purchasePrice: '10', markup: '-10', salePrice: '99' }), 'salePrice')).toEqual({
      fields: fields({ purchasePrice: '10', markup: '-10', salePrice: '9,00' }),
      leading: 'markup',
    });
  });

  test('-100 % sells for nothing, which is a price', () => {
    expect(syncPriceFields('markup', fields({ purchasePrice: '10', markup: '-100', salePrice: '99' }), 'markup').fields.salePrice).toBe('0,00');
  });

  test.each(['', 'abc', '-5'])('without a usable Nákupná cena ("%s") the Predajná cena stays', (purchasePrice) => {
    expect(syncPriceFields('markup', fields({ purchasePrice, markup: '25', salePrice: '99' }), 'markup').fields.salePrice).toBe('99');
  });

  test('a price above the largest a Položka may have stays out of the field', () => {
    expect(syncPriceFields('markup', fields({ purchasePrice: '1000000', markup: '10', salePrice: '5' }), 'markup').fields.salePrice).toBe('5');
  });
});

describe('the Predajná cena is changed', () => {
  test('12,50 € on 10 € is a Prirážka of 25 %, and the Predajná cena now leads', () => {
    expect(syncPriceFields('salePrice', fields({ purchasePrice: '10', markup: '0', salePrice: '12,5' }), 'markup')).toEqual({
      fields: fields({ purchasePrice: '10', markup: '25', salePrice: '12,5' }),
      leading: 'salePrice',
    });
  });

  test('the Prirážka has one decimal: 4 € on 3 € is 33,3 %', () => {
    expect(syncPriceFields('salePrice', fields({ purchasePrice: '3', salePrice: '4' }), 'markup').fields.markup).toBe('33,3');
  });

  test('a price below the Nákupná cena is a negative Prirážka', () => {
    expect(syncPriceFields('salePrice', fields({ purchasePrice: '10', salePrice: '9' }), 'markup').fields.markup).toBe('-10');
  });

  test('a Nákupná cena of 0 has no Prirážka, and the field is emptied', () => {
    expect(syncPriceFields('salePrice', fields({ purchasePrice: '0', markup: '25', salePrice: '5' }), 'markup').fields.markup).toBe('');
  });

  test.each(['', 'abc', '-5', '1,005'])('a Predajná cena of "%s" is not one, and the Prirážka stays', (salePrice) => {
    expect(syncPriceFields('salePrice', fields({ purchasePrice: '10', markup: '25', salePrice }), 'markup').fields.markup).toBe('25');
  });

  test.each(['', 'abc'])('without a usable Nákupná cena ("%s") the Prirážka stays', (purchasePrice) => {
    expect(syncPriceFields('salePrice', fields({ purchasePrice, markup: '25', salePrice: '5' }), 'markup').fields.markup).toBe('25');
  });
});

describe('the Nákupná cena is changed', () => {
  test('while the Prirážka leads, the Predajná cena follows: 25 % on 20 € is 25 €', () => {
    expect(syncPriceFields('purchasePrice', fields({ purchasePrice: '20', markup: '25', salePrice: '12,50' }), 'markup')).toEqual({
      fields: fields({ purchasePrice: '20', markup: '25', salePrice: '25,00' }),
      leading: 'markup',
    });
  });

  test('while the Predajná cena leads, the Prirážka follows and the price the admin typed stays: 12,50 € on 20 € is -37,5 %', () => {
    expect(syncPriceFields('purchasePrice', fields({ purchasePrice: '20', markup: '25', salePrice: '12,50' }), 'salePrice')).toEqual({
      fields: fields({ purchasePrice: '20', markup: '-37,5', salePrice: '12,50' }),
      leading: 'salePrice',
    });
  });

  test('a Nákupná cena that is emptied changes nothing else', () => {
    const typed = fields({ purchasePrice: '', markup: '25', salePrice: '12,50' });
    expect(syncPriceFields('purchasePrice', typed, 'markup')).toEqual({ fields: typed, leading: 'markup' });
    expect(syncPriceFields('purchasePrice', typed, 'salePrice')).toEqual({ fields: typed, leading: 'salePrice' });
  });
});
