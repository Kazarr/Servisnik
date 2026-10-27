import { getAuth, type Auth } from '../auth.ts';
import { role } from '../db/schema.ts';

// Data Access Layer (docs/adr/0001-stack.md): pages read data only through functions that start from
// the user returned here and hand back only what that user may see.

export type Role = (typeof role.enumValues)[number];
export type User = { id: string; email: string; name: string; role: Role };

export class UnauthenticatedError extends Error {
  constructor() {
    super('Používateľ nie je prihlásený.');
  }
}

/** First line of every DAL function that reads or writes data: no user, nothing happens. */
export function assertUser(user: User | null): asserts user is User {
  if (!user) throw new UnauthenticatedError();
}

const isRole =(value: unknown): value is Role => role.enumValues.some((known) => known === value);

/**
 * The Používateľ behind the request's session cookie. Rejects with UnauthenticatedError when there
 * is no valid session, and also when the user's Rola is one this version of the code does not know.
 */
export async function requireUser(requestHeaders: Headers, auth: Auth = getAuth()): Promise<User> {
  const session = await auth.api.getSession({ headers: requestHeaders });
  if (!session) throw new UnauthenticatedError();
  const { id, email, name, role: userRole } = session.user;
  if (!isRole(userRole)) throw new UnauthenticatedError();
  return { id, email, name, role: userRole };
}
