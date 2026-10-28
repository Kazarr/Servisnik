'use server';

import { notFound, redirect } from 'next/navigation';
import { currentUser } from '../../../dal/current-user.ts';
import { createCustomer, updateCustomer, type CustomerSaveErrors } from '../../../dal/customers.ts';

const fields = ['name', 'ico', 'dic', 'icDph', 'street', 'city', 'postalCode', 'phone', 'email', 'note'] as const;
type Field = (typeof fields)[number];

export type CustomerFormState = {
  values: Record<Field, string>;
  errors: Partial<Record<Field, string>>;
  /** The Firma that already has the IČO the form was sent with; the form links to it. */
  existing?: { id: string; name: string };
} | null;

const messages = {
  name: 'Vyplňte názov, pri osobe meno a priezvisko',
  ico: {
    required: 'Vyplňte IČO firmy',
    format: 'IČO má mať presne 8 číslic',
    taken: 'Firma s týmto IČO už existuje',
  },
  dic: 'DIČ má mať presne 10 číslic',
  icDph: 'IČ DPH začína kódom krajiny (2 veľké písmená) a pokračuje 2 až 12 písmenami alebo číslicami, napríklad SK2020123456',
  postalCode: 'PSČ má mať presne 5 číslic',
  email: 'Zadajte e-mail v tvare meno@domena.sk',
};

function read(formData: FormData) {
  const type = formData.get('type') === 'company' ? 'company' : 'person';
  const values = Object.fromEntries(fields.map((name) => [name, String(formData.get(name) ?? '')])) as Record<Field, string>;
  return { type, values } as const;
}

function refused(values: Record<Field, string>, result: { errors: CustomerSaveErrors; existing?: { id: string; name: string } }): CustomerFormState {
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

  const result = await createCustomer(user, { type, ...values });
  if (!result.ok) return refused(values, result);
  redirect(`/zakaznici/${result.id}`);
}

/** Server Action of the form that edits the customer whose id the form carries; same checks as addCustomer. */
export async function editCustomer(_state: CustomerFormState, formData: FormData): Promise<CustomerFormState> {
  const user = await currentUser();
  const { type, values } = read(formData);
  const id = String(formData.get('id') ?? '');

  const result = await updateCustomer(user, id, { type, ...values });
  if (!result.ok) {
    if (result.errors.customer) notFound();
    return refused(values, result);
  }
  redirect(`/zakaznici/${id}`);
}
