'use client';

import { defaultVatRate } from '@servisnik/domain/work-order';
import { useActionState } from 'react';
import { Field, FormError } from '../../field.tsx';
import { addLabourToWorkOrder } from '../actions.ts';

/** Adds a Práca: hours, a unit price without VAT, and a VAT rate that starts at 23 %. */
export function LabourForm({ workOrderId }: { workOrderId: string }) {
  const [state, formAction, pending] = useActionState(addLabourToWorkOrder, null);
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
        defaultValue={value('unitPrice')}
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
