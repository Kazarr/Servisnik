'use client';

import { roles, type Role } from '@servisnik/domain/access';
import { useActionState } from 'react';
import { Field, FormError, SelectField } from '../field.tsx';
import { valueIn } from '../form-value.ts';
import { roleLabels } from './role-labels.ts';
import { updateUserAction } from './user-actions.ts';
import type { UserFormValues } from './user-fields.ts';
import { userMessages } from './user-messages.ts';

/**
 * The form that changes the name, e-mail and Rola of a Používateľ, filled in with `initial`; after a
 * send the fields show what the action answered. On the admin's own page the page passes `ownRole`,
 * and there is no field for the Rola, only the Rola itself: the server refuses a change of it as well.
 */
export function UserEditForm({ userId, initial, ownRole }: { userId: string; initial: UserFormValues; ownRole?: Role }) {
  const [state, formAction, pending] = useActionState(updateUserAction, null);
  const value = valueIn(state, initial);
  const errors = state?.errors ?? {};

  // noValidate: the rules are the domain's, and the server says which one a value breaks.
  return (
    <form action={formAction} className="form" noValidate>
      <input type="hidden" name="userId" value={userId} />
      <FormError message={errors.form} />
      <Field label="Meno používateľa" name="userName" autoComplete="off" defaultValue={value('name')} error={errors.name} required />
      <Field label="E-mail používateľa" name="userEmail" type="email" autoComplete="off" defaultValue={value('email')} error={errors.email} required />
      {ownRole ? (
        <p>
          Rola: {roleLabels[ownRole]}. {userMessages.role.own}.
        </p>
      ) : (
        <SelectField label="Rola používateľa" name="userRole" defaultValue={value('role')} error={errors.role}>
          {roles.map((role) => (
            <option key={role} value={role}>
              {roleLabels[role]}
            </option>
          ))}
        </SelectField>
      )}
      {state?.saved && <p role="status">Údaje sú uložené.</p>}
      <button type="submit" disabled={pending}>
        Uložiť údaje
      </button>
    </form>
  );
}
