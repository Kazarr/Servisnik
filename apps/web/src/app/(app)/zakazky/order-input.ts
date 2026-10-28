import type { WorkOrderErrors } from '@servisnik/domain/work-order';

// What the intake form of a Zákazka sends and what it is told back: shared by the form for an existing Vozidlo
// and the one for a new Vozidlo, which save the same Zákazka. Not a 'use server' file: those export nothing
// but Server Actions.

export type OrderFormValues = Record<'mileageKm' | 'customerRequest', string>;
export type OrderFormErrors = Partial<Record<keyof OrderFormValues, string>>;

/** The fields of a Zákazka from a form. */
export const readOrder = (formData: FormData): OrderFormValues => ({
  mileageKm: String(formData.get('mileageKm') ?? ''),
  customerRequest: String(formData.get('customerRequest') ?? ''),
});

/** The message of each field the domain refused. */
export const orderMessages = ({ mileageKm, customerRequest }: WorkOrderErrors): OrderFormErrors => ({
  mileageKm: mileageKm && 'Zadajte kilometre ako celé číslo, 0 alebo viac',
  customerRequest: customerRequest && 'Vyplňte požiadavku zákazníka',
});
