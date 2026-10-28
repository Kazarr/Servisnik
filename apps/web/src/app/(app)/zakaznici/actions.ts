'use server';

import { notFound, redirect } from 'next/navigation';
import { currentUser } from '../../../dal/current-user.ts';
import { createCustomer, updateCustomer, type CustomerSaveErrors, type ExistingCustomer } from '../../../dal/customers.ts';
import { forbiddenMessage, orForbidden } from '../forbidden.ts';
import { customerMessages, readCustomer, type CustomerFormErrors, type CustomerFormValues } from './customer-input.ts';

export type { CustomerFormValues };

export type CustomerFormState = {
  values: CustomerFormValues;
  errors: CustomerFormErrors & { form?: string };
  /** The Firma that already has the IČO the form was sent with; the form links to it. */
  existing?: ExistingCustomer;
} | null;

function refused(values: CustomerFormValues, result: { errors: CustomerSaveErrors; existing?: ExistingCustomer }): CustomerFormState {
  return { values, errors: customerMessages(result.errors), existing: result.existing };
}

/**
 * Server Action of the form for a new customer. It checks the session and the Rola itself, in the
 * DAL: the proxy only sees a cookie, and the action is a public endpoint. The company fields of a
 * person are dropped by the domain.
 */
export async function addCustomer(_state: CustomerFormState, formData: FormData): Promise<CustomerFormState> {
  const user = await currentUser();
  const { type, values } = readCustomer(formData);

  const result = await orForbidden(createCustomer(user, { type, ...values }));
  if (result === 'forbidden') return { values, errors: { form: forbiddenMessage } };
  if (!result.ok) return refused(values, result);
  redirect(`/zakaznici/${result.id}`);
}

/** Server Action of the form that edits the customer whose id the form carries; same checks as addCustomer. */
export async function editCustomer(_state: CustomerFormState, formData: FormData): Promise<CustomerFormState> {
  const user = await currentUser();
  const { type, values } = readCustomer(formData);
  const id = String(formData.get('id') ?? '');

  const result = await orForbidden(updateCustomer(user, id, { type, ...values }));
  if (result === 'forbidden') return { values, errors: { form: forbiddenMessage } };
  if (!result.ok) {
    if (result.errors.customer) notFound();
    return refused(values, result);
  }
  redirect(`/zakaznici/${id}`);
}
