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

// Parses `git log --name-only --format='%x1e%h%x1f%p%x1f%s'`: one \x1e record per commit.
export function parseGitLog(output: string): Commit[] {
  return output
    .split('\x1e')
    .slice(1)
    .map((record) => {
      const [header = '', ...rest] = record.split('\n');
      const [sha = '', parents = '', subject = ''] = header.split('\x1f');
      return {
        sha,
        subject,
        files: rest.filter(Boolean),
        ...(parents.includes(' ') && { merge: true as const }),
      };
    });
}
