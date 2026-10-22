import { readFileSync } from 'node:fs';
import { expect, test } from 'vitest';

// ADR 0001: the domain runs without framework, database or network. With pnpm an undeclared
// package does not resolve, so a dependency-free package.json keeps those imports out.
test('domain has no runtime dependencies', () => {
  const pkg = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'));
  expect(pkg.dependencies ?? {}).toEqual({});
});
