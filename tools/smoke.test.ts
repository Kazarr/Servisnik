import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http';
import type { AddressInfo } from 'node:net';
import { afterEach, expect, test } from 'vitest';
import { run, smoke } from './smoke.ts';

// Deploy tier of verify (AGENTS.md): `pnpm smoke <url>` is itself a check, so it has one passing
// and one failing example and asserts the exact failure list. The servers are real, on localhost.
const servers: Server[] = [];
afterEach(() => Promise.all(servers.splice(0).map((server) => new Promise((resolve) => server.close(resolve)))));

async function serve(handler: (request: IncomingMessage, response: ServerResponse) => void) {
  const server = createServer(handler);
  servers.push(server);
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  return `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
}

/** An app whose pages answer with the given status per path; unknown paths are 404. */
const app = (statuses: Record<string, number>, headers: Record<string, string> = {}) =>
  serve((request, response) => response.writeHead(statuses[request.url ?? ''] ?? 404, headers).end());

test('smoke passes when the login page and /api/health both answer 200', async () => {
  const url = await app({ '/login': 200, '/api/health': 200 });

  expect(await smoke(url)).toEqual([]);
});

test('smoke fails on /api/health 503 and names it, the login page is still checked', async () => {
  const url = await app({ '/login': 200, '/api/health': 503 });

  expect(await smoke(url)).toEqual(['/api/health: HTTP 503, čakalo sa 200']);
});

test('smoke does not follow a redirect: a login page that redirects is not a login page', async () => {
  const url = await app({ '/login': 307, '/api/health': 200 }, { location: '/somewhere-else' });

  expect(await smoke(url)).toEqual(['/login: HTTP 307, čakalo sa 200']);
});

test('smoke reports every unreachable page with the reason', async () => {
  const url = await app({});
  await new Promise((resolve) => servers.pop()!.close(resolve)); // the port is now closed

  expect(await smoke(url)).toEqual(['/login: nedostupné (ECONNREFUSED)', '/api/health: nedostupné (ECONNREFUSED)']);
});

test('smoke gives up on a server that accepts and never answers', async () => {
  const url = await serve(() => {}); // never responds

  expect(await smoke(url, { timeoutMs: 200 })).toEqual(['/login: nedostupné (TimeoutError)', '/api/health: nedostupné (TimeoutError)']);
});

test('run exits 0 and says what it checked when the smoke passes', async () => {
  const url = await app({ '/login': 200, '/api/health': 200 });

  expect(await run([url])).toEqual({ exitCode: 0, output: [`Smoke prešiel: ${url}/login 200, ${url}/api/health 200`] });
});

test('run exits 1 and lists the failures when the smoke fails', async () => {
  const url = await app({ '/login': 200, '/api/health': 503 });

  expect(await run([url])).toEqual({ exitCode: 1, output: ['Smoke zlyhal:', '/api/health: HTTP 503, čakalo sa 200'] });
});

test('run exits 2 with the usage when no URL is given', async () => {
  expect(await run([])).toEqual({ exitCode: 2, output: ['Použitie: pnpm smoke <url> [sha]'] });
});

// With a sha, smoke also asks the deployed app which commit it runs (/api/health names it, see apps/web/src/health.ts).
const appRunning = (healthBody: string) =>
  serve((request, response) => response.writeHead(request.url === '/login' || request.url === '/api/health' ? 200 : 404).end(request.url === '/api/health' ? healthBody : ''));
const health = (sha?: string) => JSON.stringify({ status: 'ok', sha });

test('smoke passes when /api/health names the expected commit', async () => {
  const url = await appRunning(health('abc123'));

  expect(await smoke(url, { sha: 'abc123' })).toEqual([]);
});

test('smoke fails when /api/health names another commit, and says which', async () => {
  const url = await appRunning(health('def456'));

  expect(await smoke(url, { sha: 'abc123' })).toEqual(['/api/health: commit def456, čakalo sa abc123']);
});

test('smoke fails when /api/health names no commit, whether the body is JSON or not', async () => {
  const refusal = ['/api/health: commit nie je uvedený, čakalo sa abc123'];

  expect(await smoke(await appRunning(health()), { sha: 'abc123' })).toEqual(refusal);
  expect(await smoke(await appRunning('<html>an error page</html>'), { sha: 'abc123' })).toEqual(refusal);
});

test('smoke reports a failing /api/health once: the status, not also the commit', async () => {
  const url = await app({ '/login': 200, '/api/health': 503 });

  expect(await smoke(url, { sha: 'abc123' })).toEqual(['/api/health: HTTP 503, čakalo sa 200']);
});

test('smoke without a sha does not look at the commit', async () => {
  const url = await appRunning(health('def456'));

  expect(await smoke(url)).toEqual([]);
});

test('run takes the expected commit as its second argument and says it checked it', async () => {
  const url = await appRunning(health('abc123'));

  expect(await run([url, 'abc123'])).toEqual({ exitCode: 0, output: [`Smoke prešiel: ${url}/login 200, ${url}/api/health 200 (commit abc123)`] });
  expect(await run([url, 'def456'])).toEqual({ exitCode: 1, output: ['Smoke zlyhal:', '/api/health: commit abc123, čakalo sa def456'] });
});

test('run prints the URLs it called: a path in the base URL does not move them', async () => {
  const url = await app({ '/login': 200, '/api/health': 200 });

  // new URL('/login', base) resolves from the origin, so the pages are called, and listed, at the root.
  expect(await run([`${url}/some/prefix/`])).toEqual({ exitCode: 0, output: [`Smoke prešiel: ${url}/login 200, ${url}/api/health 200`] });
});
