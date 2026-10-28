import { defineConfig } from 'vitest/config';

// The deploy tests run workflow steps as they are: a bash, a fake doctl and a node per step, seconds on a busy Windows machine.
export default defineConfig({ test: { name: 'tools', testTimeout: 30_000 } });
