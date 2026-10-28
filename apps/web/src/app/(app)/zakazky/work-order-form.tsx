'use client';

import { useActionState } from 'react';
import { Field, FormError, SelectField, TextAreaField } from '../field.tsx';
import { valueIn } from '../form-value.ts';
import type { WorkOrderFormState } from './actions.ts';

type Saved = { id: string; mileageKm: number; customerRequest: string; deadline: string | null; note: string | null };

/**
 * The form of a Zákazka. With `intake` it is the form of a new one for the Vozidlo `vehicleId`: the
 * customer is the vehicle's owner unless another is chosen. With `saved` it edits the header of that
 * Zákazka (kilometres, request, Termín, note), whose customer and vehicle stay as they are. `action` is
 * addWorkOrder or editWorkOrder.
 */
export function WorkOrderForm({
  action,
  intake,
  saved,
}: {
  action: (state: WorkOrderFormState, formData: FormData) => Promise<WorkOrderFormState>;
  intake?: { vehicleId: string; ownerId: string; customers: { id: string; name: string }[] };
  saved?: Saved;
}) {
  const [state, formAction, pending] = useActionState(action, null);
  const value = valueIn(state, {
    mileageKm: String(saved?.mileageKm ?? ''),
    customerRequest: saved?.customerRequest ?? '',
    deadline: saved?.deadline ?? '',
    note: saved?.note ?? '',
  });

  return (
    <form action={formAction} className="form">
      {intake && <input type="hidden" name="vehicleId" value={intake.vehicleId} />}
      {saved && <input type="hidden" name="id" value={saved.id} />}
      <FormError message={state?.errors.form} />
      {intake && (
        <SelectField label="Zákazník" name="customerId" defaultValue={intake.ownerId}>
          {intake.customers.map(({ id, name }) => (
            <option key={id} value={id}>
              {name}
            </option>
          ))}
        </SelectField>
      )}
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
      <Field label="Termín" name="deadline" type="date" defaultValue={value('deadline')} error={state?.errors.deadline} />
      <TextAreaField label="Poznámka (interná)" name="note" rows={3} defaultValue={value('note')} />
      <button type="submit" disabled={pending}>
        Uložiť zákazku
      </button>
    </form>
  );
}
