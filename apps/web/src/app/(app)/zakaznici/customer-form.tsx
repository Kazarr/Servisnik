'use client';

import { customerTypes, type CustomerType } from '@servisnik/domain/customer';
import Link from 'next/link';
import { useActionState, useState } from 'react';
import { Field, FormError, TextAreaField } from '../field.tsx';
import { valueIn } from '../form-value.ts';
import type { CustomerFormState, CustomerFormValues } from './actions.ts';
import { customerTypeLabels } from './type-labels.ts';

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
  // The state shows or hides the company fields. The radios are not controlled, their default follows
  // the state: React resets the form when the action ends and a reset returns to the default, so a
  // failed save keeps the choice.
  const [type, setType] = useState<CustomerType>(customer?.type ?? 'person');
  const value = valueIn(state, customer);
  const errors = state?.errors ?? {};
  const taken = state?.existing && (
    <>
      {errors.ico}: <Link href={`/zakaznici/${state.existing.id}`}>{state.existing.name}</Link>
    </>
  );

  // noValidate: the browser would stop an e-mail it dislikes before the server could say why, and the rules are the domain's.
  return (
    <form action={formAction} className="form" noValidate>
      {customer && <input type="hidden" name="id" value={customer.id} />}
      <FormError message={errors.form} />
      <fieldset>
        <legend>Typ zákazníka</legend>
        {customerTypes.map((option) => (
          <label key={option} className="choice">
            <input type="radio" name="type" value={option} defaultChecked={type === option} onChange={() => setType(option)} />
            {customerTypeLabels[option]}
          </label>
        ))}
      </fieldset>
      <Field label="Názov (pri osobe meno a priezvisko)" name="name" defaultValue={value('name')} error={errors.name} required />
      {type === 'company' && (
        <>
          <Field label="IČO" name="ico" defaultValue={value('ico')} error={taken || errors.ico} inputMode="numeric" required />
          <Field label="DIČ" name="dic" defaultValue={value('dic')} error={errors.dic} inputMode="numeric" />
          <Field label="IČ DPH" name="icDph" defaultValue={value('icDph')} error={errors.icDph} />
        </>
      )}
      <Field label="Ulica" name="street" defaultValue={value('street')} autoComplete="street-address" />
      <Field label="Mesto" name="city" defaultValue={value('city')} autoComplete="address-level2" />
      <Field label="PSČ" name="postalCode" defaultValue={value('postalCode')} error={errors.postalCode} autoComplete="postal-code" />
      <Field label="Telefón" name="phone" type="tel" defaultValue={value('phone')} autoComplete="tel" />
      <Field label="E-mail" name="email" type="email" defaultValue={value('email')} error={errors.email} autoComplete="email" />
      <TextAreaField label="Poznámka" name="note" defaultValue={value('note')} />
      <button type="submit" disabled={pending}>
        Uložiť zákazníka
      </button>
    </form>
  );
}
