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

// Recorded from a real run: Chromium's console error for an image that is gone names no address, its location does.
const notFound = 'Failed to load resource: the server responded with a status of 404 (Not Found)';
const logToConsoleFrom = (page: EventEmitter, text: string, url: string) => page.emit('console', { type: () => 'error', text: () => text, location: () => ({ url }) });

test('the console rule lets the 404 of the image of the logo pass, which logo.spec.ts causes by removing it', () => {
  const page = new EventEmitter();
  const problems = watchPage(page as unknown as Page);

  logToConsoleFrom(page, notFound, 'http://127.0.0.1:3100/api/logo?v=1793380325898');

  expect(problems).toEqual([]);
});

test.each([
  ['a 404 of any other address', notFound, 'http://127.0.0.1:3100/api/logos'],
  ['a 404 of an address that only mentions the logo', notFound, 'http://127.0.0.1:3100/zakazky?next=/api/logo'],
  ['another error of the image of the logo', 'Failed to load resource: the server responded with a status of 403 (Forbidden)', 'http://127.0.0.1:3100/api/logo'],
])('the console rule reports %s', (_what, text, url) => {
  const page = new EventEmitter();
  const problems = watchPage(page as unknown as Page);

  logToConsoleFrom(page, text, url);

  expect(problems).toEqual([`console.error: ${text}`]);
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
