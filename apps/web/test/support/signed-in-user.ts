import type { Role } from '@servisnik/domain/access';
import type { Auth } from '../../src/auth.ts';
import { requireUser } from '../../src/dal/user.ts';
import type { Database } from '../../src/db/index.ts';
import { signInHeaders } from './sessions.ts';
import { seedUser } from './users.ts';

let counter = 0;

/**
 * A Používateľ of its own with this Rola, created with this password and signed in, so that no test meets another's
 * sessions: his id, name and e-mail, the headers of his session and the user the DAL gets from them.
 */
export async function signedInUser(db: Database, auth: Auth, role: Role, password: string) {
  const email = `uzivatel${++counter}@autoservis.test`;
  const name = `Používateľ ${counter}`;
  const id = await seedUser(db, { email, password, role, name });
  const headers = await signInHeaders(auth, email, password);
  return { id, name, email, headers, user: await requireUser(headers, auth) };
}
