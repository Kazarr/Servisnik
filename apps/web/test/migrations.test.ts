import { readdirSync, readFileSync } from 'node:fs';
import { expect, test } from 'vitest';
import { migrationProblems } from './support/migrations.ts';

// A check (testing-strategy): one list of migrations that passes, lists that fail with the exact problems, and the real folder.

test('migrations that all have a number of their own and are all in the journal are fine', () => {
  expect(migrationProblems(['0000_init.sql', '0001_customer.sql'], ['0000_init', '0001_customer'])).toEqual([]);
});

test('two migrations with the same number are reported, whatever their names', () => {
  expect(migrationProblems(['0004_customer_search_keys.sql', '0004_workshop_rates.sql'], ['0004_customer_search_keys', '0004_workshop_rates'])).toEqual([
    'number 0004 is used by 0004_customer_search_keys, 0004_workshop_rates',
  ]);
});

test('a migration that is not in the journal, and a journal entry without its file, are reported', () => {
  expect(migrationProblems(['0000_init.sql', '0001_a.sql'], ['0000_init', '0002_b'])).toEqual([
    '0001_a.sql is not in meta/_journal.json',
    '0002_b is in meta/_journal.json but has no .sql file',
  ]);
});

test('the migrations of apps/web/drizzle have no problem', () => {
  const folder = new URL('../drizzle/', import.meta.url);
  const sqlFiles = readdirSync(folder).filter((file) => file.endsWith('.sql'));
  const journal: { entries: { tag: string }[] } = JSON.parse(readFileSync(new URL('meta/_journal.json', folder), 'utf8'));

  expect(migrationProblems(sqlFiles, journal.entries.map(({ tag }) => tag))).toEqual([]);
});
