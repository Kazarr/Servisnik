import { authBasePath, getAuth, type Auth } from '../auth.ts';

/**
 * The Better Auth routes whose rate-limit rule limits the attempts that check a password. The rule is
 * Better Auth's own default: 3 requests in 10 seconds per client address and route, kept in the memory of
 * the process. That is enough while the app runs as one instance (docs/adr/0001-stack.md, .do/app.yaml);
 * with more, the counts would be per instance until Better Auth gets a `secondaryStorage` or the database.
 */
const limitedPaths = { 'sign-in': '/sign-in/email', 'change-password': '/change-password' } as const;

export type LimitedAttempt = keyof typeof limitedPaths;

/** What a Server Action tells the Používateľ whose attempt was turned away. */
export const tooManyAttemptsMessage = 'Príliš veľa pokusov. Skúste to znova o chvíľu.';

/**
 * Whether the client behind `requestHeaders` may make one more attempt of this kind, and counts the
 * attempt when it may. Call it before the password is checked and check nothing when it says no.
 *
 * Better Auth limits only the requests that reach its HTTP router; `auth.api` calls from a Server Action do
 * not. So this sends the router a request for the route of the attempt, which is limited before the route is
 * looked up: the router counts it against the same key, with the same rule, storage and client address
 * as a request that signs in, and answers 404 because it is a GET. Nothing is sent over the network and no
 * route runs. What that means in practice:
 * - Outside production the limit is off, because Better Auth enables it by NODE_ENV (`createAuth` can switch
 *   it on, as the tests do), and the answer is always yes.
 * - Any answer of the router but 429 is a yes; the 404 is only what a probe that was let through gets.
 * - The client is the address in the header `createAuth` is told (`clientIpHeader`, `CLIENT_IP_HEADER` of the
 *   App Spec; src/auth.ts). Where no single address can be read from it, because the header is missing or
 *   holds several, Better Auth puts all clients into one bucket per route: 3 attempts in 10 seconds for the whole
 *   shop. In development and in tests it takes 127.0.0.1 instead.
 */
export async function withinAttemptLimit(requestHeaders: Headers, attempt: LimitedAttempt, auth: Auth = getAuth()): Promise<boolean> {
  const url = new URL(`${authBasePath}${limitedPaths[attempt]}`, 'http://localhost');
  const response = await auth.handler(new Request(url, { headers: requestHeaders }));
  return response.status !== 429;
}
