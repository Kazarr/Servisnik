import { loadEnvConfig } from '@next/env';
import type { NextConfig } from 'next';
import { fileURLToPath } from 'node:url';

const repoRoot = fileURLToPath(new URL('../..', import.meta.url));

// Next reads .env files from apps/web only; the repo keeps its single .env at the root (README).
loadEnvConfig(repoRoot);

// Settings from docs/adr/0001-stack.md, "Pasce Next.js".
const config: NextConfig = {
  output: 'standalone',
  cacheComponents: false,
  images: { unoptimized: true },
  outputFileTracingRoot: repoRoot, // the standalone build must trace workspace packages
};

export default config;
