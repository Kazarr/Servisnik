'use client';

import { customerTypes, type CustomerType } from '@servisnik/domain/customer';
import Link from 'next/link';
import { useState } from 'react';
import type { ExistingCustomer } from '../../../dal/customers.ts';
import { Field, TextAreaField } from '../field.tsx';
import { intakePaths } from '../zakazky/nova/paths.ts';
import { intakeCustomerPrefix, type CustomerFormErrors, type CustomerFormValues } from './customer-input.ts';
import { customerTypeLabels } from './type-labels.ts';

/**
 * The fields of a Zákazník: his type, and what is known of him. `value` is what a field starts with and
 * `errors` the reason a field was refused. A Firma whose IČO is taken links to the Firma it is: to its
 * detail, or with `intake` (the fields are then named under `intakeCustomerPrefix`) to the intake that
 * goes on with that Firma as the Majiteľ.
 */
export function CustomerFields({
  value,
  errors,
  existing,
  type: initialType,
  intake = false,
}: {
  value: (name: keyof CustomerFormValues) => string;
  errors: CustomerFormErrors;
  existing?: ExistingCustomer;
  type: CustomerType;
  intake?: boolean;
}) {
  // The state shows or hides the company fields. The radios are not controlled, their default follows
  // the state: React resets the form when the action ends and a reset returns to the default, so a
  // failed save keeps the choice.
  const [type, setType] = useState<CustomerType>(initialType);
  const named = (name: string) => (intake ? `${intakeCustomerPrefix}${name}` : name);
  const taken = existing && (
    <>
      {errors.ico}:{' '}
      {intake ? (
        <Link href={intakePaths.withOwner(existing.id)}>Pokračovať s firmou {existing.name}</Link>
      ) : (
        <Link href={`/zakaznici/${existing.id}`}>{existing.name}</Link>
      )}
    </>
  );

  return (
    <>
      <fieldset>
        <legend>Typ zákazníka</legend>
        {customerTypes.map((option) => (
          <label key={option} className="choice">
            <input type="radio" name={named('type')} value={option} defaultChecked={type === option} onChange={() => setType(option)} />
            {customerTypeLabels[option]}
          </label>
        ))}
      </fieldset>
      <Field label="Názov (pri osobe meno a priezvisko)" name={named('name')} defaultValue={value('name')} error={errors.name} required />
      {type === 'company' && (
        <>
          <Field label="IČO" name={named('ico')} defaultValue={value('ico')} error={taken || errors.ico} inputMode="numeric" required />
          <Field label="DIČ" name={named('dic')} defaultValue={value('dic')} error={errors.dic} inputMode="numeric" />
          <Field label="IČ DPH" name={named('icDph')} defaultValue={value('icDph')} error={errors.icDph} />
        </>
      )}
      <Field label="Ulica" name={named('street')} defaultValue={value('street')} autoComplete="street-address" />
      <Field label="Mesto" name={named('city')} defaultValue={value('city')} autoComplete="address-level2" />
      <Field label="PSČ" name={named('postalCode')} defaultValue={value('postalCode')} error={errors.postalCode} autoComplete="postal-code" />
      <Field label="Telefón" name={named('phone')} type="tel" defaultValue={value('phone')} autoComplete="tel" />
      <Field label="E-mail" name={named('email')} type="email" defaultValue={value('email')} error={errors.email} autoComplete="email" />
      <TextAreaField label="Poznámka" name={named('note')} defaultValue={value('note')} />
    </>
  );
}
