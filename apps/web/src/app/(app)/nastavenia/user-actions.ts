'use server';

import { passwordLength } from '@servisnik/domain/access';
import { revalidatePath } from 'next/cache';
import { currentUser } from '../../../dal/current-user.ts';
import { createUser } from '../../../dal/users.ts';
import { forbiddenMessage, orForbidden } from '../forbidden.ts';
import { emptyUserForm, type UserFormValues } from './user-fields.ts';

export type UserFormState = {
  values: UserFormValues;
  errors: Partial<Record<keyof UserFormValues | 'password' | 'form', string>>;
  /** The Používateľ was created; `values` are then the form's starting ones. */
  created?: true;
} | null;

const messages = {
  name: 'Vyplňte meno používateľa',
  email: { format: 'Zadajte e-mail v tvare meno@domena.sk', taken: 'Používateľ s týmto e-mailom už existuje' },
  role: 'Vyberte rolu používateľa',
  password: {
    tooShort: `Heslo musí mať aspoň ${passwordLength.min} znakov`,
    tooLong: `Heslo smie mať najviac ${passwordLength.max} znakov`,
  },
};

/**
 * Server Action of the form for a new Používateľ; it checks the session and the Rola itself, in the
 * DAL, like every action. The page shows the list again, so a refused send keeps what was typed
 * except for the password. The action does not change the admin's own session, so it ends with no redirect.
 */
export async function createUserAction(_state: UserFormState, formData: FormData): Promise<UserFormState> {
  const user = await currentUser();
  const text = (name: string) => String(formData.get(name) ?? '');
  const values: UserFormValues = { name: text('newUserName'), email: text('newUserEmail'), role: text('newUserRole') };

  const result = await orForbidden(createUser(user, { ...values, password: text('newUserPassword') }));
  if (result === 'forbidden') return { values, errors: { form: forbiddenMessage } };
  if (!result.ok) {
    const { name, email, role, password } = result.errors;
    return {
      values,
      errors: {
        name: name && messages.name,
        email: email && messages.email[email],
        role: role && messages.role,
        password: password && messages.password[password],
      },
    };
  }
  revalidatePath('/nastavenia');
  return { values: emptyUserForm, errors: {}, created: true };
}
