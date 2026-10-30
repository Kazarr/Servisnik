// The commit rules of the ticket tier (AGENTS.md), each one a mistake that came back after review:
//   1. a feat or fix changes no test file;
//   2. a feat has a test commit since the previous feat on its line of commits;
//   3. a test commit changes only test files;
//   4. a commit changes files of one workspace package (packages/<x>/, apps/<y>/): files outside the
//      packages (the root, docs/, tools/) count for none;
//   5. a fix changes behaviour that was already on the base, so a fix that changes only files added by
//      earlier commits of its own line is a feat of the same ticket.
// Rule 5 judges files, not lines. `git log --name-status` tells reliably which commit added a file, and
// the test can build exactly that. Lines would need a blame of every changed line, and a fix that only
// adds lines has no earlier author to blame, so a line-level rule would have to guess. The gap of a
// file-level rule: a fix that also touches one file of the base, or adds a file itself, passes even when
// its other files are all the ticket's own; review closes it.
//
// `parent` is the sha of the first parent; a hand-written linear list may omit it, which means
// the commit listed just before. `added` holds the files the commit created (status A), a subset of `files`.
export type Commit = {
  sha: string;
  subject: string;
  files: string[];
  added?: string[];
  parent?: string;
  merge?: true;
};

// Glob forms: **/*.test.*, **/*.spec.*, e2e/**, test/** (the last two at any depth).
const TEST_FILE = /(^|\/)([^/]*\.(test|spec)\.[^/]*|(e2e|test)\/.*)$/;
const TYPE = /^(\w+)(\([^)]*\))?!?:/;
// Glob form: packages/*/** and apps/*/**, only at the root (a file directly in packages/ is in no package).
const PACKAGE = /^((?:packages|apps)\/[^/]+)\//;

// The state a commit hands on to its children: a test commit on its first-parent line since the last feat
// (rule 2), and the files its line added (rule 5). A parent outside the list is the base (or older),
// where nothing is tested or added yet.
type Line = { tested: boolean; added: ReadonlySet<string> };
const START: Line = { tested: false, added: new Set() };

// `commits` is oldest first; `allowed` shas (commits that predate the rule they break) are skipped like merges.
// Returns one "<sha> <subject>: <rule>" line per violation.
export function checkCommits(commits: Commit[], allowed: ReadonlySet<string> = new Set()): string[] {
  const violations: string[] = [];
  const lineAfter = new Map<string, Line>();
  let previous: string | undefined;
  for (const { sha, subject, files, added: created = [], merge, parent = previous } of commits) {
    let { tested, added } = lineAfter.get(parent ?? '') ?? START;
    previous = sha;
    if (!merge && !allowed.has(sha)) {
      const type = TYPE.exec(subject)?.[1];
      const fail = (rule: string) => violations.push(`${sha} ${subject}: ${rule}`);
      // Rule 1: a feat or fix changes no test file.
      if (type === 'feat' || type === 'fix') {
        const tests = files.filter((f) => TEST_FILE.test(f));
        if (tests.length) fail(`feat/fix changes test files: ${tests.join(', ')}`);
      }
      // Rule 3: a test commit changes only test files. It still counts as the test of rule 2.
      if (type === 'test') {
        const others = files.filter((f) => !TEST_FILE.test(f));
        if (others.length) fail(`test commit changes non-test files: ${others.join(', ')}`);
        tested = true;
      }
      if (type === 'feat') {
        if (!tested) fail('feat without a test commit since the previous feat or the branch base');
        tested = false;
      }
      // Rule 4: a commit changes files of one package. A moved file lists both paths (delete + add).
      const packages = [...new Set(files.flatMap((f) => PACKAGE.exec(f)?.[1] ?? []))];
      if (packages.length > 1) fail(`commit changes more than one package: ${packages.join(', ')}`);
      // Rule 5: a fix changes more than files its own line added.
      if (type === 'fix' && files.length && files.every((f) => added.has(f))) {
        fail(`fix changes only files added earlier in this range, so it is a feat of the same ticket: ${files.join(', ')}`);
      }
      added = new Set([...added, ...created]);
    }
    lineAfter.set(sha, { tested, added });
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
// children, a rename as delete + add (so the old path of a moved test file is listed too), a status
// letter before each path (A is a file the commit created).
export function gitLogArgs(base: string): string[] {
  const options = ['--reverse', '--topo-order', '--no-renames', '--name-status', `--format=${LOG_FORMAT}`];
  return ['-c', 'core.quotepath=false', 'log', ...options, `${base}..HEAD`];
}

// Parses the output of `git log --name-status --format=LOG_FORMAT`: one \x1e record per commit, one
// "<status letter><TAB><path>" line per changed file. Any other line throws: a commit with no files
// passes every rule, so a format that parses to none (the old --name-only, a rename) must not pass silently.
export function parseGitLog(output: string): Commit[] {
  return output
    .split('\x1e')
    .slice(1)
    .map((record) => {
      const [header = '', ...rest] = record.split('\n');
      const [sha = '', parents = '', subject = ''] = header.split('\x1f');
      const [parent = ''] = parents.split(' ');
      const changes = rest.filter(Boolean).map((line) => {
        const change = /^([A-Z])\t(.+)$/.exec(line);
        if (!change) throw new Error(`git log: commit ${sha}: expected "<status><TAB><path>", got "${line}"`);
        return { status: change[1], path: change[2]! };
      });
      return {
        sha,
        parent,
        subject,
        files: changes.map((c) => c.path),
        added: changes.filter((c) => c.status === 'A').map((c) => c.path),
        ...(parents.includes(' ') && { merge: true as const }),
      };
    });
}
