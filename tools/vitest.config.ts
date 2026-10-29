import { defineConfig } from 'vitest/config';

// 30 s is the limit of a test of the tools that reads files or runs one small script. A test that needed more carries its
// own, sized from its measured work: the ones of deploy-config.test.ts that run workflow steps, a bash, a fake doctl and
// more processes per run (#134).
export default defineConfig({ test: { name: 'tools', testTimeout: 30_000 } });
