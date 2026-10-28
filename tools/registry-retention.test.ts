import { expect, test } from 'vitest';
import { liveTags, run, tagsToDelete } from './registry-retention.ts';

// The Container Registry of the Starter tier holds 500 MiB (README, "Nasadenie"), so the deploy workflow deletes
// old image tags after a push and collects the garbage. The tag list is the shape `doctl registry repository
// list-tags servisnik --output json` prints (the godo RepositoryTag struct), the apps the shape `doctl apps list
// --output json` prints (the godo App struct, its active deployment carrying the spec it runs); no registry or app
// exists yet to record either from.
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

const image = (tagName: string) => ({ registry_type: 'DOCR', repository: 'servisnik', tag: tagName });
const app = (name: string, running?: { services: string[]; jobs: string[] }) => ({
  id: `id-${name}`,
  spec: { name },
  ...(running && {
    active_deployment: {
      spec: {
        name,
        services: running.services.map((tagName) => ({ name: 'web', image: image(tagName) })),
        jobs: running.jobs.map((tagName) => ({ name: 'migrate', image: image(tagName) })),
      },
    },
  }),
});
const apps = (...list: ReturnType<typeof app>[]) => JSON.stringify(list);

test('the three newest tags stay, whatever order the registry lists them in, and the older ones go (newest first)', () => {
  expect(tagsToDelete(five, ['e'])).toEqual(['b', 'a']);
});

test('nothing goes while the registry holds three tags or fewer', () => {
  expect(tagsToDelete(listing(tag('a', '2026-10-01T10:00:00Z'), tag('b', '2026-10-02T10:00:00Z'), tag('c', '2026-10-03T10:00:00Z')), ['c'])).toEqual([]);
  expect(tagsToDelete(listing(tag('a', '2026-10-01T10:00:00Z')), ['a'])).toEqual([]);
  expect(tagsToDelete('[]', ['a'])).toEqual([]);
});

test('a protected tag stays even when the registry dates it older than the rest', () => {
  expect(tagsToDelete(five, ['a'])).toEqual(['c', 'b']); // a, plus the two newest others (e, d)
});

test('the tag just pushed and the tag that is live both stay, and count towards the three', () => {
  expect(tagsToDelete(five, ['e', 'a'])).toEqual(['c', 'b']); // e and a, plus the newest other (d)
});

test('protected tags stay even when there are more of them than the registry keeps', () => {
  expect(tagsToDelete(five, ['a', 'b', 'c', 'd'])).toEqual(['e']);
});

test('the live tags are the image tags of the active deployment of the named app, services and jobs alike, each once', () => {
  expect(liveTags(apps(app('servisnik-test', { services: ['abc'], jobs: ['abc', 'abc'] })), 'servisnik-test')).toEqual(['abc']);
  expect(liveTags(apps(app('servisnik-test', { services: ['new'], jobs: ['old'] })), 'servisnik-test')).toEqual(['new', 'old']);
});

test('another app of the account is not ours: its tags are not live here', () => {
  const list = apps(app('other', { services: ['x'], jobs: [] }), app('servisnik-test', { services: ['abc'], jobs: [] }));

  expect(liveTags(list, 'servisnik-test')).toEqual(['abc']);
});

test('an app that does not exist yet, or has no active deployment yet, has no live tag', () => {
  expect(liveTags(apps(app('other', { services: ['x'], jobs: [] })), 'servisnik-test')).toEqual([]);
  expect(liveTags(apps(app('servisnik-test')), 'servisnik-test')).toEqual([]);
  expect(liveTags('[]', 'servisnik-test')).toEqual([]);
});

test('an active deployment whose image tag cannot be read is an error: guessing could delete the live version', () => {
  expect(() => liveTags(apps(app('servisnik-test', { services: [], jobs: [] })), 'servisnik-test')).toThrow('Aktívne nasadenie appky servisnik-test nemá v spec tag image');
});

const given = { current: 'e', app: 'servisnik-test', apps: apps(app('servisnik-test', { services: ['a'], jobs: ['a'] })), tags: five };

test('run prints one tag per line and exits 0: the live tag stays beside the one just pushed', () => {
  expect(run(given)).toEqual({ exitCode: 0, output: ['c', 'b'] });
  expect(run({ ...given, tags: '[]' })).toEqual({ exitCode: 0, output: [] });
});

test('run exits 2 with the usage when it is not told the tag just pushed, the app or the apps: it would not know what to keep', () => {
  const usage = { exitCode: 2, output: ['Použitie: node tools/registry-retention.ts <práve nahraný tag> <app> <výpis appiek z doctl> < výpis tagov z doctl'] };

  expect(run({ ...given, current: undefined })).toEqual(usage);
  expect(run({ ...given, app: undefined })).toEqual(usage);
  expect(run({ ...given, apps: undefined })).toEqual(usage);
});

test('run exits 1 with an error annotation and deletes nothing when the live tag cannot be read or an input is not JSON', () => {
  const noTag = run({ ...given, apps: apps(app('servisnik-test', { services: [], jobs: [] })) });
  const notJson = run({ ...given, tags: 'doctl: unauthorized' });

  expect(noTag).toEqual({
    exitCode: 1,
    output: ['::error title=Register sa nečistí::Aktívne nasadenie appky servisnik-test nemá v spec tag image, nezistím, ktorý tag je živý. Nič sa nemaže.'],
  });
  expect(notJson.exitCode).toBe(1);
  expect(notJson.output).toHaveLength(1);
  expect(notJson.output[0]).toMatch(/^::error title=Register sa nečistí::/);
});
