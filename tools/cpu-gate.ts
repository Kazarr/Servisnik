import { readFileSync, rmSync, writeFileSync } from 'node:fs';
import { cpus, tmpdir } from 'node:os';
import { join } from 'node:path';

type CpuTimes = { times: { user: number; nice: number; sys: number; idle: number; irq: number } };

// ponytail: fixed numbers, no config; make them settings when a second machine needs other ones.
const limitPercent = 80;
const starveMs = 20 * 60_000;

/** The busy share of all cores between two `os.cpus()` samples, 0–100. */
export function busyPercent(before: CpuTimes[], after: CpuTimes[]): number {
  let busy = 0;
  let total = 0;
  after.forEach(({ times }, i) => {
    const was = before[i]!.times;
    const idle = times.idle - was.idle;
    const all = times.user + times.nice + times.sys + times.idle + times.irq - (was.user + was.nice + was.sys + was.idle + was.irq);
    busy += all - idle;
    total += all;
  });
  return total === 0 ? 0 : Math.round((busy / total) * 100);
}

/**
 * Whether a `PreToolUse` call of the Agent tool may start its agent. Only an `implementer` waits, and only
 * while the CPU is at or over the limit. After 20 minutes of refusals one starts anyway, because load from
 * outside the run (the human's browser, another project's containers) would otherwise stop it for good.
 * `refusingSince` is when the current streak of refusals began, kept between calls by the CLI.
 */
export function cpuGate(input: { subagentType: string; busy: number; refusingSince: number | null; now: number }): {
  allow: boolean;
  refusingSince: number | null;
  reason?: string;
} {
  const { subagentType, busy, refusingSince, now } = input;
  if (subagentType !== 'implementer') return { allow: true, refusingSince };
  if (busy < limitPercent) return { allow: true, refusingSince: null };
  const since = refusingSince ?? now;
  if (now - since >= starveMs) return { allow: true, refusingSince: null };
  return {
    allow: false,
    refusingSince: since,
    reason: `CPU ${busy} % (limit ${limitPercent} %): počkaj, kým niektorý implementer skončí, a skús znova.`,
  };
}

if (import.meta.main) {
  const subagentType = JSON.parse(readFileSync(0, 'utf8')).tool_input?.subagent_type;
  const before = cpus();
  await new Promise((resolve) => setTimeout(resolve, 5_000));
  const state = join(tmpdir(), 'servisnik-cpu-gate.json');
  let refusingSince: number | null = null;
  try {
    refusingSince = JSON.parse(readFileSync(state, 'utf8')).refusingSince;
  } catch {}
  const decision = cpuGate({ subagentType, busy: busyPercent(before, cpus()), refusingSince, now: Date.now() });
  if (decision.refusingSince === null) rmSync(state, { force: true });
  else writeFileSync(state, JSON.stringify({ refusingSince: decision.refusingSince }));
  if (!decision.allow) {
    console.error(decision.reason);
    process.exitCode = 2;
  }
}
