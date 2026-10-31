import { cpSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const migrations = fileURLToPath(new URL('../../drizzle/', import.meta.url));

/**
 * A copy of the migrations folder whose journal ends with `tag`: the database as it was before the next migration. The caller
 * migrates with it and removes the folder (`rmSync(folder, { recursive: true })`).
 */
export function migrationsUpTo(tag: string) {
  const copy = mkdtempSync(join(tmpdir(), 'migrations-'));
  cpSync(migrations, copy, { recursive: true });
  const journalFile = join(copy, 'meta', '_journal.json');
  const journal: { entries: { tag: string }[] } = JSON.parse(readFileSync(journalFile, 'utf8'));
  journal.entries = journal.entries.slice(0, journal.entries.findIndex((entry) => entry.tag === tag) + 1);
  writeFileSync(journalFile, JSON.stringify(journal));
  return copy;
}

/**
 * What is wrong with the migrations in apps/web/drizzle: `sqlFiles` are the names of its `*.sql` files
 * and `journalTags` the `tag` of each entry of meta/_journal.json. Two tickets that each generate a
 * migration get the same number; git then merges the two files, and the journal only if the entries
 * happen not to touch the same lines. Empty when all is well.
 */
export function migrationProblems(sqlFiles: readonly string[], journalTags: readonly string[]): string[] {
  const names = sqlFiles.map((file) => file.replace(/\.sql$/, '')).sort();
  const problems: string[] = [];

  const byNumber = Map.groupBy(names, (name) => name.split('_')[0]);
  for (const [number, sharing] of byNumber) {
    if (sharing.length > 1) problems.push(`number ${number} is used by ${sharing.join(', ')}`);
  }
  for (const name of names) {
    if (!journalTags.includes(name)) problems.push(`${name}.sql is not in meta/_journal.json`);
  }
  for (const tag of journalTags) {
    if (!names.includes(tag)) problems.push(`${tag} is in meta/_journal.json but has no .sql file`);
  }
  return problems;
}
