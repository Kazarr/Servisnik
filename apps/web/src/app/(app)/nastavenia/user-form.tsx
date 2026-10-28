'use client';

import { passwordLength, roles } from '@servisnik/domain/access';
import { useActionState } from 'react';
import { Field, FormError, SelectField } from '../field.tsx';
import { valueIn } from '../form-value.ts';
import { roleLabels } from './role-labels.ts';
import { createUserAction } from './user-actions.ts';
import { emptyUserForm } from './user-fields.ts';

/**
 * The form for a new Používateľ. The fields are named `newUser…` because the page holds the forms of
 * other parts of Nastavenia, and an id may be on the page once. After a send the fields show what
 * the action answered, the password never: it is empty whatever the answer.
 */
export function UserForm() {
  const [state, formAction, pending] = useActionState(createUserAction, null);
  const value = valueIn(state, emptyUserForm);
  const errors = state?.errors ?? {};

  // noValidate: the rules are the domain's, and the server says which one a value breaks.
  return (
    <form action={formAction} className="form" noValidate>
      <FormError message={errors.form} />
      <Field label="Meno používateľa" name="newUserName" autoComplete="off" defaultValue={value('name')} error={errors.name} required />
      <Field label="E-mail používateľa" name="newUserEmail" type="email" autoComplete="off" defaultValue={value('email')} error={errors.email} required />
      <SelectField label="Rola používateľa" name="newUserRole" defaultValue={value('role')} error={errors.role}>
        {roles.map((role) => (
          <option key={role} value={role}>
            {roleLabels[role]}
          </option>
        ))}
      </SelectField>
      <Field
        label="Počiatočné heslo používateľa"
        name="newUserPassword"
        type="password"
        autoComplete="new-password"
        error={errors.password}
        required
      />
      <p>
        Heslo má {passwordLength.min} až {passwordLength.max} znakov. Povedzte ho používateľovi osobne.
      </p>
      {state?.created && <p role="status">Používateľ je založený.</p>}
      <button type="submit" disabled={pending}>
        Založiť používateľa
      </button>
    </form>
  );
}
