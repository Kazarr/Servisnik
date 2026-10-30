import {
  parseEdition,
  parseRegistration,
  parseRegistrationFilter,
  type EditionErrors,
  type EditionInput,
  type RegistrationErrors,
  type RegistrationDecision,
  type RegistrationInput,
  type RegistrationStatus,
} from '@servisnik/domain/joy-ride';
import { localDate } from '@servisnik/domain/work-order';
import { and, count, desc, eq } from 'drizzle-orm';
import { getDb, type Database } from '../db/index.ts';
import { joyRideEdition, joyRideRegistration } from '../db/schema.ts';
import { assertCan, type User } from './user.ts';
import { isUuid } from './uuid.ts';

// The Jazda radosti is the admin's alone: every function here asks for `joy-ride.read` or `joy-ride.write`, which the mechanik does not have.
// The section works with one Ročník, the current one: the latest by its day.

export type SaveEditionResult = { ok: true; id: string } | { ok: false; errors: EditionErrors };

/** The columns of a Ročník the section shows. */
const editionColumns = {
  id: joyRideEdition.id,
  name: joyRideEdition.name,
  date: joyRideEdition.date,
  place: joyRideEdition.place,
  registrationDeadline: joyRideEdition.registrationDeadline,
};

/** The uzávierka as a `datetime-local` field has it: the database gives `2026-10-09 15:00:00`, the field takes `2026-10-09T15:00`. */
const asField = (stamp: string) => stamp.replace(' ', 'T').slice(0, 16);

/** The current Ročník: the one with the latest day (the later made one, for two on the same day), or undefined when there is none. */
async function currentEdition(db: Database) {
  const [found] = await db.select(editionColumns).from(joyRideEdition).orderBy(desc(joyRideEdition.date), desc(joyRideEdition.createdAt)).limit(1);
  return found && { ...found, registrationDeadline: asField(found.registrationDeadline) };
}

/** The current Ročník, or null when the admin has not saved one yet. */
export async function getEdition(user: User | null, db: Database = getDb()) {
  assertCan(user, 'joy-ride.read');
  return (await currentEdition(db)) ?? null;
}

/**
 * Saves what the form of the Ročník sends: it changes the current Ročník, or makes the first one when there is none. The domain decides
 * what is stored (packages/domain/src/joy-ride).
 *
 * ponytail: two first saves at the same moment make two Ročníky, and the one with the later day is the current one; add a unique
 * key when the section keeps a list of Ročníky.
 */
export async function saveEdition(user: User | null, input: EditionInput, db: Database = getDb()): Promise<SaveEditionResult> {
  assertCan(user, 'joy-ride.write');
  const parsed = parseEdition(input);
  if (!parsed.ok) return parsed;
  const current = await currentEdition(db);
  if (current) {
    await db.update(joyRideEdition).set(parsed.edition).where(eq(joyRideEdition.id, current.id));
    return { ok: true, id: current.id };
  }
  const [saved] = await db.insert(joyRideEdition).values(parsed.edition).returning({ id: joyRideEdition.id });
  return { ok: true, id: saved!.id };
}

/** What the domain finds wrong, or that there is no Ročník to register on. */
export type RegistrationSaveErrors = RegistrationErrors & { edition?: 'missing' };
export type CreateRegistrationResult = { ok: true; id: string } | { ok: false; errors: RegistrationSaveErrors };

/** The columns of a Registrácia the list shows; `shown` turns `createdAt` into `createdOn`, the day it was made, in Europe/Bratislava. */
const registrationColumns = {
  id: joyRideRegistration.id,
  name: joyRideRegistration.name,
  phone: joyRideRegistration.phone,
  email: joyRideRegistration.email,
  make: joyRideRegistration.make,
  model: joyRideRegistration.model,
  licensePlate: joyRideRegistration.licensePlate,
  category: joyRideRegistration.category,
  note: joyRideRegistration.note,
  status: joyRideRegistration.status,
  createdAt: joyRideRegistration.createdAt,
};

/** A row of `registrationColumns` as the section has it: the day it was made instead of the instant. */
const shown = <Row extends { createdAt: Date }>({ createdAt, ...registration }: Row) => ({ ...registration, createdOn: localDate(createdAt) });

/**
 * Saves a Registrácia on the current Ročník as Nová, as typed in from an e-mail. The domain decides what is stored
 * (packages/domain/src/joy-ride); with no Ročník there is nothing to register on. `now` is the day it was made.
 */
export async function createRegistration(user: User | null, input: RegistrationInput, db: Database = getDb(), now = new Date()): Promise<CreateRegistrationResult> {
  assertCan(user, 'joy-ride.write');
  const edition = await currentEdition(db);
  if (!edition) return { ok: false, errors: { edition: 'missing' } };
  const parsed = parseRegistration(input);
  if (!parsed.ok) return parsed;
  const [saved] = await db.insert(joyRideRegistration).values({ ...parsed.registration, editionId: edition.id, createdAt: now }).returning({ id: joyRideRegistration.id });
  return { ok: true, id: saved!.id };
}

/**
 * The Registrácie of the current Ročník that pass the filter, the newest first, and how many of the whole Ročník have each Stav, whatever
 * the filter is (they are the counts above the list). The filter is what the address carries; what is no Kategória or Stav is left out.
 */
export async function listRegistrations(user: User | null, typedFilter: { category?: string; status?: string } = {}, db: Database = getDb()) {
  assertCan(user, 'joy-ride.read');
  const filter = parseRegistrationFilter(typedFilter);
  const counts: Record<RegistrationStatus, number> = { new: 0, approved: 0, rejected: 0 };
  const edition = await currentEdition(db);
  if (!edition) return { filter, counts, registrations: [] };

  const ofEdition = eq(joyRideRegistration.editionId, edition.id);
  for (const { status, total } of await db.select({ status: joyRideRegistration.status, total: count() }).from(joyRideRegistration).where(ofEdition).groupBy(joyRideRegistration.status)) {
    counts[status] = total;
  }
  const rows = await db
    .select(registrationColumns)
    .from(joyRideRegistration)
    .where(and(ofEdition, filter.category ? eq(joyRideRegistration.category, filter.category) : undefined, filter.status ? eq(joyRideRegistration.status, filter.status) : undefined))
    .orderBy(desc(joyRideRegistration.createdAt), desc(joyRideRegistration.id));
  return { filter, counts, registrations: rows.map(shown) };
}

/** One Registrácia, or null when there is none with this id. */
export async function getRegistration(user: User | null, id: string, db: Database = getDb()) {
  assertCan(user, 'joy-ride.read');
  if (!isUuid(id)) return null;
  const [found] = await db.select(registrationColumns).from(joyRideRegistration).where(eq(joyRideRegistration.id, id));
  return found ? shown(found) : null;
}

export type UpdateRegistrationResult = { ok: true } | { ok: false; errors: RegistrationErrors & { registration?: 'unknown' } };

/** Replaces what the form of a Registrácia sends. Its Stav, its Ročník and its day stay as they are, so an edit after the approval is still approved. */
export async function updateRegistration(user: User | null, id: string, input: RegistrationInput, db: Database = getDb()): Promise<UpdateRegistrationResult> {
  assertCan(user, 'joy-ride.write');
  if (!isUuid(id)) return { ok: false, errors: { registration: 'unknown' } };
  const parsed = parseRegistration(input);
  if (!parsed.ok) return parsed;
  const saved = await db.update(joyRideRegistration).set(parsed.registration).where(eq(joyRideRegistration.id, id)).returning({ id: joyRideRegistration.id });
  return saved.length > 0 ? { ok: true } : { ok: false, errors: { registration: 'unknown' } };
}

export type SetRegistrationStatusResult = { ok: true } | { ok: false; error: 'unknown' };

/** Approves or rejects a Registrácia (or takes either back): the admin's decision, with one click, whatever the Stav was. It is never set back to Nová. */
export async function setRegistrationStatus(user: User | null, id: string, status: RegistrationDecision, db: Database = getDb()): Promise<SetRegistrationStatusResult> {
  assertCan(user, 'joy-ride.write');
  if (!isUuid(id)) return { ok: false, error: 'unknown' };
  const saved = await db.update(joyRideRegistration).set({ status }).where(eq(joyRideRegistration.id, id)).returning({ id: joyRideRegistration.id });
  return saved.length > 0 ? { ok: true } : { ok: false, error: 'unknown' };
}
