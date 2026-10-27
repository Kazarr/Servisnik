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
