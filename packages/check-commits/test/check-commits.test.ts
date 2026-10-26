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

// Rule 2 follows first parents: a commit starts from the state of its first parent, not from
// whatever `git log --topo-order --reverse` happened to list just before it. `parent` is the
// first parent's sha; a parent that is not in the list is the base (nothing tested yet).
const on = (parent: string, c: Commit): Commit => ({ ...c, parent });

test('a ticket branch that merges its base mid-branch keeps its own test (run -> main shape)', () => {
  // main..run lists, oldest first: test b1, then A (merged into run), then B merging run back in.
  expect(
    checkCommits([
      on('base', commit('b1', 'test: b1', ['test/b1.test.ts'])),
      on('base', commit('a1', 'test: a', ['test/a.test.ts'])),
      on('a1', commit('a2', 'feat: a', ['src/a.ts'])),
      on('base', commit('mA', 'Merge A', [], true)),
      on('b1', commit('mB', 'Merge run into B', [], true)),
      on('mB', commit('b2', 'feat: b1', ['src/b1.ts'])),
    ]),
  ).toEqual([]);
});

test('a test that reaches a branch only through a merge does not satisfy the branch feat', () => {
  expect(
    checkCommits([
      on('base', commit('b1', 'docs: b', ['README.md'])),
      on('base', commit('a1', 'test: a', ['test/a.test.ts'])),
      on('b1', commit('mB', 'Merge run into B', [], true)),
      on('mB', commit('b2', 'feat: b', ['src/b.ts'])),
    ]),
  ).toEqual([`b2 feat: b: ${NO_TEST}`]);
});

test('a feat on one line neither spends nor borrows the test of another line', () => {
  // x: test, feat. y: feat with no test of its own, listed between the two x commits.
  expect(
    checkCommits([
      on('base', commit('x1', 'test: x', ['test/x.test.ts'])),
      on('base', commit('y1', 'feat: y', ['src/y.ts'])),
      on('x1', commit('x2', 'feat: x', ['src/x.ts'])),
    ]),
  ).toEqual([`y1 feat: y: ${NO_TEST}`]);
});

test('an allowlisted commit passes the state of its line on unchanged', () => {
  expect(
    checkCommits(
      [
        on('base', commit('t1', 'test: x', ['test/x.test.ts'])),
        on('t1', commit('old', 'feat: predates the check', ['src/old.ts'])),
        on('old', commit('f1', 'feat: x', ['src/x.ts'])),
      ],
      new Set(['old']),
    ),
  ).toEqual([]);
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
