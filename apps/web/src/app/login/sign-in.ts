import { APIError } from 'better-auth/api';
import type { Auth } from '../../auth.ts';

const wrongCredentialsMessage = 'Nesprávny e-mail alebo heslo.';

/**
 * Signs the user in with e-mail and password. A refused login is the user's problem and comes back as
 * the message to show him; anything else (database down, bug) stays a server error. Better Auth
 * refuses a Deaktivovaný používateľ with BANNED_USER only after the password was right, with the
 * message `bannedUserMessage` of src/auth.ts, so that is the one refusal that is not the ordinary message.
 */
export async function signInWithPassword(auth: Auth, requestHeaders: Headers, email: string, password: string) {
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
