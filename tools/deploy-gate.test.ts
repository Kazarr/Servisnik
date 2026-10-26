import { expect, test } from 'vitest';
import { deployGate } from './deploy-gate.ts';

// The deploy workflow deploys only a commit whose check `ticket` is green. The gate is a check, so it
// has one passing and one failing example per rule and asserts the exact refusal. Its input is what
// `gh api .../check-runs --paginate --jq '.check_runs[]'` prints: one JSON check run per line.
const run = (name: string, status: string, conclusion: string | null) => JSON.stringify({ name, status, conclusion });
const lines = (...runs: string[]) => runs.join('\n');

test('the gate lets a commit through when its one ticket check succeeded', () => {
  expect(deployGate(lines(run('ticket', 'completed', 'success')))).toBeUndefined();
});

test('the gate ignores other checks, even red ones', () => {
  expect(deployGate(lines(run('lint', 'completed', 'failure'), run('ticket', 'completed', 'success')))).toBeUndefined();
});

test('the gate refuses a commit that has no ticket check', () => {
  expect(deployGate('')).toBe('Commit nemá check ticket. Nasadiť sa dá len commit so zeleným ticket.');
  expect(deployGate(lines(run('lint', 'completed', 'success')))).toBe('Commit nemá check ticket. Nasadiť sa dá len commit so zeleným ticket.');
});

test('the gate refuses a failed ticket check and names the conclusion', () => {
  expect(deployGate(lines(run('ticket', 'completed', 'failure')))).toBe('Check ticket tohto commitu skončil ako failure, nie success.');
});

test('the gate refuses a ticket check that has not finished', () => {
  expect(deployGate(lines(run('ticket', 'in_progress', null)))).toBe('Check ticket tohto commitu ešte beží (in_progress).');
});

test('the gate refuses when any ticket check is not green, even if another one is', () => {
  const refusal = 'Check ticket tohto commitu skončil ako failure, nie success.';

  expect(deployGate(lines(run('ticket', 'completed', 'success'), run('ticket', 'completed', 'failure')))).toBe(refusal);
  expect(deployGate(lines(run('ticket', 'completed', 'failure'), run('ticket', 'completed', 'success')))).toBe(refusal);
});

test('the gate refuses a skipped ticket check', () => {
  expect(deployGate(lines(run('ticket', 'completed', 'skipped')))).toBe('Check ticket tohto commitu skončil ako skipped, nie success.');
});
