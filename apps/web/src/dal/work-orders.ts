import {
  amountsOf,
  canAddItems,
  formatWorkOrderNumber,
  isClosed,
  localYear,
  parseLabour,
  parseWorkOrder,
  totalsOf,
  transition,
  workOrderStatuses,
  type LabourErrors,
  type LabourInput,
  type WorkOrderErrors,
  type WorkOrderInput,
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

export type AddLabourResult =
  | { ok: true; id: string }
  | { ok: false; errors: LabourErrors & { workOrder?: 'unknown' | 'not-editable' } };

/**
 * Adds a Práca to a Zákazka that is still Prijatá; the row lock keeps it from landing after the Zákazka became Hotová.
 * The item keeps the VAT rate it has now: a VAT rate left out is the default one of Nastavenia (read with getRates, so
 * a Rola that may write work but not read Nastavenia is refused), and a later change of the rates leaves the item alone.
 */
export async function addLabour(user: User | null, workOrderId: string, input: LabourInput, db: Database = getDb()): Promise<AddLabourResult> {
  assertCan(user, 'work-orders.write');
  const { defaultVatRate } = await getRates(user, db);
  const parsed = parseLabour(input, defaultVatRate);
  if (!parsed.ok) return parsed;

  return db.transaction(async (tx) => {
    const [found] = await rowsIfUuid(workOrderId, tx.select({ status: workOrder.status }).from(workOrder).where(eq(workOrder.id, workOrderId)).for('update'));
    if (!found) return { ok: false, errors: { workOrder: 'unknown' } };
    if (!canAddItems(found.status)) return { ok: false, errors: { workOrder: 'not-editable' } };
    const [saved] = await tx.insert(workOrderItem).values({ workOrderId, ...parsed.item }).returning({ id: workOrderItem.id });
    return { ok: true, id: saved!.id };
  });
}

export type MarkDoneResult = { ok: true } | { ok: false; error: 'unknown' | 'not-allowed' };

/** Prijatá becomes Hotová and the Dátum dokončenia is stored; the domain's transition table decides, under a row lock. */
export async function markWorkOrderDone(user: User | null, id: string, db: Database = getDb(), now: Date = new Date()): Promise<MarkDoneResult> {
  assertCan(user, 'work-orders.write');
  return db.transaction(async (tx) => {
    const [found] = await rowsIfUuid(id, tx.select({ status: workOrder.status }).from(workOrder).where(eq(workOrder.id, id)).for('update'));
    if (!found) return { ok: false, error: 'unknown' };
    const changed = transition(found.status, 'done', 'user', now);
    if (!changed.ok) return { ok: false, error: 'not-allowed' };
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

/** One Zákazka with its items, the amounts of each and the totals, or null when there is none with this id. */
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
  return { ...found, items: items.map((item) => ({ ...item, amounts: amountsOf(item) })), totals: totalsOf(items) };
}
