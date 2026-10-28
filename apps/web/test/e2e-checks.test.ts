import type { Page } from '@playwright/test';
import { EventEmitter } from 'node:events';
import { expect, test } from 'vitest';
import { watchPage } from '../e2e/watch-page.ts';
import { unexpectedStderr } from '../e2e/server-stderr.ts';

// The checks of the e2e tier are code too (testing-strategy): each has a case that passes and a case
// that fails, and the failing one asserts the exact list of violations.

const respond = (page: EventEmitter, status: number) =>
  page.emit('response', { status: () => status, url: () => 'http://app.test/api/health' });

test.each([500, 503, 599])('the 5xx rule reports the status and URL of a %i response', (status) => {
  const page = new EventEmitter();
  const problems = watchPage(page as unknown as Page);

  respond(page, status);

  expect(problems).toEqual([`HTTP ${status}: http://app.test/api/health`]);
});

test.each([200, 302, 404, 499])('the 5xx rule lets a %i response pass', (status) => {
  const page = new EventEmitter();
  const problems = watchPage(page as unknown as Page);

  respond(page, status);

  expect(problems).toEqual([]);
});

const logToConsole = (page: EventEmitter, type: string) => page.emit('console', { type: () => type, text: () => 'something' });

test('the console rule reports a console error with its text', () => {
  const page = new EventEmitter();
  const problems = watchPage(page as unknown as Page);

  logToConsole(page, 'error');

  expect(problems).toEqual(['console.error: something']);
});

// Playwright's names for the other levels of console.*.
test.each(['log', 'info', 'debug', 'warning'])('the console rule lets console %s pass', (type) => {
  const page = new EventEmitter();
  const problems = watchPage(page as unknown as Page);

  logToConsole(page, type);

  expect(problems).toEqual([]);
});

// Recorded from a real run: Better Auth's warning for the wrong password that login.spec.ts types, with its colour codes.
const betterAuthWarning =
  '\u001b[2m2026-10-26T21:36:33.643Z\u001b[0m \u001b[33mWARN\u001b[0m \u001b[1m[Better Auth]:\u001b[0m Invalid password';

test('the stderr filter lets the warning for a wrong password pass', () => {
  expect(unexpectedStderr(`${betterAuthWarning}\n${betterAuthWarning}\n`)).toEqual([]);
});

test('the stderr filter reports every other line, without colour codes', () => {
  const stderr = `${betterAuthWarning}\n\u001b[31mError: connect ECONNREFUSED 127.0.0.1:5432\u001b[0m\n    at connect (pg.js:1:1)\n`;

  expect(unexpectedStderr(stderr)).toEqual(['Error: connect ECONNREFUSED 127.0.0.1:5432', '    at connect (pg.js:1:1)']);
});
