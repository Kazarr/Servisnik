import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, expect, test } from 'vitest';

// The Dockerfile's `migrate` stage runs tools/prune-migrate.sh in node_modules/.pnpm of a production install of
// apps/web, to drop the weight of Next.js that migrating does not use. Here the store is a made-up directory
// with the names pnpm gives its entries.
const forBash = (path: string) => path.replaceAll('\\', '/');
const script = forBash(fileURLToPath(new URL('prune-migrate.sh', import.meta.url)));
const stores: string[] = [];
afterEach(() => stores.splice(0).forEach((store) => rmSync(store, { recursive: true, force: true })));

const store = (...entries: string[]) => {
  const dir = mkdtempSync(join(tmpdir(), 'pnpm-store-'));
  stores.push(dir);
  for (const entry of entries) mkdirSync(join(dir, entry, 'node_modules'), { recursive: true });
  return dir;
};
const prune = (dir: string) => {
  const { status, stdout, stderr } = spawnSync('bash', [script, forBash(dir)], { encoding: 'utf8' });
  return { status, output: stdout + stderr, left: readdirSync(dir).sort() };
};

const weight = ['next@16.4.3_react@19.2.0', '@next+swc-linux-x64-gnu@16.4.3', '@img+sharp-linux-x64@0.34.5', '@img+sharp-libvips-linux-x64@1.2.4', 'sharp@0.34.5'];
const needed = ['drizzle-orm@0.45.4_pg@8.23.1', 'pg@8.23.1', 'better-auth@1.7.13_next@16.4.3', 'react@19.2.0'];

test('the prune removes Next.js, its compiler binary and sharp, and keeps everything else', () => {
  const dir = store(...weight, ...needed);

  expect(prune(dir)).toMatchObject({ status: 0, left: [...needed].sort() });
});

test('the prune fails and names the pattern that matched nothing: pnpm renamed its entries or Next.js dropped a dependency', () => {
  const dir = store(...weight.filter((entry) => !entry.startsWith('sharp@')), ...needed);

  const { status, output } = prune(dir);

  expect(status).toBe(1);
  expect(output).toContain('sharp@*');
});
