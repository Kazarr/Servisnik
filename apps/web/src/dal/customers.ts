import { parseCustomer, parseCustomerSearch, searchKeys, type Customer, type CustomerErrors, type CustomerInput } from '@servisnik/domain/customer';
import { and, count, desc, eq, ne, or, sql } from 'drizzle-orm';
import type { AnyPgColumn } from 'drizzle-orm/pg-core';
import { getDb, type Database } from '../db/index.ts';
import { customer, vehicle } from '../db/schema.ts';
import { violates } from './constraint.ts';
import { assertCan, type User } from './user.ts';
import { isUuid } from './uuid.ts';

/** What the domain finds wrong, or an IČO that another Firma already has. */
export type CustomerSaveErrors = Omit<CustomerErrors, 'ico'> & { ico?: NonNullable<CustomerErrors['ico']> | 'taken' };
/** The Firma that has the IČO, so the form can link to it. */
type Existing = { id: string; name: string };

export type CreateCustomerResult = { ok: true; id: string } | { ok: false; errors: CustomerSaveErrors; existing?: Existing };
export type UpdateCustomerResult =
  | { ok: true }
  | { ok: false; errors: CustomerSaveErrors & { customer?: 'unknown' }; existing?: Existing };

/**
 * The failure for an IČO that is taken: PostgreSQL refused a second Zákazník with it (the unique index
 * decides, so two saves at once cannot both get through). Any other error is not ours to handle.
 */
async function icoTaken(error: unknown, ico: string | null, db: Database) {
  if (!ico || !violates(error, 'customer_ico_idx')) throw error;
  const [existing] = await db.select({ id: customer.id, name: customer.name }).from(customer).where(eq(customer.ico, ico));
  return { ok: false, errors: { ico: 'taken' }, existing } as const;
}

/** A Zákazník with the keys its search looks at, so no save leaves them behind. */
const stored = (parsed: Customer) => ({ ...parsed, ...searchKeys(parsed) });

/** Saves a Zákazník; the domain decides what is stored (packages/domain/src/customer). */
export async function createCustomer(
  user: User | null,
  input: CustomerInput,
  db: Database = getDb(),
): Promise<CreateCustomerResult> {
  assertCan(user, 'customers.write');
  const parsed = parseCustomer(input);
  if (!parsed.ok) return parsed;
  try {
    const [saved] = await db.insert(customer).values(stored(parsed.customer)).returning({ id: customer.id });
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
  assertCan(user, 'customers.write');
  const parsed = parseCustomer(input);
  if (!parsed.ok) return parsed;
  if (!isUuid(id)) return { ok: false, errors: { customer: 'unknown' } };
  try {
    const [saved] = await db.update(customer).set(stored(parsed.customer)).where(eq(customer.id, id)).returning({ id: customer.id });
    return saved ? { ok: true } : { ok: false, errors: { customer: 'unknown' } };
  } catch (error) {
    return icoTaken(error, parsed.customer.ico, db);
  }
}

/** Every Zákazník, newest first. */
export async function listCustomers(user: User | null, db: Database = getDb()) {
  assertCan(user, 'customers.read');
  return db.select().from(customer).orderBy(desc(customer.createdAt));
}

const customersPerPage = 25;

const contains = (column: AnyPgColumn, part: string) => sql`strpos(${column}, ${part}) > 0`;

/**
 * A page of Zákazníci that match `query`, alphabetically by name. The query is a part of the name,
 * IČO, e-mail or phone; the domain normalizes it the way the stored keys are (packages/domain/src/
 * customer). A blank query has nothing to look for, so every Zákazník matches. `page` counts from 1:
 * any page past the last is the last, and anything that is not a page number is the first. `except` is
 * the id of a Zákazník that is never found, for the search of a new Majiteľ that leaves out the
 * current one; anything that is not an id leaves nobody out. Admin only.
 */
// ponytail: a scan of the table per search; a trigram index on the search columns if the table outgrows ~100k customers.
export async function searchCustomers(
  user: User | null,
  { query = '', page = 1, except }: { query?: string; page?: number; except?: string } = {},
  db: Database = getDb(),
) {
  assertCan(user, 'customers.read');
  const { text, ico, phone } = parseCustomerSearch(query);
  const matching = and(
    text
      ? or(
          contains(customer.searchName, text),
          contains(customer.searchEmail, text),
          contains(customer.ico, ico),
          phone ? contains(customer.searchPhone, phone) : undefined,
        )
      : undefined,
    except && isUuid(except) ? ne(customer.id, except) : undefined,
  );

  const [counted] = await db.select({ total: count() }).from(customer).where(matching);
  const total = counted!.total;
  const pageCount = Math.max(1, Math.ceil(total / customersPerPage));
  const current = Number.isInteger(page) ? Math.min(Math.max(page, 1), pageCount) : 1;
  const customers = await db
    .select({ id: customer.id, type: customer.type, name: customer.name, ico: customer.ico, phone: customer.phone, email: customer.email })
    .from(customer)
    .where(matching)
    // The Slovak alphabet (č after c, ch after h, case and diacritics only after the letters), the same on every server.
    .orderBy(sql`${customer.name} collate "sk-x-icu"`, customer.id)
    .limit(customersPerPage)
    .offset((current - 1) * customersPerPage);
  return { customers, page: current, pageCount, total };
}

/** One Zákazník with the Vozidlá they own (newest first), or null when there is none with this id. */
export async function getCustomer(user: User | null, id: string, db: Database = getDb()) {
  assertCan(user, 'customers.read');
  if (!isUuid(id)) return null;
  const [found] = await db.select().from(customer).where(eq(customer.id, id));
  if (!found) return null;
  const vehicles = await db.select().from(vehicle).where(eq(vehicle.ownerId, id)).orderBy(desc(vehicle.createdAt));
  return { ...found, vehicles };
}
