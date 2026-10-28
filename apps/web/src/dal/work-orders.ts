import { workOrderItemFromPriceListItem } from '@servisnik/domain/price-list';
import {
  amountsOf,
  canEdit,
  formatWorkOrderNumber,
  localYear,
  parseListFilter,
  marginOf,
  parseItem,
  parseWorkOrder,
  statusesOf,
  totalsOf,
  transition,
  type ItemErrors,
  type ItemInput,
  type WorkOrderErrors,
  type WorkOrderInput,
  type WorkOrderItem,
  type WorkOrderStatus,
  vatRatesKeeping,
} from '@servisnik/domain/work-order';
import { and, asc, count, desc, eq, inArray, sql } from 'drizzle-orm';
import type { SelectedFields } from 'drizzle-orm/pg-core';
import { getDb, type Database } from '../db/index.ts';
import { customer, priceListItem, vehicle, workOrder, workOrderCounter, workOrderItem } from '../db/schema.ts';
import { pageWindow } from './paging.ts';
import { getRates } from './settings.ts';
import { assertCan, type User } from './user.ts';
import { isUuid } from './uuid.ts';

/** The rows of `query`, or none when `id` is not a UUID: PostgreSQL would answer that with an error, not with no row. */
const rowsIfUuid = async <Row>(id: string, query: PromiseLike<Row[]>): Promise<Row[]> => (isUuid(id) ? await query : []);

export type CreateWorkOrderResult =
  | { ok: true; id: string; number: string }
  | { ok: false; errors: WorkOrderErrors & { vehicle?: 'unknown'; customer?: 'unknown' } };

/**
 * Saves a Zákazka for a Vozidlo with the next number of the year in Europe/Bratislava. Its Zákazník is
 * `customerId`, or the Majiteľ of the vehicle now; the Zákazka keeps it from then on. The number is one
 * atomic upsert of the year's counter inside the same transaction as the Zákazka (see workOrderCounter).
 */
export async function createWorkOrder(
  user: User | null,
  input: WorkOrderInput & { vehicleId: string; customerId?: string },
  db: Database = getDb(),
  now: Date = new Date(),
): Promise<CreateWorkOrderResult> {
  assertCan(user, 'work-orders.write');
  const parsed = parseWorkOrder(input);
  if (!parsed.ok) return parsed;

  return db.transaction(async (tx) => {
    const [found] = await rowsIfUuid(input.vehicleId, tx.select({ ownerId: vehicle.ownerId }).from(vehicle).where(eq(vehicle.id, input.vehicleId)));
    if (!found) return { ok: false, errors: { vehicle: 'unknown' } };
    const customerId = input.customerId || found.ownerId;
    const [known] = await rowsIfUuid(customerId, tx.select({ id: customer.id }).from(customer).where(eq(customer.id, customerId)));
    if (!known) return { ok: false, errors: { customer: 'unknown' } };

    const year = localYear(now);
    const [counter] = await tx
      .insert(workOrderCounter)
      .values({ year, lastSequence: 1 })
      .onConflictDoUpdate({ target: workOrderCounter.year, set: { lastSequence: sql`${workOrderCounter.lastSequence} + 1` } })
      .returning({ lastSequence: workOrderCounter.lastSequence });
    const number = formatWorkOrderNumber(year, counter!.lastSequence);
    const [saved] = await tx
      .insert(workOrder)
      .values({ number, customerId, vehicleId: input.vehicleId, ...parsed.workOrder })
      .returning({ id: workOrder.id });
    return { ok: true, id: saved!.id, number };
  });
}

type Transaction = Parameters<Parameters<Database['transaction']>[0]>[0];

/**
 * Locks the Zákazka until the transaction ends and says whether it may change now: its Položky and its
 * header. The domain's `canEdit` is that one condition for adding, changing and deleting an item and for
 * saving the header; the lock keeps a change from landing after the Zákazka became Hotová or Zrušená.
 */
async function lockForItems(tx: Transaction, workOrderId: string): Promise<'ok' | 'unknown' | 'not-editable'> {
  const [found] = await rowsIfUuid(workOrderId, tx.select({ status: workOrder.status }).from(workOrder).where(eq(workOrder.id, workOrderId)).for('update'));
  if (!found) return 'unknown';
  return canEdit(found.status) ? 'ok' : 'not-editable';
}

export type UpdateHeaderResult = { ok: true } | { ok: false; errors: WorkOrderErrors & { workOrder?: 'unknown' | 'not-editable' } };

/**
 * Saves the header of a Zákazka that is still Rozpracovaná (`canEdit`): the kilometres at intake, the
 * customer's request, the Termín and the note. The status is read under a row lock in the same transaction
 * as the write, so a header cannot land after the Zákazka became Hotová or Zrušená. The customer and the
 * vehicle are not part of it. The admin's alone: whether a mechanik may edit is ledger question 11 (#43).
 */
export async function updateWorkOrderHeader(user: User | null, id: string, input: WorkOrderInput, db: Database = getDb()): Promise<UpdateHeaderResult> {
  assertCan(user, 'work-orders.write');
  const parsed = parseWorkOrder(input);
  if (!parsed.ok) return parsed;

  return db.transaction(async (tx) => {
    const locked = await lockForItems(tx, id);
    if (locked !== 'ok') return { ok: false, errors: { workOrder: locked } };
    await tx.update(workOrder).set(parsed.workOrder).where(eq(workOrder.id, id));
    return { ok: true };
  });
}

export type AddItemResult =
  | { ok: true; id: string }
  | { ok: false; errors: ItemErrors & { workOrder?: 'unknown' | 'not-editable' } };

/** The one place an item is added to a Zákazka, for every way of adding one: under lockForItems, so a Zákazka that is no longer Rozpracovaná takes none. */
async function insertItem(
  tx: Transaction,
  workOrderId: string,
  item: WorkOrderItem,
): Promise<{ ok: true; id: string } | { ok: false; errors: { workOrder: 'unknown' | 'not-editable' } }> {
  const locked = await lockForItems(tx, workOrderId);
  if (locked !== 'ok') return { ok: false, errors: { workOrder: locked } };
  const [saved] = await tx.insert(workOrderItem).values({ workOrderId, ...item }).returning({ id: workOrderItem.id });
  return { ok: true, id: saved!.id };
}

/**
 * Adds a Práca or a Diel to a Zákazka that is still Rozpracovaná. The item keeps the VAT rate it has now: one of the
 * rates of Nastavenia, the default one when none is given (read with getRates, so a Rola that may write work but
 * not read Nastavenia is refused), and a later change of the rates leaves the item alone.
 */
export async function addItem(user: User | null, workOrderId: string, input: ItemInput, db: Database = getDb()): Promise<AddItemResult> {
  assertCan(user, 'work-orders.write');
  const parsed = parseItem(input, await getRates(user, db));
  if (!parsed.ok) return parsed;

  return db.transaction((tx) => insertItem(tx, workOrderId, parsed.item));
}

export type AddItemFromPriceListResult =
  | { ok: true; id: string }
  | { ok: false; errors: { workOrder?: 'unknown' | 'not-editable'; priceListItem?: 'unknown'; vatRate?: 'not-offered' } };

/**
 * Adds a Položka cenníka to a Zákazka that is still Rozpracovaná, under the lock of the other adds, as an item of
 * quantity 1 (packages/domain/src/price-list). What is added is a copy of its values and refers back to nothing, so a
 * later change or deletion in the Cenník leaves the Zákazka as it is. An item whose VAT rate Nastavenia no longer
 * offer is refused (`vatRate: 'not-offered'`), as a new item with that rate would be; the admin changes the rate of the
 * item in the Cenník and adds it again. The reasons are reported in this order: the item is not in the Cenník, its VAT
 * rate is not offered, the Zákazka is unknown or not Rozpracovaná. Reading the Cenník and Nastavenia is the admin's alone.
 */
export async function addItemFromPriceList(
  user: User | null,
  workOrderId: string,
  priceListItemId: string,
  db: Database = getDb(),
): Promise<AddItemFromPriceListResult> {
  assertCan(user, 'work-orders.write');
  assertCan(user, 'price-list.read');
  const { vatRates } = await getRates(user, db);

  return db.transaction(async (tx) => {
    const [source] = await rowsIfUuid(priceListItemId, tx.select().from(priceListItem).where(eq(priceListItem.id, priceListItemId)));
    if (!source) return { ok: false, errors: { priceListItem: 'unknown' } };
    if (!vatRates.includes(source.vatRate)) return { ok: false, errors: { vatRate: 'not-offered' } };
    return insertItem(tx, workOrderId, workOrderItemFromPriceListItem(source));
  });
}

export type UpdateItemResult =
  | { ok: true; workOrderId: string }
  | { ok: false; errors: ItemErrors & { item?: 'unknown'; workOrder?: 'not-editable' } };

/**
 * Replaces what the form of an item sends, on a Zákazka that is still Rozpracovaná: the kind of the item stays. What is
 * left out is as when adding, except a VAT rate, which stays the one the item has. That rate is allowed even when
 * Nastavenia no longer offer it, so an old item can still be edited; any other must be one they offer.
 */
export async function updateItem(user: User | null, itemId: string, input: Omit<ItemInput, 'kind'>, db: Database = getDb()): Promise<UpdateItemResult> {
  assertCan(user, 'work-orders.write');
  const { vatRates } = await getRates(user, db);

  return db.transaction(async (tx) => {
    const [item] = await rowsIfUuid(itemId, tx.select({ workOrderId: workOrderItem.workOrderId, kind: workOrderItem.kind, vatRate: workOrderItem.vatRate }).from(workOrderItem).where(eq(workOrderItem.id, itemId)));
    if (!item) return { ok: false, errors: { item: 'unknown' } };
    const locked = await lockForItems(tx, item.workOrderId);
    if (locked !== 'ok') return { ok: false, errors: locked === 'unknown' ? { item: 'unknown' } : { workOrder: locked } };
    const parsed = parseItem({ ...input, kind: item.kind }, { defaultVatRate: item.vatRate, vatRates: vatRatesKeeping(vatRates, item.vatRate) });
    if (!parsed.ok) return parsed;
    const [saved] = await tx.update(workOrderItem).set(parsed.item).where(eq(workOrderItem.id, itemId)).returning({ id: workOrderItem.id });
    return saved ? { ok: true, workOrderId: item.workOrderId } : { ok: false, errors: { item: 'unknown' } }; // none: deleted while this waited for the lock
  });
}

export type DeleteItemResult = { ok: true; workOrderId: string } | { ok: false; error: 'unknown' | 'not-editable' };

/** Deletes an item of a Zákazka that is still Rozpracovaná, under the same lock as adding one. */
export async function deleteItem(user: User | null, itemId: string, db: Database = getDb()): Promise<DeleteItemResult> {
  assertCan(user, 'work-orders.write');
  return db.transaction(async (tx) => {
    const [item] = await rowsIfUuid(itemId, tx.select({ workOrderId: workOrderItem.workOrderId }).from(workOrderItem).where(eq(workOrderItem.id, itemId)));
    if (!item) return { ok: false, error: 'unknown' };
    const locked = await lockForItems(tx, item.workOrderId);
    if (locked !== 'ok') return { ok: false, error: locked };
    const deleted = await tx.delete(workOrderItem).where(eq(workOrderItem.id, itemId)).returning({ id: workOrderItem.id });
    return deleted.length > 0 ? { ok: true, workOrderId: item.workOrderId } : { ok: false, error: 'unknown' }; // none: deleted while this waited for the lock
  });
}

export type ChangeStatusResult = { ok: true } | { ok: false; error: 'unknown' | 'not-allowed' | 'confirmation-required' };

/**
 * The admin takes a Zákazka to the status `to`: the domain's transition table decides, under a row lock,
 * so two clicks at once change it once. Hotová stores the Dátum dokončenia (every time), the other
 * statuses leave it as it is. Zrušená needs `confirmed`. Whether a mechanik may do this is ledger
 * question 11 (#43), so it is `work-orders.write`, the admin's alone.
 */
export async function changeWorkOrderStatus(
  user: User | null,
  id: string,
  { to, confirmed }: { to: WorkOrderStatus; confirmed?: boolean },
  db: Database = getDb(),
  now: Date = new Date(),
): Promise<ChangeStatusResult> {
  assertCan(user, 'work-orders.write');
  return db.transaction(async (tx) => {
    const [found] = await rowsIfUuid(id, tx.select({ status: workOrder.status }).from(workOrder).where(eq(workOrder.id, id)).for('update'));
    if (!found) return { ok: false, error: 'unknown' };
    const changed = transition(found.status, to, 'user', now, { confirmed });
    if (!changed.ok) return changed;
    await tx.update(workOrder).set({ status: changed.status, completedOn: changed.completedOn }).where(eq(workOrder.id, id));
    return { ok: true };
  });
}

/** The columns of a row in the list of Zákazky: the Zákazka itself, its customer and its vehicle. */
const listedFields = {
  id: workOrder.id,
  number: workOrder.number,
  status: workOrder.status,
  deadline: workOrder.deadline,
  customer: { id: customer.id, name: customer.name },
  vehicle: { id: vehicle.id, vin: vehicle.vin, licensePlate: vehicle.licensePlate, make: vehicle.make, model: vehicle.model },
};

/** Zákazky joined to their customer and vehicle, selecting the listed fields and `more`. */
const selectListed = <More extends SelectedFields>(db: Database, more: More) =>
  db
    .select({ ...listedFields, ...more })
    .from(workOrder)
    .innerJoin(customer, eq(workOrder.customerId, customer.id))
    .innerJoin(vehicle, eq(workOrder.vehicleId, vehicle.id));

/**
 * A page of the list of Zákazky with their customer, vehicle and Termín, newest first. `status`, `from`
 * and `to` are the filter as the address carries it (the domain's parseListFilter reads them, and the
 * result says which filter it applied): a status, Neuzavreté by default, and the days of intake from
 * and to, both included, by the calendar of Europe/Bratislava. `page` counts from 1 and is read by
 * pageWindow: any page past the last is the last, and anything that is not a page number is the first.
 * The mechanik may read it.
 */
export async function listWorkOrders(
  user: User | null,
  { status, from, to, page = 1 }: { status?: string; from?: string; to?: string; page?: number } = {},
  db: Database = getDb(),
) {
  assertCan(user, 'work-orders.list');
  const filter = parseListFilter({ status, from, to });
  const dayOfIntake = sql`(${workOrder.createdAt} at time zone 'Europe/Bratislava')::date`;
  const matching = and(
    inArray(workOrder.status, [...statusesOf(filter.status)]),
    filter.from ? sql`${dayOfIntake} >= ${filter.from}::date` : undefined,
    filter.to ? sql`${dayOfIntake} <= ${filter.to}::date` : undefined,
  );

  const [counted] = await db.select({ total: count() }).from(workOrder).where(matching);
  const orderCount = counted!.total;
  const { page: current, pageCount, limit, offset } = pageWindow(orderCount, page);
  const orders = await selectListed(db, {}).where(matching).orderBy(desc(workOrder.createdAt), desc(workOrder.number)).limit(limit).offset(offset);
  return { orders, page: current, pageCount, orderCount, filter };
}

/**
 * Every Zákazka of a Vozidlo in any Stav, newest first, each with its own Zákazník, who is not
 * always the Majiteľ the Vozidlo has now. Nothing is found for an id that is no Vozidlo.
 */
export async function listWorkOrdersOfVehicle(user: User | null, vehicleId: string, db: Database = getDb()) {
  assertCan(user, 'work-orders.read');
  return rowsIfUuid(vehicleId, selectListed(db, {}).where(eq(workOrder.vehicleId, vehicleId)).orderBy(desc(workOrder.createdAt)));
}

/**
 * The Zákazky made for a Zákazník, in any Stav, newest first, each with its customer and vehicle. A Zákazka
 * belongs to the customer it was made for, so the Zákazky of other customers on his vehicles are not here,
 * and after a Prepis the Zákazky stay with the customer they were made for.
 */
export async function listWorkOrdersOfCustomer(user: User | null, customerId: string, db: Database = getDb()) {
  assertCan(user, 'work-orders.read');
  if (!isUuid(customerId)) return [];
  return selectListed(db, {}).where(eq(workOrder.customerId, customerId)).orderBy(desc(workOrder.createdAt));
}

/** One Zákazka with its items, the amounts of each, the totals and the Marža, or null when there is none with this id. */
export async function getWorkOrder(user: User | null, id: string, db: Database = getDb()) {
  assertCan(user, 'work-orders.read');
  if (!isUuid(id)) return null;
  const [found] = await selectListed(db, {
    completedOn: workOrder.completedOn,
    mileageKm: workOrder.mileageKm,
    customerRequest: workOrder.customerRequest,
    note: workOrder.note,
  }).where(eq(workOrder.id, id));
  if (!found) return null;
  const items = await db.select().from(workOrderItem).where(eq(workOrderItem.workOrderId, id)).orderBy(asc(workOrderItem.createdAt), asc(workOrderItem.id));
  return { ...found, items: items.map((item) => ({ ...item, amounts: amountsOf(item) })), totals: totalsOf(items), margin: marginOf(items) };
}
