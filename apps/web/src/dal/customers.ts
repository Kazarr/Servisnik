import { parseCustomer, type CustomerErrors, type CustomerInput } from '@servisnik/domain/customer';
import { desc, eq } from 'drizzle-orm';
import { getDb, type Database } from '../db/index.ts';
import { customer, vehicle } from '../db/schema.ts';
import { assertAdmin, type User } from './user.ts';
import { isUuid } from './uuid.ts';

/** What the domain finds wrong, or an IČO that another Firma already has. */
export type CustomerSaveErrors = Omit<CustomerErrors, 'ico'> & { ico?: NonNullable<CustomerErrors['ico']> | 'taken' };
/** The Firma that has the IČO, so the form can link to it. */
type Existing = { id: string; name: string };

export type CreateCustomerResult = { ok: true; id: string } | { ok: false; errors: CustomerSaveErrors; existing?: Existing };
export type UpdateCustomerResult =
  | { ok: true }
  | { ok: false; errors: CustomerSaveErrors & { customer?: 'unknown' }; existing?: Existing };

/** PostgreSQL refused a second Zákazník with an IČO (the unique index decides, so two saves at once cannot both get through). */
function isIcoTaken(error: unknown) {
  // Drizzle wraps the driver's error as `cause`.
  return error instanceof Error && (error.cause as { constraint?: string } | undefined)?.constraint === 'customer_ico_idx';
}

/** The failure for an IČO that is taken; any other error is not ours to handle. */
async function icoTaken(error: unknown, ico: string | null, db: Database) {
  if (!ico || !isIcoTaken(error)) throw error;
  const [existing] = await db.select({ id: customer.id, name: customer.name }).from(customer).where(eq(customer.ico, ico));
  return { ok: false, errors: { ico: 'taken' }, existing } as const;
}

/** Saves a Zákazník; the domain decides what is stored (packages/domain/src/customer). */
export async function createCustomer(
  user: User | null,
  input: CustomerInput,
  db: Database = getDb(),
): Promise<CreateCustomerResult> {
  assertAdmin(user);
  const parsed = parseCustomer(input);
  if (!parsed.ok) return parsed;
  try {
    const [saved] = await db.insert(customer).values(parsed.customer).returning({ id: customer.id });
    return { ok: true, id: saved!.id };
  } catch (error) {
    return icoTaken(error, parsed.customer.ico, db);
  }
}

/** Replaces every field of a Zákazník with `input`: a Firma changed to an Osoba loses its IČO, DIČ and IČ DPH. */
export async function updateCustomer(
  user: User | null,
  id: string,
  input: CustomerInput,
  db: Database = getDb(),
): Promise<UpdateCustomerResult> {
  assertAdmin(user);
  const parsed = parseCustomer(input);
  if (!parsed.ok) return parsed;
  if (!isUuid(id)) return { ok: false, errors: { customer: 'unknown' } };
  try {
    const [saved] = await db.update(customer).set(parsed.customer).where(eq(customer.id, id)).returning({ id: customer.id });
    return saved ? { ok: true } : { ok: false, errors: { customer: 'unknown' } };
  } catch (error) {
    return icoTaken(error, parsed.customer.ico, db);
  }
}

/** Every Zákazník, newest first. */
export async function listCustomers(user: User | null, db: Database = getDb()) {
  assertAdmin(user);
  return db.select().from(customer).orderBy(desc(customer.createdAt));
}

/** One Zákazník with the Vozidlá they own (newest first), or null when there is none with this id. */
export async function getCustomer(user: User | null, id: string, db: Database = getDb()) {
  assertAdmin(user);
  if (!isUuid(id)) return null;
  const [found] = await db.select().from(customer).where(eq(customer.id, id));
  if (!found) return null;
  const vehicles = await db.select().from(vehicle).where(eq(vehicle.ownerId, id)).orderBy(desc(vehicle.createdAt));
  return { ...found, vehicles };
}
