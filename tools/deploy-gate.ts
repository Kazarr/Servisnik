import { readFileSync } from 'node:fs';

type CheckRun = { name: string; status: string; conclusion: string | null };

/**
 * The deploy workflow's gate: `undefined` when every `ticket` check run of the commit succeeded,
 * otherwise why the commit must not be deployed. `checkRuns` is one JSON check run per line, as
 * `gh api .../check-runs --paginate --jq '.check_runs[]'` prints them.
 */
export function deployGate(checkRuns: string): string | undefined {
  const tickets = checkRuns
    .split('\n')
    .filter(Boolean)
    .map((line) => JSON.parse(line) as CheckRun)
    .filter((checkRun) => checkRun.name === 'ticket');
  if (tickets.length === 0) return 'Commit nemá check ticket. Nasadiť sa dá len commit so zeleným ticket.';
  for (const { status, conclusion } of tickets) {
    if (status !== 'completed') return `Check ticket tohto commitu ešte beží (${status}).`;
    if (conclusion !== 'success') return `Check ticket tohto commitu skončil ako ${conclusion}, nie success.`;
  }
}

/** What the CLI prints (one GitHub error annotation when the commit must not be deployed) and exits with. */
export function run(checkRuns: string): { exitCode: number; output: string[] } {
  const refusal = deployGate(checkRuns);
  return refusal ? { exitCode: 1, output: [`::error title=Nasadenie odmietnuté::${refusal}`] } : { exitCode: 0, output: [] };
}

if (import.meta.main) {
  const { exitCode, output } = run(readFileSync(0, 'utf8'));
  if (output.length > 0) console.error(output.join('\n'));
  process.exitCode = exitCode;
}
