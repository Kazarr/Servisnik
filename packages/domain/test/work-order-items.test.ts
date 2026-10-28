import { describe, expect, test } from 'vitest';
import { markupFromSalePrice, parseMarkup, salePriceFromMarkup } from '../src/work-order/index.ts';

// Prirážka (GLOSSARY) is a percentage of the Nákupná cena. It is never stored: the form turns it into a
// Predajná cena and back. It is counted in tenths of a percent (125 is 12,5 %), so no amount is a float.
// Every expected value below is worked out by hand.

describe('a Prirážka as the admin types it', () => {
  test.each([
    ['25', 250],
    ['12,5', 125],
    ['12.5', 125],
    ['0', 0],
    ['0,0', 0],
    [' 7 ', 70],
    ['1 000', 10000],
  ])('"%s" is %i tenths of a percent', (typed, tenths) => {
    expect(parseMarkup(typed)).toBe(tenths);
  });

  test.each(['', ' ', '-5', '12,55', '12,', ',5', '12 %', 'veľa', '1,2,3', '99999999'])('"%s" is not a Prirážka', (typed) => {
    expect(parseMarkup(typed)).toBeNull();
  });
});

describe('the Predajná cena made from a Nákupná cena and a Prirážka', () => {
  test('25 % on 10,00 € is 12,50 €', () => {
    expect(salePriceFromMarkup(1000, 250)).toBe(1250);
  });

  test('a Prirážka of 0 sells at the purchase price', () => {
    expect(salePriceFromMarkup(1050, 0)).toBe(1050);
    expect(salePriceFromMarkup(0, 0)).toBe(0);
  });

  test('a Prirážka with a decimal: 12,5 % on 3,33 € is 3,74625 €, so 3,75 €', () => {
    expect(salePriceFromMarkup(333, 125)).toBe(375);
  });

  test('the price is rounded to the cent: 10 % on 3,33 € is 3,663 €, so 3,66 €', () => {
    expect(salePriceFromMarkup(333, 100)).toBe(366);
  });

  test('half a cent rounds up: 25 % on 0,10 € is 0,125 €, so 0,13 €', () => {
    expect(salePriceFromMarkup(10, 250)).toBe(13);
  });

  test('a price above the largest a Položka may have is none: 1 000 000 € plus 0,1 %', () => {
    expect(salePriceFromMarkup(100_000_000, 1)).toBeNull();
    expect(salePriceFromMarkup(100_000_000, 0)).toBe(100_000_000);
  });
});

describe('the Prirážka made from a Nákupná cena and a Predajná cena', () => {
  test('12,50 € on 10,00 € is 25 %', () => {
    expect(markupFromSalePrice(1000, 1250)).toBe(250);
  });

  test('a price equal to the purchase price is a Prirážka of 0', () => {
    expect(markupFromSalePrice(1000, 1000)).toBe(0);
  });

  test('it is rounded to one decimal: 4,00 € on 3,00 € is 33,333 %, so 33,3 %', () => {
    expect(markupFromSalePrice(300, 400)).toBe(333);
  });

  test('a half rounds up: 4,01 € on 4,00 € is 0,25 %, so 0,3 %', () => {
    expect(markupFromSalePrice(400, 401)).toBe(3);
  });

  test('a bit less than a half rounds down: 8,01 € on 8,00 € is 0,125 %, so 0,1 %', () => {
    expect(markupFromSalePrice(800, 801)).toBe(1);
  });

  test('a price below the purchase price is a negative Prirážka: 9,00 € on 10,00 € is -10 %', () => {
    expect(markupFromSalePrice(1000, 900)).toBe(-100);
  });

  test('a negative half rounds away from zero, as a positive one rounds up: 3,99 € on 4,00 € is -0,25 %, so -0,3 %', () => {
    expect(markupFromSalePrice(400, 399)).toBe(-3);
  });

  test('a price a cent below a purchase price of 1 000 000 € is a Prirážka of 0, not of -0', () => {
    expect(markupFromSalePrice(100_000_000, 99_999_999)).toBe(0);
  });

  test('there is no Prirážka on a purchase price of 0', () => {
    expect(markupFromSalePrice(0, 500)).toBeNull();
    expect(markupFromSalePrice(0, 0)).toBeNull();
  });

  test('it undoes salePriceFromMarkup for a whole Prirážka on a round price', () => {
    expect(markupFromSalePrice(1000, salePriceFromMarkup(1000, 250)!)).toBe(250);
  });
});
