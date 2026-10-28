import { can, roles, type Capability, type Role } from '@servisnik/domain/access';
import { getAuth, type Auth } from '../auth.ts';

// Data Access Layer (docs/adr/0001-stack.md): pages read data only through functions that start from
// the user returned here and hand back only what that user may see.

export type { Role };
export type User = { id: string; email: string; name: string; role: Role };

export class UnauthenticatedError extends Error {
  constructor() {
    super('Používateľ nie je prihlásený.');
  }
}

/**
 * The user's Rola may not do this. Pages redirect first, through currentUserWith, so one thrown in
 * a page shows the error page; a Server Action turns it into a message (app/(app)/forbidden.ts).
 */
export class ForbiddenError extends Error {
  constructor(capability: Capability) {
    super(`Zakázané: ${capability}`);
  }
}

/**
 * First line of every DAL function that reads or writes data: no user, or a Rola without this
 * capability (packages/domain/src/access), and nothing happens.
 */
export function assertCan(user: User | null, capability: Capability): asserts user is User {
  if (!user) throw new UnauthenticatedError();
  if (!can(user.role, capability)) throw new ForbiddenError(capability);
}

const isRole = (value: unknown): value is Role => roles.some((known) => known === value);

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
