import type { Page } from '@playwright/test';
import { EventEmitter } from 'node:events';
import { expect, test } from 'vitest';
import { watchPage } from '../e2e/page-problems.ts';
import { unexpectedStderr } from '../e2e/server-stderr.ts';

// The checks of the e2e tier are code too (testing-strategy): each has a case that passes and a case
// that fails, and the failing one asserts the exact list of violations.

const respond = (page: EventEmitter, status: number) =>
  page.emit('response', { status: () => status, url: () => 'http://app.test/api/health' });

test('the 5xx rule reports the status and URL of a 5xx response, and nothing else on the page', () => {
  const page = new EventEmitter();
  const problems = watchPage(page as unknown as Page);

  respond(page, 503);

  expect(problems).toEqual(['HTTP 503: http://app.test/api/health']);
});

test.each([200, 302, 404, 499])('the 5xx rule lets a %i response pass', (status) => {
  const page = new EventEmitter();
  const problems = watchPage(page as unknown as Page);

  respond(page, status);

  expect(problems).toEqual([]);
});

// What the app wrote to stderr in a real run: Better Auth's warning for the wrong password that login.spec.ts types, in colour.
const betterAuthWarning = '\u001b[33m2026-10-26T10:00:00.000Z WARN [Better Auth]: Invalid password\u001b[0m';

test('the stderr filter lets the warning for a wrong password pass', () => {
  expect(unexpectedStderr(`${betterAuthWarning}\n${betterAuthWarning}\n`)).toEqual([]);
});

test('the stderr filter reports every other line, without colour codes', () => {
  const stderr = `${betterAuthWarning}\n\u001b[31mError: connect ECONNREFUSED 127.0.0.1:5432\u001b[0m\n    at connect (pg.js:1:1)\n`;

  expect(unexpectedStderr(stderr)).toEqual(['Error: connect ECONNREFUSED 127.0.0.1:5432', '    at connect (pg.js:1:1)']);
});
