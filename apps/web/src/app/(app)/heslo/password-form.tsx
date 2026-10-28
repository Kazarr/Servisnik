'use client';

import { passwordLength } from '@servisnik/domain/access';
import { useActionState } from 'react';
import { Field, FormError } from '../field.tsx';
import { changePassword } from './actions.ts';

/** The form that changes the own password. After a send its fields are empty, whatever the answer: a password is never echoed back. */
export function PasswordForm() {
  const [state, formAction, pending] = useActionState(changePassword, null);
  const errors = state?.errors ?? {};

  // noValidate: the length rule is the domain's, and the server says why a password is refused.
  return (
    <form action={formAction} className="form" noValidate>
      <p>
        Nové heslo má {passwordLength.min} až {passwordLength.max} znakov. Zmena odhlási vaše ostatné prihlásenia.
      </p>
      <FormError message={errors.form} />
      <Field label="Súčasné heslo" name="currentPassword" type="password" autoComplete="current-password" error={errors.currentPassword} required />
      <Field label="Nové heslo" name="newPassword" type="password" autoComplete="new-password" error={errors.newPassword} required />
      <Field label="Nové heslo znova" name="confirmation" type="password" autoComplete="new-password" error={errors.confirmation} required />
      <button type="submit" disabled={pending}>
        Zmeniť heslo
      </button>
    </form>
  );
}
