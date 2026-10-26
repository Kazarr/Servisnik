import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    name: 'web',
    include: ['test/**/*.test.ts'],
    // One PostgreSQL container per run; test/support/db.ts hands each test file its own database.
    globalSetup: ['test/support/global-setup.ts'],
    testTimeout: 30_000,
    hookTimeout: 120_000,
  },
});
