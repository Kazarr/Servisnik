import { parseCustomer, parseCustomerSearch, searchKeys, type Customer, type CustomerErrors, type CustomerInput } from '@servisnik/domain/customer';
import { and, count, desc, eq, ne, or, sql } from 'drizzle-orm';
import { getDb, type Database, type Executor } from '../db/index.ts';
import { customer, vehicle } from '../db/schema.ts';
import { blockedByLink, violates } from './constraint.ts';
import { contains, pageWindow } from './paging.ts';
import { assertCan, type User } from './user.ts';
import { isUuid } from './uuid.ts';

/** What the domain finds wrong, or an IČO that another Firma already has. */
export type CustomerSaveErrors = Omit<CustomerErrors, 'ico'> & { ico?: NonNullable<CustomerErrors['ico']> | 'taken' };
/** The Firma that has the IČO, so the form can link to it. */
export type ExistingCustomer = { id: string; name: string };

export type CreateCustomerResult = { ok: true; id: string } | { ok: false; errors: CustomerSaveErrors; existing?: ExistingCustomer };
export type UpdateCustomerResult =
  | { ok: true }
  | { ok: false; errors: CustomerSaveErrors & { customer?: 'unknown' }; existing?: ExistingCustomer };

/** The failure for an IČO that is taken, with the Firma that has it. */
async function takenIco(ico: string, db: Executor) {
  const [existing] = await db.select({ id: customer.id, name: customer.name }).from(customer).where(eq(customer.ico, ico));
  return { ok: false, errors: { ico: 'taken' }, existing } as const;
}

/**
 * The failure for a save that PostgreSQL refused because of the IČO (the unique index decides, so two
 * saves at once cannot both get through). Any other error is not ours to handle.
 */
async function icoTaken(error: unknown, ico: string | null, db: Executor) {
  if (!ico || !violates(error, 'customer_ico_idx')) throw error;
  return takenIco(ico, db);
}

/** A Zákazník with the keys its search looks at, so no save leaves them behind. */
const stored = (parsed: Customer) => ({ ...parsed, ...searchKeys(parsed) });

/**
 * Saves a Zákazník; the domain decides what is stored (packages/domain/src/customer). The unique index
 * on the IČO decides a duplicate without an error, so the save can be a step of a bigger transaction
 * (`db` is then its transaction) that goes on after it, which an error would have ended.
 */
export async function createCustomer(
  user: User | null,
  input: CustomerInput,
  db: Executor = getDb(),
): Promise<CreateCustomerResult> {
  assertCan(user, 'customers.write');
  const parsed = parseCustomer(input);
  if (!parsed.ok) return parsed;
  const [saved] = await db.insert(customer).values(stored(parsed.customer)).onConflictDoNothing({ target: customer.ico }).returning({ id: customer.id });
  // Only an IČO can conflict, and a Zákazník without one never does.
  return saved ? { ok: true, id: saved.id } : takenIco(parsed.customer.ico!, db);
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

/**
 * A page of Zákazníci that match `query`, alphabetically by name. The query is a part of the name,
 * IČO, e-mail or phone; the domain normalizes it the way the stored keys are (packages/domain/src/
 * customer). A blank query has nothing to look for, so every Zákazník matches. `page` counts from 1:
 * any page past the last is the last, and anything that is not a page number is the first. `except` is
 * the id of a Zákazník that is never found, for the search of a new Majiteľ that leaves out the
 * current one; anything that is not an id leaves nobody out. Admin only.
 */
// ponytail: a scan of the table per search; rewrite `contains` to an escaped LIKE and add a pg_trgm GIN index on the search columns if the table outgrows ~100k customers.
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
  const { page: current, pageCount, limit, offset } = pageWindow(total, page);
  const customers = await db
    .select({ id: customer.id, type: customer.type, name: customer.name, ico: customer.ico, phone: customer.phone, email: customer.email })
    .from(customer)
    .where(matching)
    // The Slovak alphabet (č after c, ch after h, case and diacritics only after the letters), the same on every server.
    .orderBy(sql`${customer.name} collate "sk-x-icu"`, customer.id)
    .limit(limit)
    .offset(offset);
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

export type DeleteCustomerResult = { ok: true } | { ok: false; error: 'unknown' | 'has-links' };

/**
 * Deletes a Zákazník who has no Vozidlo and no Zákazka; one with any link stays, as `has-links`.
 * There is no look before the delete: the foreign keys to the customer are `restrict`, so PostgreSQL
 * refuses the delete itself and a link added at the same moment cannot slip through. Admin only.
 */
export async function deleteCustomer(user: User | null, id: string, db: Database = getDb()): Promise<DeleteCustomerResult> {
  assertCan(user, 'customers.write');
  if (!isUuid(id)) return { ok: false, error: 'unknown' };
  try {
    const [deleted] = await db.delete(customer).where(eq(customer.id, id)).returning({ id: customer.id });
    return deleted ? { ok: true } : { ok: false, error: 'unknown' };
  } catch (error) {
    if (!blockedByLink(error)) throw error;
    return { ok: false, error: 'has-links' };
  }
}
