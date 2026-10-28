'use client';

import { passwordLength } from '@servisnik/domain/access';
import { useActionState } from 'react';
import { Field, FormError } from '../field.tsx';
import { setUserPasswordAction } from './user-actions.ts';

/** The form that gives a Používateľ a new password, which the admin tells him in person. The field is empty after every send, the password is never sent back. */
export function UserPasswordForm({ userId }: { userId: string }) {
  const [state, formAction, pending] = useActionState(setUserPasswordAction, null);
  const errors = state?.errors ?? {};

  // noValidate: the rules are the domain's, and the server says which one a value breaks.
  return (
    <form action={formAction} className="form" noValidate>
      <input type="hidden" name="userId" value={userId} />
      <FormError message={errors.form} />
      <Field label="Nové heslo používateľa" name="userPassword" type="password" autoComplete="new-password" error={errors.password} required />
      <p>
        Heslo má {passwordLength.min} až {passwordLength.max} znakov. Povedzte ho používateľovi osobne. Všetky jeho prihlásenia sa ukončia.
      </p>
      {state?.saved && <p role="status">Nové heslo je nastavené. Prihlásenia používateľa sú ukončené.</p>}
      <button type="submit" disabled={pending}>
        Nastaviť nové heslo
      </button>
    </form>
  );
}
