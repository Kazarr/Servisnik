'use server';

import { notFound, redirect } from 'next/navigation';
import { currentUser } from '../../../dal/current-user.ts';
import { createCustomer, updateCustomer, type CustomerSaveErrors } from '../../../dal/customers.ts';
import { forbiddenMessage, orForbidden } from '../forbidden.ts';
import { formatMessages } from '../format-messages.ts';

export type CustomerFormValues = Record<'name' | 'ico' | 'dic' | 'icDph' | 'street' | 'city' | 'postalCode' | 'phone' | 'email' | 'note', string>;

export type CustomerFormState = {
  values: CustomerFormValues;
  errors: Partial<Record<keyof CustomerFormValues | 'form', string>>;
  /** The Firma that already has the IČO the form was sent with; the form links to it. */
  existing?: { id: string; name: string };
} | null;

const messages = {
  name: 'Vyplňte názov, pri osobe meno a priezvisko',
  ico: {
    required: 'Vyplňte IČO firmy',
    format: formatMessages.ico,
    taken: 'Firma s týmto IČO už existuje',
  },
  dic: formatMessages.dic,
  icDph: formatMessages.icDph,
  postalCode: formatMessages.postalCode,
  email: formatMessages.email,
};

function read(formData: FormData) {
  const type = formData.get('type') === 'company' ? 'company' : 'person';
  const text = (name: string) => String(formData.get(name) ?? '');
  const values: CustomerFormValues = {
    name: text('name'),
    ico: text('ico'),
    dic: text('dic'),
    icDph: text('icDph'),
    street: text('street'),
    city: text('city'),
    postalCode: text('postalCode'),
    phone: text('phone'),
    email: text('email'),
    note: text('note'),
  };
  return { type, values } as const;
}

function refused(values: CustomerFormValues, result: { errors: CustomerSaveErrors; existing?: { id: string; name: string } }): CustomerFormState {
  const { name, ico, dic, icDph, postalCode, email } = result.errors;
  return {
    values,
    errors: {
      name: name && messages.name,
      ico: ico && messages.ico[ico],
      dic: dic && messages.dic,
      icDph: icDph && messages.icDph,
      postalCode: postalCode && messages.postalCode,
      email: email && messages.email,
    },
    existing: result.existing,
  };
}

/**
 * Server Action of the form for a new customer. It checks the session and the Rola itself, in the
 * DAL: the proxy only sees a cookie, and the action is a public endpoint. The company fields of a
 * person are dropped by the domain.
 */
export async function addCustomer(_state: CustomerFormState, formData: FormData): Promise<CustomerFormState> {
  const user = await currentUser();
  const { type, values } = read(formData);

  const result = await orForbidden(createCustomer(user, { type, ...values }));
  if (result === 'forbidden') return { values, errors: { form: forbiddenMessage } };
  if (!result.ok) return refused(values, result);
  redirect(`/zakaznici/${result.id}`);
}

/** Server Action of the form that edits the customer whose id the form carries; same checks as addCustomer. */
export async function editCustomer(_state: CustomerFormState, formData: FormData): Promise<CustomerFormState> {
  const user = await currentUser();
  const { type, values } = read(formData);
  const id = String(formData.get('id') ?? '');

  const result = await orForbidden(updateCustomer(user, id, { type, ...values }));
  if (result === 'forbidden') return { values, errors: { form: forbiddenMessage } };
  if (!result.ok) {
    if (result.errors.customer) notFound();
    return refused(values, result);
  }
  redirect(`/zakaznici/${id}`);
}
