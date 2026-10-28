'use server';

import { revalidatePath } from 'next/cache';
import { headers } from 'next/headers';
import { currentUser } from '../../../dal/current-user.ts';
import { activateUser, createUser, deactivateUser, setUserPassword, updateUser } from '../../../dal/users.ts';
import { forbiddenMessage, orForbidden } from '../forbidden.ts';
import { emptyUserForm, type UserFormValues } from './user-fields.ts';
import { userMessages } from './user-messages.ts';

const field = (formData: FormData, name: string) => String(formData.get(name) ?? '');

/** The list and the page of every user are shown again, so that they read the change just made. */
const showUsersAgain = () => revalidatePath('/nastavenia', 'layout');

export type UserFormState = {
  values: UserFormValues;
  errors: Partial<Record<keyof UserFormValues | 'password' | 'form', string>>;
  /** The Používateľ was created; `values` are then the form's starting ones. */
  created?: true;
} | null;

/**
 * Server Action of the form for a new Používateľ; it checks the session and the Rola itself, in the
 * DAL, like every action. A refused send shows the form again with what was typed, except for the
 * password. The action does not change the admin's own session, so it ends with no redirect.
 */
export async function createUserAction(_state: UserFormState, formData: FormData): Promise<UserFormState> {
  const user = await currentUser();
  const values: UserFormValues = { name: field(formData, 'newUserName'), email: field(formData, 'newUserEmail'), role: field(formData, 'newUserRole') };

  const result = await orForbidden(createUser(user, { ...values, password: field(formData, 'newUserPassword') }));
  if (result === 'forbidden') return { values, errors: { form: forbiddenMessage } };
  if (!result.ok) {
    const { name, email, role, password } = result.errors;
    return {
      values,
      errors: {
        name: name && userMessages.name,
        email: email && userMessages.email[email],
        role: role && userMessages.role[role],
        password: password && userMessages.password[password],
      },
    };
  }
  showUsersAgain();
  return { values: emptyUserForm, errors: {}, created: true };
}

export type UserEditFormState = {
  values: UserFormValues;
  errors: Partial<Record<keyof UserFormValues | 'form', string>>;
  /** The changes were saved; `values` are then as they are stored. */
  saved?: true;
} | null;

/**
 * Server Action of the form that changes the name, e-mail and Rola of the Používateľ `userId`. A form
 * without the field of the Rola leaves the Rola as it is: it is the form of the admin's own page,
 * which has none. The DAL checks the session and the Rola, and that the admin does not change his own Rola.
 */
export async function updateUserAction(_state: UserEditFormState, formData: FormData): Promise<UserEditFormState> {
  const user = await currentUser();
  const values: UserFormValues = { name: field(formData, 'userName'), email: field(formData, 'userEmail'), role: field(formData, 'userRole') };

  const result = await orForbidden(
    updateUser(user, await headers(), field(formData, 'userId'), { name: values.name, email: values.email, ...(formData.has('userRole') && { role: values.role }) }),
  );
  if (result === 'forbidden') return { values, errors: { form: forbiddenMessage } };
  if (!result.ok) {
    const { name, email, role } = result.errors;
    return { values, errors: { name: name && userMessages.name, email: email && userMessages.email[email], role: role && userMessages.role[role] } };
  }
  showUsersAgain();
  const { name, email, role = values.role } = result.edit;
  return { values: { name, email, role }, errors: {}, saved: true };
}

export type UserPasswordFormState = { errors: { password?: string; form?: string }; saved?: true } | null;

/** Server Action of the form that gives the Používateľ `userId` a new password and ends his sign-ins. The password is never sent back to the form. */
export async function setUserPasswordAction(_state: UserPasswordFormState, formData: FormData): Promise<UserPasswordFormState> {
  const user = await currentUser();

  const result = await orForbidden(setUserPassword(user, await headers(), field(formData, 'userId'), field(formData, 'userPassword')));
  if (result === 'forbidden') return { errors: { form: forbiddenMessage } };
  if (!result.ok) return { errors: { password: userMessages.password[result.errors.password] } };
  showUsersAgain();
  return { errors: {}, saved: true };
}

export type UserStatusFormState = { error?: string } | null;

/** Server Action of the button that deactivates the Používateľ `userId`; the admin cannot do it to himself. */
export async function deactivateUserAction(_state: UserStatusFormState, formData: FormData): Promise<UserStatusFormState> {
  const user = await currentUser();

  const result = await orForbidden(deactivateUser(user, await headers(), field(formData, 'userId')));
  if (result === 'forbidden') return { error: forbiddenMessage };
  if (!result.ok) return { error: userMessages.deactivateSelf };
  showUsersAgain();
  return null;
}

/** Server Action of the button that lets the Deaktivovaný používateľ `userId` sign in again. */
export async function activateUserAction(_state: UserStatusFormState, formData: FormData): Promise<UserStatusFormState> {
  const user = await currentUser();

  const result = await orForbidden(activateUser(user, await headers(), field(formData, 'userId')));
  if (result === 'forbidden') return { error: forbiddenMessage };
  showUsersAgain();
  return null;
}
