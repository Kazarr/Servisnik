'use client';

import { useActionState } from 'react';
import { FormError, SelectField } from '../../field.tsx';
import { valueIn } from '../../form-value.ts';
import { addWorkOrder } from '../actions.ts';
import { OrderFields } from '../order-fields.tsx';

/** The customer is the vehicle's owner unless another is chosen. */
export function WorkOrderForm({ vehicleId, ownerId, customers }: { vehicleId: string; ownerId: string; customers: { id: string; name: string }[] }) {
  const [state, formAction, pending] = useActionState(addWorkOrder, null);
  const value = valueIn(state);

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
      <OrderFields value={value} errors={state?.errors ?? {}} />
      <button type="submit" disabled={pending}>
        Uložiť zákazku
      </button>
    </form>
  );
}
