'use client';

import type { RatesInput } from '@servisnik/domain/settings';
import { useActionState } from 'react';
import { Field, FormError, TextAreaField } from '../field.tsx';
import { saveRatesAction } from './actions.ts';

/** The rates of Nastavenia, filled in with `initial`; after a save or a refusal the fields show what the action answered. */
export function RatesForm({ initial }: { initial: RatesInput }) {
  const [state, formAction, pending] = useActionState(saveRatesAction, null);
  const value = (name: keyof RatesInput) => (state ? state.values[name] : initial[name]);
  const errors = state?.errors ?? {};

  // noValidate: the rules are the domain's, and the server says which one a value breaks.
  return (
    <form action={formAction} className="form" noValidate>
      <FormError message={errors.form} />
      <TextAreaField label="Sadzby DPH (%), jedna na riadok" name="vatRates" rows={4} defaultValue={value('vatRates')} error={errors.vatRates} required />
      <Field
        label="Predvolená sadzba DPH (%)"
        name="defaultVatRate"
        inputMode="numeric"
        autoComplete="off"
        defaultValue={value('defaultVatRate')}
        error={errors.defaultVatRate}
        required
      />
      <Field
        label="Hodinová sadzba bez DPH (€; prázdna sa nepredvyplní)"
        name="hourlyRate"
        inputMode="decimal"
        autoComplete="off"
        defaultValue={value('hourlyRate')}
        error={errors.hourlyRate}
      />
      <Field label="Prirážka na diely (%)" name="markup" inputMode="numeric" autoComplete="off" defaultValue={value('markup')} error={errors.markup} required />
      {state?.saved && <p role="status">Sadzby sú uložené.</p>}
      <button type="submit" disabled={pending}>
        Uložiť sadzby
      </button>
    </form>
  );
}
