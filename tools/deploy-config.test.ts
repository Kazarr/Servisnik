import { readFileSync } from 'node:fs';
import { expect, test } from 'vitest';

// Spec #77, "Nasadenie". Nothing here deploys: a cloud account, a token and a person are needed for
// that. These tests hold the files that drive a deploy to what the ticket and the research decided,
// and the image itself is proven by building and running it (README, "Nasadenie").
const read = (path: string) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');

test('the image is Debian-based node:24-slim and runs as a non-root user', () => {
  const dockerfile = read('Dockerfile');
  const bases = [...dockerfile.matchAll(/^FROM\s+(\S+)/gim)].map((match) => match[1]);
  const users = [...dockerfile.matchAll(/^USER\s+(\S+)/gim)].map((match) => match[1]);

  expect(new Set(bases)).toEqual(new Set(['node:24-slim']));
  expect(users.at(-1)).toBe('node');
  expect(dockerfile.lastIndexOf('USER node')).toBeLessThan(dockerfile.lastIndexOf('CMD'));
});

test('the build context never carries .env files into the image', () => {
  const ignored = read('.dockerignore').split('\n');

  expect(ignored).toContain('.env*');
});
