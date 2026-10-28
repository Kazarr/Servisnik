'use client';

import { vatPayerTypes, type VatPayerType, type WorkshopDetails } from '@servisnik/domain/workshop';
import { useActionState } from 'react';
import { Field, FormError, SelectField, TextAreaField } from '../field.tsx';
import { valueIn } from '../form-value.ts';
import { saveWorkshopDetailsAction } from './workshop-actions.ts';

const vatPayerTypeLabels: Record<VatPayerType, string> = { payer: 'Platiteľ', nonPayer: 'Neplatiteľ', section7: 'Registrovaný podľa §7' };

/** Údaje autoservisu, filled in with `details`; after a save or a refusal the fields show what the action answered. */
export function WorkshopForm({ details }: { details: WorkshopDetails }) {
  const [state, formAction, pending] = useActionState(saveWorkshopDetailsAction, null);
  const value = valueIn(state, details);
  const errors = state?.errors ?? {};

  // noValidate: the rules are the domain's, and the server says which one a value breaks.
  return (
    <form action={formAction} className="form" noValidate>
      <FormError message={errors.form} />
      <Field label="Názov autoservisu" name="name" autoComplete="off" defaultValue={value('name')} error={errors.name} required />
      <Field label="Ulica" name="street" autoComplete="off" defaultValue={value('street')} />
      <Field label="Mesto" name="city" autoComplete="off" defaultValue={value('city')} />
      <Field label="PSČ" name="postalCode" autoComplete="off" defaultValue={value('postalCode')} error={errors.postalCode} />
      <Field label="IČO" name="ico" inputMode="numeric" autoComplete="off" defaultValue={value('ico')} error={errors.ico} />
      <Field label="DIČ" name="dic" inputMode="numeric" autoComplete="off" defaultValue={value('dic')} error={errors.dic} />
      <Field label="IČ DPH" name="icDph" autoComplete="off" defaultValue={value('icDph')} error={errors.icDph} />
      {/* React updates the default of an input when it changes, but not of a select: the key makes a new select of it, so the reset after the action keeps the choice. */}
      <SelectField key={value('vatPayerType')} label="Platiteľ DPH" name="vatPayerType" defaultValue={value('vatPayerType')} error={errors.vatPayerType}>
        {vatPayerTypes.map((type) => (
          <option key={type} value={type}>
            {vatPayerTypeLabels[type]}
          </option>
        ))}
      </SelectField>
      <Field label="IBAN" name="iban" autoComplete="off" defaultValue={value('iban')} error={errors.iban} />
      <Field label="Telefón" name="phone" type="tel" autoComplete="off" defaultValue={value('phone')} />
      <Field label="E-mail" name="email" type="email" autoComplete="off" defaultValue={value('email')} error={errors.email} />
      <TextAreaField label="Zápis v obchodnom registri" name="commercialRegister" rows={2} defaultValue={value('commercialRegister')} />
      {state?.saved && <p role="status">Údaje autoservisu sú uložené.</p>}
      <button type="submit" disabled={pending}>
        Uložiť údaje autoservisu
      </button>
    </form>
  );
}
