'use server';

import { notFound, redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { currentUser } from '../../../dal/current-user.ts';
import { addItem, createWorkOrder, markWorkOrderDone } from '../../../dal/work-orders.ts';
import { forbiddenMessage, orForbidden } from '../forbidden.ts';

const field = (formData: FormData, name: string) => String(formData.get(name) ?? '');

export type WorkOrderFormState = {
  values: Record<'mileageKm' | 'customerRequest', string>;
  errors: { mileageKm?: string; customerRequest?: string; form?: string };
} | null;

/**
 * Server Action of the new-work-order form. It checks the session itself: the proxy only sees a cookie,
 * and the action is a public endpoint. The customer is the one chosen on the form, the vehicle's
 * Majiteľ unless the admin picked another.
 */
export async function addWorkOrder(_state: WorkOrderFormState, formData: FormData): Promise<WorkOrderFormState> {
  const user = await currentUser();
  const values = { mileageKm: field(formData, 'mileageKm'), customerRequest: field(formData, 'customerRequest') };

  const result = await orForbidden(createWorkOrder(user, { vehicleId: field(formData, 'vehicleId'), customerId: field(formData, 'customerId'), ...values }));
  if (result === 'forbidden') return { values, errors: { form: forbiddenMessage } };
  if (!result.ok) {
    if (result.errors.vehicle || result.errors.customer) notFound();
    return {
      values,
      errors: {
        mileageKm: result.errors.mileageKm && 'Zadajte kilometre ako celé číslo, 0 alebo viac',
        customerRequest: result.errors.customerRequest && 'Vyplňte požiadavku zákazníka',
      },
    };
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

  const result = await orForbidden(addItem(user, workOrderId, { kind: 'labour', ...values }));
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
        form: workOrder && 'Zákazka je už hotová, prácu do nej nemožno pridať',
      },
    };
  }
  revalidatePath(`/zakazky/${workOrderId}`);
  return null;
}

export type MarkDoneState = { error: string } | null;

/**
 * Server Action of the "Označiť ako hotovú" button; it checks the session itself, like every action. A
 * second click on a Zákazka that is already Hotová changes nothing and just shows it as it is.
 */
export async function markDone(_state: MarkDoneState, formData: FormData): Promise<MarkDoneState> {
  const user = await currentUser();
  const id = field(formData, 'workOrderId');
  const result = await orForbidden(markWorkOrderDone(user, id));
  if (result === 'forbidden') return { error: forbiddenMessage };
  if (!result.ok && result.error === 'unknown') notFound();
  revalidatePath(`/zakazky/${id}`);
  return null;
}
