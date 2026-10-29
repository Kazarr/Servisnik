import type { Role } from '@servisnik/domain/access';
import { hashPassword } from 'better-auth/crypto';
import { randomUUID } from 'node:crypto';
import { eq } from 'drizzle-orm';
import type { Database } from '../../src/db/index.ts';
import { account, user } from '../../src/db/schema.ts';

/**
 * A Používateľ with this Rola, created straight in the database, with a password the test chose, without
 * an admin who creates him (that is test/users.test.ts). `email` in lower case and not used yet. The name
 * is "Admin" unless the test gives one. Returns his id.
 */
export async function seedUser(db: Database, input: { email: string; password: string; role: Role; name?: string }) {
  const id = randomUUID();
  const password = await hashPassword(input.password);
  await db.transaction(async (tx) => {
    await tx.insert(user).values({ id, name: input.name ?? 'Admin', email: input.email, emailVerified: true, role: input.role });
    await tx.insert(account).values({ id: randomUUID(), accountId: id, providerId: 'credential', userId: id, password });
  });
  return id;
}

/** Changes the Rola of the user with this e-mail. It counts from the user's next request: the session reads the Rola from the database each time. */
export async function setRole(db: Database, email: string, role: Role) {
  await db.update(user).set({ role }).where(eq(user.email, email));
}
