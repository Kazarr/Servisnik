import type { Role } from '@servisnik/domain/access';
import { eq } from 'drizzle-orm';
import type { Database } from '../../src/db/index.ts';
import { user } from '../../src/db/schema.ts';
import { seedAdmin } from '../../src/seed.ts';

/** A Používateľ with this Rola, created straight in the database, with a password the test chose, without an admin who creates him (that is test/users.test.ts). `email` in lower case. */
export async function seedUser(db: Database, input: { email: string; password: string; role: Role }) {
  await seedAdmin(db, { email: input.email, password: input.password });
  await setRole(db, input.email, input.role);
}

/** Changes the Rola of the user with this e-mail. It counts from the user's next request: the session reads the Rola from the database each time. */
export async function setRole(db: Database, email: string, role: Role) {
  await db.update(user).set({ role }).where(eq(user.email, email));
}
