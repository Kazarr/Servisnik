import { getSessionCookie } from 'better-auth/cookies';
import { NextResponse, type NextRequest } from 'next/server';

const openPaths = ['/login', '/api/health'];

/**
 * Optimistic first check: no session cookie, no page. It only looks at the cookie, so it proves
 * nothing; every page and every DAL function checks the session itself (src/dal/user.ts).
 */
export function proxy(request: NextRequest) {
  if (openPaths.includes(request.nextUrl.pathname) || getSessionCookie(request)) return NextResponse.next();
  return NextResponse.redirect(new URL('/login', request.url));
}

/**
 * Not covered: Next's own files, and /api/logo. Next copies the body of every request the proxy runs for
 * (up to `proxyClientMaxBodySize`, 10 MB) before the handler gets it, so for an upload the handler could
 * neither refuse it with 403 or 413 before it was read, nor stop one that never ends. The route answers
 * 401 for a request without a session itself (src/logo-response.ts), as every DAL function does.
 */
export const config = { matcher: ['/((?!_next/static|_next/image|favicon.ico|icon.svg|api/logo).*)'] };
