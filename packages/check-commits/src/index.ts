export type Commit = { sha: string; subject: string; files: string[]; merge?: true };

// Glob forms: **/*.test.*, **/*.spec.*, e2e/**, test/** (the last two at any depth).
const TEST_FILE = /(^|\/)([^/]*\.(test|spec)\.[^/]*|(e2e|test)\/.*)$/;
const TYPE = /^(\w+)(\([^)]*\))?!?:/;

// `commits` is oldest first. Returns one "<sha> <subject>: <rule>" line per violation.
export function checkCommits(commits: Commit[]): string[] {
  const violations: string[] = [];
  let testSinceFeat = false;
  for (const { sha, subject, files, merge } of commits) {
    if (merge) continue;
    const type = TYPE.exec(subject)?.[1];
    const fail = (rule: string) => violations.push(`${sha} ${subject}: ${rule}`);
    if (type === 'feat' || type === 'fix') {
      const tests = files.filter((f) => TEST_FILE.test(f));
      if (tests.length) fail(`feat/fix changes test files: ${tests.join(', ')}`);
    }
    if (type === 'test') testSinceFeat = true;
    if (type === 'feat') {
      if (!testSinceFeat) fail('feat without a test commit since the previous feat or the branch base');
      testSinceFeat = false;
    }
  }
  return violations;
}
