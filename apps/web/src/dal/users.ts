import { parseNewUser, parseUserEdit, type NewUserErrors, type NewUserInput, type Role, type UserEditErrors, type UserEditInput } from '@servisnik/domain/access';
import { eq, sql } from 'drizzle-orm';
import { APIError } from 'better-auth/api';
import { getAuth, type Auth } from '../auth.ts';
import { getDb, type Database } from '../db/index.ts';
import { user as userTable } from '../db/schema.ts';
import { violates } from './constraint.ts';
import { assertCan, type User } from './user.ts';

/** A Používateľ as the list of them shows him: never a password. `banned` is the Deaktivovaný používateľ. */
export type ListedUser = { id: string; name: string; email: string; role: Role; banned: boolean };

const listedColumns = { id: userTable.id, name: userTable.name, email: userTable.email, role: userTable.role, banned: userTable.banned };

/** Every Používateľ, ordered by name the Slovak way (like the customers). Only the admin sees them. */
export async function listUsers(user: User | null, db: Database = getDb()): Promise<ListedUser[]> {
  assertCan(user, 'users.read');
  return db.select(listedColumns).from(userTable).orderBy(sql`${userTable.name} collate "sk-x-icu"`, userTable.id);
}

/** One Používateľ, as the list shows him, or null when nobody has this id. Only the admin sees him. */
export async function getUser(user: User | null, id: string, db: Database = getDb()): Promise<ListedUser | null> {
  assertCan(user, 'users.read');
  const [found] = await db.select(listedColumns).from(userTable).where(eq(userTable.id, id));
  return found ?? null;
}

/**
 * Better Auth refused an e-mail another Používateľ has: its own check says so when it sees him, and
 * when two writes race past that check, the unique index of the e-mail does. Every path that writes
 * an e-mail stores it in lower case, so the index is also what keeps two spellings of one e-mail out.
 */
const isEmailTaken = (error: unknown) =>
  (error instanceof APIError && error.body?.code === 'USER_ALREADY_EXISTS_USE_ANOTHER_EMAIL') || violates(error, 'user_email_unique');

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
    if (isEmailTaken(error)) return { ok: false, errors: { email: 'taken' } };
    if (error instanceof APIError && error.body?.code === 'INVALID_EMAIL') return { ok: false, errors: { email: 'format' } };
    throw error;
  }
}

export type UpdateUserErrors = Omit<UserEditErrors, 'email' | 'role'> & { email?: 'format' | 'taken'; role?: 'invalid' | 'own' };
export type UpdateUserResult = { ok: true } | { ok: false; errors: UpdateUserErrors };

/**
 * Changes the name, e-mail and, when the input has one, the Rola of the Používateľ `userId`: one
 * call of the admin plugin's `adminUpdateUser`, so either all is saved or nothing. The plugin reads
 * the admin's session from `requestHeaders` and checks its own permission. The admin may change his own
 * name and e-mail but not his own Rola, so that an active admin is always left. The Rola counts from
 * the user's next request, because the session reads it from the database each time (Better Auth's
 * cookie cache is off). An id nobody has makes the plugin throw, as a Server Action only gets one by a forged form.
 */
export async function updateUser(user: User | null, requestHeaders: Headers, userId: string, input: UserEditInput, auth?: Auth): Promise<UpdateUserResult> {
  assertCan(user, 'users.write');
  const parsed = parseUserEdit(input);
  if (!parsed.ok) return parsed;
  if (userId === user.id && parsed.edit.role !== undefined && parsed.edit.role !== user.role) return { ok: false, errors: { role: 'own' } };

  try {
    await (auth ?? getAuth()).api.adminUpdateUser({ headers: requestHeaders, body: { userId, data: parsed.edit } });
  } catch (error) {
    if (isEmailTaken(error)) return { ok: false, errors: { email: 'taken' } };
    if (error instanceof APIError && error.body?.code === 'INVALID_EMAIL') return { ok: false, errors: { email: 'format' } };
    throw error;
  }
  return { ok: true };
}
