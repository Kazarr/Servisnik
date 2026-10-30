'use client';

import { useActionState } from 'react';
import { Field, FormError } from '../field.tsx';
import { valueIn } from '../form-value.ts';
import { saveEditionAction } from './actions.ts';
import type { EditionFormValues } from './joy-ride-input.ts';

/** The form of the Ročník of the Jazda radosti: the one that is there, or an empty one for the first. It saves the one Ročník, whichever it is. */
export function EditionForm({ edition }: { edition: EditionFormValues | null }) {
  const [state, formAction, pending] = useActionState(saveEditionAction, null);
  const value = valueIn(state, edition ?? undefined);
  const errors = state?.errors ?? {};

  // noValidate: the browser would stop a value it dislikes before the server could say why, and the rules are the domain's.
  return (
    <form action={formAction} aria-label="Ročník" className="form" noValidate>
      <FormError message={errors.form} />
      <Field label="Názov ročníka" name="name" defaultValue={value('name')} error={errors.name} required />
      <Field label="Dátum konania" name="date" type="date" defaultValue={value('date')} error={errors.date} required />
      <Field label="Miesto konania" name="place" defaultValue={value('place')} error={errors.place} required />
      <Field label="Uzávierka registrácií" name="registrationDeadline" type="datetime-local" defaultValue={value('registrationDeadline')} error={errors.registrationDeadline} required />
      <button type="submit" disabled={pending}>
        Uložiť ročník
      </button>
    </form>
  );
}
