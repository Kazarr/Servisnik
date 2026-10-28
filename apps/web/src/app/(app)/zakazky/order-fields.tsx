import { Field, TextAreaField } from '../field.tsx';
import type { OrderFormErrors, OrderFormValues } from './order-input.ts';

/** The fields of a Zákazka at intake: the kilometres on the odometer, and what the customer asks for. */
export function OrderFields({ value, errors }: { value: (name: keyof OrderFormValues) => string; errors: OrderFormErrors }) {
  return (
    <>
      <Field label="Kilometre pri príjme" name="mileageKm" inputMode="numeric" autoComplete="off" defaultValue={value('mileageKm')} error={errors.mileageKm} required />
      <TextAreaField label="Požiadavka zákazníka" name="customerRequest" rows={4} defaultValue={value('customerRequest')} error={errors.customerRequest} required />
    </>
  );
}
