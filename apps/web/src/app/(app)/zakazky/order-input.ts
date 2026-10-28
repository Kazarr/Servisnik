import type { WorkOrderErrors } from '@servisnik/domain/work-order';

// What the form of the header of a Zákazka sends and what it is told back: shared by the form of a Zákazka for an
// existing Vozidlo (new or edited) and the form of an intake with a new Vozidlo, which save the same header.
// Not a 'use server' file: those export nothing but Server Actions.

export type OrderFormValues = Record<'mileageKm' | 'customerRequest' | 'deadline' | 'note', string>;
export type OrderFormErrors = Partial<Record<'mileageKm' | 'customerRequest' | 'deadline', string>>;

/** The header of a Zákazka from a form. */
export const readOrder = (formData: FormData): OrderFormValues => ({
  mileageKm: String(formData.get('mileageKm') ?? ''),
  customerRequest: String(formData.get('customerRequest') ?? ''),
  deadline: String(formData.get('deadline') ?? ''),
  note: String(formData.get('note') ?? ''),
});

/** The message of each field the domain refused. */
export const orderMessages = ({ mileageKm, customerRequest, deadline }: WorkOrderErrors): OrderFormErrors => ({
  mileageKm: mileageKm && 'Zadajte kilometre ako celé číslo, 0 alebo viac',
  customerRequest: customerRequest && 'Vyplňte požiadavku zákazníka',
  deadline: deadline && 'Zadajte termín ako platný dátum',
});
