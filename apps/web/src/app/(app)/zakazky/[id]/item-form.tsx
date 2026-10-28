'use client';

import type { Rates } from '@servisnik/domain/settings';
import { defaultUnits, markupFromSalePrice, type ItemKind } from '@servisnik/domain/work-order';
import { useActionState, useRef, type ChangeEvent } from 'react';
import { formatEuroInput, formatMarkupInput, formatQuantityInput } from '../../../../format.ts';
import { Field, FormError, SelectField } from '../../field.tsx';
import { valueIn } from '../../form-value.ts';
import { addItemToWorkOrder, updateItemOfWorkOrder } from '../actions.ts';
import { syncPriceFields, type PriceFields } from './price-fields.ts';

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
  const startsLeading = item ? 'unitPrice' : 'markup';
  const leading = useRef<'markup' | 'unitPrice'>(startsLeading);

  const initial = item
    ? {
        code: item.code,
        name: item.name,
        quantity: formatQuantityInput(item.quantityHundredths),
        unit: item.unit,
        purchasePrice: formatEuroInput(item.purchasePriceCents),
        markup: formatMarkupInput(item.purchasePriceCents === null ? null : markupFromSalePrice(item.purchasePriceCents, item.unitPriceCents)),
        unitPrice: formatEuroInput(item.unitPriceCents),
        vatRate: String(item.vatRate),
      }
    : {
        unit: defaultUnits[kind],
        markup: formatMarkupInput(rates.markupPercent * 10),
        unitPrice: kind === 'labour' ? formatEuroInput(rates.hourlyRateCents) : '',
        vatRate: String(rates.defaultVatRate),
      };
  const value = valueIn(state, initial);
  // An item keeps a VAT rate that Nastavenia no longer offer, so that editing its name does not change it.
  const vatRates = item && !rates.vatRates.includes(item.vatRate) ? [...rates.vatRates, item.vatRate] : rates.vatRates;
  const title = item ? 'Upraviť položku' : kind === 'part' ? 'Pridať diel' : 'Pridať prácu';
  const prefix = item ? 'edit' : kind; // the ids of the fields, since a page has the form of a Práca and the form of a Diel

  /** Reads the three price fields of the form, lets the helper work out the others, and writes the changed ones back. */
  const syncPrices = (changed: keyof PriceFields) => (event: ChangeEvent<HTMLInputElement>) => {
    const { elements } = event.currentTarget.form!;
    const control = (name: keyof PriceFields) => elements.namedItem(name) as HTMLInputElement;
    const typed = { purchasePrice: control('purchasePrice').value, markup: control('markup').value, unitPrice: control('unitPrice').value };
    const next = syncPriceFields(changed, typed, leading.current);
    leading.current = next.leading;
    for (const name of ['markup', 'unitPrice'] as const) if (control(name).value !== next.fields[name]) control(name).value = next.fields[name];
  };

  return (
    <form action={formAction} onReset={() => (leading.current = startsLeading)} aria-label={title} className="form">
      {'item' in target ? <input type="hidden" name="itemId" value={target.item.id} /> : <input type="hidden" name="workOrderId" value={target.workOrderId} />}
      <input type="hidden" name="kind" value={kind} />
      <FormError message={state?.errors.form} />
      <Field label="Kód" id={`${prefix}-code`} name="code" defaultValue={value('code')} autoComplete="off" />
      <Field label="Názov" id={`${prefix}-name`} name="name" defaultValue={value('name')} error={state?.errors.name} autoComplete="off" required />
      <Field label="Množstvo" id={`${prefix}-quantity`} name="quantity" inputMode="decimal" defaultValue={value('quantity')} error={state?.errors.quantity} autoComplete="off" required />
      <Field label="Jednotka" id={`${prefix}-unit`} name="unit" defaultValue={value('unit')} error={state?.errors.unit} autoComplete="off" required />
      {kind === 'part' && (
        <>
          <Field
            label="Nákupná cena za jednotku bez DPH (€)"
            id={`${prefix}-purchasePrice`}
            name="purchasePrice"
            inputMode="decimal"
            defaultValue={value('purchasePrice')}
            error={state?.errors.purchasePrice}
            onChange={syncPrices('purchasePrice')}
            autoComplete="off"
          />
          <Field label="Prirážka (%)" id={`${prefix}-markup`} name="markup" inputMode="decimal" defaultValue={value('markup')} onChange={syncPrices('markup')} autoComplete="off" />
        </>
      )}
      <Field
        label="Predajná cena za jednotku bez DPH (€)"
        id={`${prefix}-unitPrice`}
        name="unitPrice"
        inputMode="decimal"
        defaultValue={value('unitPrice')}
        error={state?.errors.unitPrice}
        onChange={kind === 'part' ? syncPrices('unitPrice') : undefined}
        autoComplete="off"
        required
      />
      <SelectField label="Sadzba DPH (%)" id={`${prefix}-vatRate`} name="vatRate" defaultValue={value('vatRate')} error={state?.errors.vatRate}>
        {vatRates.map((rate) => (
          <option key={rate} value={rate}>
            {rate}
          </option>
        ))}
      </SelectField>
      <button type="submit" disabled={pending}>
        {item ? 'Uložiť zmeny' : title}
      </button>
    </form>
  );
}
