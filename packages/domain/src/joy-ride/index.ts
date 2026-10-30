// Joy ride area (GLOSSARY: Jazda radosti, Ročník, Registrácia). Pure rules: no framework, database or network.
import { isEmail } from '../customer/index.ts';
import { parseLicensePlate } from '../vehicle/index.ts';
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

/** The Stav registrácie: Nová, Schválená or Zamietnutá. A Registrácia starts as Nová. */
export const registrationStatuses = ['new', 'approved', 'rejected'] as const;
export type RegistrationStatus = (typeof registrationStatuses)[number];

/** The Kategórie of the invitation to the Ročník 2026: superšporty, zaujímavé autá, ťažká technika, veterány, motorky and iné. */
export const registrationCategories = ['supersport', 'interesting', 'heavy', 'veteran', 'motorcycle', 'other'] as const;
export type RegistrationCategory = (typeof registrationCategories)[number];

/** What the form of a Registrácia sends, every value as typed; the ŠPZ and the poznámka may be left out. */
export type RegistrationInput = { name: string; phone: string; email: string; make: string; model: string; licensePlate?: string; category: string; note?: string };
export type Registration = {
  name: string;
  phone: string;
  email: string;
  make: string;
  model: string;
  licensePlate: string | null;
  category: RegistrationCategory;
  note: string | null;
};
export type RegistrationErrors = { name?: 'required'; phone?: 'required'; email?: 'required' | 'format'; make?: 'required'; model?: 'required'; category?: 'required' };

/**
 * A Registrácia ready to store, or every reason it is not one. The text is trimmed and the ŠPZ is kept as a Vozidlo has it
 * (capitals, no spaces). Everything but the ŠPZ and the poznámka is required, as the ticket's model has it; the e-mail has the
 * shape of every other e-mail of Servisník. A Kategória that is none of the six is as good as none.
 */
export function parseRegistration(input: RegistrationInput): { ok: true; registration: Registration } | { ok: false; errors: RegistrationErrors } {
  const name = input.name.trim();
  const phone = input.phone.trim();
  const email = input.email.trim();
  const make = input.make.trim();
  const model = input.model.trim();
  const category = registrationCategories.find((known) => known === input.category);
  const errors: RegistrationErrors = {};
  if (!name) errors.name = 'required';
  if (!phone) errors.phone = 'required';
  if (!email) errors.email = 'required';
  else if (!isEmail(email)) errors.email = 'format';
  if (!make) errors.make = 'required';
  if (!model) errors.model = 'required';
  if (!category) errors.category = 'required';
  if (Object.keys(errors).length > 0 || !category) return { ok: false, errors };
  return { ok: true, registration: { name, phone, email, make, model, licensePlate: parseLicensePlate(input.licensePlate ?? ''), category, note: input.note?.trim() || null } };
}

/** The filter of the list of Registrácií: a Kategória and a Stav, or null for any. */
export type RegistrationFilter = { category: RegistrationCategory | null; status: RegistrationStatus | null };

/** The filter as the address carries it. Whatever is not a Kategória or a Stav is left out, so a mangled address shows the whole list, not an error. */
export const parseRegistrationFilter = (typed: { category?: string; status?: string }): RegistrationFilter => ({
  category: registrationCategories.find((known) => known === typed.category) ?? null,
  status: registrationStatuses.find((known) => known === typed.status) ?? null,
});
