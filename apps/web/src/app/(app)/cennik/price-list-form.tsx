'use client';

import type { Rates } from '@servisnik/domain/settings';
import { vatRatesKeeping, type ItemKind } from '@servisnik/domain/work-order';
import { useActionState } from 'react';
import { FormError } from '../field.tsx';
import { valueIn } from '../form-value.ts';
import { ItemFields, startingValues, usePriceSync, valuesOfItem } from '../item-fields.tsx';
import { addToPriceList, editPriceListItem } from './actions.ts';

/** What the form needs to start from an item of the Cenník that is being edited. */
export type EditedPriceListItem = {
  id: string;
  kind: ItemKind;
  code: string | null;
  name: string;
  unit: string;
  purchasePriceCents: number | null;
  unitPriceCents: number;
  vatRate: number;
};

/**
 * The form of a Položka cenníka: adds a Práca or a Diel of the kind in `target`, or edits `target.item`. It is the form
 * of a Položka zákazky without a quantity (item-fields.tsx): a new item starts with the unit of its kind, the default
 * VAT rate of Nastavenia chosen from their rates, the hourly rate as the price of a Práca and the Prirážka of
 * Nastavenia on a Diel, and the Prirážka is a helper that is not saved.
 */
export function PriceListForm({ rates, target }: { rates: Rates; target: { kind: ItemKind } | { item: EditedPriceListItem } }) {
  const item = 'item' in target ? target.item : null;
  const kind = 'item' in target ? target.item.kind : target.kind;
  const [state, formAction, pending] = useActionState(item ? editPriceListItem : addToPriceList, null);
  const { syncPrices, resetLeading } = usePriceSync(item ? 'unitPrice' : 'markup');

  const value = valueIn(state, item ? valuesOfItem(item) : startingValues(kind, rates));
  // An item keeps a VAT rate that Nastavenia no longer offer, so that editing its name does not change it.
  const vatRates = item ? vatRatesKeeping(rates.vatRates, item.vatRate) : rates.vatRates;
  const title = item ? 'Upraviť položku cenníka' : kind === 'part' ? 'Pridať diel do cenníka' : 'Pridať prácu do cenníka';

  return (
    <form action={formAction} onReset={resetLeading} aria-label={title} className="form">
      {item && <input type="hidden" name="itemId" value={item.id} />}
      <input type="hidden" name="kind" value={kind} />
      <FormError message={state?.errors.form} />
      <ItemFields kind={kind} prefix="price-list" value={value} errors={state?.errors} vatRates={vatRates} syncPrices={syncPrices} />
      <button type="submit" disabled={pending}>
        {item ? 'Uložiť zmeny' : 'Pridať do cenníka'}
      </button>
    </form>
  );
}
