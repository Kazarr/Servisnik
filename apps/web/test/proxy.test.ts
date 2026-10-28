import { unstable_doesMiddlewareMatch } from 'next/experimental/testing/server';
import { NextRequest } from 'next/server';
import { expect, test } from 'vitest';
import { config, proxy } from '../src/proxy.ts';

const request = (path: string, cookie?: string) =>
  new NextRequest(`http://localhost:3000${path}`, { headers: cookie ? { cookie } : {} });

// proxy.ts is only the optimistic first check; every page and the DAL check the session themselves.
test('a request without a session cookie is sent to the login page', () => {
  const response = proxy(request('/zakazky'));

  expect(response.status).toBe(307);
  expect(response.headers.get('location')).toBe('http://localhost:3000/login');
});

test('a request with a session cookie goes on to the page', () => {
  const response = proxy(request('/zakazky', 'better-auth.session_token=abc.def'));

  expect(response.headers.get('x-middleware-next')).toBe('1');
});

test.each(['/login', '/api/health'])('%s is open without a session', (path) => {
  expect(proxy(request(path)).headers.get('x-middleware-next')).toBe('1');
});

// Next copies the body of every request the proxy runs for (up to 10 MB) before the handler sees it, so on a
// path the proxy covers an upload is read before the handler can answer 403 or 413, and a body without end
// never reaches the handler. The matcher is where that is decided.
test.each([
  ['/zakazky', true],
  ['/nastavenia', true],
  ['/api/health', true],
  ['/login', true],
  ['/api/logo', false],
  ['/api/logo/', false],
  ['/_next/static/chunks/app.js', false],
  ['/favicon.ico', false],
])('the proxy runs for %s: %s', (path, runs) => {
  expect(unstable_doesMiddlewareMatch({ config, url: `http://localhost:3000${path}` })).toBe(runs);
});

test('the proxy leaves /api/logo alone whatever the request carries, because the route answers 401 itself', () => {
  const headers = { cookie: 'better-auth.session_token=fake' };

  expect(unstable_doesMiddlewareMatch({ config, url: 'http://localhost:3000/api/logo?v=1', headers })).toBe(false);
  expect(unstable_doesMiddlewareMatch({ config, url: 'http://localhost:3000/api/logo' })).toBe(false);
});
