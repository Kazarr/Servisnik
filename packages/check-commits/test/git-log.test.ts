import { expect, test } from 'vitest';
import { parseGitLog } from '../src/index.ts';

// Excerpt of real output of
//   git -c core.quotepath=false log --reverse --topo-order --no-renames --name-status --format='%x1e%H%x1f%P%x1f%s'
// Records 1-3 are `140d4d2..9c56d06` unedited; records 4 and 5 are the unedited records of the merge commit
// 97fcd6d and of the commit bd9b673 (a moved file: A and D, with an M between), whose positions in the real log
// are later. A record is \x1e, "<sha>\x1f<parents>\x1f<subject>", then (for a non-merge commit) a blank line and
// one "<status>\t<path>" line per changed file. A merge commit prints no files.
const RECORDED = [
  '\x1e5ee8290ab600254b6361238d9ab61ef0c176d6c4\x1f140d4d2a97bda5e36fb2e850240ac4336ffbdf81\x1ftest: readEnv names every missing variable and never prints a value\n\nA\tapps/web/test/env.test.ts\n',
  '\x1e6f9c7ae895e62bbe3dfdf8b2069ee978cc8104e3\x1f5ee8290ab600254b6361238d9ab61ef0c176d6c4\x1ffeat: validate required environment variables in one place\n\nA\tapps/web/src/env.ts\n',
  '\x1e9c56d064c71623c2a7b8370b00d508c68a84d208\x1f6f9c7ae895e62bbe3dfdf8b2069ee978cc8104e3\x1ftest: seeded admin signs in, seeding is idempotent, against PostgreSQL 17 in Testcontainers\n\nA\tapps/web/test/seed.test.ts\nA\tapps/web/test/support/db.ts\nA\tapps/web/test/support/global-setup.ts\nM\tapps/web/vitest.config.ts\n',
  '\x1e97fcd6d10785cc3c2310b829e4128cf2bed9f162\x1f24bca357c79db3402c86f3d4b6041b77f0cf6871 bbf634033cf93d641396408c511fb939462b645d\x1fMerge ticket #78: Kostra appky: admin sa prihlási a vidí menu\n',
  '\x1ebd9b673d01a36e354a13781eac8f7ee6f6889dbb\x1fefd29f1a7cd4187e0bdef935a6087579bc2887ab\x1frefactor: price-fields.ts moves next to field.tsx, where the form of the Cenník will read it too\n\nA\tapps/web/src/app/(app)/price-fields.ts\nM\tapps/web/src/app/(app)/zakazky/[id]/item-form.tsx\nD\tapps/web/src/app/(app)/zakazky/[id]/price-fields.ts\nM\tapps/web/test/price-fields.test.ts\n',
].join('');

test('parses the recorded git log into commits with full shas, first parents and the files each commit added, flagging merges', () => {
  expect(parseGitLog(RECORDED)).toEqual([
    {
      sha: '5ee8290ab600254b6361238d9ab61ef0c176d6c4',
      parent: '140d4d2a97bda5e36fb2e850240ac4336ffbdf81',
      subject: 'test: readEnv names every missing variable and never prints a value',
      files: ['apps/web/test/env.test.ts'],
      added: ['apps/web/test/env.test.ts'],
    },
    {
      sha: '6f9c7ae895e62bbe3dfdf8b2069ee978cc8104e3',
      parent: '5ee8290ab600254b6361238d9ab61ef0c176d6c4',
      subject: 'feat: validate required environment variables in one place',
      files: ['apps/web/src/env.ts'],
      added: ['apps/web/src/env.ts'],
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
      // the config file was only modified
      added: ['apps/web/test/seed.test.ts', 'apps/web/test/support/db.ts', 'apps/web/test/support/global-setup.ts'],
    },
    {
      sha: '97fcd6d10785cc3c2310b829e4128cf2bed9f162',
      parent: '24bca357c79db3402c86f3d4b6041b77f0cf6871',
      subject: 'Merge ticket #78: Kostra appky: admin sa prihlási a vidí menu',
      files: [],
      added: [],
      merge: true,
    },
    {
      sha: 'bd9b673d01a36e354a13781eac8f7ee6f6889dbb',
      parent: 'efd29f1a7cd4187e0bdef935a6087579bc2887ab',
      subject: 'refactor: price-fields.ts moves next to field.tsx, where the form of the Cenník will read it too',
      // a moved file lists both paths and only the new one is added; a modified file is not added
      files: [
        'apps/web/src/app/(app)/price-fields.ts',
        'apps/web/src/app/(app)/zakazky/[id]/item-form.tsx',
        'apps/web/src/app/(app)/zakazky/[id]/price-fields.ts',
        'apps/web/test/price-fields.test.ts',
      ],
      added: ['apps/web/src/app/(app)/price-fields.ts'],
    },
  ]);
});

test('an empty log (no commits past the base) parses to no commits', () => {
  expect(parseGitLog('')).toEqual([]);
});

test('a commit that changes no files keeps an empty file list', () => {
  expect(parseGitLog('\x1eabc1234\x1fdef5678\x1fchore: empty\n')).toEqual([
    { sha: 'abc1234', parent: 'def5678', subject: 'chore: empty', files: [], added: [] },
  ]);
});

test('a root commit has an empty parent, which is never in the list', () => {
  expect(parseGitLog('\x1eabc1234\x1f\x1fchore: root\n')).toEqual([
    { sha: 'abc1234', parent: '', subject: 'chore: root', files: [], added: [] },
  ]);
});

test('a path with spaces stays whole', () => {
  expect(parseGitLog('\x1eabc1234\x1f\x1fdocs: odd\n\nA\tdocs/A B.md\n')).toEqual([
    { sha: 'abc1234', parent: '', subject: 'docs: odd', files: ['docs/A B.md'], added: ['docs/A B.md'] },
  ]);
});

// A line that is not "<one-letter status>\t<path>" would list no file, and a check that sees no file passes
// everything: the old --name-only output, a rename (R100) or a status with no path must stop the check instead.
test.each([
  ['the --name-only format', 'apps/web/src/env.ts'],
  ['a rename, which --no-renames rules out', 'R100\told.ts\tnew.ts'],
  ['a status with no path', 'A\t'],
])('a changed-file line with %s is refused, naming the commit', (_what, line) => {
  expect(() => parseGitLog(`\x1eabc1234\x1fdef5678\x1fchore: x\n\n${line}\n`)).toThrow(/abc1234/);
});
