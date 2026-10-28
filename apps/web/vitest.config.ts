import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    name: 'web',
    include: ['test/**/*.test.ts'],
    // One PostgreSQL container per run; test/support/db.ts hands each test file its own database.
    globalSetup: ['test/support/global-setup.ts'],
    // Better Auth loads next/headers itself; inlined, a test can stand in for it (test/password.test.ts).
    server: { deps: { inline: ['better-auth'] } },
    testTimeout: 30_000,
    hookTimeout: 120_000,
  },
});
