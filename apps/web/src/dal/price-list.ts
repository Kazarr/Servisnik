import {
  parsePriceListItem,
  parsePriceListSearch,
  priceListSearchKeys,
  type PriceListItem,
  type PriceListItemErrors,
  type PriceListItemInput,
} from '@servisnik/domain/price-list';
import { count, eq, or, sql } from 'drizzle-orm';
import { getDb, type Database } from '../db/index.ts';
import { priceListItem } from '../db/schema.ts';
import { violates } from './constraint.ts';
import { contains, pageWindow } from './paging.ts';
import { getRates } from './settings.ts';
import { assertCan, type User } from './user.ts';
import { isUuid } from './uuid.ts';

// The Cenník is the admin's alone: every function here asks for `price-list.read` or `price-list.write`, which
// the mechanik does not have, since it is prices and VAT. A Zákazka never refers to it; adding an item to one is
// `addItemFromPriceList` in work-orders.ts.

/** What the domain finds wrong, or a code that another item already has. */
export type PriceListItemSaveErrors = PriceListItemErrors & { code?: 'taken' };
/** The item that has the code, so the form can link to it. */
type Existing = { id: string; name: string };

export type CreatePriceListItemResult = { ok: true; id: string } | { ok: false; errors: PriceListItemSaveErrors; existing?: Existing };
export type UpdatePriceListItemResult =
  | { ok: true }
  | { ok: false; errors: PriceListItemSaveErrors & { item?: 'unknown' }; existing?: Existing };
export type DeletePriceListItemResult = { ok: true } | { ok: false; error: 'unknown' };

/** What the Cenník shows of an item. */
const shownFields = {
  id: priceListItem.id,
  kind: priceListItem.kind,
  code: priceListItem.code,
  name: priceListItem.name,
  unit: priceListItem.unit,
  purchasePriceCents: priceListItem.purchasePriceCents,
  unitPriceCents: priceListItem.unitPriceCents,
  vatRate: priceListItem.vatRate,
};

/** An item with the keys its search looks at, so no save leaves them behind. */
const stored = (item: PriceListItem) => ({ ...item, ...priceListSearchKeys(item) });

/**
 * The failure for a code that is taken: PostgreSQL refused a second item with the same code, whatever its case (the
 * unique index decides, so two saves at once cannot both get through). Any other error is not ours to handle.
 */
async function codeTaken(error: unknown, code: string | null, db: Database) {
  if (!code || !violates(error, 'price_list_item_code_idx')) throw error;
  const [existing] = await db
    .select({ id: priceListItem.id, name: priceListItem.name })
    .from(priceListItem)
    .where(sql`lower(${priceListItem.code}) = lower(${code})`);
  return { ok: false, errors: { code: 'taken' }, existing } as const;
}

/**
 * Saves a Položka cenníka. The domain decides what is stored (packages/domain/src/price-list); its VAT rate must be one
 * of those of Nastavenia, read with getRates, so the Rola that writes the Cenník must also read Nastavenia.
 */
export async function createPriceListItem(user: User | null, input: PriceListItemInput, db: Database = getDb()): Promise<CreatePriceListItemResult> {
  assertCan(user, 'price-list.write');
  const parsed = parsePriceListItem(input, await getRates(user, db));
  if (!parsed.ok) return parsed;
  try {
    const [saved] = await db.insert(priceListItem).values(stored(parsed.item)).returning({ id: priceListItem.id });
    return { ok: true, id: saved!.id };
  } catch (error) {
    return codeTaken(error, parsed.item.code, db);
  }
}

/**
 * Replaces what the form of an item sends: the kind of the item stays, and what is left out is as when adding, except a
 * VAT rate, which stays the one the item has. That rate is allowed even when Nastavenia no longer offer it, so an old
 * item can still be edited; any other must be one they offer. The item may keep its own code, whatever the case.
 */
export async function updatePriceListItem(
  user: User | null,
  id: string,
  input: Omit<PriceListItemInput, 'kind'>,
  db: Database = getDb(),
): Promise<UpdatePriceListItemResult> {
  assertCan(user, 'price-list.write');
  const { vatRates } = await getRates(user, db);
  if (!isUuid(id)) return { ok: false, errors: { item: 'unknown' } };
  const [item] = await db.select({ kind: priceListItem.kind, vatRate: priceListItem.vatRate }).from(priceListItem).where(eq(priceListItem.id, id));
  if (!item) return { ok: false, errors: { item: 'unknown' } };

  const parsed = parsePriceListItem({ ...input, kind: item.kind }, { defaultVatRate: item.vatRate, vatRates: [...vatRates, item.vatRate] });
  if (!parsed.ok) return parsed;
  try {
    const [saved] = await db.update(priceListItem).set(stored(parsed.item)).where(eq(priceListItem.id, id)).returning({ id: priceListItem.id });
    return saved ? { ok: true } : { ok: false, errors: { item: 'unknown' } }; // none: deleted since it was read
  } catch (error) {
    return codeTaken(error, parsed.item.code, db);
  }
}

/** Deletes a Položka cenníka. The Zákazky that got a copy of it keep theirs. */
export async function deletePriceListItem(user: User | null, id: string, db: Database = getDb()): Promise<DeletePriceListItemResult> {
  assertCan(user, 'price-list.write');
  if (!isUuid(id)) return { ok: false, error: 'unknown' };
  const deleted = await db.delete(priceListItem).where(eq(priceListItem.id, id)).returning({ id: priceListItem.id });
  return deleted.length > 0 ? { ok: true } : { ok: false, error: 'unknown' };
}

/**
 * A page of the Položky cenníka that match `query`, by name in the Slovak alphabet. The query is a part of the code or
 * of the name; the domain normalizes it the way the stored keys are (packages/domain/src/price-list). A blank query
 * has nothing to look for, so every item matches. `page` counts from 1, as in `searchCustomers`.
 */
// ponytail: a scan of the table per search; rewrite `contains` to an escaped LIKE and add a pg_trgm GIN index on the search columns if the Cenník outgrows ~100k items.
export async function searchPriceList(user: User | null, { query = '', page = 1 }: { query?: string; page?: number } = {}, db: Database = getDb()) {
  assertCan(user, 'price-list.read');
  const text = parsePriceListSearch(query);
  const matching = text ? or(contains(priceListItem.searchCode, text), contains(priceListItem.searchName, text)) : undefined;

  const [counted] = await db.select({ total: count() }).from(priceListItem).where(matching);
  const total = counted!.total;
  const { page: current, pageCount, limit, offset } = pageWindow(total, page);
  const items = await db
    .select(shownFields)
    .from(priceListItem)
    .where(matching)
    // The Slovak alphabet (č after c, ch after h), the same on every server; the id settles the order of equal names, so no item is on two pages or on none.
    .orderBy(sql`${priceListItem.name} collate "sk-x-icu"`, priceListItem.id)
    .limit(limit)
    .offset(offset);
  return { items, page: current, pageCount, total };
}

/** One Položka cenníka, or null when there is none with this id. */
export async function getPriceListItem(user: User | null, id: string, db: Database = getDb()) {
  assertCan(user, 'price-list.read');
  if (!isUuid(id)) return null;
  const [found] = await db.select(shownFields).from(priceListItem).where(eq(priceListItem.id, id));
  return found ?? null;
}
