import { parseCustomer, type CustomerInput } from '@servisnik/domain/customer';
import { parseVehicle, type VehicleInput } from '@servisnik/domain/vehicle';
import {
  amountsOf,
  canEdit,
  formatWorkOrderNumber,
  localYear,
  mileageAtIntake,
  parseLabour,
  parseWorkOrder,
  totalsOf,
  transition,
  type LabourErrors,
  type LabourInput,
  type WorkOrderErrors,
  type WorkOrderInput,
  type WorkOrderStatus,
} from '@servisnik/domain/work-order';
import { asc, desc, eq, sql } from 'drizzle-orm';
import type { SelectedFields } from 'drizzle-orm/pg-core';
import { getDb, type Database, type Executor } from '../db/index.ts';
import { customer, vehicle, workOrder, workOrderCounter, workOrderItem } from '../db/schema.ts';
import { createCustomer, type CustomerSaveErrors, type ExistingCustomer } from './customers.ts';
import { getRates } from './settings.ts';
import { assertCan, type User } from './user.ts';
import { isUuid } from './uuid.ts';
import { createVehicle, type ExistingVehicle, type VehicleSaveErrors } from './vehicles.ts';

/** The rows of `query`, or none when `id` is not a UUID: PostgreSQL would answer that with an error, not with no row. */
const rowsIfUuid = async <Row>(id: string, query: PromiseLike<Row[]>): Promise<Row[]> => (isUuid(id) ? await query : []);

export type CreateWorkOrderResult =
  /** `lowerMileage` is there when the kilometres are lower than the Stav km of the vehicle, which is then left as it is. */
  | { ok: true; id: string; number: string; lowerMileage?: { vehicleMileageKm: number } }
  | { ok: false; errors: WorkOrderErrors & { vehicle?: 'unknown'; customer?: 'unknown' } };

/**
 * Saves a Zákazka for a Vozidlo with the next number of the year in Europe/Bratislava. Its Zákazník is
 * `customerId`, or the Majiteľ of the vehicle now; the Zákazka keeps it from then on. The number is one
 * atomic upsert of the year's counter inside the same transaction as the Zákazka (see workOrderCounter).
 * The kilometres at intake become the Stav km of the vehicle when higher (`mileageAtIntake`), in the same
 * transaction; the vehicle row is locked from reading its Stav km to the commit, so two intakes at once
 * cannot lose the higher one.
 */
export async function createWorkOrder(
  user: User | null,
  input: WorkOrderInput & { vehicleId: string; customerId?: string },
  db: Executor = getDb(),
  now: Date = new Date(),
): Promise<CreateWorkOrderResult> {
  assertCan(user, 'work-orders.write');
  const parsed = parseWorkOrder(input);
  if (!parsed.ok) return parsed;

  return db.transaction(async (tx) => {
    // "No key update" is enough to serialize intakes on the vehicle, and leaves the key share lock the new Zákazka takes on it alone.
    const [found] = await rowsIfUuid(
      input.vehicleId,
      tx.select({ ownerId: vehicle.ownerId, mileageKm: vehicle.mileageKm }).from(vehicle).where(eq(vehicle.id, input.vehicleId)).for('no key update'),
    );
    if (!found) return { ok: false, errors: { vehicle: 'unknown' } };
    const customerId = input.customerId || found.ownerId;
    const [known] = await rowsIfUuid(customerId, tx.select({ id: customer.id }).from(customer).where(eq(customer.id, customerId)));
    if (!known) return { ok: false, errors: { customer: 'unknown' } };

    // After every check that can refuse the Zákazka: a refusal returns, which commits, so a write before it would stay.
    const atIntake = mileageAtIntake(found.mileageKm, parsed.workOrder.mileageKm);
    if (atIntake.vehicleMileageKm !== found.mileageKm) {
      await tx.update(vehicle).set({ mileageKm: atIntake.vehicleMileageKm }).where(eq(vehicle.id, input.vehicleId));
    }

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
    const lowerMileage = atIntake.lowerThanVehicle ? { lowerMileage: { vehicleMileageKm: atIntake.vehicleMileageKm } } : {};
    return { ok: true, id: saved!.id, number, ...lowerMileage };
  });
}

/** What the form of a Príjem vozidla with a new Vozidlo sends: its Majiteľ, who is an existing Zákazník or a new one, the Vozidlo, and the Zákazka. The Stav km of a new Vozidlo is the kilometres at intake. */
export type IntakeInput = WorkOrderInput & {
  owner: { id: string } | { customer: CustomerInput };
  vehicle: Omit<VehicleInput, 'mileageKm'>;
};

export type CreateIntakeResult =
  | { ok: true; id: string; number: string }
  | {
      ok: false;
      errors: { owner?: 'unknown'; customer?: CustomerSaveErrors; vehicle?: VehicleSaveErrors; workOrder?: WorkOrderErrors };
      /** The Firma that has the IČO, and the Vozidlo that has the VIN: the forms link to them. */
      existingCustomer?: ExistingCustomer;
      existingVehicle?: ExistingVehicle;
    };

/** Ends the transaction of an intake that was refused, with the refusal to hand back. */
class IntakeRefused extends Error {
  readonly refusal: Extract<CreateIntakeResult, { ok: false }>;

  constructor(refusal: Extract<CreateIntakeResult, { ok: false }>) {
    super('The intake was refused.');
    this.refusal = refusal;
  }
}

/**
 * Príjem vozidla with a new Vozidlo (GLOSSARY): saves the new Zákazník when there is one, the Vozidlo with
 * him or the existing Zákazník as its Majiteľ, and the Zákazka for it, whose Zákazník is the Majiteľ, all
 * in one transaction. A part that cannot be saved takes the others with it, whether the rules refuse it, a
 * VIN or an IČO is taken, or PostgreSQL fails. Every part is checked before any is written, so every
 * reason comes back at once. Each part is saved by its own function (createCustomer, createVehicle,
 * createWorkOrder), so the rules of each stay where they are.
 */
export async function createIntake(user: User | null, input: IntakeInput, db: Database = getDb(), now: Date = new Date()): Promise<CreateIntakeResult> {
  assertCan(user, 'work-orders.write');
  const { owner, vehicle: vehicleFields, ...orderFields } = input;
  const newCustomer = 'customer' in owner ? parseCustomer(owner.customer) : undefined;
  const parsedVehicle = parseVehicle(vehicleFields, localYear(now));
  const parsedOrder = parseWorkOrder(orderFields);
  const errors = {
    ...(newCustomer && !newCustomer.ok && { customer: newCustomer.errors }),
    ...(!parsedVehicle.ok && { vehicle: parsedVehicle.errors }),
    ...(!parsedOrder.ok && { workOrder: parsedOrder.errors }),
  };
  if (Object.keys(errors).length > 0) return { ok: false, errors };

  try {
    return await db.transaction(async (tx) => {
      let ownerId: string;
      if ('customer' in owner) {
        const saved = await createCustomer(user, owner.customer, tx);
        if (!saved.ok) throw new IntakeRefused({ ok: false, errors: { customer: saved.errors }, existingCustomer: saved.existing });
        ownerId = saved.id;
      } else {
        ownerId = owner.id;
      }

      const savedVehicle = await createVehicle(user, { ...vehicleFields, ownerId }, tx);
      if (!savedVehicle.ok) {
        const { owner: unknownOwner, ...vehicleErrors } = savedVehicle.errors;
        throw new IntakeRefused(unknownOwner ? { ok: false, errors: { owner: unknownOwner } } : { ok: false, errors: { vehicle: vehicleErrors }, existingVehicle: savedVehicle.existing });
      }

      const savedOrder = await createWorkOrder(user, { ...orderFields, vehicleId: savedVehicle.id }, tx, now);
      // The parts were checked, and the Vozidlo and its Majiteľ were just saved: nothing is left to refuse the Zákazka.
      if (!savedOrder.ok) throw new Error(`The Zákazka of an intake was refused: ${JSON.stringify(savedOrder.errors)}`);
      return { ok: true, id: savedOrder.id, number: savedOrder.number };
    });
  } catch (error) {
    if (error instanceof IntakeRefused) return error.refusal;
    throw error;
  }
}

export type AddLabourResult =
  | { ok: true; id: string }
  | { ok: false; errors: LabourErrors & { workOrder?: 'unknown' | 'not-editable' } };

/**
 * Adds a Práca to a Zákazka that is still Rozpracovaná (`canEdit`); the row lock keeps it from landing after the Zákazka became Hotová or Zrušená.
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
    if (!canEdit(found.status)) return { ok: false, errors: { workOrder: 'not-editable' } };
    const [saved] = await tx.insert(workOrderItem).values({ workOrderId, ...parsed.item }).returning({ id: workOrderItem.id });
    return { ok: true, id: saved!.id };
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
