import { describe, expect, test } from 'vitest';
import { parseEdition, type EditionInput } from '../src/joy-ride/index.ts';

// Jazda radosti (GLOSSARY): the Ročník, its Registrácie. The ticket (#153) gives the example: the Ročník of 2026 was on 10. 10. 2026 in Považská Bystrica and registering closed the day before at 15:00.

const edition: EditionInput = { name: 'Jazda radosti 2026', date: '2026-10-10', place: 'Považská Bystrica, centrum', registrationDeadline: '2026-10-09T15:00' };

describe('Ročník', () => {
  test('a Ročník with a name, a day, a place and the uzávierka registrácií is kept as it is', () => {
    expect(parseEdition(edition)).toEqual({ ok: true, edition });
  });

  test('the name and the place are trimmed', () => {
    expect(parseEdition({ ...edition, name: '  Jazda radosti 2026 ', place: ' Považská Bystrica, centrum  ' })).toEqual({ ok: true, edition });
  });

  test('every value is required, and each missing one is reported', () => {
    expect(parseEdition({ name: ' ', date: '', place: '', registrationDeadline: '  ' })).toEqual({
      ok: false,
      errors: { name: 'required', date: 'required', place: 'required', registrationDeadline: 'required' },
    });
  });

  test.each([
    ['a day that is not in the calendar', '2026-02-30'],
    ['a day as it is written in Slovak', '10. 10. 2026'],
    ['a year before 0100, which Date would read as 19xx', '0026-10-10'],
  ])('%s is no day of the Ročník', (_what, date) => {
    expect(parseEdition({ ...edition, date })).toEqual({ ok: false, errors: { date: 'invalid' } });
  });

  test.each([
    ['a day without the hour', '2026-10-09'],
    ['an hour that does not exist', '2026-10-09T24:00'],
    ['minutes that do not exist', '2026-10-09T15:60'],
    ['a day that is not in the calendar', '2026-02-30T15:00'],
    ['a space instead of the T', '2026-10-09 15:00'],
  ])('%s is no uzávierka registrácií', (_what, registrationDeadline) => {
    expect(parseEdition({ ...edition, registrationDeadline })).toEqual({ ok: false, errors: { registrationDeadline: 'invalid' } });
  });

  test('the hour of the uzávierka may be midnight or the last minute of the day', () => {
    for (const registrationDeadline of ['2026-10-09T00:00', '2026-10-09T23:59']) {
      expect(parseEdition({ ...edition, registrationDeadline }), registrationDeadline).toEqual({ ok: true, edition: { ...edition, registrationDeadline } });
    }
  });
});
