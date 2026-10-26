import { expect, test } from 'vitest';
import { parseGitLog } from '../src/index.ts';

// Recorded from this repo:
//   git -c core.quotepath=false log --reverse --topo-order --name-only --format='%x1e%H%x1f%P%x1f%s'
// A commit is a record: \x1e, then "<sha>\x1f<parents>\x1f<subject>", then (for a non-merge
// commit) a blank line and one changed file per line. A merge commit prints no files.
const SHA = {
  env: '5ee8290ab600254b6361238d9ab61ef0c176d6c4',
  envImpl: '6f9c7ae895e62bbe3dfdf8b2069ee978cc8104e3',
  seed: '9c56d064c71623c2a7b8370b00d508c68a84d208',
  merge: '97fcd6d10785cc3c2310b829e4128cf2bed9f162',
};
const RECORDED =
  `\x1e${SHA.env}\x1f140d4d2a97bda5e36fb2e850240ac4336ffbdf81\x1ftest: readEnv names every missing variable and never prints a value\n` +
  '\napps/web/test/env.test.ts\n' +
  `\x1e${SHA.envImpl}\x1f${SHA.env}\x1ffeat: validate required environment variables in one place\n` +
  '\napps/web/src/env.ts\n' +
  `\x1e${SHA.seed}\x1f${SHA.envImpl}\x1ftest: seeded admin signs in, seeding is idempotent\n` +
  '\napps/web/test/seed.test.ts\napps/web/test/support/db.ts\n' +
  `\x1e${SHA.merge}\x1f24bca357c79db3402c86f3d4b6041b77f0cf6871 bbf634033cf93d641396408c511fb939462b645d\x1fMerge ticket #78: Kostra appky: admin sa prihlási a vidí menu\n`;

test('parses the recorded git log into commits with full shas, flagging merges', () => {
  expect(parseGitLog(RECORDED)).toEqual([
    {
      sha: SHA.env,
      subject: 'test: readEnv names every missing variable and never prints a value',
      files: ['apps/web/test/env.test.ts'],
    },
    {
      sha: SHA.envImpl,
      subject: 'feat: validate required environment variables in one place',
      files: ['apps/web/src/env.ts'],
    },
    {
      sha: SHA.seed,
      subject: 'test: seeded admin signs in, seeding is idempotent',
      files: ['apps/web/test/seed.test.ts', 'apps/web/test/support/db.ts'],
    },
    {
      sha: SHA.merge,
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
