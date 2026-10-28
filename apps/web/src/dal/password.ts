import { passwordError, type PasswordError } from '@servisnik/domain/access';
import { APIError } from 'better-auth/api';
import { getAuth, type Auth } from '../auth.ts';
import { assertCan, requireUser } from './user.ts';

export type PasswordChange = { currentPassword: string; newPassword: string; confirmation: string };
export type PasswordChangeErrors = { currentPassword?: 'wrong'; newPassword?: PasswordError; confirmation?: 'mismatch' };
export type ChangePasswordResult = { ok: true } | { ok: false; errors: PasswordChangeErrors };

/**
 * Better Auth refused the current password: INVALID_PASSWORD when it is not the user's, and
 * PASSWORD_TOO_LONG when it is longer than any password can be. The new password was judged against
 * the same limit first (auth.ts hands Better Auth the numbers of the access area), so a too-long
 * password from Better Auth can only be the current one.
 */
const isWrongCurrentPassword = (error: unknown) =>
  error instanceof APIError && (error.body?.code === 'INVALID_PASSWORD' || error.body?.code === 'PASSWORD_TOO_LONG');

/**
 * Changes the password of the Používateľ whose session `requestHeaders` carry, and ends his other
 * sign-ins. The user is the one that session names, so the capability is checked for the user whose
 * password changes. Better Auth swaps the session he is in for a new one; in a Server Action the
 * nextCookies plugin puts its cookie on the response, so he stays signed in. The new password and its
 * repeat are judged first, so a bad new password is reported before Better Auth checks the current one.
 */
export async function changeOwnPassword(requestHeaders: Headers, input: PasswordChange, auth: Auth = getAuth()): Promise<ChangePasswordResult> {
  const user = await requireUser(requestHeaders, auth);
  assertCan(user, 'password.change');
  const errors: PasswordChangeErrors = {};
  const tooBad = passwordError(input.newPassword);
  if (tooBad) errors.newPassword = tooBad;
  if (input.confirmation !== input.newPassword) errors.confirmation = 'mismatch';
  if (Object.keys(errors).length > 0) return { ok: false, errors };

  try {
    await auth.api.changePassword({
      headers: requestHeaders,
      body: { currentPassword: input.currentPassword, newPassword: input.newPassword, revokeOtherSessions: true },
    });
  } catch (error) {
    if (isWrongCurrentPassword(error)) return { ok: false, errors: { currentPassword: 'wrong' } };
    throw error;
  }
  return { ok: true };
}
