import { expect, test } from 'vitest';
import { newErrors, run } from './log-diff.ts';

// The deploy workflow compares the run log of the service before the deploy with the one after it
// (README, "Čo workflow robí"). The lines below are made up in the shape `doctl apps logs <app> web --type run`
// prints them (a timestamp, then the message of the app): no deployed app has run yet to record real ones.
const at = (time: string, message: string) => `2026-10-28T${time}Z ${message}`;
const log = (...lines: string[]) => lines.join('\n');

const refused = at('10:00:01.000', 'Error: connect ECONNREFUSED 10.0.0.1:25060');
const before = log(at('10:00:00.100', '▲ Next.js 16.4.3'), refused, at('10:00:02.000', 'GET /login 200'));

test('an error line that the earlier log does not have is new', () => {
  const after = log(at('11:00:00.000', '▲ Next.js 16.4.3'), at('11:00:03.000', 'TypeError: x is not a function'));

  expect(newErrors(before, after)).toEqual(['TypeError: x is not a function']);
});

test('an error the earlier log already had is not new, whatever time it was logged at', () => {
  const after = log(at('11:00:01.123', 'Error: connect ECONNREFUSED 10.0.0.1:25060'));

  expect(newErrors(before, after)).toEqual([]);
});

test('a new line that is no error is not an error', () => {
  expect(newErrors(before, log(at('11:00:00.000', 'GET /api/health 200'), at('11:00:01.000', 'Ready in 412ms')))).toEqual([]);
});

test('fatal, unhandled and uncaught lines count as errors, in any case', () => {
  const after = log(at('11:00:00.000', 'FATAL: out of memory'), at('11:00:01.000', 'Unhandled Rejection: boom'), at('11:00:02.000', 'uncaughtException: boom'));

  expect(newErrors('', after)).toEqual(['FATAL: out of memory', 'Unhandled Rejection: boom', 'uncaughtException: boom']);
});

test('without an earlier log every error is new, and a repeated one is listed once', () => {
  expect(newErrors('', log(refused, at('10:00:09.000', 'Error: connect ECONNREFUSED 10.0.0.1:25060')))).toEqual(['Error: connect ECONNREFUSED 10.0.0.1:25060']);
});

test('run exits 0 and says so when the deploy added no error', () => {
  expect(run(before, before)).toEqual({ exitCode: 0, output: ['V logu služby po nasadení nepribudla žiadna nová chyba.'] });
});

test('run exits 1 with a count and without the text of the errors: the workflow log of a public repository is public', () => {
  const after = log(refused, at('11:00:03.000', 'Error: password authentication failed for user "doadmin"'), at('11:00:04.000', 'TypeError: x'));

  const result = run(before, after);

  expect(result).toEqual({
    exitCode: 1,
    output: [
      '::error title=Nové chyby v logu služby::Po nasadení pribudlo v logu služby nových riadkov s chybou: 2. ' +
        'Ich text sa do verejného logu nevypisuje, prečítaj ich cez `doctl apps logs <app> <služba> --type run`.',
    ],
  });
  expect(result.output.join()).not.toContain('doadmin');
});
