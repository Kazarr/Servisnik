'use server';

import { workOrderStatuses, type WorkOrderErrors } from '@servisnik/domain/work-order';
import { notFound, redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { currentUser } from '../../../dal/current-user.ts';
import { addLabour, changeWorkOrderStatus, createWorkOrder, updateWorkOrderHeader } from '../../../dal/work-orders.ts';
import { forbiddenMessage, orForbidden } from '../forbidden.ts';

const field = (formData: FormData, name: string) => String(formData.get(name) ?? '');

export type WorkOrderFormState = {
  values: Record<'mileageKm' | 'customerRequest' | 'deadline' | 'note', string>;
  errors: { mileageKm?: string; customerRequest?: string; deadline?: string; form?: string };
} | null;

/** What the form of a Zákazka sent: the header, the same fields whether the Zákazka is new or edited. */
const readHeader = (formData: FormData) => ({
  mileageKm: field(formData, 'mileageKm'),
  customerRequest: field(formData, 'customerRequest'),
  deadline: field(formData, 'deadline'),
  note: field(formData, 'note'),
});

/** The form again, with what was typed and the reason at each field the domain refused (and `form` for a reason that is not a field's). */
function refused(
  values: NonNullable<WorkOrderFormState>['values'],
  errors: WorkOrderErrors,
  form?: string,
): WorkOrderFormState {
  return {
    values,
    errors: {
      mileageKm: errors.mileageKm && 'Zadajte kilometre ako celé číslo, 0 alebo viac',
      customerRequest: errors.customerRequest && 'Vyplňte požiadavku zákazníka',
      deadline: errors.deadline && 'Zadajte termín ako platný dátum',
      form,
    },
  };
}

/**
 * Server Action of the new-work-order form. It checks the session itself: the proxy only sees a cookie,
 * and the action is a public endpoint. The customer is the one chosen on the form, the vehicle's
 * Majiteľ unless the admin picked another.
 */
export async function addWorkOrder(_state: WorkOrderFormState, formData: FormData): Promise<WorkOrderFormState> {
  const user = await currentUser();
  const values = readHeader(formData);

  const result = await orForbidden(createWorkOrder(user, { vehicleId: field(formData, 'vehicleId'), customerId: field(formData, 'customerId'), ...values }));
  if (result === 'forbidden') return { values, errors: { form: forbiddenMessage } };
  if (!result.ok) {
    if (result.errors.vehicle || result.errors.customer) notFound();
    return refused(values, result.errors);
  }
  redirect(`/zakazky/${result.id}`);
}

/**
 * Server Action of the form that edits the header of the Zákazka whose id the form carries; it checks
 * the session itself, like every action. A Zákazka that is no longer Rozpracovaná (a click that came
 * late, or a status changed in another tab) is refused with a message on the form and changes nothing.
 */
export async function editWorkOrder(_state: WorkOrderFormState, formData: FormData): Promise<WorkOrderFormState> {
  const user = await currentUser();
  const id = field(formData, 'id');
  const values = readHeader(formData);

  const result = await orForbidden(updateWorkOrderHeader(user, id, values));
  if (result === 'forbidden') return { values, errors: { form: forbiddenMessage } };
  if (!result.ok) {
    if (result.errors.workOrder === 'unknown') notFound();
    return refused(values, result.errors, result.errors.workOrder && 'Zákazka už nie je rozpracovaná, jej hlavičku nemožno upraviť');
  }
  redirect(`/zakazky/${id}`);
}

export type LabourFormState = {
  values: Record<'name' | 'quantity' | 'unitPrice' | 'vatRate', string>;
  errors: { name?: string; quantity?: string; unitPrice?: string; vatRate?: string; form?: string };
} | null;

/** Server Action of the add-work form; it checks the session itself, like every action. */
export async function addLabourToWorkOrder(_state: LabourFormState, formData: FormData): Promise<LabourFormState> {
  const user = await currentUser();
  const workOrderId = field(formData, 'workOrderId');
  const values = {
    name: field(formData, 'name'),
    quantity: field(formData, 'quantity'),
    unitPrice: field(formData, 'unitPrice'),
    vatRate: field(formData, 'vatRate'),
  };

  const result = await orForbidden(addLabour(user, workOrderId, values));
  if (result === 'forbidden') return { values, errors: { form: forbiddenMessage } };
  if (!result.ok) {
    const { workOrder, name, quantity, unitPrice, vatRate } = result.errors;
    if (workOrder === 'unknown') notFound();
    return {
      values,
      errors: {
        name: name && 'Vyplňte názov',
        quantity: quantity && 'Množstvo musí byť väčšie ako 0, najviac na 2 desatinné miesta',
        unitPrice: unitPrice && 'Cena musí byť 0 alebo viac, najviac na 2 desatinné miesta',
        vatRate: vatRate && 'Sadzba DPH je celé číslo od 0 do 100',
        form: workOrder && 'Zákazka už nie je rozpracovaná, prácu do nej nemožno pridať',
      },
    };
  }
  revalidatePath(`/zakazky/${workOrderId}`);
  return null;
}

export type ChangeStatusState = { error: string } | null;

/**
 * Server Action of the status buttons of a Zákazka (`to` is the button's value) and of "Potvrdiť
 * zrušenie" (which also sends `confirmed`); it checks the session itself, like every action. A click
 * the Zákazka no longer allows (a second click, or a status changed in another tab) changes nothing
 * and just shows it as it is.
 */
export async function changeStatus(_state: ChangeStatusState, formData: FormData): Promise<ChangeStatusState> {
  const user = await currentUser();
  const id = field(formData, 'workOrderId');
  const to = workOrderStatuses.find((status) => status === field(formData, 'to'));
  if (!to) return { error: 'Neznámy stav zákazky' };

  const result = await orForbidden(changeWorkOrderStatus(user, id, { to, confirmed: field(formData, 'confirmed') === 'yes' }));
  if (result === 'forbidden') return { error: forbiddenMessage };
  if (!result.ok && result.error === 'unknown') notFound();
  if (!result.ok && result.error === 'confirmation-required') return { error: 'Zrušenie zákazky treba potvrdiť' };
  revalidatePath(`/zakazky/${id}`);
  return null;
}
