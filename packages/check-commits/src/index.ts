// `parent` is the sha of the first parent; a hand-written linear list may omit it, which means
// the commit listed just before.
export type Commit = { sha: string; subject: string; files: string[]; parent?: string; merge?: true };

// Glob forms: **/*.test.*, **/*.spec.*, e2e/**, test/** (the last two at any depth).
const TEST_FILE = /(^|\/)([^/]*\.(test|spec)\.[^/]*|(e2e|test)\/.*)$/;
const TYPE = /^(\w+)(\([^)]*\))?!?:/;

// `commits` is oldest first; `allowed` shas (commits that predate the check) are skipped like merges.
// Returns one "<sha> <subject>: <rule>" line per violation.
export function checkCommits(commits: Commit[], allowed: ReadonlySet<string> = new Set()): string[] {
  const violations: string[] = [];
  // Rule 2 state after each commit: a test commit on its first-parent line since the last feat.
  // A parent outside the list is the base (or older), where nothing is tested yet.
  const testedAfter = new Map<string, boolean>();
  let previous: string | undefined;
  for (const { sha, subject, files, merge, parent = previous } of commits) {
    let tested = testedAfter.get(parent ?? '') ?? false;
    previous = sha;
    if (!merge && !allowed.has(sha)) {
      const type = TYPE.exec(subject)?.[1];
      const fail = (rule: string) => violations.push(`${sha} ${subject}: ${rule}`);
      if (type === 'feat' || type === 'fix') {
        const tests = files.filter((f) => TEST_FILE.test(f));
        if (tests.length) fail(`feat/fix changes test files: ${tests.join(', ')}`);
      }
      if (type === 'test') {
        const others = files.filter((f) => !TEST_FILE.test(f));
        if (others.length) fail(`test commit changes non-test files: ${others.join(', ')}`);
        tested = true;
      }
      if (type === 'feat') {
        if (!tested) fail('feat without a test commit since the previous feat or the branch base');
        tested = false;
      }
    }
    testedAfter.set(sha, tested);
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

// One record per commit, fields split by \x1f: parseGitLog reads exactly this format.
const LOG_FORMAT = '%x1e%H%x1f%P%x1f%s';

// Arguments for the git that prints the commits of `<base>..HEAD`: oldest first, parents before
// children, a rename as delete + add (so the old path of a moved test file is listed too).
export function gitLogArgs(base: string): string[] {
  const options = ['--reverse', '--topo-order', '--no-renames', '--name-only', `--format=${LOG_FORMAT}`];
  return ['-c', 'core.quotepath=false', 'log', ...options, `${base}..HEAD`];
}

// Parses the output of `git log --name-only --format=LOG_FORMAT`: one \x1e record per commit.
export function parseGitLog(output: string): Commit[] {
  return output
    .split('\x1e')
    .slice(1)
    .map((record) => {
      const [header = '', ...rest] = record.split('\n');
      const [sha = '', parents = '', subject = ''] = header.split('\x1f');
      const [parent = ''] = parents.split(' ');
      return {
        sha,
        parent,
        subject,
        files: rest.filter(Boolean),
        ...(parents.includes(' ') && { merge: true as const }),
      };
    });
}
