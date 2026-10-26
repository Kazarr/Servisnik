import { expect, test } from 'vitest';
import { parseGitLog } from '../src/index.ts';

// Recorded from this repo:
//   git -c core.quotepath=false log --reverse --topo-order --name-only --format='%x1e%h%x1f%p%x1f%s'
// A commit is a record: \x1e, then "<sha>\x1f<parents>\x1f<subject>", then (for a non-merge
// commit) a blank line and one changed file per line. A merge commit prints no files.
const RECORDED =
  '\x1e5ee8290\x1f140d4d2\x1ftest: readEnv names every missing variable and never prints a value\n' +
  '\napps/web/test/env.test.ts\n' +
  '\x1e6f9c7ae\x1f5ee8290\x1ffeat: validate required environment variables in one place\n' +
  '\napps/web/src/env.ts\n' +
  '\x1e9c56d06\x1f6f9c7ae\x1ftest: seeded admin signs in, seeding is idempotent\n' +
  '\napps/web/test/seed.test.ts\napps/web/test/support/db.ts\n' +
  '\x1e97fcd6d\x1f24bca35 bbf6340\x1fMerge ticket #78: Kostra appky: admin sa prihlási a vidí menu\n';

test('parses the recorded git log into commits, flagging merges', () => {
  expect(parseGitLog(RECORDED)).toEqual([
    {
      sha: '5ee8290',
      subject: 'test: readEnv names every missing variable and never prints a value',
      files: ['apps/web/test/env.test.ts'],
    },
    {
      sha: '6f9c7ae',
      subject: 'feat: validate required environment variables in one place',
      files: ['apps/web/src/env.ts'],
    },
    {
      sha: '9c56d06',
      subject: 'test: seeded admin signs in, seeding is idempotent',
      files: ['apps/web/test/seed.test.ts', 'apps/web/test/support/db.ts'],
    },
    {
      sha: '97fcd6d',
      subject: 'Merge ticket #78: Kostra appky: admin sa prihlási a vidí menu',
      files: [],
      merge: true,
    },
  ]);
});

test('an empty log (no commits past the base) parses to no commits', () => {
  expect(parseGitLog('')).toEqual([]);
});

test('a commit that changes no files keeps an empty file list', () => {
  expect(parseGitLog('\x1eabc1234\x1fdef5678\x1fchore: empty\n')).toEqual([
    { sha: 'abc1234', subject: 'chore: empty', files: [] },
  ]);
});
