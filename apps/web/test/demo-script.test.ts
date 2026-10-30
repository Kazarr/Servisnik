import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { expect, test } from 'vitest';
import { demoRefusal } from '../src/demo.ts';

// `pnpm db:demo` replaces the details of the autoservis and the logo and sets the Termíny of the demo Zákazky, so against a database
// that is not the demo's it would overwrite real data. It runs only when it is told to, with DEMO=1, and otherwise says how to run it.

const how = "$env:DEMO='1'; pnpm db:demo";

test.each([
  ['nothing', {}],
  ['an empty value', { DEMO: '' }],
  ['0', { DEMO: '0' }],
  ['true', { DEMO: 'true' }],
  ['1 with a space', { DEMO: ' 1' }],
])('db:demo is refused when DEMO is %s, and the refusal says how to run it', (_what, env) => {
  expect(demoRefusal(env)).toContain(how);
});

test('db:demo runs when DEMO is 1', () => {
  expect(demoRefusal({ DEMO: '1' })).toBeNull();
});

test('the script refuses before it opens the database, and ends with an error', () => {
  const appDirectory = fileURLToPath(new URL('..', import.meta.url));
  const { DEMO: _kept, ...env } = process.env;

  // A database that nothing listens on: had the script gone on, the one thing it would have said is that it cannot connect to it.
  const run = spawnSync(process.execPath, ['scripts/demo.ts'], { cwd: appDirectory, env: { ...env, DATABASE_URL: 'postgres://nobody:nothing@127.0.0.1:1/none' }, encoding: 'utf8' });

  expect(run.stderr).toContain(how);
  expect(run.stdout).toBe('');
  expect(run.status).toBe(1);
});
