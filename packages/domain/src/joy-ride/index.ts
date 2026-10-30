// Joy ride area (GLOSSARY: Jazda radosti, Ročník, Registrácia). Pure rules: no framework, database or network.
import { parseDay } from '../work-order/index.ts';

/** What the form of the Ročník sends, every value as typed. The uzávierka is what a `datetime-local` field sends, `YYYY-MM-DDTHH:mm`. */
export type EditionInput = { name: string; date: string; place: string; registrationDeadline: string };
export type Edition = EditionInput;
export type EditionErrors = { name?: 'required'; date?: 'required' | 'invalid'; place?: 'required'; registrationDeadline?: 'required' | 'invalid' };

/** An hour and minute as `HH:mm`, on the 24-hour clock. */
const time = /^([01]\d|2[0-3]):[0-5]\d$/;

/**
 * The uzávierka registrácií is a wall-clock time at the place of the Ročník (Europe/Bratislava), so it is kept as typed and
 * no instant is made of it. It is a real day of the calendar and a real time of the day, or null.
 */
function parseDeadline(typed: string): string | null {
  const [day, hour, ...rest] = typed.split('T');
  return rest.length === 0 && hour !== undefined && parseDay(day!) !== null && time.test(hour) ? typed : null;
}

/** A Ročník ready to store, or every reason it is not one. Its name and place are trimmed; all four values are required. */
export function parseEdition(input: EditionInput): { ok: true; edition: Edition } | { ok: false; errors: EditionErrors } {
  const edition = { name: input.name.trim(), date: input.date.trim(), place: input.place.trim(), registrationDeadline: input.registrationDeadline.trim() };
  const errors: EditionErrors = {};
  if (!edition.name) errors.name = 'required';
  if (!edition.date) errors.date = 'required';
  else if (parseDay(edition.date) === null) errors.date = 'invalid';
  if (!edition.place) errors.place = 'required';
  if (!edition.registrationDeadline) errors.registrationDeadline = 'required';
  else if (parseDeadline(edition.registrationDeadline) === null) errors.registrationDeadline = 'invalid';
  return Object.keys(errors).length > 0 ? { ok: false, errors } : { ok: true, edition };
}
