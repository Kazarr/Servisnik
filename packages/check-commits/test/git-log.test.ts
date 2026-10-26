import { expect, test } from 'vitest';
import { parseGitLog } from '../src/index.ts';

// Excerpt of real output of
//   git -c core.quotepath=false log --reverse --topo-order --no-renames --name-only --format='%x1e%H%x1f%P%x1f%s'
// Records 1-3 are `140d4d2..9c56d06` unedited; record 4 is the unedited record of the merge commit
// 97fcd6d (its position in the real log is later). A record is \x1e, "<sha>\x1f<parents>\x1f<subject>",
// then (for a non-merge commit) a blank line and one changed file per line. A merge commit prints no files.
const RECORDED = [
  '\x1e5ee8290ab600254b6361238d9ab61ef0c176d6c4\x1f140d4d2a97bda5e36fb2e850240ac4336ffbdf81\x1ftest: readEnv names every missing variable and never prints a value\n\napps/web/test/env.test.ts\n',
  '\x1e6f9c7ae895e62bbe3dfdf8b2069ee978cc8104e3\x1f5ee8290ab600254b6361238d9ab61ef0c176d6c4\x1ffeat: validate required environment variables in one place\n\napps/web/src/env.ts\n',
  '\x1e9c56d064c71623c2a7b8370b00d508c68a84d208\x1f6f9c7ae895e62bbe3dfdf8b2069ee978cc8104e3\x1ftest: seeded admin signs in, seeding is idempotent, against PostgreSQL 17 in Testcontainers\n\napps/web/test/seed.test.ts\napps/web/test/support/db.ts\napps/web/test/support/global-setup.ts\napps/web/vitest.config.ts\n',
  '\x1e97fcd6d10785cc3c2310b829e4128cf2bed9f162\x1f24bca357c79db3402c86f3d4b6041b77f0cf6871 bbf634033cf93d641396408c511fb939462b645d\x1fMerge ticket #78: Kostra appky: admin sa prihlási a vidí menu\n',
].join('');

test('parses the recorded git log into commits with full shas and first parents, flagging merges', () => {
  expect(parseGitLog(RECORDED)).toEqual([
    {
      sha: '5ee8290ab600254b6361238d9ab61ef0c176d6c4',
      parent: '140d4d2a97bda5e36fb2e850240ac4336ffbdf81',
      subject: 'test: readEnv names every missing variable and never prints a value',
      files: ['apps/web/test/env.test.ts'],
    },
    {
      sha: '6f9c7ae895e62bbe3dfdf8b2069ee978cc8104e3',
      parent: '5ee8290ab600254b6361238d9ab61ef0c176d6c4',
      subject: 'feat: validate required environment variables in one place',
      files: ['apps/web/src/env.ts'],
    },
    {
      sha: '9c56d064c71623c2a7b8370b00d508c68a84d208',
      parent: '6f9c7ae895e62bbe3dfdf8b2069ee978cc8104e3',
      subject: 'test: seeded admin signs in, seeding is idempotent, against PostgreSQL 17 in Testcontainers',
      files: [
        'apps/web/test/seed.test.ts',
        'apps/web/test/support/db.ts',
        'apps/web/test/support/global-setup.ts',
        'apps/web/vitest.config.ts',
      ],
    },
    {
      sha: '97fcd6d10785cc3c2310b829e4128cf2bed9f162',
      parent: '24bca357c79db3402c86f3d4b6041b77f0cf6871',
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
    { sha: 'abc1234', parent: 'def5678', subject: 'chore: empty', files: [] },
  ]);
});

test('a root commit has an empty parent, which is never in the list', () => {
  expect(parseGitLog('\x1eabc1234\x1f\x1fchore: root\n')).toEqual([
    { sha: 'abc1234', parent: '', subject: 'chore: root', files: [] },
  ]);
});
