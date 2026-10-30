import { parseEdition, type EditionErrors, type EditionInput } from '@servisnik/domain/joy-ride';
import { desc, eq } from 'drizzle-orm';
import { getDb, type Database } from '../db/index.ts';
import { joyRideEdition } from '../db/schema.ts';
import { assertCan, type User } from './user.ts';

// The Jazda radosti is the admin's alone: every function here asks for `joy-ride.read` or `joy-ride.write`, which the mechanik does not have.
// The section works with one Ročník, the current one: the latest by its day.

export type SaveEditionResult = { ok: true; id: string } | { ok: false; errors: EditionErrors };

/** What the section shows of a Ročník. */
const shownFields = {
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
  const [found] = await db.select(shownFields).from(joyRideEdition).orderBy(desc(joyRideEdition.date), desc(joyRideEdition.createdAt)).limit(1);
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
