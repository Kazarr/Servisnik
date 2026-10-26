export type Commit = { sha: string; subject: string; files: string[]; merge?: true };

// Glob forms: **/*.test.*, **/*.spec.*, e2e/**, test/** (the last two at any depth).
const TEST_FILE = /(^|\/)([^/]*\.(test|spec)\.[^/]*|(e2e|test)\/.*)$/;
const TYPE = /^(\w+)(\([^)]*\))?!?:/;

// `commits` is oldest first; `allowed` shas (commits that predate the check) are skipped like merges.
// Returns one "<sha> <subject>: <rule>" line per violation.
export function checkCommits(commits: Commit[], allowed: ReadonlySet<string> = new Set()): string[] {
  const violations: string[] = [];
  let testSinceFeat = false;
  for (const { sha, subject, files, merge } of commits) {
    if (merge || allowed.has(sha)) continue;
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

// One "<40-hex sha> <reason>" per line; blank lines and # comments are ignored. A short sha or a
// missing reason throws, because a line that can never match would silently allow nothing.
export function parseAllowlist(text: string): Set<string> {
  const shas = new Set<string>();
  text.split('\n').forEach((line, i) => {
    if (!line.trim() || line.startsWith('#')) return;
    const match = /^([0-9a-f]{40}) \S/.exec(line);
    if (!match) throw new Error(`allowlist line ${i + 1}: expected "<40-hex sha> <reason>"`);
    shas.add(match[1]!);
  });
  return shas;
}

// Parses `git log --name-only --format='%x1e%H%x1f%P%x1f%s'`: one \x1e record per commit.
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
