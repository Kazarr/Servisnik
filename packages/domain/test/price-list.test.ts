import { describe, expect, test } from 'vitest';
import { parsePriceListItem, parsePriceListSearch, priceListSearchKeys, workOrderItemFromPriceListItem, type PriceListItemInput } from '../src/price-list/index.ts';

// Položka cenníka (GLOSSARY) is a Práca or a Diel with prices per unit and without VAT. The rules of its
// prices are those of a Položka zákazky (work-order-items.test.ts), which it asks; here is what is its own.

const rates = { defaultVatRate: 23, vatRates: [23, 19, 5] };
const brake: PriceListItemInput = { kind: 'part', code: 'BR-123', name: 'Brzdová doštička', unit: 'ks', purchasePrice: '20', unitPrice: '30', vatRate: '19' };

describe('a Položka cenníka as the admin types it', () => {
  test('a Diel keeps its trimmed code, name, unit, Nákupná cena, Predajná cena and VAT rate, and has no quantity', () => {
    const parsed = parsePriceListItem({ ...brake, code: '  BR-123 ', name: ' Brzdová doštička ', unit: ' ks ' }, rates);

    expect(parsed).toEqual({
      ok: true,
      item: { kind: 'part', code: 'BR-123', name: 'Brzdová doštička', unit: 'ks', purchasePriceCents: 2000, unitPriceCents: 3000, vatRate: 19 },
    });
  });

  test('a Práca is in hours unless the unit is typed, has no code and no Nákupná cena, and its price is in cents', () => {
    expect(parsePriceListItem({ kind: 'labour', name: 'Výmena oleja', unitPrice: '45,50' }, rates)).toEqual({
      ok: true,
      item: { kind: 'labour', code: null, name: 'Výmena oleja', unit: 'h', purchasePriceCents: null, unitPriceCents: 4550, vatRate: 23 },
    });
  });

  test('a Práca with a fixed price is in pieces when the unit is typed so', () => {
    expect(parsePriceListItem({ kind: 'labour', name: 'Nastavenie geometrie', unit: 'ks', unitPrice: '60' }, rates)).toMatchObject({
      ok: true,
      item: { unit: 'ks', unitPriceCents: 6000 },
    });
  });

  test('a Diel is in pieces unless the unit is typed, and a Diel without a Nákupná cena has none, where one of 0 € has 0', () => {
    expect(parsePriceListItem({ kind: 'part', name: 'Tesnenie', unitPrice: '4' }, rates)).toMatchObject({ ok: true, item: { unit: 'ks', purchasePriceCents: null } });
    expect(parsePriceListItem({ kind: 'part', name: 'Tesnenie', unitPrice: '4', purchasePrice: '0' }, rates)).toMatchObject({ ok: true, item: { purchasePriceCents: 0 } });
  });

  test('a Práca has no Nákupná cena, whatever is sent for it', () => {
    expect(parsePriceListItem({ kind: 'labour', name: 'Výmena oleja', unitPrice: '40', purchasePrice: '10' }, rates)).toMatchObject({ ok: true, item: { purchasePriceCents: null } });
  });

  test('a code left blank is none', () => {
    expect(parsePriceListItem({ ...brake, code: '   ' }, rates)).toMatchObject({ ok: true, item: { code: null } });
  });

  test('the VAT rate is the default one when none is typed, and a typed one must be one of the rates', () => {
    const { vatRate: _vatRate, ...withoutRate } = brake;

    expect(parsePriceListItem(withoutRate, rates)).toMatchObject({ ok: true, item: { vatRate: 23 } });
    expect(parsePriceListItem({ ...brake, vatRate: '5' }, rates)).toMatchObject({ ok: true, item: { vatRate: 5 } });
    expect(parsePriceListItem({ ...brake, vatRate: '20' }, rates)).toEqual({ ok: false, errors: { vatRate: 'invalid' } });
  });

  test('a Predajná cena of 0 € is a price, and so is a Nákupná cena of 0 €', () => {
    expect(parsePriceListItem({ ...brake, purchasePrice: '0', unitPrice: '0' }, rates)).toMatchObject({ ok: true, item: { purchasePriceCents: 0, unitPriceCents: 0 } });
  });

  test.each(['', '-1', '1,505', '40 €', 'drahé', '1000000,01'])('Predajná cena "%s" is refused', (unitPrice) => {
    expect(parsePriceListItem({ ...brake, unitPrice }, rates)).toEqual({ ok: false, errors: { unitPrice: 'invalid' } });
  });

  test.each(['-5', '12,505', 'lacné'])('Nákupná cena "%s" of a Diel is refused', (purchasePrice) => {
    expect(parsePriceListItem({ ...brake, purchasePrice }, rates)).toEqual({ ok: false, errors: { purchasePrice: 'invalid' } });
  });

  // The Prirážka of 50 % makes the Predajná cena of 30 € of the Nákupná cena of 20 €. The form shows it as a helper, as the form of a Zákazka does.
  test('the Prirážka the form shows is asked as for a Položka zákazky: one that fits the prices is accepted and not stored, one that does not is refused', () => {
    expect(parsePriceListItem({ ...brake, markup: '50' }, rates)).toEqual(parsePriceListItem(brake, rates));
    expect(parsePriceListItem({ ...brake, markup: '-33,3', purchasePrice: '30', unitPrice: '20' }, rates)).toMatchObject({ ok: true });
    expect(parsePriceListItem({ ...brake, markup: '25' }, rates)).toEqual({ ok: false, errors: { markup: 'disagrees' } });
    expect(parsePriceListItem({ ...brake, markup: '50,55' }, rates)).toEqual({ ok: false, errors: { markup: 'invalid' } });
  });

  test('a name is required and a unit sent blank is refused, where every reason comes back at once and none of them is a quantity', () => {
    expect(parsePriceListItem({ kind: 'part', name: '  ', unit: ' ', purchasePrice: 'x', unitPrice: 'x', vatRate: 'x' }, rates)).toEqual({
      ok: false,
      errors: { name: 'required', unit: 'required', purchasePrice: 'invalid', unitPrice: 'invalid', vatRate: 'invalid' },
    });
  });
});

describe('searching the Cenník', () => {
  test('the code and the name of an item are stored beside it as they are searched: lower case, without diacritics', () => {
    expect(priceListSearchKeys({ code: 'BR-Ž1', name: 'Brzdová  doštička' })).toEqual({ searchCode: 'br-z1', searchName: 'brzdova dosticka' });
  });

  test('an item without a code has an empty code key, which no search text is found in', () => {
    expect(priceListSearchKeys({ code: null, name: 'Výmena oleja' })).toEqual({ searchCode: '', searchName: 'vymena oleja' });
  });

  test('what is typed is searched the same way: "BRZDOVÁ" and " brzdova " are both "brzdova"', () => {
    expect(parsePriceListSearch('BRZDOVÁ')).toBe('brzdova');
    expect(parsePriceListSearch(' brzdova ')).toBe('brzdova');
    expect(parsePriceListSearch('Doštička   Brzdová')).toBe('dosticka brzdova');
  });

  test('blank text is searched as nothing', () => {
    expect(parsePriceListSearch('   ')).toBe('');
  });

  test('what is typed is found in what is stored, which is how the search matches', () => {
    const { searchName } = priceListSearchKeys({ code: null, name: 'Brzdová doštička' });

    expect(searchName.includes(parsePriceListSearch('brzdova'))).toBe(true);
    expect(searchName.includes(parsePriceListSearch('DOŠTIČ'))).toBe(true);
    expect(searchName.includes(parsePriceListSearch('olej'))).toBe(false);
  });
});

describe('adding a Položka cenníka to a Zákazka', () => {
  const stored = { kind: 'part', code: 'BR-123', name: 'Brzdová doštička', unit: 'ks', purchasePriceCents: 2000, unitPriceCents: 3000, vatRate: 19 } as const;

  test('copies the kind, code, name, unit, both prices and the VAT rate, in a quantity of 1', () => {
    expect(workOrderItemFromPriceListItem(stored)).toEqual({ ...stored, quantityHundredths: 100 });
  });

  test('copies a Práca with no code and no Nákupná cena as it is', () => {
    const labour = { kind: 'labour', code: null, name: 'Výmena oleja', unit: 'h', purchasePriceCents: null, unitPriceCents: 4550, vatRate: 23 } as const;

    expect(workOrderItemFromPriceListItem(labour)).toEqual({ ...labour, quantityHundredths: 100 });
  });

  test('copies nothing but those values: the row it is handed may carry an id and dates, and the copy points back to none of them', () => {
    const row = { ...stored, id: '7d1c0a3e-0000-4000-8000-000000000001', searchCode: 'br-123', searchName: 'brzdova dosticka', createdAt: new Date(0), updatedAt: new Date(0) };

    expect(Object.keys(workOrderItemFromPriceListItem(row)).sort()).toEqual(
      ['code', 'kind', 'name', 'purchasePriceCents', 'quantityHundredths', 'unit', 'unitPriceCents', 'vatRate'].sort(),
    );
  });
});
