import { afterEach, expect, test, vi } from 'vitest';
import { printError } from '../src/print-error.ts';

afterEach(() => vi.restoreAllMocks());

// Startup and the db scripts print their failure for the operator: a missing variable must read as one
// line, not as a stack, and whatever else was thrown is printed as it is.
test('an Error is printed as its message, without the stack', () => {
  const log = vi.spyOn(console, 'error').mockImplementation(() => {});

  printError(new Error('Chýbajú premenné prostredia: DATABASE_URL.'));

  expect(log.mock.calls).toEqual([['Chýbajú premenné prostredia: DATABASE_URL.']]);
});

test('something that is not an Error is printed as it is', () => {
  const log = vi.spyOn(console, 'error').mockImplementation(() => {});

  printError('boom');

  expect(log.mock.calls).toEqual([['boom']]);
});
