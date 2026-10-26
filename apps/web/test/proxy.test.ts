import { NextRequest } from 'next/server';
import { expect, test } from 'vitest';
import { proxy } from '../src/proxy.ts';

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
