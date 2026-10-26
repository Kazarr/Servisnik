'use client';

import { customerTypes, type CustomerType } from '@servisnik/domain/customer';
import { useActionState, useState } from 'react';
import { Field } from '../../field.tsx';
import { addCustomer } from '../actions.ts';
import { customerTypeLabels } from '../type-labels.ts';

export function CustomerForm() {
  const [state, formAction, pending] = useActionState(addCustomer, null);
  // Controlled: React resets an uncontrolled form when the action ends, and a failed save must keep the choice.
  const [type, setType] = useState<CustomerType>('person');
  const value = (name: string) => state?.values[name];

  return (
    <form action={formAction} className="form">
      <fieldset>
        <legend>Typ zákazníka</legend>
        {customerTypes.map((option) => (
          <label key={option} className="choice">
            <input type="radio" name="type" value={option} checked={type === option} onChange={() => setType(option)} />
            {customerTypeLabels[option]}
          </label>
        ))}
      </fieldset>
      <Field label="Názov (pri osobe meno a priezvisko)" name="name" defaultValue={value('name')} error={state?.errors.name} required />
      {type === 'company' && (
        <>
          <Field label="IČO" name="ico" defaultValue={value('ico')} />
          <Field label="DIČ" name="dic" defaultValue={value('dic')} />
          <Field label="IČ DPH" name="icDph" defaultValue={value('icDph')} />
        </>
      )}
      <Field label="Ulica" name="street" defaultValue={value('street')} autoComplete="street-address" />
      <Field label="Mesto" name="city" defaultValue={value('city')} autoComplete="address-level2" />
      <Field label="PSČ" name="postalCode" defaultValue={value('postalCode')} autoComplete="postal-code" />
      <Field label="E-mail" name="email" type="email" defaultValue={value('email')} autoComplete="email" />
      <button type="submit" disabled={pending}>
        Uložiť zákazníka
      </button>
    </form>
  );
}
