import { passwordLength } from '@servisnik/domain/access';
import { betterAuth } from 'better-auth';
import { drizzleAdapter } from 'better-auth/adapters/drizzle';
import { nextCookies } from 'better-auth/next-js';
import { admin } from 'better-auth/plugins/admin';
import { adminAc, userAc } from 'better-auth/plugins/admin/access';
import { appEnv } from './env.ts';
import { getDb, type Database } from './db/index.ts';
import * as schema from './db/schema.ts';

/**
 * Better Auth with e-mail and password. There is no registration: the first admin comes from the seed
 * command and every other Používateľ from an admin, through the admin plugin's server API.
 */
export function createAuth({ db, secret }: { db: Database; secret: string }) {
  return betterAuth({
    secret,
    database: drizzleAdapter(db, { provider: 'pg', schema }),
    // The password length is the access area's rule (packages/domain/src/access); Better Auth checks the same numbers.
    emailAndPassword: { enabled: true, disableSignUp: true, minPasswordLength: passwordLength.min, maxPasswordLength: passwordLength.max },
    plugins: [
      // The plugin owns `role`, `banned`, `ban_reason`, `ban_expires` and `session.impersonated_by` (src/db/schema.ts). A user it
      // is not told the Rola of is a mechanik; the mechanik has no permission of the plugin's, the admin has all.
      // Which Rola may do what in Servisník is the access area's rule; the DAL checks it before it calls the plugin (src/dal/users.ts).
      admin({ roles: { admin: adminAc, mechanik: userAc }, adminRoles: ['admin'], defaultRole: 'mechanik' }),
      nextCookies(), // keep last
    ],
  });
}

export type Auth = ReturnType<typeof createAuth>;

const shared = globalThis as { servisnikAuth?: Auth };

/** The app's auth, created on first use so that importing it needs no environment. */
export const getAuth = () => (shared.servisnikAuth ??= createAuth({ db: getDb(), secret: appEnv().BETTER_AUTH_SECRET }));
