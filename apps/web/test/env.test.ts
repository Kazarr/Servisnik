import { expect, test } from 'vitest';
import { readEnv } from '../src/env.ts';

test('readEnv returns the requested variables', () => {
  const env = readEnv({ DATABASE_URL: 'postgres://db', BETTER_AUTH_SECRET: 's3cret', OTHER: 'x' }, [
    'DATABASE_URL',
    'BETTER_AUTH_SECRET',
  ]);
  expect(env).toEqual({ DATABASE_URL: 'postgres://db', BETTER_AUTH_SECRET: 's3cret' });
});

test('readEnv names every missing or empty variable in one message and never prints a value', () => {
  const run = () =>
    readEnv({ DATABASE_URL: 'postgres://user:hunter2@db/x', BETTER_AUTH_SECRET: '' }, [
      'DATABASE_URL',
      'BETTER_AUTH_SECRET',
      'ADMIN_EMAIL',
    ]);
  expect(run).toThrowError(/BETTER_AUTH_SECRET.*ADMIN_EMAIL|ADMIN_EMAIL.*BETTER_AUTH_SECRET/);
  expect(run).not.toThrowError(/DATABASE_URL|hunter2/);
});
