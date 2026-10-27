import { expect, test } from '@playwright/test';
import { spawn } from 'node:child_process';

test('the app stops at startup and names the missing variable', async ({ baseURL }) => {
  // The same standalone server the other specs run, but without BETTER_AUTH_SECRET.
  const server = spawn(process.execPath, ['server.js'], {
    cwd: process.env.E2E_SERVER_DIR,
    env: {
      ...process.env,
      NODE_ENV: 'production',
      HOSTNAME: '127.0.0.1',
      PORT: String(Number(new URL(baseURL!).port) + 1),
      DATABASE_URL: 'postgres://servisnik:tajne-heslo@127.0.0.1:1/servisnik',
    },
  });
  let output = '';
  server.stdout.on('data', (chunk) => (output += chunk));
  server.stderr.on('data', (chunk) => (output += chunk));

  const killer = setTimeout(() => server.kill(), 20_000);
  const exitCode = await new Promise<number | null>((resolve) => server.on('exit', resolve));
  clearTimeout(killer);

  expect(exitCode).toBe(1);
  expect(output).toContain('BETTER_AUTH_SECRET');
  expect(output).not.toContain('tajne-heslo');
});
