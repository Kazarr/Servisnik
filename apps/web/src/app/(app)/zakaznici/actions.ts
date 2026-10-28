'use server';

import { redirect } from 'next/navigation';
import { createCustomer } from '../../../dal/customers.ts';
import { currentUser } from '../../../dal/current-user.ts';
import { forbiddenMessage, orForbidden } from '../forbidden.ts';

export type CustomerFormState = { values: Record<string, string>; errors: { name?: string; form?: string } } | null;

const fields = ['name', 'ico', 'dic', 'icDph', 'street', 'city', 'postalCode', 'email'] as const;

/**
 * Server Action of the customer form. It checks the session itself: the proxy only sees a cookie, and
 * the action is a public endpoint. The company fields of a person are dropped by the domain.
 */
export async function addCustomer(_state: CustomerFormState, formData: FormData): Promise<CustomerFormState> {
  const user = await currentUser();
  const type = formData.get('type') === 'company' ? 'company' : 'person';
  const values = Object.fromEntries(fields.map((name) => [name, String(formData.get(name) ?? '')])) as Record<
    (typeof fields)[number],
    string
  >;

  const result = await orForbidden(createCustomer(user, { type, ...values }));
  if (result === 'forbidden') return { values, errors: { form: forbiddenMessage } };
  if (!result.ok) return { values, errors: { name: 'Vyplňte názov, pri osobe meno a priezvisko' } };
  redirect(`/zakaznici/${result.id}`);
}
