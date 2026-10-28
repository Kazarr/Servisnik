'use server';

import { workOrderStatuses } from '@servisnik/domain/work-order';
import { notFound, redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { currentUser } from '../../../dal/current-user.ts';
import { addLabour, changeWorkOrderStatus, createWorkOrder } from '../../../dal/work-orders.ts';
import { forbiddenMessage, orForbidden } from '../forbidden.ts';
import { orderMessages, readOrder, type OrderFormErrors, type OrderFormValues } from './order-input.ts';

const field = (formData: FormData, name: string) => String(formData.get(name) ?? '');

export type WorkOrderFormState = {
  values: OrderFormValues;
  errors: OrderFormErrors & { form?: string };
} | null;

/**
 * Server Action of the new-work-order form. It checks the session itself: the proxy only sees a cookie,
 * and the action is a public endpoint. The customer is the one chosen on the form, the vehicle's
 * Majiteľ unless the admin picked another.
 */
export async function addWorkOrder(_state: WorkOrderFormState, formData: FormData): Promise<WorkOrderFormState> {
  const user = await currentUser();
  const values = readOrder(formData);

  const result = await orForbidden(createWorkOrder(user, { vehicleId: field(formData, 'vehicleId'), customerId: field(formData, 'customerId'), ...values }));
  if (result === 'forbidden') return { values, errors: { form: forbiddenMessage } };
  if (!result.ok) {
    if (result.errors.vehicle || result.errors.customer) notFound();
    return { values, errors: orderMessages(result.errors) };
  }
  redirect(`/zakazky/${result.id}`);
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
