'use client';

import type { Rates } from '@servisnik/domain/settings';
import { defaultUnits, markupFromSalePrice, type ItemKind } from '@servisnik/domain/work-order';
import { useRef, type ChangeEvent, type ReactNode } from 'react';
import { formatEuroInput, formatMarkupInput } from '../../format.ts';
import { Field, SelectField } from './field.tsx';
import type { ItemMessages } from './item-messages.ts';
import { syncPriceFields, type PriceFields } from './price-fields.ts';

// The fields a Práca or a Diel has wherever it is entered: on a Zákazka and in the Cenník. The Prirážka is only a
// helper in the form (price-fields.ts); what is saved are the two prices. The form still sends the Prirážka, and the
// domain refuses an item whose Prirážka is none or does not fit its prices, at this field (parseItem).

/** The fields of an item but its quantity, which only the form of a Zákazka has. */
export type ItemFieldName = 'code' | 'name' | 'unit' | 'purchasePrice' | 'markup' | 'salePrice' | 'vatRate';
export type ItemFieldErrors = ItemMessages & { code?: string };

/** What a new item starts with: the unit of its kind, the Prirážka of Nastavenia, the hourly rate as the price of a Práca and the default VAT rate. */
export function startingValues(kind: ItemKind, rates: Rates) {
  return {
    unit: defaultUnits[kind],
    markup: formatMarkupInput(rates.markupPercent * 10),
    salePrice: kind === 'labour' ? formatEuroInput(rates.hourlyRateCents) : '',
    vatRate: String(rates.defaultVatRate),
  };
}

/** What the fields start with when an item is edited: its values, and the Prirážka its two prices make (none without a Nákupná cena). */
export function valuesOfItem(item: { code: string | null; name: string; unit: string; purchasePriceCents: number | null; salePriceCents: number; vatRate: number }) {
  return {
    code: item.code,
    name: item.name,
    unit: item.unit,
    purchasePrice: formatEuroInput(item.purchasePriceCents),
    markup: formatMarkupInput(item.purchasePriceCents === null ? null : markupFromSalePrice(item.purchasePriceCents, item.salePriceCents)),
    salePrice: formatEuroInput(item.salePriceCents),
    vatRate: String(item.vatRate),
  };
}

/**
 * The handlers of the Nákupná cena, the Prirážka and the Predajná cena of a form: whichever the admin changes,
 * the others follow (price-fields.ts). `startsLeading` is the one that leads before he types anything: the Prirážka
 * on a new item, the Predajná cena on one that is edited. `resetLeading` is for the reset of the form.
 */
export function usePriceSync(startsLeading: 'markup' | 'salePrice') {
  const leading = useRef<'markup' | 'salePrice'>(startsLeading);

  /** Reads the three price fields of the form, lets the helper work out the others, and writes the changed ones back. */
  const syncPrices = (changed: keyof PriceFields) => (event: ChangeEvent<HTMLInputElement>) => {
    const { elements } = event.currentTarget.form!;
    const control = (name: keyof PriceFields) => elements.namedItem(name) as HTMLInputElement;
    const typed = { purchasePrice: control('purchasePrice').value, markup: control('markup').value, salePrice: control('salePrice').value };
    const next = syncPriceFields(changed, typed, leading.current);
    leading.current = next.leading;
    for (const name of ['markup', 'salePrice'] as const) if (control(name).value !== next.fields[name]) control(name).value = next.fields[name];
  };

  return { syncPrices, resetLeading: () => (leading.current = startsLeading) };
}

/**
 * The labelled fields of an item, with the reason each was refused tied to it: the code, the name, `quantity` (the
 * field the form of a Zákazka puts here), the unit, the Nákupná cena and the Prirážka of a Diel, the Predajná cena
 * and the VAT rate. `prefix` makes their ids, since a page may have the form of a Práca and the form of a Diel.
 * `value(name)` is what a field holds; `vatRates` are the options.
 */
export function ItemFields({
  kind,
  prefix,
  value,
  errors,
  vatRates,
  quantity,
  syncPrices,
}: {
  kind: ItemKind;
  prefix: string;
  value: (name: ItemFieldName) => string;
  errors?: ItemFieldErrors;
  vatRates: readonly number[];
  quantity?: ReactNode;
  syncPrices: ReturnType<typeof usePriceSync>['syncPrices'];
}) {
  return (
    <>
      <Field label="Kód" id={`${prefix}-code`} name="code" defaultValue={value('code')} error={errors?.code} autoComplete="off" />
      <Field label="Názov" id={`${prefix}-name`} name="name" defaultValue={value('name')} error={errors?.name} autoComplete="off" required />
      {quantity}
      <Field label="Jednotka" id={`${prefix}-unit`} name="unit" defaultValue={value('unit')} error={errors?.unit} autoComplete="off" required />
      {kind === 'part' && (
        <>
          <Field
            label="Nákupná cena za jednotku bez DPH (€)"
            id={`${prefix}-purchasePrice`}
            name="purchasePrice"
            inputMode="decimal"
            defaultValue={value('purchasePrice')}
            error={errors?.purchasePrice}
            onChange={syncPrices('purchasePrice')}
            autoComplete="off"
          />
          <Field
            label="Prirážka (%)"
            id={`${prefix}-markup`}
            name="markup"
            inputMode="decimal"
            defaultValue={value('markup')}
            error={errors?.markup}
            onChange={syncPrices('markup')}
            autoComplete="off"
          />
        </>
      )}
      <Field
        label="Predajná cena za jednotku bez DPH (€)"
        id={`${prefix}-salePrice`}
        name="salePrice"
        inputMode="decimal"
        defaultValue={value('salePrice')}
        error={errors?.salePrice}
        onChange={kind === 'part' ? syncPrices('salePrice') : undefined}
        autoComplete="off"
        required
      />
      <SelectField label="Sadzba DPH (%)" id={`${prefix}-vatRate`} name="vatRate" defaultValue={value('vatRate')} error={errors?.vatRate}>
        {vatRates.map((rate) => (
          <option key={rate} value={rate}>
            {rate}
          </option>
        ))}
      </SelectField>
    </>
  );
}
