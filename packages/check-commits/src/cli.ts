// Ticket tier of verify (AGENTS.md): checks the commits of this branch past CHECK_COMMITS_BASE.
import { execFileSync } from 'node:child_process';
import { checkCommits, parseGitLog } from './index.ts';

const base = process.env.CHECK_COMMITS_BASE || 'origin/main';
const range = `${base}..HEAD`;
let log: string;
try {
  log = execFileSync(
    'git',
    ['-c', 'core.quotepath=false', 'log', '--reverse', '--topo-order', '--name-only', '--format=%x1e%h%x1f%p%x1f%s', range],
    { encoding: 'utf8', stdio: ['ignore', 'pipe', 'inherit'] },
  );
} catch {
  console.error(`check-commits: cannot read ${range} (fetch the base ref, in CI with fetch-depth: 0)`);
  process.exit(2);
}
const violations = checkCommits(parseGitLog(log));
if (violations.length) {
  console.error(`check-commits: ${violations.length} violation(s) in ${range}\n${violations.join('\n')}`);
  process.exit(1);
}
console.log(`check-commits: ${range} ok`);
