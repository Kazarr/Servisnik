import {
  amountsOf,
  canAddItems,
  formatWorkOrderNumber,
  isOpen,
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
import { getDb, type Database } from '../db/index.ts';
import { customer, vehicle, workOrder, workOrderCounter, workOrderItem } from '../db/schema.ts';
import { assertUser, type User } from './user.ts';
import { isUuid } from './uuid.ts';

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
  assertUser(user);
  const parsed = parseWorkOrder(input);
  if (!parsed.ok) return parsed;

  return db.transaction(async (tx) => {
    const [found] = isUuid(input.vehicleId) ? await tx.select({ ownerId: vehicle.ownerId }).from(vehicle).where(eq(vehicle.id, input.vehicleId)) : [];
    if (!found) return { ok: false, errors: { vehicle: 'unknown' } };
    const customerId = input.customerId || found.ownerId;
    const [known] = isUuid(customerId) ? await tx.select({ id: customer.id }).from(customer).where(eq(customer.id, customerId)) : [];
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

/** Adds a Práca to a Zákazka that is still Prijatá; the row lock keeps it from landing after the Zákazka became Hotová. */
export async function addLabour(user: User | null, workOrderId: string, input: LabourInput, db: Database = getDb()): Promise<AddLabourResult> {
  assertUser(user);
  const parsed = parseLabour(input);
  if (!parsed.ok) return parsed;

  return db.transaction(async (tx) => {
    const [found] = isUuid(workOrderId)
      ? await tx.select({ status: workOrder.status }).from(workOrder).where(eq(workOrder.id, workOrderId)).for('update')
      : [];
    if (!found) return { ok: false, errors: { workOrder: 'unknown' } };
    if (!canAddItems(found.status)) return { ok: false, errors: { workOrder: 'not-editable' } };
    const [saved] = await tx.insert(workOrderItem).values({ workOrderId, ...parsed.item }).returning({ id: workOrderItem.id });
    return { ok: true, id: saved!.id };
  });
}

export type MarkDoneResult = { ok: true } | { ok: false; error: 'unknown' | 'not-allowed' };

/** Prijatá becomes Hotová and the delivery date is stored; the domain's transition table decides, under a row lock. */
export async function markWorkOrderDone(user: User | null, id: string, db: Database = getDb(), now: Date = new Date()): Promise<MarkDoneResult> {
  assertUser(user);
  return db.transaction(async (tx) => {
    const [found] = isUuid(id) ? await tx.select({ status: workOrder.status }).from(workOrder).where(eq(workOrder.id, id)).for('update') : [];
    if (!found) return { ok: false, error: 'unknown' };
    const changed = transition(found.status, 'done', 'user', now);
    if (!changed.ok) return { ok: false, error: 'not-allowed' };
    await tx.update(workOrder).set({ status: changed.status, completedOn: changed.completedOn }).where(eq(workOrder.id, id));
    return { ok: true };
  });
}

const withParties = {
  id: workOrder.id,
  number: workOrder.number,
  status: workOrder.status,
  customer: { id: customer.id, name: customer.name },
  vehicle: { id: vehicle.id, vin: vehicle.vin, licensePlate: vehicle.licensePlate, make: vehicle.make, model: vehicle.model },
};

/** Every Zákazka with its customer and vehicle, newest first. */
export async function listWorkOrders(user: User | null, db: Database = getDb()) {
  assertUser(user);
  return db
    .select(withParties)
    .from(workOrder)
    .innerJoin(customer, eq(workOrder.customerId, customer.id))
    .innerJoin(vehicle, eq(workOrder.vehicleId, vehicle.id))
    .orderBy(desc(workOrder.createdAt));
}

/** The open Zákazky of a Vozidlo (not yet invoiced), newest first. */
export async function listOpenWorkOrdersOfVehicle(user: User | null, vehicleId: string, db: Database = getDb()) {
  assertUser(user);
  if (!isUuid(vehicleId)) return [];
  return db
    .select({ id: workOrder.id, number: workOrder.number, status: workOrder.status })
    .from(workOrder)
    .where(and(eq(workOrder.vehicleId, vehicleId), inArray(workOrder.status, workOrderStatuses.filter(isOpen))))
    .orderBy(desc(workOrder.createdAt));
}

/** One Zákazka with its items, the amounts of each and the totals, or null when there is none with this id. */
export async function getWorkOrder(user: User | null, id: string, db: Database = getDb()) {
  assertUser(user);
  if (!isUuid(id)) return null;
  const [found] = await db
    .select({
      ...withParties,
      completedOn: workOrder.completedOn,
      mileageKm: workOrder.mileageKm,
      customerRequest: workOrder.customerRequest,
    })
    .from(workOrder)
    .innerJoin(customer, eq(workOrder.customerId, customer.id))
    .innerJoin(vehicle, eq(workOrder.vehicleId, vehicle.id))
    .where(eq(workOrder.id, id));
  if (!found) return null;
  const items = await db.select().from(workOrderItem).where(eq(workOrderItem.workOrderId, id)).orderBy(asc(workOrderItem.createdAt), asc(workOrderItem.id));
  return { ...found, items: items.map((item) => ({ ...item, amounts: amountsOf(item) })), totals: totalsOf(items) };
}
