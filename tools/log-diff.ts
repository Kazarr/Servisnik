import { readFileSync } from 'node:fs';

// Deploy workflow, after the smoke: `node tools/log-diff.ts <log before> <log after>`, two run logs of the service
// (`doctl apps logs <app> web --type run`). Errors are found by a word, not by a log format nobody has recorded yet.
const timestamp = /\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}:\d{2}(?:\.\d+)?Z?/g;
const isError = /fatal|error|unhandled|uncaught/i;

const errorLines = (log: string) => new Set(log.split('\n').filter((line) => isError.test(line)).map((line) => line.replace(timestamp, '').trim()));

/** The error lines of `after` that `before` does not have, each once, without their timestamps. */
export function newErrors(before: string, after: string): string[] {
  const known = errorLines(before);
  return [...errorLines(after)].filter((line) => !known.has(line));
}

/** What the CLI prints and exits with. The text of the errors stays out of it: the workflow log of a public repository is public. */
export function run(before: string, after: string): { exitCode: number; output: string[] } {
  const fresh = newErrors(before, after);
  if (fresh.length === 0) return { exitCode: 0, output: ['V logu služby po nasadení nepribudla žiadna nová chyba.'] };
  const how = 'Ich text sa do verejného logu nevypisuje, prečítaj ich cez `doctl apps logs <app> <služba> --type run`.';
  return { exitCode: 1, output: [`::error title=Nové chyby v logu služby::Po nasadení pribudlo v logu služby nových riadkov s chybou: ${fresh.length}. ${how}`] };
}

if (import.meta.main) {
  const [before, after] = process.argv.slice(2).map((file) => readFileSync(file, 'utf8'));
  const { exitCode, output } = run(before!, after!);
  (exitCode === 0 ? console.log : console.error)(output.join('\n'));
  process.exitCode = exitCode;
}
