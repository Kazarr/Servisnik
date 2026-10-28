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

/** The page every Rola may open: where a user is sent whose Rola may not open the page asked for. */
export const homePage = '/zakazky';

/**
 * The user's Rola may not do this. Pages redirect first, through currentUserWith. One thrown while a
 * page renders anyway (a DAL function the gate did not cover) carries the digest of the error that
 * Next's `redirect(homePage)` throws, so Next sends the user there, with no error page and no log
 * line, as it does for redirect(). A Server Action turns it into a message (app/(app)/forbidden.ts)
 * before Next sees it. The digest is spelled out because the e2e specs import the DAL under Node, where
 * `next/navigation` does not resolve; test/forbidden-page.test.ts compares it with what redirect() throws.
 */
export class ForbiddenError extends Error {
  readonly digest = `NEXT_REDIRECT;replace;${homePage};307;`;

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
