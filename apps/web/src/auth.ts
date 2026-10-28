import { passwordLength } from '@servisnik/domain/access';
import { betterAuth } from 'better-auth';
import { drizzleAdapter } from 'better-auth/adapters/drizzle';
import { nextCookies } from 'better-auth/next-js';
import { appEnv } from './env.ts';
import { getDb, type Database } from './db/index.ts';
import * as schema from './db/schema.ts';

/** Better Auth with e-mail and password. There is no registration: the first admin comes from the seed command. */
export function createAuth({ db, secret }: { db: Database; secret: string }) {
  return betterAuth({
    secret,
    database: drizzleAdapter(db, { provider: 'pg', schema }),
    // The password length is the access area's rule (packages/domain/src/access); Better Auth checks the same numbers.
    emailAndPassword: { enabled: true, disableSignUp: true, minPasswordLength: passwordLength.min, maxPasswordLength: passwordLength.max },
    user: {
      additionalFields: {
        role: { type: 'string', defaultValue: 'mechanik', input: false },
      },
    },
    plugins: [nextCookies()], // keep last
  });
}

export type Auth = ReturnType<typeof createAuth>;

const shared = globalThis as { servisnikAuth?: Auth };

/** The app's auth, created on first use so that importing it needs no environment. */
export const getAuth = () => (shared.servisnikAuth ??= createAuth({ db: getDb(), secret: appEnv().BETTER_AUTH_SECRET }));
