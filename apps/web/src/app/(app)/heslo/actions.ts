'use server';

import { passwordLength } from '@servisnik/domain/access';
import { headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { currentUser } from '../../../dal/current-user.ts';
import { changeOwnPassword, type PasswordChangeErrors } from '../../../dal/password.ts';
import { forbiddenMessage, orForbidden } from '../forbidden.ts';
import { ownPassword } from '../menu.ts';

export type PasswordFormState = { errors: Partial<Record<keyof PasswordChangeErrors | 'form', string>> } | null;

const messages = {
  currentPassword: 'Súčasné heslo nie je správne',
  newPassword: {
    tooShort: `Nové heslo musí mať aspoň ${passwordLength.min} znakov`,
    tooLong: `Nové heslo smie mať najviac ${passwordLength.max} znakov`,
  },
  confirmation: 'Zopakované heslo sa nezhoduje s novým heslom',
};

/** What the Používateľ is told, field by field. */
function refused({ currentPassword, newPassword, confirmation }: PasswordChangeErrors): PasswordFormState {
  return {
    errors: {
      currentPassword: currentPassword && messages.currentPassword,
      newPassword: newPassword && messages.newPassword[newPassword],
      confirmation: confirmation && messages.confirmation,
    },
  };
}

/**
 * Server Action of the form that changes the signed-in Používateľ's own password. The DAL checks the
 * session and the capability; it ends his other sign-ins, and Better Auth's nextCookies plugin puts
 * the cookie of the new session he is in on this action's response. The page is then loaded again
 * by a redirect, like after the login: Next.js renders the page the action came from with the
 * request's old cookie, which no longer names a session. The passwords are never sent back to the form.
 */
export async function changePassword(_state: PasswordFormState, formData: FormData): Promise<PasswordFormState> {
  const user = await currentUser();
  const input = {
    currentPassword: String(formData.get('currentPassword') ?? ''),
    newPassword: String(formData.get('newPassword') ?? ''),
    confirmation: String(formData.get('confirmation') ?? ''),
  };

  const result = await orForbidden(changeOwnPassword(user, await headers(), input));
  if (result === 'forbidden') return { errors: { form: forbiddenMessage } };
  if (!result.ok) return refused(result.errors);
  redirect(`${ownPassword.href}?zmenene`); // page.tsx shows the confirmation for this parameter
}
