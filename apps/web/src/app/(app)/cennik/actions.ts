'use server';

import { itemKinds } from '@servisnik/domain/work-order';
import { revalidatePath } from 'next/cache';
import { notFound, redirect } from 'next/navigation';
import { currentUser } from '../../../dal/current-user.ts';
import { createPriceListItem, deletePriceListItem, updatePriceListItem, type PriceListItemSaveErrors } from '../../../dal/price-list.ts';
import { forbiddenMessage, orForbidden } from '../forbidden.ts';
import { itemMessages } from '../item-messages.ts';

const field = (formData: FormData, name: string) => String(formData.get(name) ?? '');

const priceListFields = ['code', 'name', 'unit', 'purchasePrice', 'markup', 'unitPrice', 'vatRate'] as const;

export type PriceListFormState = {
  values: Record<(typeof priceListFields)[number], string>;
  errors: Partial<Record<'code' | 'name' | 'unit' | 'purchasePrice' | 'unitPrice' | 'vatRate' | 'form', string>>;
} | null;

/**
 * What the form of an item sent. The Prirážka is read only to be shown again with a refused form: the item keeps
 * its two prices, and the Prirážka is worked out from them (item-fields.tsx).
 */
const formValues = (formData: FormData) => Object.fromEntries(priceListFields.map((name) => [name, field(formData, name)])) as NonNullable<PriceListFormState>['values'];

/** The domain's input from the values of the form: everything but the Prirážka. */
const itemInput = ({ code, name, unit, purchasePrice, unitPrice, vatRate }: NonNullable<PriceListFormState>['values']) => ({
  code,
  name,
  unit,
  purchasePrice,
  unitPrice,
  vatRate,
});

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

  const result = await orForbidden(createPriceListItem(user, { kind, ...itemInput(values) }));
  if (result === 'forbidden') return { values, errors: { form: forbiddenMessage } };
  if (!result.ok) return { values, errors: errorMessages(result.errors, result.existing) };
  revalidatePath('/cennik');
  redirect('/cennik');
}

/** Server Action of the form that edits an item of the Cenník; it checks the session itself, and goes back to the Cenník once the item is saved. */
export async function editPriceListItem(_state: PriceListFormState, formData: FormData): Promise<PriceListFormState> {
  const user = await currentUser();
  const values = formValues(formData);

  const result = await orForbidden(updatePriceListItem(user, field(formData, 'itemId'), itemInput(values)));
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
