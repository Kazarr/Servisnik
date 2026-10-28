'use client';

import { useActionState } from 'react';
import { FormError, SelectField } from '../../field.tsx';
import { valueIn } from '../../form-value.ts';
import { addWorkOrder } from '../actions.ts';
import { OrderFields } from '../order-fields.tsx';
import { LowerMileageNotice } from './lower-mileage-notice.tsx';

/** The customer is the vehicle's owner unless another is chosen. A Zákazka saved with kilometres lower than the Stav km of the vehicle is told here, instead of opening it. */
export function WorkOrderForm({ vehicleId, ownerId, customers }: { vehicleId: string; ownerId: string; customers: { id: string; name: string }[] }) {
  const [state, formAction, pending] = useActionState(addWorkOrder, null);
  const value = valueIn(state);
  if (state?.saved) return <LowerMileageNotice {...state.saved} />;

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
