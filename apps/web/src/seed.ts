import { hashPassword, verifyPassword } from 'better-auth/crypto';
import { randomUUID } from 'node:crypto';
import { and, eq } from 'drizzle-orm';
import type { Database } from './db/index.ts';
import { account, user } from './db/schema.ts';

/** Creates the admin, or brings an existing one back to: role admin, this password. Safe to run any number of times. */
export async function seedAdmin(db: Database, input: { email: string; password: string }) {
  const email = input.email.trim().toLowerCase(); // Better Auth looks users up in lower case

  await db.transaction(async (tx) => {
    const [existing] = await tx.select({ id: user.id }).from(user).where(eq(user.email, email));
    const userId = existing?.id ?? randomUUID();
    if (existing) {
      await tx.update(user).set({ role: 'admin' }).where(eq(user.id, userId));
    } else {
      await tx.insert(user).values({ id: userId, name: 'Admin', email, emailVerified: true, role: 'admin' });
    }

    const credential = and(eq(account.userId, userId), eq(account.providerId, 'credential'));
    const [current] = await tx.select({ password: account.password }).from(account).where(credential);
    if (!current) {
      await tx.insert(account).values({
        id: randomUUID(),
        accountId: userId,
        providerId: 'credential',
        userId,
        password: await hashPassword(input.password),
      });
    } else if (!current.password || !(await verifyPassword({ hash: current.password, password: input.password }))) {
      await tx.update(account).set({ password: await hashPassword(input.password) }).where(credential);
    }
  });
}
