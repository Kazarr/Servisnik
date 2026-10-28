import { expect, test } from 'vitest';
import { busyPercent, cpuGate } from './cpu-gate.ts';

// A run starts an implementer only while the host carries it (AGENTS.md). The gate is a check, so each
// rule has a passing and a failing example and the refusal is asserted exactly.
const minute = 60_000;
const gate = (busy: number, refusingSince: number | null = null, subagentType = 'implementer') =>
  cpuGate({ subagentType, busy, refusingSince, now: 100 * minute });

test('an implementer starts while the CPU is under the limit, and a past refusal is forgotten', () => {
  expect(gate(79, 95 * minute)).toEqual({ allow: true, refusingSince: null });
});

test('an implementer waits while the CPU is at or over the limit, and the refusal says why', () => {
  expect(gate(80)).toEqual({
    allow: false,
    refusingSince: 100 * minute,
    reason: 'CPU 80 % (limit 80 %): počkaj, kým niektorý implementer skončí, a skús znova.',
  });
});

test('the time of the first refusal is kept while the CPU stays high', () => {
  expect(gate(95, 90 * minute).refusingSince).toBe(90 * minute);
});

test('after 20 minutes of refusals one implementer starts anyway, so outside load cannot stop the run', () => {
  expect(gate(100, 80 * minute)).toEqual({ allow: true, refusingSince: null });
  expect(gate(100, 80 * minute + 1).allow).toBe(false);
});

test('other agents (reviews, exploration) are never held back', () => {
  expect(gate(100, null, 'general-purpose')).toEqual({ allow: true, refusingSince: null });
  // The main conversation's Agent calls may name no subagent type at all.
  expect(cpuGate({ subagentType: undefined as unknown as string, busy: 100, refusingSince: null, now: 0 })).toEqual({
    allow: true,
    refusingSince: null,
  });
});

test('the busy share is the non-idle time of all cores between two samples', () => {
  const core = (idle: number, user: number) => ({ times: { user, nice: 0, sys: 0, idle, irq: 0 } });
  expect(busyPercent([core(100, 100), core(100, 100)], [core(130, 170), core(130, 170)])).toBe(70);
  expect(busyPercent([core(0, 0)], [core(0, 0)])).toBe(0);
});
