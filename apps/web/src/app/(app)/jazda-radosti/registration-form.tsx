'use client';

import { registrationCategories } from '@servisnik/domain/joy-ride';
import { useActionState } from 'react';
import { Field, FormError, SelectField, TextAreaField } from '../field.tsx';
import { valueIn } from '../form-value.ts';
import { addRegistration, editRegistration } from './actions.ts';
import type { RegistrationFormValues } from './joy-ride-input.ts';
import { registrationCategoryLabels } from './labels.ts';

/** The form of a new Registrácia, or with `registration` the form that edits it. */
export function RegistrationForm({ registration }: { registration?: RegistrationFormValues & { id: string } }) {
  const [state, formAction, pending] = useActionState(registration ? editRegistration : addRegistration, null);
  const value = valueIn(state, registration);
  const errors = state?.errors ?? {};

  // noValidate: the browser would stop an e-mail it dislikes before the server could say why, and the rules are the domain's.
  return (
    <form action={formAction} aria-label={registration ? 'Upraviť registráciu' : 'Nová registrácia'} className="form" noValidate>
      {registration && <input type="hidden" name="id" value={registration.id} />}
      <FormError message={errors.form} />
      <Field label="Meno a priezvisko" name="name" defaultValue={value('name')} error={errors.name} required />
      <Field label="Telefón" name="phone" type="tel" defaultValue={value('phone')} error={errors.phone} required />
      <Field label="E-mail" name="email" type="email" defaultValue={value('email')} error={errors.email} required />
      <Field label="Značka" name="make" defaultValue={value('make')} error={errors.make} required />
      <Field label="Model" name="model" defaultValue={value('model')} error={errors.model} required />
      <Field label="ŠPZ" name="licensePlate" defaultValue={value('licensePlate')} />
      <SelectField label="Kategória" name="category" defaultValue={value('category')} error={errors.category} required>
        <option value="">Vyberte kategóriu</option>
        {registrationCategories.map((category) => (
          <option key={category} value={category}>
            {registrationCategoryLabels[category]}
          </option>
        ))}
      </SelectField>
      <TextAreaField label="Poznámka" name="note" defaultValue={value('note')} />
      <button type="submit" disabled={pending}>
        Uložiť registráciu
      </button>
    </form>
  );
}
