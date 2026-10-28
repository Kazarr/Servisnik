import { Field, TextAreaField } from '../field.tsx';
import type { OrderFormErrors, OrderFormValues } from './order-input.ts';

/** The fields of the header of a Zákazka: the kilometres on the odometer at intake, what the customer asks for, the Termín and the internal note. */
export function OrderFields({ value, errors }: { value: (name: keyof OrderFormValues) => string; errors: OrderFormErrors }) {
  return (
    <>
      <Field label="Kilometre pri príjme" name="mileageKm" inputMode="numeric" autoComplete="off" defaultValue={value('mileageKm')} error={errors.mileageKm} required />
      <TextAreaField label="Požiadavka zákazníka" name="customerRequest" rows={4} defaultValue={value('customerRequest')} error={errors.customerRequest} required />
      <Field label="Termín" name="deadline" type="date" defaultValue={value('deadline')} error={errors.deadline} />
      <TextAreaField label="Poznámka (interná)" name="note" rows={3} defaultValue={value('note')} />
    </>
  );
}
