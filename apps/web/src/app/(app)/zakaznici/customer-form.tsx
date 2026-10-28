'use client';

import type { CustomerType } from '@servisnik/domain/customer';
import { useActionState } from 'react';
import { FormError } from '../field.tsx';
import { valueIn } from '../form-value.ts';
import type { CustomerFormState } from './actions.ts';
import { CustomerFields } from './customer-fields.tsx';
import type { CustomerFormValues } from './customer-input.ts';

type Fields = Record<keyof CustomerFormValues, string | null>;

/** The form of a new customer, or with `customer` the form that edits it. `action` is addCustomer or editCustomer. */
export function CustomerForm({
  action,
  customer,
}: {
  action: (state: CustomerFormState, formData: FormData) => Promise<CustomerFormState>;
  customer?: Fields & { id: string; type: CustomerType };
}) {
  const [state, formAction, pending] = useActionState(action, null);
  const value = valueIn(state, customer);
  const errors = state?.errors ?? {};

  // noValidate: the browser would stop an e-mail it dislikes before the server could say why, and the rules are the domain's.
  return (
    <form action={formAction} className="form" noValidate>
      {customer && <input type="hidden" name="id" value={customer.id} />}
      <FormError message={errors.form} />
      <CustomerFields value={value} errors={errors} existing={state?.existing} type={customer?.type ?? 'person'} />
      <button type="submit" disabled={pending}>
        Uložiť zákazníka
      </button>
    </form>
  );
}
