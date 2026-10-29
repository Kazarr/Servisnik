import { describe, expect, test } from 'vitest';
import {
  defaultUnits,
  marginOf,
  markupFromSalePrice,
  parseItem,
  parseMarkup,
  salePriceFromMarkup,
  vatRatesKeeping,
  type ItemInput,
} from '../src/work-order/index.ts';

// Prirážka (GLOSSARY) is a percentage of the Nákupná cena. It is never stored: the form turns it into a
// Predajná cena and back. It is counted in tenths of a percent (125 is 12,5 %), so no amount is a float.
// A Predajná cena below the Nákupná cena makes a negative Prirážka, which the form shows and reads back; the
// least it can be is -100 %, the Predajná cena of 0 €, since a price is not below 0.
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
    ['-10', -100],
    ['-12,5', -125],
    ['-0,3', -3],
    ['-100', -1000],
    ['-0', 0],
    ['99999999', 999999990],
    ['9999999999', 99_999_999_990],
  ])('"%s" is %i tenths of a percent', (typed, tenths) => {
    expect(parseMarkup(typed)).toBe(tenths);
  });

  test.each(['', ' ', '12,55', '12,', ',5', '12 %', 'veľa', '1,2,3', '-', '--5', '+5', '−5', '-100,1', '-101', '99999999999'])('"%s" is not a Prirážka', (typed) => {
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

  test('a negative Prirážka sells below the purchase price: -10 % on 10,00 € is 9,00 €', () => {
    expect(salePriceFromMarkup(1000, -100)).toBe(900);
  });

  test('-100 % sells for 0 €, and a Prirážka below it would be a price below 0, which is none', () => {
    expect(salePriceFromMarkup(1000, -1000)).toBe(0);
    expect(salePriceFromMarkup(1000, -1001)).toBeNull();
    expect(salePriceFromMarkup(0, -1001)).toBeNull();
  });

  test('half a cent rounds up with a negative Prirážka as with a positive one: -25 % on 0,10 € is 0,075 €, so 0,08 €', () => {
    expect(salePriceFromMarkup(10, -250)).toBe(8);
  });

  test('the largest Prirážka a field takes on the largest purchase price is none, not a wrong price', () => {
    expect(salePriceFromMarkup(100_000_000, 99_999_999_990)).toBeNull();
  });

  test('the Prirážka that markupFromSalePrice makes of the cheapest purchase price and the dearest sale makes that price again', () => {
    const markup = markupFromSalePrice(1, 100_000_000)!;

    expect(markup).toBe(99_999_999_000);
    expect(parseMarkup('9999999900')).toBe(markup);
    expect(salePriceFromMarkup(1, markup)).toBe(100_000_000);
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

// A Položka zákazky as the admin types it, a Práca or a Diel. The rates of Nastavenia are handed to the domain.
describe('a Položka zákazky as the admin types it', () => {
  const rates = { defaultVatRate: 23, vatRates: [23, 19, 5] };
  const labour = { kind: 'labour', name: ' Výmena oleja ', quantity: '1,5', salePrice: '40', vatRate: '23' } as const;
  const part = {
    kind: 'part',
    code: ' OL-5W30 ',
    name: ' Olej 5W-30 ',
    quantity: '4',
    unit: 'l',
    purchasePrice: '12,50',
    salePrice: '15,60',
    vatRate: '19',
  } as const;
  const parsed = (input: ItemInput) => parseItem(input, rates);
  const refused = (overrides: Partial<ItemInput>) => parsed({ ...labour, ...overrides });

  test('a Práca is in hours unless the unit is typed, has no code and no Nákupná cena, and keeps its quantity in hundredths and its price in cents', () => {
    expect(parsed(labour)).toEqual({
      ok: true,
      item: { kind: 'labour', code: null, name: 'Výmena oleja', quantityHundredths: 150, unit: 'h', purchasePriceCents: null, salePriceCents: 4000, vatRate: 23 },
    });
  });

  test('a Diel keeps its trimmed code, unit and Nákupná cena beside the Predajná cena', () => {
    expect(parsed(part)).toEqual({
      ok: true,
      item: { kind: 'part', code: 'OL-5W30', name: 'Olej 5W-30', quantityHundredths: 400, unit: 'l', purchasePriceCents: 1250, salePriceCents: 1560, vatRate: 19 },
    });
  });

  test('a Diel is in pieces unless the unit is typed', () => {
    const { unit: _typed, ...withoutUnit } = part;
    expect(parsed(withoutUnit)).toMatchObject({ ok: true, item: { unit: 'ks' } });
    expect(defaultUnits).toEqual({ labour: 'h', part: 'ks' });
  });

  test('a Diel with no Nákupná cena typed has none, and one typed as 0 has 0', () => {
    expect(parsed({ ...part, purchasePrice: '' })).toMatchObject({ ok: true, item: { purchasePriceCents: null } });
    expect(parsed({ ...part, purchasePrice: ' ' })).toMatchObject({ ok: true, item: { purchasePriceCents: null } });
    const { purchasePrice: _typed, ...withoutPrice } = part;
    expect(parsed(withoutPrice)).toMatchObject({ ok: true, item: { purchasePriceCents: null } });
    expect(parsed({ ...part, purchasePrice: '0' })).toMatchObject({ ok: true, item: { purchasePriceCents: 0 } });
  });

  test('a Práca has no Nákupná cena, whatever is sent for it', () => {
    expect(parsed({ ...labour, purchasePrice: '10' })).toMatchObject({ ok: true, item: { purchasePriceCents: null } });
    expect(parsed({ ...labour, purchasePrice: 'drahé' })).toMatchObject({ ok: true, item: { purchasePriceCents: null } });
  });

  test('a code left blank is none', () => {
    expect(parsed({ ...part, code: '  ' })).toMatchObject({ ok: true, item: { code: null } });
    expect(parsed({ ...labour, code: 'PR-1' })).toMatchObject({ ok: true, item: { code: 'PR-1' } });
  });

  test('the VAT rate is the default rate the domain is given unless typed otherwise, and a typed one must be one of its rates', () => {
    const { vatRate: _typed, ...withoutRate } = labour;
    expect(parseItem(withoutRate, { defaultVatRate: 19, vatRates: [23, 19] })).toMatchObject({ ok: true, item: { vatRate: 19 } });
    expect(parseItem(withoutRate, { defaultVatRate: 5, vatRates: [23, 5] })).toMatchObject({ ok: true, item: { vatRate: 5 } });
    expect(refused({ vatRate: '5' })).toMatchObject({ ok: true, item: { vatRate: 5 } });
    expect(parseItem({ ...labour, vatRate: '0' }, { defaultVatRate: 23, vatRates: [23, 0] })).toMatchObject({ ok: true, item: { vatRate: 0 } });
    expect(refused({ vatRate: '7' })).toEqual({ ok: false, errors: { vatRate: 'invalid' } });
    expect(refused({ vatRate: '0' })).toEqual({ ok: false, errors: { vatRate: 'invalid' } });
  });

  // 1,15 * 100 is 114.99999999999999 as a float: the digits are read, never multiplied.
  test.each([
    ['1,15', 115],
    ['0,29', 29],
    ['2.3', 230],
    ['0,05', 5],
    [' 12 ', 1200],
    ['99999,99', 9999999],
  ])('quantity "%s" is %i hundredths', (quantity, hundredths) => {
    expect(refused({ quantity })).toMatchObject({ ok: true, item: { quantityHundredths: hundredths } });
  });

  test.each([
    ['40,5', 4050],
    ['40.50', 4050],
    ['33,33', 3333],
    ['0', 0],
    ['1 000 000', 100000000],
  ])('Predajná cena "%s" is %i cents', (salePrice, cents) => {
    expect(refused({ salePrice })).toMatchObject({ ok: true, item: { salePriceCents: cents } });
  });

  test.each([
    ['12,5', 1250],
    ['0,01', 1],
    ['1 000 000', 100000000],
  ])('Nákupná cena "%s" is %i cents', (purchasePrice, cents) => {
    expect(parsed({ ...part, purchasePrice })).toMatchObject({ ok: true, item: { purchasePriceCents: cents } });
  });

  test.each(['', '0', '0,00', '-1', '1,505', '1,2,3', 'hodina', '100000'])('quantity "%s" is refused', (quantity) => {
    expect(refused({ quantity })).toEqual({ ok: false, errors: { quantity: 'invalid' } });
  });

  test.each(['', '-5', '40,505', '40 €', 'drahé', '1000000,01'])('Predajná cena "%s" is refused', (salePrice) => {
    expect(refused({ salePrice })).toEqual({ ok: false, errors: { salePrice: 'invalid' } });
  });

  test.each(['-5', '12,505', '12 €', 'drahé', '1000000,01'])('Nákupná cena "%s" of a Diel is refused', (purchasePrice) => {
    expect(parsed({ ...part, purchasePrice })).toEqual({ ok: false, errors: { purchasePrice: 'invalid' } });
  });

  test.each(['', '-1', '101', '2,5', '23 %', '2 3', 'plná'])('VAT rate "%s" is refused', (vatRate) => {
    expect(refused({ vatRate })).toEqual({ ok: false, errors: { vatRate: 'invalid' } });
  });

  test('a unit sent blank is refused, where one left out is the default', () => {
    expect(refused({ unit: ' ' })).toEqual({ ok: false, errors: { unit: 'required' } });
    expect(refused({ unit: ' ks ' })).toMatchObject({ ok: true, item: { unit: 'ks' } });
  });

  test('a name is required, and every reason comes back at once', () => {
    expect(refused({ name: '  ' })).toEqual({ ok: false, errors: { name: 'required' } });
    expect(parsed({ ...part, name: '', quantity: '0', unit: '', purchasePrice: 'x', markup: 'x', salePrice: '', vatRate: 'x' })).toEqual({
      ok: false,
      errors: { name: 'required', quantity: 'invalid', unit: 'required', purchasePrice: 'invalid', markup: 'invalid', salePrice: 'invalid', vatRate: 'invalid' },
    });
  });

  // The form of a Diel shows a Prirážka that is not saved: either price may have made it, or the other way round. What it
  // shows must be a Prirážka (parseMarkup) and must fit the two prices it is sent with; else the form tells the admin.
  // The part above is bought for 12,50 € and sold for 15,60 €, which is a Prirážka of 24,8 % (3,10 / 12,50 = 24,8 %).
  describe('the Prirážka a Diel is sent with', () => {
    const withMarkup = (markup: string, overrides: Partial<ItemInput> = {}) => parsed({ ...part, markup, ...overrides });

    test('one that the prices make is accepted, and is not part of what is stored', () => {
      expect(withMarkup('24,8')).toEqual(parsed(part));
      expect(withMarkup('24.8')).toEqual(parsed(part));
    });

    test('one that makes the Predajná cena is accepted though the price makes another: 12,5 % on 3,33 € is 3,75 €, which is 12,6 % of 3,33 €', () => {
      expect(withMarkup('12,5', { purchasePrice: '3,33', salePrice: '3,75' })).toMatchObject({ ok: true, item: { purchasePriceCents: 333, salePriceCents: 375 } });
    });

    test('a sale below the Nákupná cena is saved as it was, with the negative Prirážka the form shows: 9,00 € on 10,00 € is -10 %', () => {
      expect(withMarkup('-10', { purchasePrice: '10', salePrice: '9' })).toMatchObject({ ok: true, item: { purchasePriceCents: 1000, salePriceCents: 900 } });
      expect(withMarkup('-100', { purchasePrice: '10', salePrice: '0' })).toMatchObject({ ok: true, item: { salePriceCents: 0 } });
    });

    test('a Prirážka of 0 is one that fits a Predajná cena equal to the Nákupná cena', () => {
      expect(withMarkup('0', { purchasePrice: '10', salePrice: '10' })).toMatchObject({ ok: true });
    });

    test('a field left blank, or not sent, says nothing the prices could contradict', () => {
      expect(withMarkup('')).toEqual(parsed(part));
      expect(withMarkup('  ')).toEqual(parsed(part));
      expect(parsed(part)).toMatchObject({ ok: true });
    });

    test.each(['12,55', 'abc', '12 %', '-100,1', '-', '+5'])('"%s" is not a Prirážka, and the item is refused at the field whatever the prices are', (markup) => {
      expect(withMarkup(markup)).toEqual({ ok: false, errors: { markup: 'invalid' } });
    });

    test('a Prirážka the prices do not make is refused as one that does not fit: 25 % when 15,60 € is sold for 12,50 €', () => {
      expect(withMarkup('25')).toEqual({ ok: false, errors: { markup: 'disagrees' } });
      expect(withMarkup('-10')).toEqual({ ok: false, errors: { markup: 'disagrees' } });
    });

    test('a tenth of a percent off is refused: 24,9 and 24,7 for 24,8 %', () => {
      expect(withMarkup('24,9')).toEqual({ ok: false, errors: { markup: 'disagrees' } });
      expect(withMarkup('24,7')).toEqual({ ok: false, errors: { markup: 'disagrees' } });
    });

    test('a Nákupná cena of 0 € has no Prirážka to show: a blank one fits any Predajná cena, and one that is typed fits only the Predajná cena of 0 € that it makes', () => {
      expect(withMarkup('', { purchasePrice: '0', salePrice: '5' })).toMatchObject({ ok: true });
      expect(withMarkup('25', { purchasePrice: '0', salePrice: '0' })).toMatchObject({ ok: true });
      expect(withMarkup('25', { purchasePrice: '0', salePrice: '5' })).toEqual({ ok: false, errors: { markup: 'disagrees' } });
    });

    test('there is nothing to fit without a Nákupná cena: the Prirážka of Nastavenia that starts the form stays, whatever the price', () => {
      expect(withMarkup('25', { purchasePrice: '' })).toMatchObject({ ok: true, item: { purchasePriceCents: null, salePriceCents: 1560 } });
      expect(withMarkup('25', { purchasePrice: undefined })).toMatchObject({ ok: true });
    });

    test('it is not asked when the prices are not fit to ask it of, and only the reasons of the prices come back', () => {
      expect(withMarkup('25', { salePrice: 'x' })).toEqual({ ok: false, errors: { salePrice: 'invalid' } });
      expect(withMarkup('25', { purchasePrice: 'x' })).toEqual({ ok: false, errors: { purchasePrice: 'invalid' } });
    });

    test('a Práca has no Prirážka, whatever is sent for it', () => {
      expect(refused({ markup: '25' })).toMatchObject({ ok: true });
      expect(refused({ markup: 'abc' })).toMatchObject({ ok: true });
    });
  });
});

// Marža (GLOSSARY) is the sale without VAT less the Nákupná cena of the Diely, in euros and as a percentage of the sale.
// Every expected value is worked out by hand; the quantity is in hundredths and a price in cents.
describe('the Sadzby DPH an item that is edited may choose from', () => {
  test('the rates of Nastavenia, in their order, when the item has one of them', () => {
    expect(vatRatesKeeping([23, 19, 5], 19)).toEqual([23, 19, 5]);
    expect(vatRatesKeeping([23, 19, 5], 5)).toEqual([23, 19, 5]);
  });

  test('the rates of Nastavenia and, after them, the rate the item has when they no longer offer it', () => {
    expect(vatRatesKeeping([23, 19, 5], 7)).toEqual([23, 19, 5, 7]);
    expect(vatRatesKeeping([23], 0)).toEqual([23, 0]);
  });

  test('a rate of 0 that Nastavenia offer is not added twice', () => {
    expect(vatRatesKeeping([23, 0], 0)).toEqual([23, 0]);
  });

  test('the list of Nastavenia is left as it is', () => {
    const offered = [23, 19];

    vatRatesKeeping(offered, 7);

    expect(offered).toEqual([23, 19]);
  });
});

describe('the Marža of a Zákazka', () => {
  const labour = (quantityHundredths: number, salePriceCents: number) => ({ kind: 'labour', quantityHundredths, salePriceCents, vatRate: 23, purchasePriceCents: null }) as const;
  const part = (quantityHundredths: number, purchasePriceCents: number | null, salePriceCents: number) =>
    ({ kind: 'part', quantityHundredths, salePriceCents, vatRate: 23, purchasePriceCents }) as const;

  test('a Zákazka with no Položka has no Marža and no percentage', () => {
    expect(marginOf([])).toEqual({ purchaseNet: 0, cents: 0, percentTenths: null, partsWithoutPurchasePrice: 0 });
  });

  test('a Práca has no Nákupná cena, so the Marža of 1,5 h at 40 € is all of the 60 €, 100 %, and nothing is missing', () => {
    expect(marginOf([labour(150, 4000)])).toEqual({ purchaseNet: 0, cents: 6000, percentTenths: 1000, partsWithoutPurchasePrice: 0 });
  });

  test('a Diel costs its quantity times its Nákupná cena: 60 € of work and 2 pieces at 12,50 € bought for 10 € leave 65 € of 85 €, 76,5 %', () => {
    // 65 / 85 is 76,4705...: one decimal is 76,5.
    expect(marginOf([labour(150, 4000), part(200, 1000, 1250)])).toEqual({ purchaseNet: 2000, cents: 6500, percentTenths: 765, partsWithoutPurchasePrice: 0 });
  });

  test('a Nákupná cena is rounded to cents once per item, like a Predajná cena: two items of 0,5 pieces at 0,01 € cost 2 cents, not 1', () => {
    expect(marginOf([part(50, 1, 100), part(50, 1, 100)])).toEqual({ purchaseNet: 2, cents: 98, percentTenths: 980, partsWithoutPurchasePrice: 0 });
  });

  test('a Diel without a Nákupná cena costs 0 and is counted, a Diel bought for 0 € is not, and a Práca never is', () => {
    const items = [labour(100, 500), part(100, null, 1000), part(100, 0, 500), part(100, 300, 700)];

    expect(marginOf(items)).toEqual({ purchaseNet: 300, cents: 2400, percentTenths: 889, partsWithoutPurchasePrice: 1 });
  });

  test('two Diely without a Nákupná cena are two', () => {
    expect(marginOf([part(100, null, 1000), part(300, null, 200)]).partsWithoutPurchasePrice).toBe(2);
  });

  test('a sale of 0 has a Marža in euros, a loss, and no percentage', () => {
    expect(marginOf([part(100, 500, 0)])).toEqual({ purchaseNet: 500, cents: -500, percentTenths: null, partsWithoutPurchasePrice: 0 });
  });

  test('a Diel sold below its Nákupná cena is a loss, as a negative percentage', () => {
    expect(marginOf([part(100, 1000, 800)])).toEqual({ purchaseNet: 1000, cents: -200, percentTenths: -250, partsWithoutPurchasePrice: 0 });
  });

  test('the percentage rounds a half up, 1 cent of 4,00 € is 0,25 %, so 0,3 %, and a negative half away from zero', () => {
    expect(marginOf([part(100, 399, 400)]).percentTenths).toBe(3);
    expect(marginOf([part(100, 401, 400)]).percentTenths).toBe(-3);
  });

  test('the percentage is of the sale without VAT, whatever the VAT rate is', () => {
    expect(marginOf([{ ...part(100, 1000, 2000), vatRate: 0 }, { ...part(100, 1000, 2000), vatRate: 23 }]).percentTenths).toBe(500);
  });
});
