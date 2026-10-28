import { readFileSync } from 'node:fs';

type Tag = { tag: string; updated_at: string };
type Image = { image?: { tag?: string } };
type App = { spec?: { name?: string }; active_deployment?: { spec?: { services?: Image[]; jobs?: Image[] } } };

// How many image tags the registry keeps after a push: the protected ones (the tag just pushed, the live one)
// and the newest others, for a rollback.
export const keep = 3;

/**
 * Tags to delete, newest first: all but `keep` of them, and never one of `protectedTags`, which count towards the `keep`.
 * `listTags` is what `doctl registry repository list-tags <repository> --output json` prints.
 */
export function tagsToDelete(listTags: string, protectedTags: string[]): string[] {
  const tags = JSON.parse(listTags) as Tag[];
  const kept = tags.filter(({ tag }) => protectedTags.includes(tag)).length;
  const others = tags
    .filter(({ tag }) => !protectedTags.includes(tag))
    .sort((a, b) => Date.parse(b.updated_at) - Date.parse(a.updated_at));
  return others.slice(Math.max(keep - kept, 0)).map(({ tag }) => tag);
}

/**
 * The image tags the active deployment of app `name` runs: [] while there is no such app or no active deployment yet.
 * Throws when there is one but no tag can be read from it: deleting on a guess could delete the live version.
 * `apps` is what `doctl apps list --output json` prints.
 */
export function liveTags(apps: string, name: string): string[] {
  const running = (JSON.parse(apps) as App[]).find((app) => app.spec?.name === name)?.active_deployment;
  if (!running) return [];
  const tags = [...(running.spec?.services ?? []), ...(running.spec?.jobs ?? [])].flatMap(({ image }) => (image?.tag ? [image.tag] : []));
  if (tags.length === 0) throw new Error(`Aktívne nasadenie appky ${name} nemá v spec tag image, nezistím, ktorý tag je živý. Nič sa nemaže.`);
  return [...new Set(tags)];
}

type Input = { current?: string; app?: string; apps?: string; tags: string };

/** What the CLI prints (one tag per line) and exits with. */
export function run({ current, app, apps, tags }: Input): { exitCode: number; output: string[] } {
  if (!current || !app || apps === undefined) {
    return { exitCode: 2, output: ['Použitie: node tools/registry-retention.ts <práve nahraný tag> <app> <výpis appiek z doctl> < výpis tagov z doctl'] };
  }
  try {
    return { exitCode: 0, output: tagsToDelete(tags, [current, ...liveTags(apps, app)]) };
  } catch (error) {
    return { exitCode: 1, output: [`::error title=Register sa nečistí::${(error as Error).message}`] };
  }
}

if (import.meta.main) {
  const [current, app, appsFile] = process.argv.slice(2);
  const { exitCode, output } = run({ current, app, apps: appsFile && readFileSync(appsFile, 'utf8'), tags: readFileSync(0, 'utf8') });
  (exitCode === 0 ? console.log : console.error)(output.join('\n'));
  process.exitCode = exitCode;
}
