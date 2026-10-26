import { expect, test } from 'vitest';
import { type Commit, checkCommits } from '../src/index.ts';

// Commits are listed oldest first, as `git log --reverse` prints them.
const commit = (sha: string, subject: string, files: string[] = [], merge?: true): Commit => ({
  sha,
  subject,
  files,
  ...(merge && { merge }),
});

const NO_TEST = 'feat without a test commit since the previous feat or the branch base';

test('a branch that keeps test before feat and feat/fix free of test files passes', () => {
  expect(
    checkCommits([
      commit('a1', 'docs: describe the check', ['README.md']),
      commit('b2', 'test: totals add up', ['packages/domain/test/totals.test.ts']),
      commit('c3', 'feat(domain): totals add up', ['packages/domain/src/totals.ts']),
      commit('d4', 'fix: round totals', ['packages/domain/src/totals.ts']),
      commit('e5', 'test(web): login page', ['apps/web/e2e/login.spec.ts']),
      commit('f6', 'feat!: drop old login', ['apps/web/src/login.ts']),
    ]),
  ).toEqual([]);
});

test('lists every violation as "<sha> <subject>: <rule>"', () => {
  expect(
    checkCommits([
      // rule 2: no test since the start of the branch
      commit('a1', 'feat: first', ['src/first.ts']),
      commit('b2', 'test: second', ['test/second.test.ts']),
      // rule 1: test files in a feat, the *.test.*, *.spec.* patterns
      commit('c3', 'feat(web): second', ['src/second.ts', 'src/second.test.ts', 'a/b.spec.tsx']),
      // rule 1 in a fix, the e2e/** and test/** patterns at any depth, and rule 2 is not
      // reported because a fix needs no test before it
      commit('d4', 'fix: third', ['e2e/smoke.ts', 'apps/web/test/support/db.ts', 'src/third.ts']),
      // rule 2 only, because `feat!` is a feat
      commit('e5', 'feat!: fourth', ['src/fourth.ts']),
      // both rules on one commit
      commit('f6', 'feat: fifth', ['test/fifth.ts']),
    ]),
  ).toEqual([
    `a1 feat: first: ${NO_TEST}`,
    'c3 feat(web): second: feat/fix changes test files: src/second.test.ts, a/b.spec.tsx',
    'd4 fix: third: feat/fix changes test files: e2e/smoke.ts, apps/web/test/support/db.ts',
    `e5 feat!: fourth: ${NO_TEST}`,
    'f6 feat: fifth: feat/fix changes test files: test/fifth.ts',
    `f6 feat: fifth: ${NO_TEST}`,
  ]);
});

test('merge commits are skipped: no violation, not a test, and they do not reset an earlier test', () => {
  expect(
    checkCommits([
      commit('a1', 'test: first', ['test/first.test.ts']),
      commit('b2', "Merge branch 'run/2026-10-26' into ticket", ['test/other.test.ts'], true),
      commit('c3', 'feat: first', ['src/first.ts']),
      commit('d4', 'test: a merge with a test subject', [], true),
      commit('e5', 'feat: second', ['src/second.ts']),
      commit('f6', 'feat: a merge with test files', ['test/x.test.ts'], true),
    ]),
  ).toEqual([`e5 feat: second: ${NO_TEST}`]);
});

test('only feat and fix are held to the test file rule, only feat to the order rule', () => {
  expect(
    checkCommits([
      commit('a1', 'refactor: move totals', ['src/totals.ts', 'test/totals.test.ts']),
      commit('b2', 'docs: feat is not a type here', ['e2e/README.md']),
      commit('c3', 'Fix: capitalised is not a type', ['test/x.test.ts']),
      commit('d4', 'fix: no test needed before a fix', ['src/x.ts']),
      commit('e5', 'Feature: test files in a looks-like feat', ['test/y.test.ts']),
    ]),
  ).toEqual([]);
});
