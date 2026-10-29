import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { afterAll, beforeAll, expect, test } from 'vitest';
import { checkCommits, gitLogArgs, parseGitLog } from '../src/index.ts';

test('gitLogArgs reads <base>..HEAD oldest first, parents before children, renames as delete + add', () => {
  expect(gitLogArgs('origin/main')).toEqual([
    '-c',
    'core.quotepath=false',
    'log',
    '--reverse',
    '--topo-order',
    '--no-renames',
    '--name-only',
    '--format=%x1e%H%x1f%P%x1f%s',
    'origin/main..HEAD',
  ]);
});

// The same arguments against a real repository: what git prints is what parseGitLog and the rules see.
let dir: string;
const git = (...args: string[]) => execFileSync('git', args, { cwd: dir, encoding: 'utf8' }).trim();
const write = (file: string) => {
  mkdirSync(dirname(join(dir, file)), { recursive: true });
  writeFileSync(join(dir, file), `${file}\n`);
};
const commit = (subject: string, ...files: string[]) => {
  files.forEach(write);
  git('add', '-A');
  git('commit', '-q', '-m', subject);
  return git('rev-parse', 'HEAD');
};
const merge = (branch: string, subject: string) => git('merge', '-q', '--no-ff', '-m', subject, branch);
const check = (base: string) => checkCommits(parseGitLog(git(...gitLogArgs(base))));

// The real work is git processes: nine in the hook (init, five config, add, commit, rev-parse), about a second on an idle
// Windows machine, and one to four seconds for each test below (a branch, some commits, a merge). With two `pnpm verify` at
// once (#134) the hook ran past its 10 s default and a test past 30 s, so all of them have 80 s: twenty times the 4 s of the
// slowest idle test (3.9 s measured).
const gitWork = 80_000;

beforeAll(() => {
  dir = mkdtempSync(join(tmpdir(), 'check-commits-'));
  git('init', '-q', '-b', 'trunk');
  git('config', 'user.name', 'test');
  git('config', 'user.email', 'test@example.com');
  git('config', 'commit.gpgsign', 'false');
  git('config', 'core.autocrlf', 'false');
  git('config', 'core.hooksPath', join(dir, 'no-hooks'));
  commit('chore: base', 'README.md');
}, gitWork);

afterAll(() => rmSync(dir, { recursive: true, force: true, maxRetries: 3 }));

test('a feat that renames a test file out of the test patterns is flagged by the old path', { timeout: gitWork }, () => {
  git('checkout', '-q', '-b', 'rename', 'trunk');
  commit('test: add c', 'test/c.test.ts');
  mkdirSync(join(dir, 'src'));
  git('mv', 'test/c.test.ts', 'src/c.ts.off');
  const sha = commit('feat: move c');
  expect(check('trunk')).toEqual([`${sha} feat: move c: feat/fix changes test files: test/c.test.ts`]);
});

test('a test commit that moves a production file into test/ is flagged by the old path', { timeout: gitWork }, () => {
  git('checkout', '-q', '-b', 'move-prod', 'trunk');
  commit('chore: add helper', 'src/helper.ts');
  mkdirSync(join(dir, 'test'), { recursive: true });
  git('mv', 'src/helper.ts', 'test/helper.test.ts');
  const sha = commit('test: move helper');
  expect(check('trunk')).toEqual([`${sha} test: move helper: test commit changes non-test files: src/helper.ts`]);
});

test('a ticket branch that merges its base mid-branch passes on the run -> main range', { timeout: gitWork }, () => {
  git('checkout', '-q', '-b', 'a', 'trunk');
  commit('test: a', 'test/a.test.ts');
  commit('feat: a', 'src/a.ts');
  git('checkout', '-q', '-b', 'b', 'trunk');
  commit('test: b1', 'test/b1.test.ts');
  git('checkout', '-q', '-b', 'run', 'trunk');
  merge('a', 'Merge A');
  git('checkout', '-q', 'b');
  merge('run', 'Merge run into B');
  commit('feat: b1', 'src/b1.ts');
  git('checkout', '-q', 'run');
  merge('b', 'Merge B');
  expect(check('trunk')).toEqual([]);
});
