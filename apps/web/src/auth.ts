import { passwordLength } from '@servisnik/domain/access';
import { betterAuth } from 'better-auth';
import { drizzleAdapter } from 'better-auth/adapters/drizzle';
import { nextCookies } from 'better-auth/next-js';
import { admin } from 'better-auth/plugins/admin';
import { defaultAc } from 'better-auth/plugins/admin/access';
import { appEnv } from './env.ts';
import { getDb, type Database } from './db/index.ts';
import * as schema from './db/schema.ts';

/** Better Auth's default path. No route is mounted there: src/dal/attempt-limit.ts sends the router requests under it. */
export const authBasePath = '/api/auth';

/**
 * What the admin plugin's own routes let a Rola do when the request carries a session. Servisník
 * calls them on the server with the admin's session (src/dal/users.ts) and asks nothing else:
 * `adminAc` of the plugin would add removing and impersonating a user, and creating one, where the
 * plugin does not check the length of the password. The creation is not here because the DAL calls
 * it with no session, which the plugin does not check. Nothing is in the mechanik's role.
 */
const adminRole = defaultAc.newRole({ user: ['update', 'set-email', 'set-role', 'ban', 'set-password'], session: ['revoke'] });
const mechanikRole = defaultAc.newRole({ user: [], session: [] });

/**
 * Better Auth with e-mail and password. There is no registration: the first admin comes from the seed
 * command and every other Používateľ from an admin, through the admin plugin's server API.
 *
 * `clientIpHeader` names the request header the address of the client is read from, which the limit of the
 * attempts to sign in and to change the password counts by (src/dal/attempt-limit.ts). Better Auth takes the
 * header as the client only when it holds exactly one address, and puts every client into one shared bucket
 * when it holds several or is missing. Behind DigitalOcean's ingress `x-forwarded-for` is the ingress, so
 * App Platform names `do-connecting-ip` (`CLIENT_IP_HEADER` in .do/app.yaml, read by `getAuth`); with a single
 * forged `x-forwarded-for` instead, a client would get new attempts at will. Without a proxy the default holds:
 * Next.js fills `x-forwarded-for` with the address of the socket when the request brings none.
 */
export function createAuth({
  db,
  secret,
  rateLimit,
  clientIpHeader = 'x-forwarded-for',
}: {
  db: Database;
  secret: string;
  rateLimit?: { enabled: boolean };
  clientIpHeader?: string;
}) {
  return betterAuth({
    secret,
    basePath: authBasePath,
    // Better Auth's default: limited when NODE_ENV is production, with its default rules (src/dal/attempt-limit.ts). Tests switch it on.
    rateLimit,
    advanced: { ipAddress: { ipAddressHeaders: [clientIpHeader] } },
    database: drizzleAdapter(db, { provider: 'pg', schema }),
    // The password length is the access area's rule (packages/domain/src/access); Better Auth checks the same numbers.
    emailAndPassword: { enabled: true, disableSignUp: true, minPasswordLength: passwordLength.min, maxPasswordLength: passwordLength.max },
    plugins: [
      // The plugin owns `role`, `banned`, `ban_reason`, `ban_expires` and `session.impersonated_by` (src/db/schema.ts). A user it
      // is not told the Rola of is a mechanik. Which Rola may do what in Servisník is the access area's rule; the DAL checks it
      // before it calls the plugin (src/dal/users.ts), and the roles above are what the plugin itself lets through.
      admin({
        roles: { admin: adminRole, mechanik: mechanikRole },
        adminRoles: ['admin'],
        defaultRole: 'mechanik',
        // What a Deaktivovaný používateľ is told at the login, after the right password; a wrong one gets the ordinary message (app/login/sign-in.ts).
        bannedUserMessage: 'Používateľ je deaktivovaný. Obráťte sa na admina.',
      }),
      nextCookies(), // keep last
    ],
  });
}

export type Auth = ReturnType<typeof createAuth>;

const shared = globalThis as { servisnikAuth?: Auth };

/**
 * The app's auth, created on first use so that importing it needs no environment. `CLIENT_IP_HEADER` is optional
 * and read here and not by appEnv(), which would refuse to start the app without it: unset or empty, the client is
 * read from `x-forwarded-for`.
 */
export const getAuth = () =>
  (shared.servisnikAuth ??= createAuth({ db: getDb(), secret: appEnv().BETTER_AUTH_SECRET, clientIpHeader: process.env.CLIENT_IP_HEADER || undefined }));
