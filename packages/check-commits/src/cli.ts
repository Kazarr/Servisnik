// Ticket tier of verify (AGENTS.md): checks the commits of this branch past CHECK_COMMITS_BASE.
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { checkCommits, parseAllowlist, parseGitLog } from './index.ts';

const base = process.env.CHECK_COMMITS_BASE || 'origin/main';
const range = `${base}..HEAD`;
let log: string;
try {
  log = execFileSync(
    'git',
    ['-c', 'core.quotepath=false', 'log', '--reverse', '--topo-order', '--name-only', '--format=%x1e%H%x1f%P%x1f%s', range],
    { encoding: 'utf8', stdio: ['ignore', 'pipe', 'inherit'] },
  );
} catch {
  console.error(`check-commits: cannot read ${range} (fetch the base ref, in CI with fetch-depth: 0)`);
  process.exit(2);
}
const allowed = parseAllowlist(readFileSync(new URL('../allowlist.txt', import.meta.url), 'utf8'));
const violations = checkCommits(parseGitLog(log), allowed);
if (violations.length) {
  console.error(`check-commits: ${violations.length} violation(s) in ${range}\n${violations.join('\n')}`);
  process.exit(1);
}
console.log(`check-commits: ${range} ok`);
