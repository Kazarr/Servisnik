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
