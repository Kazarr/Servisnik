'use client';

import { useActionState } from 'react';
import { formatEuroInput } from '../../../../format.ts';
import { Field, FormError } from '../../field.tsx';
import { addWorkToOrder } from '../actions.ts';

/**
 * Adds a Práca: hours, a unit price without VAT and a VAT rate. The form starts with the default VAT rate
 * and the hourly rate of Nastavenia (no price when there is none), and again after each save.
 */
export function LabourForm({ workOrderId, defaultVatRate, hourlyRateCents }: { workOrderId: string; defaultVatRate: number; hourlyRateCents: number | null }) {
  const [state, formAction, pending] = useActionState(addWorkToOrder, null);
  const value = (name: string) => state?.values[name];

  return (
    <form action={formAction} className="form">
      <input type="hidden" name="workOrderId" value={workOrderId} />
      <FormError message={state?.errors.form} />
      <Field label="Názov" name="name" defaultValue={value('name')} error={state?.errors.name} autoComplete="off" required />
      <Field label="Množstvo (h)" name="quantity" inputMode="decimal" defaultValue={value('quantity')} error={state?.errors.quantity} autoComplete="off" required />
      <Field
        label="Cena za jednotku bez DPH (€)"
        name="unitPrice"
        inputMode="decimal"
        defaultValue={value('unitPrice') ?? formatEuroInput(hourlyRateCents)}
        error={state?.errors.unitPrice}
        autoComplete="off"
        required
      />
      <Field label="Sadzba DPH (%)" name="vatRate" inputMode="numeric" defaultValue={value('vatRate') ?? String(defaultVatRate)} error={state?.errors.vatRate} autoComplete="off" required />
      <button type="submit" disabled={pending}>
        Pridať prácu
      </button>
    </form>
  );
}
