import { markupFromSalePrice, parseMarkup, parseUnitPrice, salePriceFromMarkup } from '@servisnik/domain/work-order';
import { formatEuroInput, formatMarkupInput } from '../../../../format.ts';

/** The three price fields of the form of a Diel, as typed. The Prirážka is only here, it is never saved. */
export type PriceFields = { purchasePrice: string; markup: string; unitPrice: string };

/**
 * The fields after the admin changed `changed`. The Prirážka and the Predajná cena (`unitPrice`) derive from each
 * other and from the Nákupná cena: `leading` is the one he typed last, which a change of the Nákupná cena leaves
 * as it is, so that the other follows. A field that cannot be read, or a Nákupná cena that is missing, changes nothing.
 */
export function syncPriceFields(
  changed: keyof PriceFields,
  fields: PriceFields,
  leading: 'markup' | 'unitPrice',
): { fields: PriceFields; leading: 'markup' | 'unitPrice' } {
  const nowLeading = changed === 'purchasePrice' ? leading : changed;
  const purchasePriceCents = fields.purchasePrice.trim() === '' ? null : parseUnitPrice(fields.purchasePrice);
  if (purchasePriceCents === null) return { fields, leading: nowLeading };

  if (nowLeading === 'markup') {
    const markupTenths = parseMarkup(fields.markup);
    const salePriceCents = markupTenths === null ? null : salePriceFromMarkup(purchasePriceCents, markupTenths);
    return { fields: salePriceCents === null ? fields : { ...fields, unitPrice: formatEuroInput(salePriceCents) }, leading: nowLeading };
  }
  const salePriceCents = parseUnitPrice(fields.unitPrice);
  if (salePriceCents === null) return { fields, leading: nowLeading };
  return { fields: { ...fields, markup: formatMarkupInput(markupFromSalePrice(purchasePriceCents, salePriceCents)) }, leading: nowLeading };
}
