import { parseNewUser, type NewUserErrors, type NewUserInput, type Role } from '@servisnik/domain/access';
import { sql } from 'drizzle-orm';
import { APIError } from 'better-auth/api';
import { getAuth, type Auth } from '../auth.ts';
import { getDb, type Database } from '../db/index.ts';
import { user as userTable } from '../db/schema.ts';
import { assertCan, type User } from './user.ts';

/** A Používateľ as the list of them shows him: never a password. `banned` is the Deaktivovaný používateľ. */
export type ListedUser = { id: string; name: string; email: string; role: Role; banned: boolean };

/** Every Používateľ, ordered by name the Slovak way (like the customers). Only the admin sees them. */
export async function listUsers(user: User | null, db: Database = getDb()): Promise<ListedUser[]> {
  assertCan(user, 'users.read');
  return db
    .select({ id: userTable.id, name: userTable.name, email: userTable.email, role: userTable.role, banned: userTable.banned })
    .from(userTable)
    .orderBy(sql`${userTable.name} collate "sk-x-icu"`, userTable.id);
}

export type CreateUserErrors = Omit<NewUserErrors, 'email'> & { email?: 'format' | 'taken' };
export type CreateUserResult = { ok: true; id: string } | { ok: false; errors: CreateUserErrors };

/**
 * Creates a Používateľ with the Rola and the starting password the admin gives, who tells it to the new
 * user in person. The access area checks the input first (packages/domain/src/access), because Better
 * Auth does not check the minimal length of a password when an admin creates a user. Better Auth then
 * creates him through its admin plugin, called on the server with no session; the plugin then checks
 * no permission of its own, so the capability is checked here, before anything. The password is never returned.
 */
export async function createUser(user: User | null, input: NewUserInput, auth: Auth = getAuth()): Promise<CreateUserResult> {
  assertCan(user, 'users.write');
  const parsed = parseNewUser(input);
  if (!parsed.ok) return parsed;

  try {
    const { user: created } = await auth.api.createUser({ body: parsed.user });
    return { ok: true, id: created.id };
  } catch (error) {
    // The e-mail is already used (Better Auth compares it in lower case, as the domain stores it), or has a shape its own check refuses.
    if (error instanceof APIError && error.body?.code === 'USER_ALREADY_EXISTS_USE_ANOTHER_EMAIL') return { ok: false, errors: { email: 'taken' } };
    if (error instanceof APIError && error.body?.code === 'INVALID_EMAIL') return { ok: false, errors: { email: 'format' } };
    throw error;
  }
}
