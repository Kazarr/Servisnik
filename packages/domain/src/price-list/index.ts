// Price list area (GLOSSARY: Ceny, Cenník, Položka cenníka). Pure rules: no framework, database or network.

import { normalizeText } from '../customer/index.ts';
import { parseItem, type ItemErrors, type ItemInput, type WorkOrderItem } from '../work-order/index.ts';

/**
 * Položka cenníka: a Práca or a Diel with its prices per unit and without VAT, and the VAT rate it was given. It is a
 * Položka zákazky without a quantity, which is the Zákazka's to say.
 */
export type PriceListItem = Omit<WorkOrderItem, 'quantityHundredths'>;

/** What the form sends for a Položka cenníka: what it sends for a Položka zákazky, less the quantity. */
export type PriceListItemInput = Omit<ItemInput, 'quantity'>;
export type PriceListItemErrors = Omit<ItemErrors, 'quantity'>;

/**
 * A Položka cenníka ready to store, or every reason it is not one. Its prices, unit and VAT rate are a Položka
 * zákazky's, so they are parsed by `parseItem`, with a quantity of 1 that is thrown away, and the code is
 * stored trimmed (the database keeps it unique, whatever the case).
 */
export function parsePriceListItem(
  input: PriceListItemInput,
  rates: { defaultVatRate: number; vatRates: readonly number[] },
): { ok: true; item: PriceListItem } | { ok: false; errors: PriceListItemErrors } {
  const parsed = parseItem({ ...input, quantity: '1' }, rates);
  if (!parsed.ok) return parsed;
  const { quantityHundredths: _quantity, ...item } = parsed.item;
  return { ok: true, item };
}

// Hľadanie v cenníku: one field finds a Položka cenníka by a part of its code or name. As with the Zákazníci, the
// same normalization is applied to what is stored and to what is typed, so PostgreSQL needs no `unaccent`.

/** The normalized code and name of an item, stored beside them to be searched. */
export const priceListSearchKeys = ({ code, name }: { code: string | null; name: string }) => ({
  searchCode: normalizeText(code ?? ''),
  searchName: normalizeText(name),
});

/** What to look for when `typed` is typed into the search field; blank text looks for nothing. */
export const parsePriceListSearch = (typed: string) => normalizeText(typed);

/**
 * The Položka zákazky that adding a Položka cenníka to a Zákazka makes: the values of the item in a quantity of 1.
 * Only these values are taken, so the copy points back to nothing (no id) and a later change of the Cenník does not reach it.
 */
export const workOrderItemFromPriceListItem = ({ kind, code, name, unit, purchasePriceCents, unitPriceCents, vatRate }: PriceListItem): WorkOrderItem => ({
  kind,
  code,
  name,
  unit,
  purchasePriceCents,
  unitPriceCents,
  vatRate,
  quantityHundredths: 100,
});
