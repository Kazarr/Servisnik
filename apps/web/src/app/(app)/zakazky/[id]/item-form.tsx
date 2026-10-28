'use client';

import type { Rates } from '@servisnik/domain/settings';
import type { ItemKind } from '@servisnik/domain/work-order';
import { useActionState } from 'react';
import { formatQuantityInput } from '../../../../format.ts';
import { Field, FormError } from '../../field.tsx';
import { valueIn } from '../../form-value.ts';
import { ItemFields, startingValues, usePriceSync, valuesOfItem } from '../../item-fields.tsx';
import { addItemToWorkOrder, updateItemOfWorkOrder } from '../actions.ts';

/** What the form needs to start from an item that is being edited. */
export type EditedItem = {
  id: string;
  kind: ItemKind;
  code: string | null;
  name: string;
  quantityHundredths: number;
  unit: string;
  purchasePriceCents: number | null;
  unitPriceCents: number;
  vatRate: number;
};

/**
 * The form of a Položka zákazky: adds a Práca or a Diel to the Zákazka in `target`, or edits `target.item`. A new
 * item starts with the unit of its kind, the default VAT rate of Nastavenia chosen from their rates, the hourly
 * rate as the price of a Práca and the Prirážka of Nastavenia on a Diel. The Prirážka is only a helper: with a
 * Nákupná cena, typing it makes the Predajná cena and typing the Predajná cena makes it (price-fields.ts), and
 * it is not sent as anything the server saves.
 */
export function ItemForm({ rates, target }: { rates: Rates; target: { workOrderId: string; kind: ItemKind } | { item: EditedItem } }) {
  const item = 'item' in target ? target.item : null;
  const kind = 'item' in target ? target.item.kind : target.kind;
  const [state, formAction, pending] = useActionState(item ? updateItemOfWorkOrder : addItemToWorkOrder, null);
  const { syncPrices, resetLeading } = usePriceSync(item ? 'unitPrice' : 'markup');

  const initial = item ? { ...valuesOfItem(item), quantity: formatQuantityInput(item.quantityHundredths) } : startingValues(kind, rates);
  const value = valueIn(state, initial);
  // An item keeps a VAT rate that Nastavenia no longer offer, so that editing its name does not change it.
  const vatRates = item && !rates.vatRates.includes(item.vatRate) ? [...rates.vatRates, item.vatRate] : rates.vatRates;
  const title = item ? 'Upraviť položku' : kind === 'part' ? 'Pridať diel' : 'Pridať prácu';
  const prefix = item ? 'edit' : kind; // the ids of the fields, since a page has the form of a Práca and the form of a Diel

  return (
    <form action={formAction} onReset={resetLeading} aria-label={title} className="form">
      {'item' in target ? <input type="hidden" name="itemId" value={target.item.id} /> : <input type="hidden" name="workOrderId" value={target.workOrderId} />}
      <input type="hidden" name="kind" value={kind} />
      <FormError message={state?.errors.form} />
      <ItemFields
        kind={kind}
        prefix={prefix}
        value={value}
        errors={state?.errors}
        vatRates={vatRates}
        syncPrices={syncPrices}
        quantity={
          <Field
            label="Množstvo"
            id={`${prefix}-quantity`}
            name="quantity"
            inputMode="decimal"
            defaultValue={value('quantity')}
            error={state?.errors.quantity}
            autoComplete="off"
            required
          />
        }
      />
      <button type="submit" disabled={pending}>
        {item ? 'Uložiť zmeny' : title}
      </button>
    </form>
  );
}
