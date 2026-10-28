import { APIError } from 'better-auth/api';
import type { Auth } from '../../auth.ts';
import { tooManyAttemptsMessage, withinAttemptLimit } from '../../dal/attempt-limit.ts';

const wrongCredentialsMessage = 'Nesprávny e-mail alebo heslo.';

/**
 * Signs the user in with e-mail and password. A refused login is the user's problem and comes back as
 * the message to show him; anything else (database down, bug) stays a server error. Better Auth
 * refuses a Deaktivovaný používateľ with BANNED_USER only after the password was right, with the
 * message `bannedUserMessage` of src/auth.ts, so that is the one refusal that is not the ordinary message.
 * A client that made too many attempts is turned away first, and no password is checked (src/dal/attempt-limit.ts).
 */
export async function signInWithPassword(auth: Auth, requestHeaders: Headers, email: string, password: string) {
  if (!(await withinAttemptLimit(requestHeaders, 'sign-in', auth))) return { ok: false, message: tooManyAttemptsMessage } as const;
  try {
    await auth.api.signInEmail({ body: { email, password }, headers: requestHeaders });
    return { ok: true } as const;
  } catch (error) {
    if (error instanceof APIError && error.statusCode < 500) {
      return { ok: false, message: error.body?.code === 'BANNED_USER' ? error.message : wrongCredentialsMessage } as const;
    }
    throw error;
  }
}
