'use server';

import { itemKinds } from '@servisnik/domain/work-order';
import { revalidatePath } from 'next/cache';
import { notFound, redirect } from 'next/navigation';
import { currentUser } from '../../../dal/current-user.ts';
import { createPriceListItem, deletePriceListItem, updatePriceListItem, type PriceListItemSaveErrors } from '../../../dal/price-list.ts';
import { forbiddenMessage, orForbidden } from '../forbidden.ts';
import { itemMessages, type ItemMessages } from '../item-messages.ts';

const field = (formData: FormData, name: string) => String(formData.get(name) ?? '');

const priceListFields = ['code', 'name', 'unit', 'purchasePrice', 'markup', 'salePrice', 'vatRate'] as const;

export type PriceListFormState = {
  values: Record<(typeof priceListFields)[number], string>;
  errors: ItemMessages & { code?: string; form?: string };
} | null;

/**
 * What the form of an item sent, which is the input of the domain. The item keeps its two prices and not the Prirážka,
 * which is worked out from them when the item is shown (item-fields.tsx); the domain only checks that the one the form
 * sent fits them.
 */
const formValues = (formData: FormData) => Object.fromEntries(priceListFields.map((name) => [name, field(formData, name)])) as NonNullable<PriceListFormState>['values'];

/** The messages for the reasons an item was refused, at the fields; `existing` is the item that has the code another one wants. */
function errorMessages(errors: PriceListItemSaveErrors, existing?: { name: string }): NonNullable<PriceListFormState>['errors'] {
  return {
    ...itemMessages(errors),
    code: errors.code && (existing ? `Tento kód už má položka „${existing.name}“` : 'Tento kód už má iná položka cenníka'),
  };
}

/** Server Action of the form that adds a Práca or a Diel to the Cenník; it checks the session itself, like every action. */
export async function addToPriceList(_state: PriceListFormState, formData: FormData): Promise<PriceListFormState> {
  const user = await currentUser();
  const kind = itemKinds.find((known) => known === field(formData, 'kind'));
  if (!kind) notFound();
  const values = formValues(formData);

  const result = await orForbidden(createPriceListItem(user, { kind, ...values }));
  if (result === 'forbidden') return { values, errors: { form: forbiddenMessage } };
  if (!result.ok) return { values, errors: errorMessages(result.errors, result.existing) };
  revalidatePath('/cennik');
  redirect('/cennik');
}

/** Server Action of the form that edits an item of the Cenník; it checks the session itself, and goes back to the Cenník once the item is saved. */
export async function editPriceListItem(_state: PriceListFormState, formData: FormData): Promise<PriceListFormState> {
  const user = await currentUser();
  const values = formValues(formData);

  const result = await orForbidden(updatePriceListItem(user, field(formData, 'itemId'), values));
  if (result === 'forbidden') return { values, errors: { form: forbiddenMessage } };
  if (!result.ok) {
    if (result.errors.item === 'unknown') notFound();
    return { values, errors: errorMessages(result.errors, result.existing) };
  }
  revalidatePath('/cennik');
  redirect('/cennik');
}

export type DeletePriceListItemState = { error: string } | null;

/**
 * Server Action of the button that deletes an item of the Cenník; it checks the session itself, like every action.
 * A second click on an item that is already gone changes nothing and just shows the Cenník as it is.
 */
export async function deleteFromPriceList(_state: DeletePriceListItemState, formData: FormData): Promise<DeletePriceListItemState> {
  const user = await currentUser();
  const result = await orForbidden(deletePriceListItem(user, field(formData, 'itemId')));
  if (result === 'forbidden') return { error: forbiddenMessage };
  revalidatePath('/cennik');
  return null;
}
