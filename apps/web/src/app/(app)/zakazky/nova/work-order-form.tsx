'use client';

import { useActionState } from 'react';
import { Field, FormError, SelectField, TextAreaField } from '../../field.tsx';
import { openWorkOrder } from '../actions.ts';

/** The customer is the vehicle's owner unless another is chosen. */
export function WorkOrderForm({ vehicleId, ownerId, customers }: { vehicleId: string; ownerId: string; customers: { id: string; name: string }[] }) {
  const [state, formAction, pending] = useActionState(openWorkOrder, null);
  const value = (name: string) => state?.values[name];

  return (
    <form action={formAction} className="form">
      <input type="hidden" name="vehicleId" value={vehicleId} />
      <FormError message={state?.errors.form} />
      <SelectField label="Zákazník" name="customerId" defaultValue={ownerId}>
        {customers.map(({ id, name }) => (
          <option key={id} value={id}>
            {name}
          </option>
        ))}
      </SelectField>
      <Field
        label="Kilometre pri príjme"
        name="mileageKm"
        inputMode="numeric"
        autoComplete="off"
        defaultValue={value('mileageKm')}
        error={state?.errors.mileageKm}
        required
      />
      <TextAreaField label="Požiadavka zákazníka" name="customerRequest" rows={4} defaultValue={value('customerRequest')} error={state?.errors.customerRequest} required />
      <button type="submit" disabled={pending}>
        Uložiť zákazku
      </button>
    </form>
  );
}
