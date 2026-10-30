// The commit rules of the ticket tier (AGENTS.md), each one a mistake that came back after review:
//   1. a feat or fix changes no test file;
//   2. a feat has a test commit since the previous feat on its line of commits;
//   3. a test commit changes only test files;
//   4. a commit changes files of at most one workspace package (packages/<x>/, apps/<y>/): any path outside
//      packages/* and apps/* counts for none, so a commit with no package file passes;
//   5. a fix changes behaviour that was already on the base, so a fix that changes only files its own
//      first-parent line added is a feat of the same ticket.
// Rule 5 judges files, not lines. `git log --name-status` tells reliably which commit added a file, and
// the test can build exactly that. Lines would need a blame of every changed line, and a fix that only
// adds lines has no earlier author to blame, so a line-level rule would have to guess. The gap of a
// file-level rule: a fix that also touches one file of the base, or adds a file itself, passes even when
// its other files are all the ticket's own; review closes it.
// A moved file is no added file: git prints a move as one R line with both paths and no A, so a file of the
// base that a refactor moved stays the base's and a fix of it passes, while a file its own line added stays
// its own under the new path. Git detects a move only above 50% similarity and within diff.renameLimit; a
// move it misses reads as delete + add, and a fix of that file is flagged as a feat of the same ticket.
// Rule 5 also assumes that a ticket lands on its base through a merge commit (the run merges with --no-ff),
// so the files a merged ticket added belong to no line but its own. A fast-forward would put them on the
// line that receives them, and a later fix of them there would be flagged as a feat.
//
// `parent` is the sha of the first parent; a hand-written linear list may omit it, which means
// the commit listed just before. `added` holds the files the commit created (status A) and `moves` the
// [old path, new path] pairs it moved (status R), both parts of `files`, which lists the two paths of a move.
export type Commit = {
  sha: string;
  subject: string;
  files: string[];
  added?: string[];
  moves?: [from: string, to: string][];
  parent?: string;
  merge?: true;
};

// Glob forms: **/*.test.*, **/*.spec.*, e2e/**, test/** (the last two at any depth).
const TEST_FILE = /(^|\/)([^/]*\.(test|spec)\.[^/]*|(e2e|test)\/.*)$/;
const TYPE = /^(\w+)(\([^)]*\))?!?:/;
// Glob form: packages/*/** and apps/*/**, only at the root (a file directly in packages/ is in no package).
const PACKAGE = /^((?:packages|apps)\/[^/]+)\//;

// The state a commit hands on to its children: a test commit on its first-parent line since the last feat
// (rule 2), and the files its line owns, those it added and the new paths of those it moved (rule 5). A parent
// outside the list is the base (or older), where nothing is tested or owned yet.
type Line = { tested: boolean; owned: ReadonlySet<string> };
const START: Line = { tested: false, owned: new Set() };

// `commits` is oldest first; `allowed` shas (commits that predate the rule they break) are skipped like merges.
// Returns one "<sha> <subject>: <rule>" line per violation.
export function checkCommits(commits: Commit[], allowed: ReadonlySet<string> = new Set()): string[] {
  const violations: string[] = [];
  const lineAfter = new Map<string, Line>();
  let previous: string | undefined;
  for (const { sha, subject, files, added = [], moves = [], merge, parent = previous } of commits) {
    let { tested, owned } = lineAfter.get(parent ?? '') ?? START;
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
      // Rule 4: a commit changes files of at most one package. A moved file lists both paths.
      const packages = [...new Set(files.flatMap((f) => PACKAGE.exec(f)?.[1] ?? []))];
      if (packages.length > 1) fail(`commit changes more than one package: ${packages.join(', ')}`);
      // Rule 5: a fix changes more than files its own line owns.
      if (type === 'fix' && files.length && files.every((f) => owned.has(f))) {
        fail(`fix changes only files its own first-parent line added, so it is a feat of the same ticket: ${files.join(', ')}`);
      }
      // A move hands the ownership of the old path on to the new one; a file of the base stays the base's.
      owned = new Set([...owned, ...added, ...moves.flatMap(([from, to]) => (owned.has(from) ? [to] : []))]);
    }
    lineAfter.set(sha, { tested, owned });
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
// children, a move as one line with both paths (so the old path of a moved test file is listed too), a
// status letter before each path (A is a file the commit created).
export function gitLogArgs(base: string): string[] {
  const options = ['--reverse', '--topo-order', '-M', '--name-status', `--format=${LOG_FORMAT}`];
  return ['-c', 'core.quotepath=false', 'log', ...options, `${base}..HEAD`];
}

// The two forms of a changed-file line of `git log --name-status`: "<status letter><TAB><path>" and, for a
// move, "R<three-digit score><TAB><old path><TAB><new path>". git quotes a path with a tab in it.
const CHANGE = /^([A-Z])\t([^\t]+)$/;
const MOVE = /^R\d{3}\t([^\t]+)\t([^\t]+)$/;

// Parses the output of `git log --name-status --format=LOG_FORMAT`: one \x1e record per commit, one
// CHANGE or MOVE line per changed file. Any other line throws: a commit with no files passes every
// rule, so a format that parses to none (the old --name-only) or to the wrong ones must not pass silently.
export function parseGitLog(output: string): Commit[] {
  return output
    .split('\x1e')
    .slice(1)
    .map((record) => {
      const [header = '', ...rest] = record.split('\n');
      const [sha = '', parents = '', subject = ''] = header.split('\x1f');
      const [parent = ''] = parents.split(' ');
      const files: string[] = [];
      const added: string[] = [];
      const moves: [string, string][] = [];
      for (const line of rest.filter(Boolean)) {
        const [, from, to] = MOVE.exec(line) ?? [];
        const [, status, path] = CHANGE.exec(line) ?? [];
        if (from && to) {
          files.push(from, to);
          moves.push([from, to]);
        } else if (status && path) {
          files.push(path);
          if (status === 'A') added.push(path);
        } else {
          throw new Error(`git log: commit ${sha}: expected "<status><TAB><path>" or "R<score><TAB><old path><TAB><new path>", got "${line}"`);
        }
      }
      return { sha, parent, subject, files, added, moves, ...(parents.includes(' ') && { merge: true as const }) };
    });
}
