import { expect, test } from '@playwright/test';
import { spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { join } from 'node:path';
import { stripVTControlCharacters } from 'node:util';
import { watchPage } from './watch-page.ts';

// The `page` fixture of fixtures.ts is a check (testing-strategy), tested in two parts. The rules it
// applies are tested below with plain `test`, because the fixture would fail those tests: each asserts
// the exact list watchPage collects. That the fixture fails a test on a problem is tested by running
// fixture-probe/probe.ts, which uses the fixture's own `test`, as a Playwright of its own.
// The 5xx rule alone is tested in test/e2e-checks.test.ts: Chromium also logs a failed response as a
// console error, so a real 5xx always reports twice.

type Result = { status: string; errors: { message: string }[] };
type Suite = { specs?: { title: string; tests: { results: Result[] }[] }[]; suites?: Suite[] };

/** How each test of the probe ended, by title. The probe fails one test on purpose, hence no check of the exit code. */
function runProbe() {
  const cli = createRequire(import.meta.url).resolve('@playwright/test/cli');
  // This process is a Playwright worker; its variables would tell the probe it is one too.
  const env = Object.fromEntries(Object.entries(process.env).filter(([name]) => !/^(PW|PWTEST|PLAYWRIGHT|TEST_)/.test(name))) as NodeJS.ProcessEnv;
  const config = join(import.meta.dirname, 'fixture-probe/playwright.config.ts');
  const { stdout } = spawnSync(process.execPath, [cli, 'test', '--config', config], { encoding: 'utf8', env });
  const specs = (suite: Suite): NonNullable<Suite['specs']> => [...(suite.specs ?? []), ...(suite.suites ?? []).flatMap(specs)];
  const report: { suites: Suite[] } = JSON.parse(stdout);
  return Object.fromEntries(
    report.suites.flatMap(specs).map(({ title, tests }) => {
      const { status, errors } = tests[0]!.results[0]!;
      return [title, { status, errors: errors.map((error) => stripVTControlCharacters(error.message)) }];
    }),
  );
}

test('the page fixture passes a clean page and fails a test on a console error, naming it', () => {
  const outcomes = runProbe();

  expect(outcomes['clean page']).toEqual({ status: 'passed', errors: [] });
  const failed = outcomes['page with a console error']!;
  expect(failed.status).toBe('failed');
  expect(failed.errors).toHaveLength(1);
  const message = failed.errors[0]!;
  expect(message).toContain('the page reported errors');
  expect(message.match(/^\+ {3}".*",$/gm)).toEqual(['+   "console.error: boom",']);
});

test.describe('watchPage reports', () => {
  test('nothing for a clean page', async ({ page }) => {
    const problems = watchPage(page);

    await page.goto('/login');

    expect(problems).toEqual([]);
  });

  test('a console error', async ({ page }) => {
    const problems = watchPage(page);
    await page.goto('/login');

    await page.evaluate(() => console.error('boom'));

    await expect.poll(() => problems).toEqual(['console.error: boom']);
  });

  test('an uncaught page exception', async ({ page }) => {
    const problems = watchPage(page);
    await page.goto('/login');

    await page.evaluate(() => setTimeout(() => {
      throw new Error('boom');
    }));

    await expect.poll(() => problems).toEqual(['pageerror: boom']);
  });

  test('an HTTP 5xx', async ({ page, baseURL }) => {
    const problems = watchPage(page);
    await page.route('**/api/health', (route) => route.fulfill({ status: 503, body: 'down' }));

    await page.goto('/api/health');

    await expect
      .poll(() => problems)
      .toEqual([
        `HTTP 503: ${baseURL}/api/health`,
        'console.error: Failed to load resource: the server responded with a status of 503 (Service Unavailable)',
      ]);
  });
});
