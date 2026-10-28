import { readFileSync } from 'node:fs';

type Tag = { tag: string; updated_at: string };

// How many image tags the registry keeps after a deploy: the one just deployed and the previous ones, for a rollback.
export const keep = 3;

/**
 * Tags to delete, newest first: all but `keep` of them, and never `current`, the tag just deployed.
 * `listTags` is what `doctl registry repository list-tags <repository> --output json` prints.
 */
export function tagsToDelete(listTags: string, current: string): string[] {
  const others = (JSON.parse(listTags) as Tag[])
    .filter(({ tag }) => tag !== current)
    .sort((a, b) => Date.parse(b.updated_at) - Date.parse(a.updated_at));
  return others.slice(keep - 1).map(({ tag }) => tag);
}

/** What the CLI prints (one tag per line) and exits with. */
export function run(current: string | undefined, listTags: string): { exitCode: number; output: string[] } {
  if (!current) return { exitCode: 2, output: ['Použitie: node tools/registry-retention.ts <práve nasadený tag> < výpis tagov z doctl'] };
  return { exitCode: 0, output: tagsToDelete(listTags, current) };
}

if (import.meta.main) {
  const { exitCode, output } = run(process.argv[2], readFileSync(0, 'utf8'));
  (exitCode === 0 ? console.log : console.error)(output.join('\n'));
  process.exitCode = exitCode;
}
