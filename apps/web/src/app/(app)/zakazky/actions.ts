'use server';

import { itemKinds, workOrderStatuses, type ItemErrors } from '@servisnik/domain/work-order';
import { notFound, redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { currentUser } from '../../../dal/current-user.ts';
import { addItem, changeWorkOrderStatus, createWorkOrder, deleteItem, updateItem } from '../../../dal/work-orders.ts';
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

const itemFields = ['code', 'name', 'quantity', 'unit', 'purchasePrice', 'markup', 'unitPrice', 'vatRate'] as const;

export type ItemFormState = {
  values: Record<(typeof itemFields)[number], string>;
  errors: Partial<Record<'name' | 'quantity' | 'unit' | 'purchasePrice' | 'unitPrice' | 'vatRate' | 'form', string>>;
} | null;

/**
 * What the form of an item sent. The Prirážka is read only to be shown again with a refused form: the item
 * keeps its two prices, and the Prirážka is worked out from them (item-form.tsx).
 */
const itemValues = (formData: FormData) => Object.fromEntries(itemFields.map((name) => [name, field(formData, name)])) as NonNullable<ItemFormState>['values'];

/** The domain's input from the values of the form: everything but the Prirážka. */
const itemInput = ({ code, name, quantity, unit, purchasePrice, unitPrice, vatRate }: NonNullable<ItemFormState>['values']) => ({
  code,
  name,
  quantity,
  unit,
  purchasePrice,
  unitPrice,
  vatRate,
});

const notEditableMessage = 'Položky sa dajú meniť len na rozpracovanej zákazke';

/** The messages for the reasons an item was refused, at the fields; `notEditable` is the reason for the whole form. */
function itemErrors(errors: ItemErrors, notEditable: boolean): NonNullable<ItemFormState>['errors'] {
  return {
    name: errors.name && 'Vyplňte názov',
    quantity: errors.quantity && 'Množstvo musí byť väčšie ako 0, najviac na 2 desatinné miesta',
    unit: errors.unit && 'Vyplňte jednotku',
    purchasePrice: errors.purchasePrice && 'Nákupná cena musí byť 0 alebo viac, najviac na 2 desatinné miesta',
    unitPrice: errors.unitPrice && 'Cena musí byť 0 alebo viac, najviac na 2 desatinné miesta',
    vatRate: errors.vatRate && 'Vyberte sadzbu DPH zo sadzieb v Nastaveniach',
    form: notEditable ? notEditableMessage : undefined,
  };
}

/** Server Action of the form that adds a Práca or a Diel; it checks the session itself, like every action. */
export async function addItemToWorkOrder(_state: ItemFormState, formData: FormData): Promise<ItemFormState> {
  const user = await currentUser();
  const workOrderId = field(formData, 'workOrderId');
  const kind = itemKinds.find((known) => known === field(formData, 'kind'));
  if (!kind) notFound();
  const values = itemValues(formData);

  const result = await orForbidden(addItem(user, workOrderId, { kind, ...itemInput(values) }));
  if (result === 'forbidden') return { values, errors: { form: forbiddenMessage } };
  if (!result.ok) {
    if (result.errors.workOrder === 'unknown') notFound();
    return { values, errors: itemErrors(result.errors, result.errors.workOrder === 'not-editable') };
  }
  revalidatePath(`/zakazky/${workOrderId}`);
  return null;
}

/** Server Action of the form that edits an item; it checks the session itself, and goes back to the Zákazka once the item is saved. */
export async function updateItemOfWorkOrder(_state: ItemFormState, formData: FormData): Promise<ItemFormState> {
  const user = await currentUser();
  const values = itemValues(formData);

  const result = await orForbidden(updateItem(user, field(formData, 'itemId'), itemInput(values)));
  if (result === 'forbidden') return { values, errors: { form: forbiddenMessage } };
  if (!result.ok) {
    if (result.errors.item === 'unknown') notFound();
    return { values, errors: itemErrors(result.errors, result.errors.workOrder === 'not-editable') };
  }
  revalidatePath(`/zakazky/${result.workOrderId}`);
  redirect(`/zakazky/${result.workOrderId}`);
}

export type DeleteItemState = { error: string } | null;

/**
 * Server Action of the button that deletes an item; it checks the session itself, like every action. A second
 * click on an item that is already gone changes nothing and just shows the Zákazka as it is.
 */
export async function deleteItemOfWorkOrder(_state: DeleteItemState, formData: FormData): Promise<DeleteItemState> {
  const user = await currentUser();
  const result = await orForbidden(deleteItem(user, field(formData, 'itemId')));
  if (result === 'forbidden') return { error: forbiddenMessage };
  if (!result.ok && result.error === 'not-editable') return { error: notEditableMessage };
  revalidatePath(`/zakazky/${result.ok ? result.workOrderId : field(formData, 'workOrderId')}`);
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
