import { expect, test } from 'vitest';
import { run, tagsToDelete } from './registry-retention.ts';

// The Container Registry of the Starter tier holds 500 MiB (README, "Nasadenie"), so the deploy workflow deletes
// old image tags after a deploy and collects the garbage. The input is the shape `doctl registry repository
// list-tags servisnik --output json` prints, which is the godo RepositoryTag struct; no registry exists yet to record one from.
const tag = (name: string, updatedAt: string) =>
  ({ registry_name: 'servisnik', repository: 'servisnik', tag: name, manifest_digest: `sha256:${name}`, compressed_size_bytes: 1, size_bytes: 2, updated_at: updatedAt });
const listing = (...tags: ReturnType<typeof tag>[]) => JSON.stringify(tags);

const five = listing(
  tag('b', '2026-10-02T10:00:00Z'),
  tag('e', '2026-10-05T10:00:00Z'),
  tag('a', '2026-10-01T10:00:00Z'),
  tag('d', '2026-10-04T10:00:00Z'),
  tag('c', '2026-10-03T10:00:00Z'),
);

test('the three newest tags stay, whatever order the registry lists them in, and the older ones go (newest first)', () => {
  expect(tagsToDelete(five, 'e')).toEqual(['b', 'a']);
});

test('nothing goes while the registry holds three tags or fewer', () => {
  expect(tagsToDelete(listing(tag('a', '2026-10-01T10:00:00Z'), tag('b', '2026-10-02T10:00:00Z'), tag('c', '2026-10-03T10:00:00Z')), 'c')).toEqual([]);
  expect(tagsToDelete(listing(tag('a', '2026-10-01T10:00:00Z')), 'a')).toEqual([]);
  expect(tagsToDelete('[]', 'a')).toEqual([]);
});

test('the tag just deployed stays even when the registry dates it older than the rest', () => {
  expect(tagsToDelete(five, 'a')).toEqual(['c', 'b']); // a, plus the two newest others (e, d)
});

test('run prints one tag per line and exits 0', () => {
  expect(run('e', five)).toEqual({ exitCode: 0, output: ['b', 'a'] });
  expect(run('e', '[]')).toEqual({ exitCode: 0, output: [] });
});

test('run exits 2 with the usage when it is not told which tag was just deployed: it would not know what to keep', () => {
  expect(run(undefined, five)).toEqual({ exitCode: 2, output: ['Použitie: node tools/registry-retention.ts <práve nasadený tag> < výpis tagov z doctl'] });
});
