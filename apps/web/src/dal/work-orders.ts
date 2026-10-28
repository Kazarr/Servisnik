import {
  amountsOf,
  canEdit,
  formatWorkOrderNumber,
  isClosed,
  localYear,
  marginOf,
  parseItem,
  parseWorkOrder,
  totalsOf,
  transition,
  workOrderStatuses,
  type ItemErrors,
  type ItemInput,
  type WorkOrderErrors,
  type WorkOrderInput,
  type WorkOrderStatus,
} from '@servisnik/domain/work-order';
import { and, asc, desc, eq, inArray, sql } from 'drizzle-orm';
import type { SelectedFields } from 'drizzle-orm/pg-core';
import { getDb, type Database } from '../db/index.ts';
import { customer, vehicle, workOrder, workOrderCounter, workOrderItem } from '../db/schema.ts';
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
 * Locks the Zákazka until the transaction ends and says whether its Položky may change now. The domain's
 * `canEdit` is that one condition for adding, changing and deleting an item; the lock keeps a change from
 * landing after the Zákazka became Hotová or Zrušená.
 */
async function lockForItems(tx: Transaction, workOrderId: string): Promise<'ok' | 'unknown' | 'not-editable'> {
  const [found] = await rowsIfUuid(workOrderId, tx.select({ status: workOrder.status }).from(workOrder).where(eq(workOrder.id, workOrderId)).for('update'));
  if (!found) return 'unknown';
  return canEdit(found.status) ? 'ok' : 'not-editable';
}

export type AddItemResult =
  | { ok: true; id: string }
  | { ok: false; errors: ItemErrors & { workOrder?: 'unknown' | 'not-editable' } };

/**
 * Adds a Práca or a Diel to a Zákazka that is still Rozpracovaná. The item keeps the VAT rate it has now: one of the
 * rates of Nastavenia, the default one when none is given (read with getRates, so a Rola that may write work but
 * not read Nastavenia is refused), and a later change of the rates leaves the item alone.
 */
export async function addItem(user: User | null, workOrderId: string, input: ItemInput, db: Database = getDb()): Promise<AddItemResult> {
  assertCan(user, 'work-orders.write');
  const parsed = parseItem(input, await getRates(user, db));
  if (!parsed.ok) return parsed;

  return db.transaction(async (tx) => {
    const locked = await lockForItems(tx, workOrderId);
    if (locked !== 'ok') return { ok: false, errors: { workOrder: locked } };
    const [saved] = await tx.insert(workOrderItem).values({ workOrderId, ...parsed.item }).returning({ id: workOrderItem.id });
    return { ok: true, id: saved!.id };
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
    const parsed = parseItem({ ...input, kind: item.kind }, { defaultVatRate: item.vatRate, vatRates: [...vatRates, item.vatRate] });
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

/** Every Zákazka with its customer and vehicle, newest first. */
export async function listWorkOrders(user: User | null, db: Database = getDb()) {
  assertCan(user, 'work-orders.list');
  return selectListed(db, {}).orderBy(desc(workOrder.createdAt));
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

/** The Zákazky of a Vozidlo that are not Uzavretá, newest first. */
export async function listUnclosedWorkOrdersOfVehicle(user: User | null, vehicleId: string, db: Database = getDb()) {
  assertCan(user, 'work-orders.read');
  if (!isUuid(vehicleId)) return [];
  return db
    .select({ id: workOrder.id, number: workOrder.number, status: workOrder.status })
    .from(workOrder)
    .where(and(eq(workOrder.vehicleId, vehicleId), inArray(workOrder.status, workOrderStatuses.filter((status) => !isClosed(status)))))
    .orderBy(desc(workOrder.createdAt));
}

/** One Zákazka with its items, the amounts of each, the totals and the Marža, or null when there is none with this id. */
export async function getWorkOrder(user: User | null, id: string, db: Database = getDb()) {
  assertCan(user, 'work-orders.read');
  if (!isUuid(id)) return null;
  const [found] = await selectListed(db, {
    completedOn: workOrder.completedOn,
    mileageKm: workOrder.mileageKm,
    customerRequest: workOrder.customerRequest,
  }).where(eq(workOrder.id, id));
  if (!found) return null;
  const items = await db.select().from(workOrderItem).where(eq(workOrderItem.workOrderId, id)).orderBy(asc(workOrderItem.createdAt), asc(workOrderItem.id));
  return { ...found, items: items.map((item) => ({ ...item, amounts: amountsOf(item) })), totals: totalsOf(items), margin: marginOf(items) };
}
