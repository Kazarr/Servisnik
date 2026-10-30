import { parseLetterhead, type Letterhead } from '@servisnik/domain/print';
import { parseWorkshopDetails, type VatPayerType, type WorkshopDetails, type WorkshopDetailsErrors, type WorkshopDetailsInput } from '@servisnik/domain/workshop';
import { eq } from 'drizzle-orm';
import { getDb, type Database } from '../db/index.ts';
import { workshop } from '../db/schema.ts';
import { assertCan, type User } from './user.ts';

// Údaje autoservisu live in the one row of `workshop` (src/db/schema.ts), beside the rates of Nastavenia.
const theWorkshop = eq(workshop.id, 1);
const detailsColumns = {
  name: workshop.name,
  street: workshop.street,
  city: workshop.city,
  postalCode: workshop.postalCode,
  ico: workshop.ico,
  dic: workshop.dic,
  icDph: workshop.icDph,
  vatPayerType: workshop.vatPayerType,
  iban: workshop.iban,
  phone: workshop.phone,
  email: workshop.email,
  commercialRegister: workshop.commercialRegister,
};

/**
 * Údaje autoservisu, in one read, for every signed-in user: the documents a mechanik prints carry
 * them, and they hold no amount. The rates of Nastavenia are not among them (getRates).
 */
export async function getWorkshopDetails(user: User | null, db: Database = getDb()): Promise<WorkshopDetails> {
  assertCan(user, 'workshop.read');
  const [details] = await db.select(detailsColumns).from(workshop).where(theWorkshop);
  return details!;
}

/**
 * The Platiteľ DPH of the autoservis (a platiteľ, a neplatiteľ or a registrovaný podľa §7), for whoever
 * needs only that, like the invoice. It is the same value getWorkshopDetails returns, and as readable.
 */
export async function getVatPayerType(user: User | null, db: Database = getDb()): Promise<VatPayerType> {
  assertCan(user, 'workshop.read');
  const [row] = await db.select({ vatPayerType: workshop.vatPayerType }).from(workshop).where(theWorkshop);
  return row!.vatPayerType;
}

/**
 * The Hlavička tlačív the forms are printed with, for every signed-in user: the zákazkový list a mechanik prints has it
 * too, and it holds no amount.
 */
export async function getLetterhead(user: User | null, db: Database = getDb()): Promise<Letterhead> {
  assertCan(user, 'workshop.read');
  const [row] = await db.select({ letterhead: workshop.letterhead }).from(workshop).where(theWorkshop);
  return row!.letterhead;
}

/** Picks the Hlavička tlačív when `typed` is one of the two (packages/domain/src/print), and otherwise changes nothing. Only the admin may. */
export async function saveLetterhead(user: User | null, typed: string, db: Database = getDb()): Promise<{ ok: true; letterhead: Letterhead } | { ok: false }> {
  assertCan(user, 'settings.write');
  const picked = parseLetterhead(typed);
  if (!picked) return { ok: false };
  await db.update(workshop).set({ letterhead: picked }).where(theWorkshop);
  return { ok: true, letterhead: picked };
}

export type SaveWorkshopDetailsResult = { ok: true; details: WorkshopDetails } | { ok: false; errors: WorkshopDetailsErrors };

/** Replaces Údaje autoservisu with what the domain accepts (packages/domain/src/workshop); the rates of Nastavenia stay. */
export async function saveWorkshopDetails(user: User | null, input: WorkshopDetailsInput, db: Database = getDb()): Promise<SaveWorkshopDetailsResult> {
  assertCan(user, 'settings.write');
  const parsed = parseWorkshopDetails(input);
  if (!parsed.ok) return parsed;
  const [details] = await db.update(workshop).set(parsed.details).where(theWorkshop).returning(detailsColumns);
  return { ok: true, details: details! };
}
