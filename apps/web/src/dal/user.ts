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

export class ForbiddenError extends Error {
  constructor() {
    super('Používateľ na to nemá oprávnenie.');
  }
}

/**
 * First line of a DAL function only the admin may use: no user and nothing happens, a mechanik and
 * nothing happens either (GLOSSARY, Rola: a mechanik sees only the zákazky, without prices). Only the
 * customers and createVehicle (a Vozidlo is added from a Zákazník) use it so far; the other functions
 * stay on assertUser until #118 (Prístup) replaces it with its capability check.
 */
export function assertAdmin(user: User | null): asserts user is User {
  assertUser(user);
  if (user.role !== 'admin') throw new ForbiddenError();
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
