import { defineConfig, devices } from '@playwright/test';

// `pnpm e2e` is the batch tier (AGENTS.md): e2e/global-setup.ts builds the app and runs it on a fresh
// PostgreSQL 17 container. E2E_PORT lets parallel worktrees run side by side.
const port = Number(process.env.E2E_PORT ?? 3100);

export default defineConfig({
  testDir: 'e2e',
  globalSetup: './e2e/global-setup.ts',
  reporter: 'list',
  forbidOnly: Boolean(process.env.CI),
  use: {
    baseURL: `http://127.0.0.1:${port}`,
    locale: 'sk-SK',
    trace: 'retain-on-failure',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
});
