import { authBasePath, getAuth, type Auth } from '../auth.ts';

/**
 * The Better Auth routes whose rate-limit rule limits the attempts that check a password. The rule is
 * Better Auth's own default: 3 requests in 10 seconds per client address and route, kept in memory.
 */
const limitedPaths = { 'sign-in': '/sign-in/email', 'change-password': '/change-password' } as const;

export type LimitedAttempt = keyof typeof limitedPaths;

/**
 * Whether the client behind `requestHeaders` may make one more attempt of this kind, and counts the
 * attempt when it may. Call it before the password is checked and check nothing when it says no.
 *
 * Better Auth limits only the requests that reach its HTTP router; `auth.api` calls from a Server Action do
 * not. So this sends the router a request for the route of the attempt, which is limited before the route is
 * looked up: the router counts it against the same key, with the same rule, storage and client address
 * (`advanced.ipAddress` of the options; by default the `x-forwarded-for` header, which Next.js fills with the
 * socket's address when the request has none) as a request that signs in, and answers 404 because it is a GET.
 * Nothing is sent over the network and no route runs.
 */
export async function withinAttemptLimit(requestHeaders: Headers, attempt: LimitedAttempt, auth: Auth = getAuth()): Promise<boolean> {
  const url = new URL(`${authBasePath}${limitedPaths[attempt]}`, 'http://localhost');
  const response = await auth.handler(new Request(url, { headers: requestHeaders }));
  return response.status !== 429;
}
