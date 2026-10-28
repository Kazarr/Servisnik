import { expect, test } from 'vitest';
import { type Commit, checkCommits, parseAllowlist } from '../src/index.ts';

const A = 'e54c38e6da3084e3e77ff908c43963c20d354f6d';
const B = '271f0412224e1c6bcc9aed5a7423656c229e7494';

// Violates both rules: test files in a feat, and no test commit before it.
const bad = (sha: string): Commit => ({
  sha,
  subject: 'feat: login',
  files: ['src/login.ts', 'e2e/login.spec.ts'],
});

test('a listed sha is skipped for every rule, an unlisted identical commit fails', () => {
  expect(checkCommits([bad(A)], new Set([A]))).toEqual([]);
  expect(checkCommits([bad(B)], new Set([A]))).toEqual([
    `${B} feat: login: feat/fix changes test files: e2e/login.spec.ts`,
    `${B} feat: login: feat without a test commit since the previous feat or the branch base`,
  ]);
});

test('a listed sha is skipped for rule 3 too, an unlisted identical test commit fails', () => {
  const badTest = (sha: string): Commit => ({
    sha,
    subject: 'test: login',
    files: ['test/login.test.ts', 'src/login.ts'],
  });
  expect(checkCommits([badTest(A)], new Set([A]))).toEqual([]);
  expect(checkCommits([badTest(B)], new Set([A]))).toEqual([
    `${B} test: login: test commit changes non-test files: src/login.ts`,
  ]);
});

test('a listed sha neither counts as a test nor resets the test requirement', () => {
  const test_: Commit = { sha: 'a1', subject: 'test: x', files: ['test/x.test.ts'] };
  const listedFeat: Commit = { sha: A, subject: 'feat: listed', files: ['src/a.ts'] };
  const feat: Commit = { sha: 'c3', subject: 'feat: next', files: ['src/b.ts'] };
  expect(checkCommits([test_, listedFeat, feat], new Set([A]))).toEqual([]);
  expect(checkCommits([listedFeat, feat], new Set([A]))).toEqual([
    'c3 feat: next: feat without a test commit since the previous feat or the branch base',
  ]);
});

test('parses "<40-hex sha> <reason>" lines, ignoring blank lines and # comments', () => {
  expect(
    parseAllowlist(
      [
        '# Commits that predate the check.',
        '',
        `${A} #78: feat after feat, e2e files in feat`,
        `${B} #78: feat after feat`,
        '',
      ].join('\n'),
    ),
  ).toEqual(new Set([A, B]));
  expect(parseAllowlist('')).toEqual(new Set());
});

test('rejects a line that is not a full sha followed by a reason', () => {
  expect(() => parseAllowlist('e54c38e #78: short sha never matches')).toThrow(
    'allowlist line 1: expected "<40-hex sha> <reason>"',
  );
  expect(() => parseAllowlist(`# ok\n${A}`)).toThrow('allowlist line 2: expected "<40-hex sha> <reason>"');
  expect(() => parseAllowlist(`${A.toUpperCase()} upper case sha`)).toThrow('allowlist line 1');
  expect(() => parseAllowlist(`${A} `)).toThrow('allowlist line 1');
  expect(() => parseAllowlist(`junk ${A} the sha is not at the start`)).toThrow('allowlist line 1');
});
