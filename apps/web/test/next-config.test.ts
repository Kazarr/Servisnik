import { expect, test } from 'vitest';
import config from '../next.config.ts';

// docs/adr/0001-stack.md, "Pasce Next.js": each of these is a decision, not a default.
test('next.config keeps the ADR 0001 settings', () => {
  expect(config).toMatchObject({
    output: 'standalone',
    cacheComponents: false,
    images: { unoptimized: true },
  });
});

// The standalone build copies only the files its trace sees, and playwright-core reads browsers.json when it starts
// Chromium without any require the trace could follow: without it the printed forms answer 500 from the build that ships
// (found by e2e/job-sheet.spec.ts). Every printed form is a Route Handler two segments under /zakazky.
test('the trace of the printed forms keeps browsers.json of playwright-core', () => {
  expect(config.outputFileTracingIncludes).toEqual({ '/zakazky/*/*': ['./node_modules/playwright-core/browsers.json'] });
});
