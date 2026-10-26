import { defineConfig } from '@playwright/test';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

// Config of the probe that fixtures.spec.ts runs as a Playwright of its own: no global setup, no server.
// Its own output directory, because the default one is the e2e run's, which the probe would clear.
export default defineConfig({
  testDir: '.',
  testMatch: 'probe.ts',
  outputDir: join(tmpdir(), 'servisnik-fixture-probe'),
  reporter: 'json',
});
