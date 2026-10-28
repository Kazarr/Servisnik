import { APIError } from 'better-auth/api';
import { getAuth, type Auth } from '../auth.ts';
import { withinAttemptLimit } from './attempt-limit.ts';

export type SignInResult = { ok: true } | { ok: false; reason: 'refused' | 'tooManyAttempts' };

/**
 * Signs in the Používateľ with this e-mail and password; in a Server Action the nextCookies plugin puts the
 * cookie of the new session on the response. Sign-in is public by nature: it is how a session starts. A client
 * that made too many attempts is turned away before the password is checked.
 */
export async function signInWithPassword(requestHeaders: Headers, credentials: { email: string; password: string }, auth: Auth = getAuth()): Promise<SignInResult> {
  if (!(await withinAttemptLimit(requestHeaders, 'sign-in', auth))) return { ok: false, reason: 'tooManyAttempts' };
  try {
    await auth.api.signInEmail({ body: credentials, headers: requestHeaders });
  } catch (error) {
    // A rejected login is the user's problem; anything else (database down, bug) must stay a server error.
    if (error instanceof APIError && error.statusCode < 500) return { ok: false, reason: 'refused' };
    throw error;
  }
  return { ok: true };
}
