import type { Auth } from '../../src/auth.ts';

/**
 * The request headers of a browser that has just signed in with this e-mail and password: the cookie
 * of the new session, as the browser sends it back. A DAL function that asks Better Auth to act as
 * the user, and `requireUser`, read the session from them.
 */
export async function signInHeaders(auth: Auth, email: string, password: string) {
  const { headers } = await auth.api.signInEmail({ body: { email, password }, returnHeaders: true });
  return new Headers({ cookie: headers.getSetCookie().map((cookie) => cookie.split(';')[0]).join('; ') });
}
