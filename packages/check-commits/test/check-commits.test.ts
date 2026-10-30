import { expect, test } from 'vitest';
import { type Commit, checkCommits } from '../src/index.ts';

// Commits are listed oldest first, as `git log --reverse` prints them.
const commit = (sha: string, subject: string, files: string[] = [], merge?: true): Commit => ({
  sha,
  subject,
  files,
  ...(merge && { merge }),
});

// `adding(c, ...added)` is c with `added` as the files it created: git prints them with the status A and parseGitLog
// lists them in `added`, besides `files`. `created` is the usual case, a commit whose files are all new.
const adding = (c: Commit, ...added: string[]): Commit => ({ ...c, added });
const created = (sha: string, subject: string, ...files: string[]) => adding(commit(sha, subject, files), ...files);
// A commit that moved `from` to `to` and changed nothing else: git prints one R line, parseGitLog lists both paths
// in `files` (the old one first), no added file, and the pair in `moves`.
const moved = (sha: string, subject: string, from: string, to: string): Commit => ({
  ...commit(sha, subject, [from, to]),
  moves: [[from, to]],
});

const NO_TEST = 'feat without a test commit since the previous feat or the branch base';
const MANY_PACKAGES = (...packages: string[]) => `commit changes more than one package: ${packages.join(', ')}`;
const SAME_TICKET = (...files: string[]) =>
  `fix changes only files its own first-parent line added, so it is a feat of the same ticket: ${files.join(', ')}`;

test('a branch that keeps test before feat and feat/fix free of test files passes', () => {
  expect(
    checkCommits([
      commit('a1', 'docs: describe the check', ['README.md']),
      commit('b2', 'test: totals add up', ['packages/domain/test/totals.test.ts']),
      created('c3', 'feat(domain): totals add up', 'packages/domain/src/totals.ts'),
      // a file that was already on the base
      commit('d4', 'fix: round totals', ['packages/domain/src/rounding.ts']),
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

test('rule 3: a test commit that changes only test files, helpers included, passes', () => {
  expect(
    checkCommits([
      commit('a1', 'test: totals', ['src/totals.test.ts', 'a/b.spec.tsx']),
      commit('b2', 'test(web): login', ['apps/web/e2e/login.spec.ts', 'e2e/helpers.ts']),
      commit('c3', 'test(web): seed', ['apps/web/test/support/db.ts', 'test/fixtures/users.json']),
      commit('d4', 'test: nothing changed'),
      // not the type `test`, so rule 3 does not apply
      commit('e5', 'Test: capitalised is not a type', ['src/x.ts']),
      commit('f6', 'tests: plural is not a type', ['src/y.ts']),
      commit('g7', 'test: a merge with a production file', ['src/z.ts'], true),
    ]),
  ).toEqual([]);
});

test('rule 3: lists every non-test file of a test commit, a moved production file included', () => {
  expect(
    checkCommits([
      // the shape of #71: a test commit that also moved a production file (a rename reads as delete + add)
      commit('a1', 'test(web): vehicle form', [
        'apps/web/src/vozidla/novy/vehicle-form.tsx',
        'apps/web/src/vozidla/vehicle-form.tsx',
        'apps/web/test/vehicle-form.test.tsx',
      ]),
      // test files and config side by side: only the config is named
      commit('b2', 'test: totals', ['src/totals.test.ts', 'vitest.config.ts', 'README.md']),
    ]),
  ).toEqual([
    'a1 test(web): vehicle form: test commit changes non-test files: apps/web/src/vozidla/novy/vehicle-form.tsx, apps/web/src/vozidla/vehicle-form.tsx',
    'b2 test: totals: test commit changes non-test files: vitest.config.ts, README.md',
  ]);
});

test('a test commit that breaks rule 3 still counts as the test before a feat: one violation, not two', () => {
  expect(
    checkCommits([
      commit('a1', 'test: totals', ['test/totals.test.ts', 'src/totals.ts']),
      commit('b2', 'feat: totals', ['src/more.ts']),
    ]),
  ).toEqual(['a1 test: totals: test commit changes non-test files: src/totals.ts']);
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

test('rule 1 holds only feat and fix, rule 2 only feat, rule 3 only test', () => {
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

test('rule 4: a commit that stays in one package passes, whatever it changes outside the packages', () => {
  expect(
    checkCommits([
      // folders and depths of one package, production and config files side by side
      commit('a1', 'docs: one package', ['packages/domain/src/a.ts', 'packages/domain/src/deep/er/b.ts', 'packages/domain/package.json']),
      commit('b2', 'test(web): one app', ['apps/web/test/a.test.ts', 'apps/web/e2e/b.spec.ts', 'apps/web/test/support/db.ts']),
      // any path outside packages/* and apps/* (the root, docs/, tools/, .github/, .claude/) belongs to no package
      commit('c3', 'chore: files outside the packages next to one package', [
        'pnpm-lock.yaml',
        'docs/adr/0002.md',
        'tools/vendor.sh',
        '.github/workflows/ci.yml',
        '.claude/skills/lesson/SKILL.md',
        'apps/web/src/a.ts',
      ]),
      commit('d4', 'docs: only files outside the packages', ['AGENTS.md', 'docs/runs/x.md']),
      // near-misses: packages/ and apps/ folders that are not at the root, and files directly in packages/ or apps/
      commit('e5', 'docs: look-alikes', ['tools/packages/a/b.ts', 'docs/apps/web/x.md', 'packages/README.md', 'apps/notes.txt']),
      commit('f6', 'chore: look-alikes next to one package', ['packages/README.md', 'apps/notes.txt', 'packages/domain/src/a.ts']),
      commit('g7', 'docs: nothing changed'),
    ]),
  ).toEqual([]);
});

test('rule 4: lists the packages of a commit that changes two or more, in order of appearance, whatever its type', () => {
  expect(
    checkCommits([
      commit('a1', 'test: domain and web', ['packages/domain/test/a.test.ts', 'apps/web/test/b.test.ts']),
      commit('b2', 'docs: three, one of them twice', ['apps/web/a.md', 'packages/domain/a.md', 'packages/check-commits/a.md', 'apps/web/b.md']),
      commit('c3', 'not a conventional subject', ['packages/domain/a.ts', 'apps/web/b.ts']),
      // the same name under packages/ and apps/ is two packages
      commit('d4', 'refactor: same name', ['packages/web/a.ts', 'apps/web/b.ts']),
      // a move between packages reads as delete + add, so both packages are named
      commit('e5', 'refactor: move a file', ['apps/web/src/a.ts', 'packages/domain/src/a.ts']),
      // a feat after its test breaks only rule 4
      commit('f6', 'test: split', ['packages/domain/test/f.test.ts']),
      commit('g7', 'feat: split', ['packages/domain/src/f.ts', 'apps/web/src/f.ts']),
    ]),
  ).toEqual([
    `a1 test: domain and web: ${MANY_PACKAGES('packages/domain', 'apps/web')}`,
    `b2 docs: three, one of them twice: ${MANY_PACKAGES('apps/web', 'packages/domain', 'packages/check-commits')}`,
    `c3 not a conventional subject: ${MANY_PACKAGES('packages/domain', 'apps/web')}`,
    `d4 refactor: same name: ${MANY_PACKAGES('packages/web', 'apps/web')}`,
    `e5 refactor: move a file: ${MANY_PACKAGES('apps/web', 'packages/domain')}`,
    `g7 feat: split: ${MANY_PACKAGES('packages/domain', 'apps/web')}`,
  ]);
});

test('rule 4 skips merge commits and allowlisted commits', () => {
  expect(
    checkCommits(
      [
        commit('a1', 'Merge ticket into run', ['packages/domain/a.ts', 'apps/web/b.ts'], true),
        commit('old', 'chore: predates the rule', ['packages/domain/a.ts', 'apps/web/b.ts']),
        commit('b2', 'chore: next', ['packages/domain/c.ts', 'apps/web/d.ts']),
      ],
      new Set(['old']),
    ),
  ).toEqual([`b2 chore: next: ${MANY_PACKAGES('packages/domain', 'apps/web')}`]);
});

test('rule 5: a fix that changes only files its own first-parent line added is a feat of the same ticket', () => {
  expect(
    checkCommits([
      commit('a1', 'test: totals', ['test/totals.test.ts']),
      created('b2', 'feat: totals', 'src/totals.ts', 'src/round.ts'),
      // the files of any earlier commit count, not only those of a feat
      created('c3', 'chore: config', 'config/app.json'),
      commit('d4', 'fix: round totals', ['src/totals.ts']),
      commit('e5', 'fix(domain)!: both files', ['src/round.ts', 'src/totals.ts']),
      // a fix that deletes a file added earlier changes nothing of the base either
      commit('f6', 'fix: drop the config', ['config/app.json']),
    ]),
  ).toEqual([
    `d4 fix: round totals: ${SAME_TICKET('src/totals.ts')}`,
    `e5 fix(domain)!: both files: ${SAME_TICKET('src/round.ts', 'src/totals.ts')}`,
    `f6 fix: drop the config: ${SAME_TICKET('config/app.json')}`,
  ]);
});

test('rule 5: a fix passes when a file it changes is from the base, when it adds a file itself, or when it changes none', () => {
  expect(
    checkCommits([
      commit('a1', 'test: a', ['test/a.test.ts']),
      created('b2', 'feat: a', 'src/a.ts'),
      commit('c3', 'fix: a and a file of the base', ['src/a.ts', 'src/base.ts']),
      // helper.ts is new in this very commit, not added earlier
      adding(commit('d4', 'fix: a and a new file', ['src/a.ts', 'src/helper.ts']), 'src/helper.ts'),
      commit('e5', 'fix: no files'),
    ]),
  ).toEqual([]);
});

test('rule 5 holds only fix: any other type may change files added earlier', () => {
  expect(
    checkCommits([
      commit('a1', 'test: a', ['test/a.test.ts']),
      created('b2', 'feat: a', 'src/a.ts'),
      commit('c3', 'refactor: tidy a', ['src/a.ts']),
      commit('d4', 'docs: a', ['src/a.ts']),
      commit('e5', 'Fix: capitalised is not a type', ['src/a.ts']),
      commit('f6', 'fixes: plural is not a type', ['src/a.ts']),
      commit('g7', 'test: more a', ['test/a.test.ts']),
      commit('h8', 'feat: more a', ['src/a.ts']),
    ]),
  ).toEqual([]);
});

// Rule 5 follows first parents like rule 2: a commit starts from what the line of its first parent added.
test('rule 5: a fix of a file that another line added passes (run -> main shape: ticket B fixes what ticket A merged)', () => {
  expect(
    checkCommits([
      on('base', commit('x1', 'test: x', ['test/x.test.ts'])),
      on('x1', created('x2', 'feat: x', 'src/x.ts')),
      on('base', commit('y1', 'fix: x from another ticket', ['src/x.ts'])),
    ]),
  ).toEqual([]);
});

test('rule 5: files that reach a branch only through a merge are not its own', () => {
  expect(
    checkCommits([
      on('base', created('a1', 'chore: a', 'src/a.ts')),
      on('base', commit('b1', 'docs: b', ['README.md'])),
      on('b1', commit('mB', 'Merge run into B', [], true)),
      on('mB', commit('b2', 'fix: a', ['src/a.ts'])),
    ]),
  ).toEqual([]);
});

test('rule 5: a ticket branch that merges its base mid-branch still owns the files it added', () => {
  expect(
    checkCommits([
      on('base', commit('b1', 'test: b', ['test/b.test.ts'])),
      on('b1', created('b2', 'feat: b', 'src/b.ts')),
      on('b2', commit('mB', 'Merge run into B', [], true)),
      on('mB', commit('b3', 'fix: b', ['src/b.ts'])),
    ]),
  ).toEqual([`b3 fix: b: ${SAME_TICKET('src/b.ts')}`]);
});

test('rule 5: merge commits and allowlisted commits add no file, and a move of theirs makes no file the line owns', () => {
  expect(
    checkCommits(
      [
        adding(commit('m1', 'Merge x', ['src/m.ts'], true), 'src/m.ts'),
        commit('f1', 'fix: m', ['src/m.ts']),
        created('own', 'chore: own', 'src/own.ts'),
        { ...moved('m2', 'Merge y', 'src/own.ts', 'src/merged.ts'), merge: true },
        commit('f2', 'fix: merged', ['src/merged.ts']),
        created('old', 'feat: predates the check', 'src/old.ts'),
        moved('old2', 'refactor: predates the check', 'src/own.ts', 'src/allowed.ts'),
        commit('f3', 'fix: old', ['src/old.ts']),
        commit('f4', 'fix: allowed', ['src/allowed.ts']),
      ],
      new Set(['old', 'old2']),
    ),
  ).toEqual([]);
});

// A move reads in git as one R line, and git prints no A for the new path: a file the base had does not become the
// branch's own by a move, so a later fix of it passes (the recorded shape: a refactor that moves a file, then a fix).
test('rule 5: a fix of a file of the base passes after the branch moved it, once or twice', () => {
  expect(
    checkCommits([
      moved('a1', 'refactor: move price', 'src/price.ts', 'src/shop/price.ts'),
      commit('b2', 'fix: price rounds half up', ['src/shop/price.ts']),
      moved('c3', 'refactor: move price again', 'src/shop/price.ts', 'src/price/index.ts'),
      commit('d4', 'fix: price rounds half down', ['src/price/index.ts', 'src/shop/price.ts']),
    ]),
  ).toEqual([]);
});

test('rule 5: a file the branch added keeps being its own after a move, once or twice, and so does a fix of it', () => {
  expect(
    checkCommits([
      commit('a1', 'test: price', ['test/price.test.ts']),
      created('b2', 'feat: price', 'src/price.ts'),
      moved('c3', 'refactor: move price', 'src/price.ts', 'src/shop/price.ts'),
      commit('d4', 'fix: price rounds half up', ['src/shop/price.ts']),
      moved('e5', 'refactor: move price again', 'src/shop/price.ts', 'src/price/index.ts'),
      commit('f6', 'fix: price rounds half down', ['src/price/index.ts']),
      // a file of the base next to the branch's own file keeps the fix legal
      commit('g7', 'fix: price and a file of the base', ['src/price/index.ts', 'README.md']),
    ]),
  ).toEqual([
    `d4 fix: price rounds half up: ${SAME_TICKET('src/shop/price.ts')}`,
    `f6 fix: price rounds half down: ${SAME_TICKET('src/price/index.ts')}`,
  ]);
});

test('rule 5: a move of a file the line did not add, next to one it did, makes only the added one its own', () => {
  expect(
    checkCommits([
      created('a1', 'chore: new', 'src/new.ts'),
      {
        ...commit('b2', 'refactor: move two', ['src/new.ts', 'src/new/index.ts', 'src/base.ts', 'src/base/index.ts']),
        moves: [
          ['src/new.ts', 'src/new/index.ts'],
          ['src/base.ts', 'src/base/index.ts'],
        ],
      },
      commit('c3', 'fix: the moved new file', ['src/new/index.ts']),
      commit('d4', 'fix: the moved file of the base', ['src/base/index.ts']),
    ]),
  ).toEqual([`c3 fix: the moved new file: ${SAME_TICKET('src/new/index.ts')}`]);
});

test('rule 5: a move on one line makes the file its own only on that line', () => {
  expect(
    checkCommits([
      on('base', created('a1', 'chore: a', 'src/a.ts')),
      on('base', commit('b1', 'docs: b', ['README.md'])),
      on('a1', moved('a2', 'refactor: move a', 'src/a.ts', 'src/shop/a.ts')),
      on('b1', commit('b2', 'fix: a from the other line', ['src/shop/a.ts'])),
      on('a2', commit('a3', 'fix: a', ['src/shop/a.ts'])),
    ]),
  ).toEqual([`a3 fix: a: ${SAME_TICKET('src/shop/a.ts')}`]);
});

test('one commit that breaks rules 4 and 5 lists rule 4 first', () => {
  expect(
    checkCommits([
      created('a1', 'chore: both', 'packages/domain/src/a.ts', 'apps/web/src/b.ts'),
      commit('b2', 'fix: both', ['packages/domain/src/a.ts', 'apps/web/src/b.ts']),
    ]),
  ).toEqual([
    `a1 chore: both: ${MANY_PACKAGES('packages/domain', 'apps/web')}`,
    `b2 fix: both: ${MANY_PACKAGES('packages/domain', 'apps/web')}`,
    `b2 fix: both: ${SAME_TICKET('packages/domain/src/a.ts', 'apps/web/src/b.ts')}`,
  ]);
});
